import { DomainError, requireInteger } from "./domain.js";
import {
  authorization,
  fullSha,
  tokenExpiry,
  tokenFrom,
  verifyCheckout,
  type CheckoutPlan,
  type SimulatedGitHubAccess,
  type SimulatedRepositoryAuthority,
  type SimulatedRepositoryBootstrap,
} from "./repository-access.js";
import type { RepositoryStore } from "./repository-store.js";
import { RepositoryCredentialVault } from "./repository-credentials.js";

async function bounded<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("Repository call aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([work(), cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export async function workRepository(
  store: RepositoryStore,
  authority: SimulatedRepositoryAuthority,
  github: SimulatedGitHubAccess,
  bootstrap: SimulatedRepositoryBootstrap,
  custody: RepositoryCredentialVault,
  leaseMs = 1000,
  cleanupTimeoutMs = 1000,
): Promise<boolean> {
  if (!custody.isFor(store))
    throw new DomainError(400, "Repository custody does not match the store");
  if (
    [custody, authority, github, bootstrap].some(
      (adapter) => adapter.simulation !== true,
    )
  )
    throw new DomainError(
      400,
      "Only simulated repository adapters are supported",
    );
  requireInteger(leaseMs, "leaseMs", 100, 60000);
  requireInteger(cleanupTimeoutMs, "cleanupTimeoutMs", 100, 5000);
  store.reconcileExpired();
  const op = store.claim(leaseMs);
  if (!op) return false;
  const fence = op.leaseToken!;
  let credential: string | null = null;
  let channelDispatched = false;
  let verified = false;
  let cleanupPassed = true;
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(),
    Math.max(0, op.deadlineAt! - Date.now()),
  );
  const heartbeat = setInterval(
    () => {
      try {
        store.heartbeat(op.id, fence, leaseMs);
      } catch {
        controller.abort();
      }
    },
    Math.max(25, Math.floor(leaseMs / 3)),
  );

  try {
    const grant = authorization(
      await bounded(controller.signal, () =>
        authority.authorize(
          op.operatorId,
          op.repository,
          op.ref,
          controller.signal,
        ),
      ),
      op.operatorId,
      op.repository,
      op.ref,
    );
    store.authorize(op.id, fence, grant.repositoryId, grant.installationId);
    const minted = await bounded(controller.signal, () =>
      github.mint(
        grant.installationId,
        {
          repository_ids: [grant.repositoryId],
          permissions: { contents: "read" },
        },
        controller.signal,
      ),
    );
    // Capture the credential before validating scope so an overbroad grant is
    // revoked too. Never retain arbitrary provider response/error text.
    credential = tokenFrom(minted);
    // Commit encrypted custody before scope validation or any credential use.
    // Overbroad tokens must remain recoverable if revocation is interrupted.
    if (credential !== null) custody.capture(op.id, fence, credential);
    const expiresAt = tokenExpiry(minted, grant);
    store.minted(op.id, fence, expiresAt);
    // The deadline bounds every later call and revocation may run for one
    // cleanup timeout after it, so the token must outlive both.
    if (expiresAt <= op.deadlineAt! + cleanupTimeoutMs)
      throw new Error("Repository credential expires before the deadline");
    const sha = fullSha(
      await bounded(controller.signal, () =>
        github.resolve(credential!, op.repository, op.ref, controller.signal),
      ),
    );
    store.checkout(op.id, fence, sha);
    // Keep the verification baseline immutable across adapter calls.
    const plan: CheckoutPlan = Object.freeze({
      operationId: op.id,
      providerId: op.providerId,
      repositoryId: grant.repositoryId,
      remoteUrl: op.repository,
      headSha: sha,
      hooks: false,
      submodules: false,
      lfs: false,
      simulation: true,
    });
    channelDispatched = true;
    await bounded(controller.signal, () =>
      bootstrap.checkout(plan, credential!, controller.signal),
    );
    const evidence = await bounded(controller.signal, () =>
      bootstrap.inspect(plan, controller.signal),
    );
    verifyCheckout(evidence, plan);
    store.verified(op.id, fence);
    verified = true;
  } catch {
    // The store settles the outcome from the persisted phase below.
    // Adapter errors may contain secrets; only fixed event names are persisted.
  } finally {
    // A separate bounded signal allows cleanup even after a main-call timeout.
    // Attempt both actions even when either fails. Neither dispatch is retried.
    for (const kind of ["credential", "channel"] as const) {
      if (kind === "credential" ? credential === null : !channelDispatched)
        continue;
      const cleanup = new AbortController();
      const timer = setTimeout(() => cleanup.abort(), cleanupTimeoutMs);
      try {
        await bounded(cleanup.signal, () =>
          kind === "credential"
            ? github.revoke(credential!, cleanup.signal)
            : bootstrap.clearCredential(op.id, cleanup.signal),
        );
        store.cleanup(op.id, fence, kind);
      } catch {
        cleanupPassed = false;
      } finally {
        clearTimeout(timer);
        cleanup.abort();
      }
    }
    credential = null;
    clearTimeout(deadline);
    clearInterval(heartbeat);
    controller.abort();
  }

  const conflict = (error: unknown) => {
    if (!(error instanceof DomainError && error.status === 409)) throw error;
  };
  if (verified && cleanupPassed)
    try {
      store.complete(op.id, fence);
      return true;
    } catch (error) {
      // Lease/deadline expiry cannot be turned into success by a late response.
      conflict(error);
    }
  try {
    store.settle(op.id, fence);
  } catch (error) {
    // Another worker or reconciliation already settled the operation.
    conflict(error);
  }
  return true;
}
