export const REPO_URL = "https://github.com/GregPat22/argent";
export const DOCS_URL = `${REPO_URL}/blob/main/docs/PROJECT_CONTEXT.md`;
export const ROADMAP_URL = `${REPO_URL}/blob/main/ROADMAP.md`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/** Facts quoted from the repository. Update them when the repository changes. */
export const M0 = {
  testsPassed: 22,
  testsTotal: 22,
} as const;

export type Status = "live" | "next" | "planned" | "policy";

export const STATUS_LABEL: Record<Status, string> = {
  live: "Works today in M0",
  next: "In development",
  planned: "Planned",
  policy: "Project rule",
};
