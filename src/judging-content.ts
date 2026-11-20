import type { WorkspaceChange } from "./domain.js";
import type { Entry } from "./workspace-changes.js";
import {
  changedPaths,
  isManifest,
  isTestPath,
  type SkipMarker,
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
        !change.binary &&
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

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function jsonObject(bytes: Buffer): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return object(value) ? value : null;
  } catch {
    return null;
  }
}
function scripts(bytes: Buffer | undefined): Map<string, string> | null {
  const result = new Map<string, string>();
  if (!bytes) return result;
  const manifest = jsonObject(bytes);
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

// Match the documented declaration spellings, without evaluating repository code.
const call =
  /^[ \t]*(test\.describe\.skip|(?:test|it|describe)\.skip|xit|xtest|xdescribe)[ \t]*\([ \t]*/;
const literalTitle = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')[ \t]*(?=,|\))/;

function skipMarkers(bytes?: Buffer): (SkipMarker & { key: string })[] | null {
  if (!bytes) return [];
  const markers: (SkipMarker & { key: string })[] = [];
  const lines = bytes.toString("utf8").split(/\r\n|[\n\r\u2028\u2029]/);
  for (const [index, line] of lines.entries()) {
    const found = call.exec(line);
    if (!found) continue;
    const marker = found[1]!;
    const title = literalTitle.exec(line.slice(found[0].length))?.[0].trimEnd();
    if (!title || markers.length >= FILE_DETAIL_LIMIT) return null;
    markers.push({
      marker: marker as SkipMarker["marker"],
      line: index + 1,
      key: marker + ":" + title,
    });
  }
  return markers;
}

export function skipFindings(
  files: readonly WorkspaceChange[],
  base: ReadonlyMap<string, Entry>,
  head: ReadonlyMap<string, Entry>,
) {
  return contentFindings(files, base, head, isTestPath, (old, next) => {
    const before = skipMarkers(old),
      after = skipMarkers(next);
    if (!before || !after) return null;
    const counts = new Map<string, number>();
    for (const { key } of before) counts.set(key, (counts.get(key) ?? 0) + 1);
    return after.flatMap(({ key, marker, line }) => {
      const count = counts.get(key) ?? 0;
      if (!count) return [Object.freeze({ marker, line })];
      counts.set(key, count - 1);
      return [];
    });
  });
}
