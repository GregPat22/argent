import type { LocalCommandConfigDescriptor } from "./local-command-config.js";
import type {
  LocalCommandReviewFile,
  REVIEW_POLICY,
} from "./local-command-review.js";

/** A complete pinned review and consent matching this fresh reading only. */
export interface CandidateReviewView {
  kind: "local-candidate-review";
  workspaceId: string;
  identity: string;
  policyVersion: typeof REVIEW_POLICY;
  baseSha: string;
  headSha: string;
  treeId: string;
  configurationState: "unchanged" | "changed" | "removed";
  configuration: LocalCommandConfigDescriptor;
  approvalId: string;
  files: readonly LocalCommandReviewFile[];
  summary: { files: number; textFiles: number; binaryFiles: number };
  consent: { id: string; createdAt: number } | null;
  executionAllowed: false;
  tested: false;
}

export interface CandidateConsentReceiptView {
  kind: "local-candidate-consent-receipt";
  workspaceId: string;
  id: string;
  reviewIdentity: string;
  headSha: string;
  createdAt: number;
  historical: true;
  executionAllowed: false;
  tested: false;
}
