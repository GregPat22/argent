export interface PublicationRefs {
  repository: string;
  baseBranch: string;
  baseSha: string;
  branch: string;
  headSha: string;
}

export interface PublicationTarget extends PublicationRefs {
  title: string;
  body: string;
}

export interface PublicationInput {
  reviewIdentity: string;
  repository: string;
  baseBranch: string;
  title: string;
}
export interface PublicationReview extends PublicationInput, PublicationTarget {
  workspaceId: string;
  identity: string;
  commitCount: number;
}

export interface PublicationStatus extends PublicationRefs {
  workspaceId: string;
  identity: string;
  phase: "push" | "draft" | "complete";
  status: "needs_attention" | "published";
  url: string | null;
}

export const PUBLICATION_MAX_COMMITS = 64;

const matches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === "string" && pattern.exec(value)?.[0] === value;

export const githubRepository = (value: unknown): value is string =>
  matches(
    value,
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/[A-Za-z0-9._-]{1,100}$/,
  ) &&
  ![".", ".."].includes(value.split("/")[1]!) &&
  !/\.git$/i.test(value);
export const publicationBaseRef = (value: unknown): value is string =>
  matches(value, /^[a-zA-Z0-9_][a-zA-Z0-9._/-]{0,254}$/) &&
  !value.includes("..") &&
  !value.startsWith("refs/") &&
  value
    .split("/")
    .every(
      (part) =>
        part &&
        !part.startsWith(".") &&
        !part.endsWith(".") &&
        !part.endsWith(".lock"),
    );

export function publicationTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    !/[\p{Cc}\p{Bidi_Control}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)
  );
}

/** GitHub's GraphQL pull request number is a positive signed 32-bit integer. */
export function publicationNumber(
  value: unknown,
  repository: string,
): number | null {
  const prefix = `https://github.com/${repository}/pull/`;
  if (
    !githubRepository(repository) ||
    typeof value !== "string" ||
    !value.startsWith(prefix)
  )
    return null;
  const suffix = value.slice(prefix.length);
  if (!matches(suffix, /^[1-9][0-9]{0,9}$/)) return null;
  const number = Number(suffix);
  return number <= 0x7fffffff ? number : null;
}

export function isPublicationUrl(
  value: unknown,
  repository: string,
): value is string {
  return publicationNumber(value, repository) !== null;
}
