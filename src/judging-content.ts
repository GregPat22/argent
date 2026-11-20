import type { WorkspaceChange } from "./domain.js";
import type { Entry } from "./workspace-changes.js";
import {
  changedPaths,
  isManifest,
  type FileFindings,
  type ScriptChange,
  DETAIL_LIMIT,
  FILE_DETAIL_LIMIT,
  validFindingText,
} from "./judging-changes.js";

/** All bytes here were read and verified by the pinned candidate review. */
export function contentFindings<T>(
  files: readonly WorkspaceChange[],
  base: ReadonlyMap<string, Entry>,
  head: ReadonlyMap<string, Entry>,
  matches: (path: string) => boolean,
  compare: (
    before: Buffer | undefined,
    after: Buffer | undefined,
    moved: boolean,
  ) => T[] | null,
): readonly FileFindings<T>[] | null {
  if (![...base.keys()].some(matches) && ![...head.keys()].some(matches))
    return null;
  let available = DETAIL_LIMIT;
  return Object.freeze(
    changedPaths(files, matches).map((file) => {
      const change = files[file]!;
      const original = change.previousPath ?? change.path;
      const old = matches(original) ? base.get(original) : undefined;
      const next = matches(change.path) ? head.get(change.path) : undefined;
      let entries: T[] | null = null;
      if (
        [old, next].every(
          (side) =>
            !side ||
            (side.mode !== "120000" &&
              side.bytes &&
              side.bytes.length <= 64 * 1024),
        )
      ) {
        entries = compare(
          old?.bytes,
          next?.bytes,
          !!old && !!next && original !== change.path,
        );
      }
      if (entries && entries.length > available) entries = null;
      available -= entries?.length ?? 0;
      return Object.freeze({
        file,
        entries: entries && Object.freeze(entries),
      });
    }),
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scripts(bytes: Buffer | undefined): Map<string, string> | null {
  const result = new Map<string, string>();
  if (!bytes) return result;
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return null;
  }
  if (!object(manifest)) return null;
  if (!Object.hasOwn(manifest, "scripts")) return result;
  if (!object(manifest.scripts)) return null;
  const pairs = Object.entries(manifest.scripts);
  if (pairs.length > FILE_DETAIL_LIMIT) return null;
  for (const [name, command] of pairs) {
    if (!validFindingText(name) || typeof command !== "string") return null;
    result.set(name, command);
  }
  return result;
}

export function scriptFindings(
  files: readonly WorkspaceChange[],
  base: ReadonlyMap<string, Entry>,
  head: ReadonlyMap<string, Entry>,
) {
  return contentFindings(files, base, head, isManifest, (old, next, moved) => {
    const before = scripts(old),
      after = scripts(next);
    if (!before || !after) return null;
    const changes: ScriptChange[] = [];
    for (const name of [
      ...new Set([...before.keys(), ...after.keys()]),
    ].sort()) {
      const change = !before.has(name)
        ? "added"
        : !after.has(name)
          ? "removed"
          : moved
            ? "moved"
            : before.get(name) !== after.get(name)
              ? "modified"
              : null;
      if (change) changes.push(Object.freeze({ name, change }));
    }
    return changes;
  });
}
