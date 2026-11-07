import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { DomainError } from "./domain.js";

export function checkDirectory(path: string, privateDirectory = false): void {
  const absolute = resolve(path);
  const info = lstatSync(absolute);
  if (
    !info.isDirectory() ||
    realpathSync(absolute) !== absolute ||
    (privateDirectory &&
      (info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700))
  )
    throw new DomainError(400, "History path requires a safe owned directory");
}

export function readHistoryFile(path: string, max: number): Buffer {
  let descriptor: number | undefined;
  try {
    checkDirectory(dirname(path));
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.size > max)
      throw new Error("unsafe file");
    // Read at most max + 1 bytes, even if a file grows after the initial stat.
    const buffer = Buffer.alloc(Math.min(before.size + 1, max + 1));
    let count = 0;
    while (count < buffer.length) {
      const read = readSync(
        descriptor,
        buffer,
        count,
        buffer.length - count,
        null,
      );
      if (read === 0) break;
      count += read;
    }
    const after = fstatSync(descriptor);
    if (
      count !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new Error("changed file");
    return buffer.subarray(0, count);
  } catch {
    throw new DomainError(
      400,
      "History file is unavailable, unsafe or too large",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function writeHistoryFile(path: string, content: string): void {
  const absolute = resolve(path);
  const directory = dirname(absolute);
  let temporary: string | undefined;
  try {
    checkDirectory(directory, true);
    const candidate = join(directory, `.argent-history-${randomUUID()}`);
    const descriptor = openSync(candidate, "wx", 0o600);
    temporary = candidate;
    try {
      writeFileSync(descriptor, content);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    // Linking publishes the whole file atomically and refuses any existing target.
    linkSync(temporary, absolute);
  } catch {
    throw new DomainError(
      400,
      "History output requires a new file in a private directory",
    );
  } finally {
    if (temporary !== undefined) unlinkSync(temporary);
  }
}
