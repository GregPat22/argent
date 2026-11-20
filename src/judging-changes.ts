import type { WorkspaceChange } from "./domain.js";

export interface JudgingChanges {
  /** Indexes in review order. Null means neither tree has a recognised path. */
  readonly testPaths: readonly number[] | null;
  readonly commandPaths: readonly number[];
}

export function judgingChangeCount(report: JudgingChanges): number {
  return (report.testPaths?.length ?? 0) + report.commandPaths.length;
}

// At most two path entries per file within the 1,000-file full-review limit.
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
