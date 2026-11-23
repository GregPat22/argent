import type { LocalCommandConfigDescriptor } from "./local-command-config.js";
import type {
  LocalCommandReviewFile,
  REVIEW_POLICY,
} from "./local-command-review.js";

/** A complete pinned review and consent matching this fresh reading only. */
export interface CandidateReviewView {
  kind: "local-candidate-review";
  /** Omitted for the original setup/test contract. */
  action?: "setup-run";
  workspaceId: string;
  identity: string;
  policyVersion: typeof REVIEW_POLICY;
  baseSha: string;
  headSha: string;
  treeId: string;
  configurationState: "unchanged" | "changed" | "removed" | "added";
  configuration: LocalCommandConfigDescriptor;
  approvalId: string;
  files: readonly LocalCommandReviewFile[];
  judgingChanges: import("./judging-changes.js").JudgingChanges;
  summary: { files: number; textFiles: number; binaryFiles: number };
  consent: { id: string; createdAt: number } | null;
  executionAllowed: false;
  tested: false;
}

export interface CandidateConsentReceiptView {
  kind: "local-candidate-consent-receipt";
  /** Omitted for the original setup/test contract. */
  action?: "setup-run";
  workspaceId: string;
  id: string;
  reviewIdentity: string;
  headSha: string;
  createdAt: number;
  historical: true;
  executionAllowed: false;
  tested: false;
}
