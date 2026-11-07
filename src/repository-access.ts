import { DomainError } from "./domain.js";

export const MAX_REPOSITORY_CREDENTIAL_BYTES = 4096;

export interface RepositoryAuthorization {
  operatorId: string;
  repository: string;
  ref: string;
  repositoryId: number;
  installationId: number;
}

// Deliberately separate from both the desktop and provider credentials. These
// contracts cannot enable live access; real adapters require their own gates.
export interface SimulatedRepositoryAuthority {
  readonly simulation: true;
  authorize(
    operatorId: string,
    repository: string,
    ref: string,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface SimulatedGitHubAccess {
  readonly simulation: true;
  mint(
    installationId: number,
    scope: { repository_ids: [number]; permissions: { contents: "read" } },
    signal: AbortSignal,
  ): Promise<unknown>;
  resolve(
    token: string,
    repository: string,
    ref: string,
    signal: AbortSignal,
  ): Promise<unknown>;
  revoke(token: string, signal: AbortSignal): Promise<void>;
}

export interface CheckoutPlan {
  operationId: string;
  providerId: string;
  repositoryId: number;
  remoteUrl: string;
  headSha: string;
  hooks: false;
  submodules: false;
  lfs: false;
  simulation: true;
}

export interface SimulatedRepositoryBootstrap {
  readonly simulation: true;
  // Token is an ephemeral channel argument, never part of the serializable plan.
  checkout(
    plan: CheckoutPlan,
    token: string,
    signal: AbortSignal,
  ): Promise<void>;
  inspect(plan: CheckoutPlan, signal: AbortSignal): Promise<unknown>;
  clearCredential(operationId: string, signal: AbortSignal): Promise<void>;
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new DomainError(403, "Invalid repository access evidence");
  return value as Record<string, unknown>;
}

export function authorization(
  value: unknown,
  operatorId: string,
  repository: string,
  ref: string,
): RepositoryAuthorization {
  const grant = record(value);
  if (
    grant.operatorId !== operatorId ||
    grant.repository !== repository ||
    grant.ref !== ref ||
    !Number.isSafeInteger(grant.repositoryId) ||
    (grant.repositoryId as number) < 1 ||
    !Number.isSafeInteger(grant.installationId) ||
    (grant.installationId as number) < 1
  )
    throw new DomainError(403, "Repository authorization denied");
  return {
    operatorId,
    repository,
    ref,
    repositoryId: grant.repositoryId as number,
    installationId: grant.installationId as number,
  };
}

export function tokenFrom(value: unknown): string | null {
  const candidate = record(value).token;
  if (
    typeof candidate !== "string" ||
    candidate.length < 8 ||
    candidate.length > MAX_REPOSITORY_CREDENTIAL_BYTES
  )
    return null;
  // Keep synthetic/legacy fixtures and GitHub's documented ghs_-prefixed
  // stateless format. Tokens remain opaque: encoded JWT claims grant nothing.
  const legacy = candidate.length <= 512 && !/[^A-Za-z0-9_]/.test(candidate);
  const installation =
    candidate.startsWith("ghs_") &&
    candidate.length >= 40 &&
    !/[^A-Za-z0-9_.-]/.test(candidate);
  return legacy || installation ? candidate : null;
}

export function tokenExpiry(
  value: unknown,
  grant: RepositoryAuthorization,
  now = Date.now(),
): number {
  const data = record(value);
  const permissions = record(data.permissions);
  const repositories = data.repositories;
  const repository =
    Array.isArray(repositories) && repositories.length === 1
      ? record(repositories[0])
      : {};
  const expiry =
    typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
  if (
    !tokenFrom(value) ||
    data.repository_selection !== "selected" ||
    // The numeric ID is GitHub's stable identity; owner/name changes on rename
    // or transfer, so it must not decide whether a token is in scope.
    repository.id !== grant.repositoryId ||
    permissions.contents !== "read" ||
    Object.entries(permissions).some(
      ([key, access]) =>
        !["contents", "metadata"].includes(key) || access !== "read",
    ) ||
    !Number.isFinite(expiry) ||
    expiry < now + 60000 ||
    expiry > now + 3600000
  )
    throw new DomainError(
      403,
      "Installation token scope or expiration rejected",
    );
  return expiry;
}

export function fullSha(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value))
    throw new DomainError(403, "Expected a full commit SHA");
  return value;
}

export function verifyCheckout(value: unknown, plan: CheckoutPlan): void {
  const evidence = record(value);
  if (
    evidence.operationId !== plan.operationId ||
    evidence.providerId !== plan.providerId ||
    evidence.repositoryId !== plan.repositoryId ||
    evidence.remoteUrl !== plan.remoteUrl ||
    evidence.headSha !== plan.headSha ||
    evidence.hooks !== false ||
    evidence.submodules !== false ||
    evidence.lfs !== false ||
    evidence.credentialPersisted !== false ||
    evidence.simulation !== true
  )
    throw new DomainError(
      403,
      "Checkout identity or credential policy rejected",
    );
}
