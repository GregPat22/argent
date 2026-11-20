import type { WorkspaceChange } from "./domain.js";
import type { Entry } from "./workspace-changes.js";
import { contentFindings, jsonObject, object } from "./judging-content.js";
import {
  isLockfile,
  validInstallation,
  validFindingText,
  type PackageChange,
} from "./judging-changes.js";

function installations(bytes?: Buffer): Map<string, string> | null {
  const result = new Map<string, string>();
  if (!bytes) return result;
  const lock = jsonObject(bytes);
  if (
    !lock ||
    (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) ||
    !object(lock.packages) ||
    !Object.hasOwn(lock.packages, "") ||
    !object(lock.packages[""])
  )
    return null;
  const records = Object.entries(lock.packages);
  if (records.length > 1024) return null;
  for (const [location, metadata] of records) {
    if (
      !object(metadata) ||
      (Object.hasOwn(metadata, "link") && typeof metadata.link !== "boolean")
    )
      return null;
    if (!location.split("/").includes("node_modules")) continue;
    if (!validInstallation(location)) return null;
    let version = metadata.version;
    if (metadata.link === true) {
      if (
        typeof metadata.resolved !== "string" ||
        !metadata.resolved ||
        !Object.hasOwn(lock.packages, metadata.resolved) ||
        metadata.resolved === location
      )
        return null;
      const target = lock.packages[metadata.resolved];
      if (
        !object(target) ||
        target.link === true ||
        (version !== undefined && version !== target.version)
      )
        return null;
      version = target.version;
    }
    if (!validFindingText(version)) return null;
    result.set(location, version);
  }
  return result;
}

export function packageFindings(
  files: readonly WorkspaceChange[],
  base: ReadonlyMap<string, Entry>,
  head: ReadonlyMap<string, Entry>,
) {
  return contentFindings(files, base, head, isLockfile, (old, next, moved) => {
    const before = installations(old),
      after = installations(next);
    if (!before || !after) return null;
    const entries: PackageChange[] = [];
    for (const location of [
      ...new Set([...before.keys(), ...after.keys()]),
    ].sort()) {
      const a = before.get(location) ?? null,
        b = after.get(location) ?? null;
      const change =
        a === null
          ? "added"
          : b === null
            ? "removed"
            : moved
              ? "moved"
              : a !== b
                ? "modified"
                : null;
      if (change)
        entries.push(Object.freeze({ location, change, before: a, after: b }));
    }
    return entries;
  });
}
