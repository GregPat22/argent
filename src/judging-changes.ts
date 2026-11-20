import type { WorkspaceChange } from "./domain.js";

export const DETAIL_LIMIT = 256;
export const FILE_DETAIL_LIMIT = 128;
export interface FileFindings<T> {
  readonly file: number;
  readonly entries: readonly T[] | null;
}
export const SKIP_MARKERS = [
  "test.skip",
  "it.skip",
  "describe.skip",
  "test.describe.skip",
  "xit",
  "xtest",
  "xdescribe",
] as const;
export interface SkipMarker {
  readonly marker: (typeof SKIP_MARKERS)[number];
  readonly line: number;
}
export interface ScriptChange {
  readonly name: string;
  readonly change: "added" | "removed" | "modified" | "moved";
}
export interface PackageChange {
  readonly location: string;
  readonly newInstallScript: boolean;
  readonly change: "added" | "removed" | "modified" | "moved";
  readonly before: string | null;
  readonly after: string | null;
}
export const isLockfile = (path: string) =>
  path === "package-lock.json" || path.endsWith("/package-lock.json");
export function validInstallation(value: unknown): value is string {
  if (!validFindingText(value)) return false;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    return false;
  const index = parts.lastIndexOf("node_modules");
  if (index < 0) return false;
  const name = parts.slice(index + 1);
  return (
    (name.length === 1 && !name[0]!.startsWith("@")) ||
    (name.length === 2 && name[0]!.startsWith("@") && name[0]!.length > 1)
  );
}
export const isManifest = (path: string) =>
  path === "package.json" || path.endsWith("/package.json");
export function validFindingText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value) <= 256 &&
    !/[\uD800-\uDFFF]/u.test(value)
  );
}
export interface JudgingChanges {
  /** Indexes in review order. Null means neither tree has a recognised path. */
  readonly testPaths: readonly number[] | null;
  readonly skips: readonly FileFindings<SkipMarker>[] | null;
  readonly packages: readonly FileFindings<PackageChange>[] | null;
  readonly scripts: readonly FileFindings<ScriptChange>[] | null;
  readonly commandPaths: readonly number[];
}

function countFindings(files: readonly FileFindings<unknown>[] | null): number {
  return files?.reduce((n, file) => n + (file.entries?.length ?? 1), 0) ?? 0;
}

export function judgingChangeCount(report: JudgingChanges): number {
  return (
    (report.testPaths?.length ?? 0) +
    report.commandPaths.length +
    countFindings(report.packages) +
    countFindings(report.scripts) +
    countFindings(report.skips)
  );
}

// Stable limit on the complete report, including unsummarised-file entries.
export function validJudgingChangeCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 2000
  );
}

const extension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const suffix = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/;
const directory = /(?:^|\/)(?:tests?|__tests__)\//;

export function isTestPath(path: string): boolean {
  return suffix.test(path) || (extension.test(path) && directory.test(path));
}

export function isCommandPath(path: string): boolean {
  if (
    path === "argent.json" ||
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)
  )
    return true;
  const name = path.slice(path.lastIndexOf("/") + 1);
  return (
    name === "tsconfig.json" ||
    name === ".prettierignore" ||
    /^(?:jest|vitest|playwright)\.config\.(?:[cm]?[jt]s)$/.test(name)
  );
}

export function changedPaths(
  files: readonly WorkspaceChange[],
  matches: (path: string) => boolean,
): number[] {
  return files.flatMap((file, index) =>
    matches(file.path) || (file.previousPath && matches(file.previousPath))
      ? [index]
      : [],
  );
}
