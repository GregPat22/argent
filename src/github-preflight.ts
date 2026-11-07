import { DomainError, requireInteger, requireString } from "./domain.js";
import { fullSha, record } from "./repository-access.js";

const ORIGIN = "https://api.github.com";
const API_VERSION = "2026-03-10";
const MAX_RESPONSE_BYTES = 128 * 1024;

// These identities must come from the trusted authentication/selection service,
// not from request JSON. This component does not implement that service.
export interface GitHubRepositoryBinding {
  operatorId: string;
  githubUserId: number;
  appId: number;
  installationId: number;
  repositoryId: number;
  repository: string;
  ref: string;
}

export interface GitHubPreflightCredentials {
  userAccessToken: string;
  appJwt: string;
}

export interface GitHubRepositoryObservation extends GitHubRepositoryBinding {
  kind: "read_only_preflight";
  source: "github_api" | "injected_transport";
  simulation: boolean;
  headSha: string;
  observedAt: number;
  apiVersion: typeof API_VERSION;
}

type ReadTransport = (url: URL, init: RequestInit) => Promise<Response>;

function denied(): never {
  throw new DomainError(403, "GitHub preflight identity or policy rejected");
}

// No durable/live bootstrap authority is returned. In particular this cannot
// implement the simulation worker's authorize/mint/checkout interfaces.
export async function inspectGitHubRepository(
  input: Readonly<GitHubRepositoryBinding>,
  operatorId: string,
  credentials: Readonly<GitHubPreflightCredentials>,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    transport?: ReadTransport;
  } = {},
): Promise<Readonly<GitHubRepositoryObservation>> {
  // Snapshot trusted inputs before the first await. Caller mutation cannot
  // switch repository identities or credentials during a multi-request check.
  const binding = Object.freeze({
    operatorId: requireString(input.operatorId, "operatorId", 128),
    githubUserId: requireInteger(
      input.githubUserId,
      "githubUserId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    appId: requireInteger(input.appId, "appId", 1, Number.MAX_SAFE_INTEGER),
    installationId: requireInteger(
      input.installationId,
      "installationId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    repositoryId: requireInteger(
      input.repositoryId,
      "repositoryId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    repository: requireString(input.repository, "repository", 250),
    ref: requireString(input.ref, "ref", 250),
  });
  if (binding.operatorId !== requireString(operatorId, "operatorId", 128))
    denied();
  const repository =
    /^https:\/\/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/.exec(
      binding.repository,
    );
  if (
    !repository ||
    [".", ".."].includes(repository[2]!) ||
    repository[2]!.endsWith(".git")
  )
    throw new DomainError(400, "Expected a canonical GitHub repository URL");
  if (
    !/^refs\/heads\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(
      binding.ref,
    ) ||
    /\.\.|\.(?:\/|$)|\.lock(?:\/|$)/.test(binding.ref)
  )
    throw new DomainError(400, "Expected an explicit branch ref");
  const userToken = requireString(
    credentials.userAccessToken,
    "userAccessToken",
    512,
  );
  const appJwt = requireString(credentials.appJwt, "appJwt", 4096);
  if (
    !/^ghu_[A-Za-z0-9_]{8,508}$/.test(userToken) ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(appJwt)
  )
    throw new DomainError(400, "Invalid GitHub preflight credential format");
  const timeoutMs = requireInteger(
    options.timeoutMs ?? 1000,
    "timeoutMs",
    100,
    5000,
  );
  const transport = options.transport ?? ((url, init) => fetch(url, init));
  const simulation = options.transport !== undefined;
  const callerSignal = options.signal;
  const deadlineAt = Date.now() + timeoutMs;
  const controller = new AbortController();
  const abort = () => controller.abort();
  callerSignal?.addEventListener("abort", abort, { once: true });
  if (callerSignal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  const cancelled = new Promise<never>((_, reject) => {
    const fail = () =>
      reject(new DomainError(408, "GitHub preflight interrupted"));
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener("abort", fail, { once: true });
  });
  // A pre-aborted caller must not create an unhandled rejection before the
  // first bounded request, and must never send credentials.
  void cancelled.catch(() => {});
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    if (Date.now() >= deadlineAt) controller.abort();
    controller.signal.throwIfAborted();
    return Promise.race([work(), cancelled]);
  }
  async function get(
    path: string,
    credential: string,
  ): Promise<Record<string, unknown>> {
    const response = await bounded(() =>
      transport(new URL(path, ORIGIN), {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${credential}`,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "Argent-ReadOnly-Preflight/0.0.1",
        },
        signal: controller.signal,
      }),
    );
    if (response.status !== 200 || response.redirected) denied();
    // Never follow response URLs or Location/Link headers. Even a custom
    // transport returning a followed redirect cannot vouch for the target.
    if (response.url && response.url !== new URL(path, ORIGIN).href) denied();
    const length = response.headers.get("content-length");
    if (
      length !== null &&
      (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
    )
      denied();
    if (
      !response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        ?.toLowerCase()
        .match(/^application\/json$/)
    )
      denied();
    if (!response.body) denied();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await bounded(() => reader.read());
        if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) denied();
        chunks.push(next.value);
      }
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } finally {
      // Cancellation is best effort; a hostile/hung injected stream must not
      // extend the overall deadline while this function unwinds.
      void reader.cancel().catch(() => {});
    }
  }
  try {
    const user = await get("/user", userToken);
    if (user.id !== binding.githubUserId) denied();
    const path = `/repos/${repository[1]}/${repository[2]}`;
    const repo = await get(path, userToken);
    if (
      repo.id !== binding.repositoryId ||
      repo.archived !== false ||
      repo.disabled !== false ||
      record(repo.permissions).pull !== true
    )
      denied();
    const installation = await get(`${path}/installation`, appJwt);
    const permissions = record(installation.permissions);
    if (
      installation.id !== binding.installationId ||
      installation.app_id !== binding.appId ||
      installation.suspended_at !== null ||
      installation.repository_selection !== "selected" ||
      permissions.contents !== "read" ||
      Object.entries(permissions).some(
        ([name, access]) =>
          !["contents", "metadata"].includes(name) || access !== "read",
      )
    )
      denied();
    const branch = binding.ref
      .slice("refs/".length)
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const reference = await get(`${path}/git/ref/${branch}`, userToken);
    const object = record(reference.object);
    if (reference.ref !== binding.ref || object.type !== "commit") denied();
    const headSha = fullSha(object.sha);
    if (controller.signal.aborted || Date.now() >= deadlineAt)
      throw new DomainError(408, "GitHub preflight interrupted");
    return Object.freeze({
      ...binding,
      kind: "read_only_preflight",
      headSha,
      observedAt: Date.now(),
      source: simulation ? "injected_transport" : "github_api",
      simulation,
      apiVersion: API_VERSION,
    });
  } catch (error) {
    // HTTP/provider text and transport errors may contain tokens or private
    // repository data. Only our fixed local errors cross this boundary.
    if (controller.signal.aborted || Date.now() >= deadlineAt)
      throw new DomainError(408, "GitHub preflight interrupted");
    if (
      error instanceof DomainError &&
      error.message === "GitHub preflight identity or policy rejected"
    )
      denied();
    throw new DomainError(502, "GitHub preflight request failed");
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
