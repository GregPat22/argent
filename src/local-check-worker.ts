import { DomainError, UncertainExecutionError } from "./domain.js";
import { runBoundedCommand } from "./local-command-runner.js";
import {
  createVerificationCheckout,
  removeVerificationCheckout,
  verifyOwnedCheckout,
  type VerificationCheckout,
  type VerificationRoots,
} from "./local-verification-checkout.js";
import type { CheckPhase, CheckResult } from "./local-checks.js";
import type { Store } from "./store.js";

/** Explicitly enabled only by the local service. Never consumes dormant jobs. */
export class LocalCheckWorker {
  constructor(
    private readonly store: Store,
    private readonly roots: VerificationRoots,
    private readonly leaseMs = 5000,
  ) {}
  async tick(shutdown?: AbortSignal): Promise<boolean> {
    this.store.reconcile();
    if (shutdown?.aborted) return false;
    const job = this.store.localChecks.claim(this.leaseMs);
    if (!job) return false;
    const { run } = job,
      token = run.leaseToken!;
    const controller = new AbortController();
    const stop = () => controller.abort("worker_shutdown");
    shutdown?.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(
      () => controller.abort("runtime_exceeded"),
      Math.max(0, run.deadlineAt! - Date.now()),
    );
    const heartbeat = setInterval(
      () => {
        try {
          if (
            this.store.heartbeat(run.id, token, this.leaseMs).status ===
            "cancelling"
          )
            controller.abort("user_cancelled");
        } catch {
          controller.abort("lease_lost");
        }
      },
      Math.max(20, Math.floor(this.leaseMs / 4)),
    );
    let checkout: VerificationCheckout | undefined;
    let uncertain = false;
    try {
      const { binding, commands } = await this.store.localChecks.revalidate(
        this.roots.worktreeRoot,
        run.id,
        token,
        controller.signal,
      );
      checkout = await createVerificationCheckout(
        this.store,
        this.roots,
        {
          id: run.id,
          workspaceId: run.workspaceId,
          headSha: binding.headSha,
          treeId: binding.treeId,
        },
        controller.signal,
      );
      const phases: CheckPhase[] = [];
      const unchanged = () => verifyOwnedCheckout(checkout!, controller.signal);
      for (const action of ["setup", "test"] as const) {
        const command = commands[action];
        if (!command) continue;
        controller.signal.throwIfAborted();
        this.store.localChecks.assertOwned(run.id, token);
        await unchanged();
        // One deadline bounds review, checkout, commands and result acceptance.
        // Cleanup may outlast it; never release ownership before cleanup settles.
        const remaining = run.deadlineAt! - Date.now();
        if (remaining < 1000)
          throw new DomainError(408, "Check deadline exceeded");
        this.store.localChecks.assertOwned(run.id, token);
        controller.signal.throwIfAborted();
        const result = await runBoundedCommand(command.argv, {
          cwd: checkout.directory,
          maxRuntimeMs: remaining,
          signal: controller.signal,
        });
        phases.push({
          action,
          argv: result.argv,
          outcome: result.outcome,
          exitCode: result.exitCode,
          signal: result.signal,
          startedAt: result.startedAt,
          durationMs: result.durationMs,
          stdout: { bytes: result.stdout.bytes, sha256: result.stdout.sha256 },
          stderr: { bytes: result.stderr.bytes, sha256: result.stderr.sha256 },
        });
        // A zero exit after changing tracked files cannot establish this commit.
        await unchanged();
        if (result.outcome !== "exited" || result.exitCode !== 0) break;
      }
      const evidence: CheckResult = {
        policy: "argent-local-check-v1",
        headSha: binding.headSha,
        treeId: binding.treeId,
        baseSha: binding.baseSha,
        configurationIdentity: binding.configurationIdentity,
        reviewIdentity: binding.reviewIdentity,
        consentId: job.consentId,
        outcome:
          phases.at(-1)?.action === "test" &&
          phases.every((p) => p.outcome === "exited" && p.exitCode === 0)
            ? "passed"
            : "failed",
        phases,
      };
      await removeVerificationCheckout(checkout);
      checkout = undefined;
      controller.signal.throwIfAborted();
      this.store.localChecks.complete(run.id, token, evidence);
    } catch (error) {
      uncertain = error instanceof UncertainExecutionError;
      if (checkout && !uncertain) {
        try {
          await removeVerificationCheckout(checkout);
          checkout = undefined;
        } catch {
          uncertain = true;
        }
      }
      // Failed creation cleanup and any lost process identity remain blocked.
      if (
        error instanceof DomainError &&
        /left in place|cleanup/i.test(error.message)
      )
        uncertain = true;
      const current = this.store.getRun(run.id);
      if (
        current.leaseToken === token &&
        (current.leaseExpiresAt ?? 0) > Date.now() &&
        ["running", "cancelling"].includes(current.status)
      ) {
        const reason: unknown = controller.signal.reason;
        const status =
          uncertain || reason === "worker_shutdown" || reason === "lease_lost"
            ? "needs_attention"
            : current.status === "cancelling"
              ? "cancelled"
              : "failed";
        this.store.finish(run.id, token, status, {
          reason: uncertain
            ? "check_cleanup_unconfirmed"
            : typeof reason === "string"
              ? reason
              : "check_preparation_or_execution_failed",
        });
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timer);
      shutdown?.removeEventListener("abort", stop);
    }
    return true;
  }
}
