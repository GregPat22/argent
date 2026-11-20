import type { WorkspaceChange } from "./domain.js";
import type { Entry } from "./workspace-changes.js";
import { contentFindings, jsonObject, object } from "./judging-content.js";
import {
  isLockfile,
  validInstallation,
  validFindingText,
  type PackageChange,
  type PackageSource,
} from "./judging-changes.js";

interface Installation {
  version: string;
  installScript: boolean;
  reference: string | null;
  source: PackageSource;
}
function sourceKind(value: string | null, link: boolean): PackageSource | null {
  if (value === null) return "not recorded";
  if (
    link &&
    /^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !/^(?:file:|link:|[a-z]:[\\/])/i.test(value)
  )
    return null;
  if (link || /^(?:file:|link:|\.{1,2}[\\/]|[\\/]|[a-z]:[\\/])/i.test(value))
    return "local path";
  if (
    /^(?:git(?:\+[a-z0-9.-]+)?:|ssh:|git@|github:|gitlab:|bitbucket:|gist:)/i.test(
      value,
    ) ||
    // The optional fragment can name a branch or an npm semver range.
    /^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+(?:#|$)/i.test(value)
  )
    return "Git reference";
  if (/^https?:/i.test(value)) {
    if (!/^https?:\/\/[^/]/i.test(value) || /[\s\\]/.test(value)) return null;
    const url = URL.parse(value);
    if (!url) return null;
    return url.origin === "https://registry.npmjs.org"
      ? "npm registry URL"
      : "HTTP(S) URL";
  }
  return "other reference";
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
      (Object.hasOwn(metadata, "resolved") &&
        (typeof metadata.resolved !== "string" ||
          !metadata.resolved ||
          Buffer.byteLength(metadata.resolved) > 4096 ||
          /[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(
            metadata.resolved,
          ))) ||
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
    const reference =
      typeof metadata.resolved === "string" ? metadata.resolved : null;
    const source = sourceKind(reference, metadata.link === true);
    if (!source) return null;
    result.set(location, { version, installScript, reference, source });
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
      const resolution =
        newPackage &&
        (oldPackage
          ? oldPackage.reference !== newPackage.reference ||
            oldPackage.source !== newPackage.source
          : newPackage.reference !== null)
          ? Object.freeze({
              before: oldPackage?.source ?? null,
              after: newPackage.source,
            })
          : null;
      const change =
        a === null
          ? "added"
          : b === null
            ? "removed"
            : moved
              ? "moved"
              : a !== b || newInstallScript || resolution
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
            resolution,
          }),
        );
    }
    return entries;
  });
}
