import type { WorkspaceChange } from "./domain.js";

export interface JudgingChanges {
  /** Indexes in review order. Null means neither tree has a recognised path. */
  readonly testPaths: readonly number[] | null;
}

const extension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const suffix = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/;
const directory = /(?:^|\/)(?:tests?|__tests__)\//;

export function isTestPath(path: string): boolean {
  return suffix.test(path) || (extension.test(path) && directory.test(path));
}

export function changedTestPaths(files: readonly WorkspaceChange[]): number[] {
  return files.flatMap((file, index) =>
    isTestPath(file.path) ||
    (file.previousPath && isTestPath(file.previousPath))
      ? [index]
      : [],
  );
}
