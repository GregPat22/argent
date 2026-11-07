import { setTimeout as delay } from "node:timers/promises";
import { DomainError, requireInteger } from "./domain.js";
import { record } from "./repository-access.js";
import {
  inspectGitHubRepository,
  type GitHubRepositoryBinding,
} from "./github-preflight.js";

export interface GitHubDevicePrompt {
  userCode: string;
  verificationUri: "https://github.com/login/device";
  expiresAt: number;
  simulation: boolean;
}

type Transport = (url: URL, init: RequestInit) => Promise<Response>;
interface Clock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
const clock: Clock = {
  now: Date.now,
  async sleep(ms, signal) {
    await delay(ms, undefined, { signal });
  },
};
const interrupted = () =>
  new DomainError(408, "GitHub sign-in expired or cancelled");
const rejected = () => new DomainError(403, "GitHub sign-in rejected");

// A trusted control-plane session. No credential getter/JSON field or renderer
// bridge exists. Closing forgets a local token; it does not revoke GitHub's grant.
export class GitHubDeviceSession {
  #accessToken: string | null;
  constructor(
    token: string,
    readonly expiresAt: number,
    private readonly transport: Transport | undefined,
    private readonly time: Clock,
  ) {
    this.#accessToken = token;
  }
  get simulation() {
    return this.transport !== undefined;
  }
  close(): void {
    this.#accessToken = null;
  }
  toJSON() {
    return {
      kind: "github_device_session",
      simulation: this.simulation,
      expiresAt: this.expiresAt,
      closed: this.#accessToken === null,
    };
  }
  async preflight(
    binding: GitHubRepositoryBinding,
    operatorId: string,
    appJwt: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ) {
    if (
      this.#accessToken === null ||
      this.time.now() + (options.timeoutMs ?? 1000) >= this.expiresAt
    )
      throw interrupted();
    return inspectGitHubRepository(
      binding,
      operatorId,
      { userAccessToken: this.#accessToken, appJwt },
      {
        ...options,
        ...(this.transport ? { transport: this.transport } : {}),
      },
    );
  }
}

export async function signInGitHubDevice(
  clientId: string,
  repositoryId: number,
  onPrompt: (prompt: Readonly<GitHubDevicePrompt>) => void,
  options: {
    signal?: AbortSignal;
    maxRuntimeMs?: number;
    transport?: Transport;
    clock?: Clock;
  } = {},
): Promise<GitHubDeviceSession> {
  if (typeof clientId !== "string" || !/^Iv[0-9A-Za-z]{10,80}$/.test(clientId))
    throw new DomainError(400, "Invalid GitHub App client ID");
  requireInteger(repositoryId, "repositoryId", 1, Number.MAX_SAFE_INTEGER);
  const runtime = requireInteger(
    options.maxRuntimeMs ?? 900000,
    "maxRuntimeMs",
    1000,
    900000,
  );
  const injectedTransport = options.transport;
  if (options.clock && !injectedTransport)
    throw new DomainError(400, "A test clock requires a simulated transport");
  const time = options.clock ?? clock;
  const transport = injectedTransport ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const caller = options.signal;
  const abort = () => controller.abort();
  caller?.addEventListener("abort", abort, { once: true });
  if (caller?.aborted) abort();
  const timer = setTimeout(abort, runtime);
  let deadlineAt = time.now() + runtime;
  function active() {
    if (controller.signal.aborted || time.now() >= deadlineAt)
      throw interrupted();
  }
  async function post(
    path: "/login/device/code" | "/login/oauth/access_token",
    fields: Record<string, string>,
  ) {
    active();
    const requestController = new AbortController();
    const cancel = () => requestController.abort();
    controller.signal.addEventListener("abort", cancel, { once: true });
    const requestTimer = setTimeout(cancel, 5000);
    let rejectAbort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(interrupted());
      requestController.signal.addEventListener("abort", rejectAbort, {
        once: true,
      });
    });
    async function bounded<T>(work: () => Promise<T>): Promise<T> {
      active();
      requestController.signal.throwIfAborted();
      const result = await Promise.race([work(), cancelled]);
      active();
      return result;
    }
    try {
      const url = new URL(path, "https://github.com");
      const response = await bounded(() =>
        transport(url, {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Argent-Device-Pilot/0.0.1",
          },
          body: new URLSearchParams(fields).toString(),
          signal: requestController.signal,
        }),
      );
      if (
        response.status !== 200 ||
        response.redirected ||
        (response.url && response.url !== url.href) ||
        response.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase() !== "application/json" ||
        !response.body
      )
        throw rejected();
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > 16384))
        throw rejected();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await bounded(() => reader.read());
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 16384) throw rejected();
          chunks.push(next.value);
        }
        return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } finally {
        void reader.cancel().catch(() => {});
      }
    } catch {
      if (controller.signal.aborted || time.now() >= deadlineAt)
        throw interrupted();
      throw new DomainError(502, "GitHub sign-in request failed");
    } finally {
      clearTimeout(requestTimer);
      controller.signal.removeEventListener("abort", cancel);
      requestController.signal.removeEventListener("abort", rejectAbort);
      requestController.abort();
    }
  }
  try {
    const startedAt = time.now();
    const code = await post("/login/device/code", { client_id: clientId });
    if (
      typeof code.device_code !== "string" ||
      !/^[a-zA-Z0-9]{40}$/.test(code.device_code) ||
      typeof code.user_code !== "string" ||
      !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.user_code) ||
      code.verification_uri !== "https://github.com/login/device" ||
      !Number.isSafeInteger(code.expires_in) ||
      (code.expires_in as number) < 1 ||
      (code.expires_in as number) > 900 ||
      !Number.isSafeInteger(code.interval) ||
      (code.interval as number) < 1 ||
      (code.interval as number) > 60
    )
      throw rejected();
    deadlineAt = Math.min(
      deadlineAt,
      startedAt + (code.expires_in as number) * 1000,
    );
    let interval = (code.interval as number) * 1000;
    let nextPollAt = time.now() + interval;
    onPrompt(
      Object.freeze({
        userCode: code.user_code,
        verificationUri: "https://github.com/login/device",
        expiresAt: deadlineAt,
        simulation: injectedTransport !== undefined,
      }),
    );
    for (;;) {
      active();
      await time.sleep(
        Math.min(
          Math.max(0, nextPollAt - time.now()),
          Math.max(0, deadlineAt - time.now()),
        ),
        controller.signal,
      );
      active();
      const requestedAt = time.now();
      const result = await post("/login/oauth/access_token", {
        client_id: clientId,
        device_code: code.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        repository_id: String(repositoryId),
      });
      if (result.error !== undefined) {
        if (Object.hasOwn(result, "access_token")) throw rejected();
        // Only explicit protocol pending/slow-down responses permit another
        // poll. A lost/uncertain exchange response never triggers a retry.
        if (result.error === "slow_down") {
          if (
            result.interval !== undefined &&
            (!Number.isSafeInteger(result.interval) ||
              (result.interval as number) < 1 ||
              (result.interval as number) > 900)
          )
            throw rejected();
          interval = Math.max(
            interval + 5000,
            ((result.interval as number) ?? 0) * 1000,
          );
        } else if (result.error !== "authorization_pending") throw rejected();
        nextPollAt = time.now() + interval;
        continue;
      }
      if (
        typeof result.access_token !== "string" ||
        !/^ghu_[A-Za-z0-9_]{8,508}$/.test(result.access_token) ||
        result.token_type !== "bearer" ||
        result.scope !== "" ||
        !Number.isSafeInteger(result.expires_in) ||
        (result.expires_in as number) < 1 ||
        (result.expires_in as number) > 28800
      )
        throw rejected();
      active();
      return new GitHubDeviceSession(
        result.access_token,
        requestedAt + (result.expires_in as number) * 1000,
        injectedTransport,
        time,
      );
    }
  } catch (error) {
    if (controller.signal.aborted || time.now() >= deadlineAt)
      throw interrupted();
    if (
      error instanceof DomainError &&
      error.message === "GitHub sign-in rejected"
    )
      throw rejected();
    throw new DomainError(502, "GitHub sign-in request failed");
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", abort);
    abort();
  }
}
