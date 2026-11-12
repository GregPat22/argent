export const SITE_URL = "https://argent.build";
export const SITE_TITLE = "Argent: AI coding agents you can verify";
export const SITE_DESCRIPTION =
  "Open-source desktop app for Claude Code in local Git worktrees. Review changes and durable run records. Early prototype; trusted checks planned.";

export const REPO_URL = "https://github.com/GregPat22/argent";
export const DOCS_URL = `${REPO_URL}#readme`;
export const ARCHITECTURE_URL = `${REPO_URL}/blob/main/ARCHITECTURE.md`;
export const ROADMAP_URL = `${REPO_URL}/blob/main/ROADMAP.md`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const X_URL = "https://x.com/Argent_build";

export type Status = "live" | "next" | "planned" | "policy";

export const STATUS_LABEL: Record<Status, string> = {
  live: "Works today",
  next: "In development",
  planned: "Planned",
  policy: "Project rule",
};
export const CONTRIBUTING_URL = `${REPO_URL}/blob/main/CONTRIBUTING.md`;
export const LOCAL_MVP_URL = `${REPO_URL}/blob/main/docs/specs/0013-local-mvp.md`;
