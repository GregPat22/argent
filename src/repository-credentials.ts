import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DomainError } from "./domain.js";
import { tokenFrom } from "./repository-access.js";
import type {
  RepositoryOperation,
  RepositoryStore,
} from "./repository-store.js";

export interface SealedRepositoryCredential {
  keyId: string;
  nonce: Uint8Array;
  tag: Uint8Array;
  ciphertext: Uint8Array;
}

function context(op: RepositoryOperation): Buffer {
  return Buffer.from(
    JSON.stringify([
      "argent-repository-credential-v1",
      op.credentialReference,
      op.id,
      op.workspaceId,
      op.operatorId,
      op.providerId,
      op.repositoryId,
      op.installationId,
    ]),
  );
}

// Internal simulation custody only. The caller supplies a dedicated key from
// outside SQLite; this module never generates, persists or discovers host keys.
export class RepositoryCredentialVault {
  readonly simulation = true;
  readonly #key: Buffer;

  constructor(
    private readonly store: RepositoryStore,
    private readonly keyId: string,
    key: Uint8Array,
  ) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || key.byteLength !== 32)
      throw new DomainError(400, "Invalid repository custody key");
    this.#key = Buffer.from(key);
  }

  isFor(store: RepositoryStore): boolean {
    return this.store === store;
  }

  capture(id: string, fence: string, credential: string): void {
    if (tokenFrom({ token: credential }) === null)
      throw new DomainError(400, "Invalid repository credential");
    const op = this.store.operation(id);
    if (!op.credentialReference)
      throw new DomainError(409, "Repository custody intent is missing");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce);
    cipher.setAAD(context(op));
    const ciphertext = Buffer.concat([
      cipher.update(credential, "utf8"),
      cipher.final(),
    ]);
    this.store.captureCredential(id, fence, {
      keyId: this.keyId,
      nonce,
      tag: cipher.getAuthTag(),
      ciphertext,
    });
  }

  // operatorId is a trusted caller identity, not an authorization token. No
  // desktop/API exposes this method. Reads cannot mint, revoke or unlock work.
  recover(id: string, operatorId: string): string {
    const sealed = this.store.credentialRecord(id, operatorId);
    try {
      if (sealed.keyId !== this.keyId) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.#key, sealed.nonce);
      decipher.setAAD(context(this.store.operation(id)));
      decipher.setAuthTag(Buffer.from(sealed.tag));
      const credential = Buffer.concat([
        decipher.update(sealed.ciphertext),
        decipher.final(),
      ]).toString("utf8");
      if (tokenFrom({ token: credential }) === null) throw new Error();
      return credential;
    } catch {
      throw new DomainError(409, "Repository credential unavailable");
    }
  }
}
