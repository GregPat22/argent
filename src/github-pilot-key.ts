import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  type KeyObject,
} from "node:crypto";
import { constants } from "node:fs";
import { open, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { DomainError } from "./domain.js";

export class PilotGitHubSigner {
  #key: KeyObject;
  constructor(
    key: KeyObject,
    private readonly clientId: string,
  ) {
    this.#key = key;
  }
  jwt(now = Date.now()): string {
    if (!Number.isSafeInteger(now) || now < 1)
      throw new DomainError(400, "Invalid GitHub signing time");
    const encode = (data: object) =>
      Buffer.from(JSON.stringify(data)).toString("base64url");
    const seconds = Math.floor(now / 1000);
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: seconds - 60, exp: seconds + 120, iss: this.clientId })}`;
    return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), this.#key).toString("base64url")}`;
  }
}

// Single-host pilot loading only. This supplies no secret-service rotation,
// backup or managed-host trust boundary. Never search for a key or use env tokens.
export async function loadPilotGitHubSigner(
  path: string,
  fingerprint: string,
  clientId: string,
): Promise<PilotGitHubSigner> {
  if (
    !isAbsolute(path) ||
    !/^SHA256:[A-Za-z0-9+/]{43}=$/.test(fingerprint) ||
    !/^Iv[0-9A-Za-z]{10,80}$/.test(clientId)
  )
    throw new DomainError(400, "Invalid GitHub pilot signing configuration");
  try {
    const parent = dirname(path);
    const directory = await lstat(parent);
    if (
      !directory.isDirectory() ||
      directory.uid !== process.getuid!() ||
      (directory.mode & 0o777) !== 0o700 ||
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
        stat.size < 100 ||
        stat.size > 16384
      )
        throw new Error();
      const bytes = Buffer.alloc(16385);
      let key: KeyObject;
      try {
        const { bytesRead } = await file.read({ buffer: bytes, position: 0 });
        if (bytesRead !== stat.size || bytesRead > 16384) throw new Error();
        key = createPrivateKey(bytes.subarray(0, bytesRead));
      } finally {
        bytes.fill(0);
      }
      if (
        key.asymmetricKeyType !== "rsa" ||
        (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
      )
        throw new Error();
      const der = createPublicKey(key).export({ type: "spki", format: "der" });
      if (
        `SHA256:${createHash("sha256").update(der).digest("base64")}` !==
        fingerprint
      )
        throw new Error();
      return new PilotGitHubSigner(key, clientId);
    } finally {
      await file.close();
    }
  } catch {
    throw new DomainError(
      403,
      "GitHub pilot signing key is unavailable or unsafe",
    );
  }
}
