import { closeSync, constants, fstatSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DomainError } from "./domain.js";
import { checkDirectory } from "./continuity-files.js";
import {
  decodeHistory,
  historicalView,
  isHistoryDigest,
} from "./continuity.js";

const APPLICATION_ID = 0x41524748;

export interface ImportReceipt {
  id: string;
  importedAt: number;
  readOnly: true;
  simulation: true;
  trust: "historical-untrusted";
}

export class ContinuityStore {
  private readonly db: DatabaseSync;

  constructor(path: string, readOnly = false) {
    const absolute = resolve(path);
    let db: DatabaseSync | undefined;
    try {
      checkDirectory(dirname(absolute), true);
      let created = false;
      let descriptor: number;
      try {
        descriptor = openSync(
          absolute,
          readOnly
            ? constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
            : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
          0o600,
        );
        created = !readOnly;
      } catch (error) {
        if (
          readOnly ||
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "EEXIST"
        )
          throw error;
        descriptor = openSync(
          absolute,
          constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
      }
      try {
        const info = fstatSync(descriptor);
        if (
          !info.isFile() ||
          info.nlink !== 1 ||
          info.uid !== process.getuid?.() ||
          (info.mode & 0o777) !== 0o600
        )
          throw new Error("unsafe history store");
      } finally {
        closeSync(descriptor);
      }
      db = new DatabaseSync(absolute, { readOnly });
      db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
      if (created) {
        db.exec(`BEGIN IMMEDIATE;
          PRAGMA application_id = ${APPLICATION_ID};
          PRAGMA user_version = 1;
          CREATE TABLE history_bundles (
            id TEXT PRIMARY KEY, bundle TEXT NOT NULL, imported_at INTEGER NOT NULL
          ) STRICT;
          CREATE TABLE history_events (
            id TEXT PRIMARY KEY REFERENCES history_bundles(id),
            type TEXT NOT NULL CHECK(type = 'history.imported'), created_at INTEGER NOT NULL
          ) STRICT;
          COMMIT;`);
      }
      if (
        db.prepare("PRAGMA application_id").get()!.application_id !==
          APPLICATION_ID ||
        db.prepare("PRAGMA user_version").get()!.user_version !== 1
      )
        throw new Error("wrong history database");
      if (!readOnly) db.exec("PRAGMA synchronous = FULL;");
      this.db = db;
    } catch {
      db?.close();
      throw new DomainError(
        400,
        "History store requires a private Argent history database",
      );
    }
  }

  close(): void {
    this.db.close();
  }

  restore(bytes: Uint8Array): ImportReceipt {
    // Keep no reference to caller-owned mutable bytes; validate before any write.
    const bundle = decodeHistory(bytes);
    const serialized = JSON.stringify(bundle);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db
        .prepare("SELECT imported_at FROM history_bundles WHERE id = ?")
        .get(bundle.sha256);
      const importedAt = prior ? (prior.imported_at as number) : Date.now();
      if (!prior) {
        this.db
          .prepare("INSERT INTO history_bundles VALUES (?, ?, ?)")
          .run(bundle.sha256, serialized, importedAt);
        this.db
          .prepare(
            "INSERT INTO history_events VALUES (?, 'history.imported', ?)",
          )
          .run(bundle.sha256, importedAt);
      }
      this.db.exec("COMMIT");
      return this.receipt(bundle.sha256, importedAt);
    } catch {
      this.db.exec("ROLLBACK");
      throw new DomainError(409, "History import did not commit");
    }
  }

  private receipt(id: string, importedAt: number): ImportReceipt {
    return {
      id,
      importedAt,
      readOnly: true,
      simulation: true,
      trust: "historical-untrusted",
    };
  }

  list(
    limit = 50,
    before?: string,
  ): { items: ImportReceipt[]; nextCursor: string | null } {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (before !== undefined && !isHistoryDigest(before))
    )
      throw new DomainError(400, "Invalid history page");
    const rows = this.db
      .prepare(
        "SELECT id, imported_at FROM history_bundles WHERE id < ? ORDER BY id DESC LIMIT ?",
      )
      .all(before ?? "g", limit + 1);
    const items = rows
      .slice(0, limit)
      .map((row) => this.receipt(row.id as string, row.imported_at as number));
    return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
  }

  show(id: string) {
    if (!isHistoryDigest(id))
      throw new DomainError(400, "Invalid history identity");
    const row = this.db
      .prepare("SELECT bundle FROM history_bundles WHERE id = ?")
      .get(id);
    if (!row) throw new DomainError(404, "History import not found");
    const bundle = decodeHistory(Buffer.from(row.bundle as string));
    if (bundle.sha256 !== id)
      throw new DomainError(409, "History identity mismatch");
    return historicalView(bundle);
  }
}
