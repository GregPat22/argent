import type { WorkspaceChange } from "./domain.js";

export const DETAIL_LIMIT = 256;
export const FILE_DETAIL_LIMIT = 128;
export interface FileFindings<T> {
  readonly file: number;
  readonly entries: readonly T[] | null;
}
export interface ScriptChange {
  readonly name: string;
  readonly change: "added" | "removed" | "modified" | "moved";
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
  readonly scripts: readonly FileFindings<ScriptChange>[] | null;
  readonly commandPaths: readonly number[];
}

export function judgingChangeCount(report: JudgingChanges): number {
  return (
    (report.testPaths?.length ?? 0) +
    report.commandPaths.length +
    (report.scripts?.reduce((n, file) => n + (file.entries?.length ?? 1), 0) ??
      0)
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
