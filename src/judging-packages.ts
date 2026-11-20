import type { WorkspaceChange } from "./domain.js";
import type { Entry } from "./workspace-changes.js";
import { contentFindings, jsonObject, object } from "./judging-content.js";
import {
  isLockfile,
  validInstallation,
  validFindingText,
  type PackageChange,
} from "./judging-changes.js";

interface Installation {
  version: string;
  installScript: boolean;
}
function installations(bytes?: Buffer): Map<string, Installation> | null {
  const result = new Map<string, Installation>();
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
      (Object.hasOwn(metadata, "hasInstallScript") &&
        typeof metadata.hasInstallScript !== "boolean") ||
      (Object.hasOwn(metadata, "link") && typeof metadata.link !== "boolean")
    )
      return null;
    if (!location.split("/").includes("node_modules")) continue;
    if (!validInstallation(location)) return null;
    let version = metadata.version;
    let installScript = metadata.hasInstallScript === true;
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
        (version !== undefined && version !== target.version) ||
        (Object.hasOwn(metadata, "hasInstallScript") &&
          installScript !== (target.hasInstallScript === true))
      )
        return null;
      version = target.version;
      installScript = target.hasInstallScript === true;
    }
    if (!validFindingText(version)) return null;
    result.set(location, { version, installScript });
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
      const oldPackage = before.get(location),
        newPackage = after.get(location);
      const a = oldPackage?.version ?? null,
        b = newPackage?.version ?? null;
      const newInstallScript =
        newPackage?.installScript === true && !oldPackage?.installScript;
      const change =
        a === null
          ? "added"
          : b === null
            ? "removed"
            : moved
              ? "moved"
              : a !== b || newInstallScript
                ? "modified"
                : null;
      if (change)
        entries.push(
          Object.freeze({
            location,
            change,
            before: a,
            after: b,
            newInstallScript,
          }),
        );
    }
    return entries;
  });
}
