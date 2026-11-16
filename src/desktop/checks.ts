import { DomainError } from "../domain.js";
import {
  checkId,
  validateCheckResult,
  type LocalCheckView,
} from "../local-checks.js";
export function validateCheckView(
  value: unknown,
  workspaceId: string,
): LocalCheckView | null {
  if (value === null) return null;
  const fail = () => {
    throw new DomainError(502, "Invalid check response");
  };
  try {
    if (!value || typeof value !== "object") return fail();
    const v = value as LocalCheckView;
    if (
      v.kind !== "local-check" ||
      v.workspaceId !== workspaceId ||
      typeof v.headSha !== "string" ||
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.exec(v.headSha)?.[0] !== v.headSha ||
      ![
        "queued",
        "running",
        "cancelling",
        "completed",
        "failed",
        "cancelled",
        "needs_attention",
      ].includes(v.status) ||
      !["current", "stale", "unknown"].includes(v.freshness) ||
      !Number.isSafeInteger(v.createdAt) ||
      v.createdAt < 0
    )
      return fail();
    const id = checkId(v.id);
    const result = v.result === null ? null : validateCheckResult(v.result);
    if (
      (result &&
        (result.headSha !== v.headSha ||
          v.status !==
            (result.outcome === "passed" ? "completed" : "failed"))) ||
      (!result && (v.status === "completed" || v.freshness !== "unknown"))
    )
      return fail();
    return {
      kind: "local-check",
      workspaceId,
      id,
      headSha: v.headSha,
      status: v.status,
      createdAt: v.createdAt,
      freshness: v.freshness,
      result,
    };
  } catch {
    return fail();
  }
}
