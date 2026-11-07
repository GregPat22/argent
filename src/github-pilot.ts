import { constants } from "node:fs";
import { open, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { DomainError, requireInteger, requireString } from "./domain.js";
import { record } from "./repository-access.js";
import {
  signInGitHubDevice,
  type GitHubDevicePrompt,
} from "./github-device.js";
import { loadPilotGitHubSigner } from "./github-pilot-key.js";
import type { GitHubRepositoryBinding } from "./github-preflight.js";

export interface GitHubPilotConfig {
  githubUserId: number;
  appId: number;
  clientId: string;
  installationId: number;
  repositoryId: number;
  repository: string;
  ref: string;
  keyPath: string;
  keyFingerprint: string;
}

export async function readGitHubPilotConfig(
  path: string,
): Promise<GitHubPilotConfig> {
  if (!isAbsolute(path))
    throw new DomainError(
      400,
      "Expected an absolute private pilot config path",
    );
  let value: unknown;
  try {
    const parent = dirname(path);
    const dir = await lstat(parent);
    if (
      !dir.isDirectory() ||
      dir.uid !== process.getuid!() ||
      (dir.mode & 0o777) !== 0o700 ||
      (await realpath(parent)) !== parent
    )
      throw new Error();
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.uid !== process.getuid!() ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.nlink !== 1 ||
        stat.size > 16384
      )
        throw new Error();
      const bytes = Buffer.alloc(16385);
      const { bytesRead } = await file.read({ buffer: bytes, position: 0 });
      if (bytesRead !== stat.size || bytesRead > 16384) throw new Error();
      value = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
    } finally {
      await file.close();
    }
  } catch {
    throw new DomainError(
      403,
      "GitHub pilot configuration is unavailable or unsafe",
    );
  }
  const data = record(value);
  const names = [
    "githubUserId",
    "appId",
    "clientId",
    "installationId",
    "repositoryId",
    "repository",
    "ref",
    "keyPath",
    "keyFingerprint",
  ];
  if (Object.keys(data).some((name) => !names.includes(name)))
    throw new DomainError(400, "Unexpected GitHub pilot configuration field");
  const config: GitHubPilotConfig = {
    githubUserId: requireInteger(
      data.githubUserId,
      "githubUserId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    appId: requireInteger(data.appId, "appId", 1, Number.MAX_SAFE_INTEGER),
    clientId: requireString(data.clientId, "clientId", 100),
    installationId: requireInteger(
      data.installationId,
      "installationId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    repositoryId: requireInteger(
      data.repositoryId,
      "repositoryId",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    repository: requireString(data.repository, "repository", 250),
    ref: requireString(data.ref, "ref", 250),
    keyPath: requireString(data.keyPath, "keyPath", 4096),
    keyFingerprint: requireString(data.keyFingerprint, "keyFingerprint", 100),
  };
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(
      config.repository,
    ) ||
    [".", ".."].includes(config.repository.split("/").at(-1)!) ||
    config.repository.endsWith(".git") ||
    !/^refs\/heads\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(
      config.ref,
    ) ||
    /\.\.|\.(?:\/|$)|\.lock(?:\/|$)/.test(config.ref)
  )
    throw new DomainError(400, "Invalid GitHub pilot repository selection");
  return Object.freeze(config);
}

export async function runGitHubPilot(
  config: Readonly<GitHubPilotConfig>,
  onPrompt: (prompt: Readonly<GitHubDevicePrompt>) => void,
  options: Parameters<typeof signInGitHubDevice>[3] = {},
) {
  const selection = Object.freeze({ ...config });
  const signer = await loadPilotGitHubSigner(
    selection.keyPath,
    selection.keyFingerprint,
    selection.clientId,
  );
  const operatorId = `local-uid:${process.getuid!()}`;
  const binding: GitHubRepositoryBinding = {
    operatorId,
    githubUserId: selection.githubUserId,
    appId: selection.appId,
    installationId: selection.installationId,
    repositoryId: selection.repositoryId,
    repository: selection.repository,
    ref: selection.ref,
  };
  const session = await signInGitHubDevice(
    selection.clientId,
    selection.repositoryId,
    onPrompt,
    options,
  );
  try {
    const observation = await session.preflight(
      binding,
      operatorId,
      signer.jwt(),
      {
        ...(options?.signal ? { signal: options.signal } : {}),
        timeoutMs: 5000,
      },
    );
    return Object.freeze({
      kind: "github_read_only_pilot_receipt" as const,
      observation,
      sessionTokensRetained: false,
      installationTokenMinted: false,
      checkoutExecuted: false,
      durableExecutionGrant: false,
    });
  } finally {
    session.close();
  }
}
