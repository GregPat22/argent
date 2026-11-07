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
