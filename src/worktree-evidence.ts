import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { DomainError } from "./domain.js";

const MAX_FILE_BYTES = 16 << 20;
const MAX_TOTAL_BYTES = 64 << 20;
const MAX_FILES = 10000;
const unsafe = () =>
  new DomainError(
    409,
    "Untracked evidence is unsafe, changed or exceeds its limits",
  );

/** Hash bytes without following links, reading special files or modifying Git's index. */
export async function untrackedManifest(
  directory: string,
  listing: Buffer,
  signal?: AbortSignal,
) {
  const names = new TextDecoder("utf8", { fatal: true })
    .decode(listing)
    .split("\0")
    .filter(Boolean)
    .sort();
  if (names.length > MAX_FILES) throw unsafe();
  const entries: { path: string; mode: string; sha256: string }[] = [];
  let total = 0;
  for (const name of names) {
    signal?.throwIfAborted();
    if (
      isAbsolute(name) ||
      name.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw unsafe();
    const path = join(directory, name);
    if ((await realpath(dirname(path))) !== dirname(path)) throw unsafe();
    const before = await lstat(path);
    let bytes: Buffer;
    let mode: string;
    if (before.isSymbolicLink()) {
      bytes = await readlink(path, { encoding: "buffer" });
      mode = "120000";
    } else {
      if (
        !before.isFile() ||
        before.nlink !== 1 ||
        before.size > MAX_FILE_BYTES ||
        total + before.size > MAX_TOTAL_BYTES
      )
        throw unsafe();
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const opened = await file.stat();
        if (
          opened.dev !== before.dev ||
          opened.ino !== before.ino ||
          !opened.isFile()
        )
          throw unsafe();
        bytes = Buffer.alloc(before.size + 1);
        let count = 0;
        while (count < bytes.length) {
          signal?.throwIfAborted();
          const { bytesRead } = await file.read(
            bytes,
            count,
            Math.min(65536, bytes.length - count),
            count,
          );
          if (!bytesRead) break;
          count += bytesRead;
        }
        const after = await file.stat();
        if (
          count !== before.size ||
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs ||
          after.ctimeMs !== before.ctimeMs
        )
          throw unsafe();
        bytes = bytes.subarray(0, count);
        mode = before.mode & 0o111 ? "100755" : "100644";
      } finally {
        await file.close();
      }
    }
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) throw unsafe();
    const after = await lstat(path);
    if (
      after.ino !== before.ino ||
      after.dev !== before.dev ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw unsafe();
    entries.push({
      path: name,
      mode,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return entries;
}
