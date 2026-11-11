import { DomainError, type WorkspaceChanges } from "../domain.js";

/** Service content is display data, never executable markup or evidence. */
export function validateWorkspaceChanges(
  value: unknown,
  workspaceId: string,
): WorkspaceChanges {
  const invalid = () =>
    new DomainError(
      502,
      "The service returned invalid workspace changes. Refresh to try again.",
    );
  const object = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === "object" && !Array.isArray(item);
  const sha = (item: unknown) =>
    typeof item === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(item);
  const path = (item: unknown) =>
    typeof item === "string" &&
    item.length > 0 &&
    item.length <= 4096 &&
    !item.includes("\0") &&
    !item.startsWith("/") &&
    !item.split("/").some((part) => part === ".." || part === "." || !part);
  const mode = (item: unknown) =>
    item === null ||
    item === "100644" ||
    item === "100755" ||
    item === "120000";
  if (
    !object(value) ||
    value.kind !== "workspace-changes" ||
    value.workspaceId !== workspaceId ||
    !sha(value.baseSha) ||
    !sha(value.headSha) ||
    (value.baseSha as string).length !== (value.headSha as string).length ||
    value.simulation !== false ||
    value.tested !== false ||
    value.consistency !== "live" ||
    !Array.isArray(value.files) ||
    value.files.length > 1000
  )
    throw invalid();
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of value.files) {
    if (
      !object(file) ||
      !path(file.path) ||
      !(file.previousPath === null || path(file.previousPath)) ||
      typeof file.status !== "string" ||
      !["added", "modified", "deleted", "renamed", "typechanged"].includes(
        file.status,
      ) ||
      !mode(file.oldMode) ||
      !mode(file.newMode) ||
      typeof file.binary !== "boolean" ||
      typeof file.diff !== "string"
    )
      throw invalid();
    if (
      paths.has(file.path as string) ||
      (file.binary && file.diff !== "") ||
      (file.status === "renamed") !== (file.previousPath !== null)
    )
      throw invalid();
    paths.add(file.path as string);
    bytes += Buffer.byteLength(file.diff, "utf8");
    if (bytes > 1024 * 1024) throw invalid();
  }
  return value as unknown as WorkspaceChanges;
}
