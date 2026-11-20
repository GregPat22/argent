import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The compiled engine and desktop code: the tree the detached service runs
// from. A plain `tsc` rebuild updates it, so no separately generated file can
// go stale against the code that actually loads.
const root = fileURLToPath(new URL("..", import.meta.url));

let cached: string | undefined;

function files(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...files(path));
    else if (entry.isFile() && /\.c?js$/.test(entry.name)) found.push(path);
  }
  return found;
}

/**
 * SHA-256 over every compiled module path under `directory` and its bytes.
 * Two trees give the same value only when they hold the same code. It
 * identifies a build for compatibility; it is not an integrity proof.
 */
export function treeIdentity(directory: string): string {
  const hash = createHash("sha256");
  const paths = files(directory)
    .map((path) => ({
      path,
      name: relative(directory, path).split(sep).join("/"),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const { path, name } of paths) {
    const bytes = readFileSync(path);
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

/** This process's build, read once so it describes the code already loaded. */
export function buildIdentity(): string {
  return (cached ??= treeIdentity(root));
}
