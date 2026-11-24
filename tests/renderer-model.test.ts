import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent, RunView, Workspace } from "../src/domain.js";
import {
  composerGate,
  diffLines,
  diffStats,
  groupWorkspaces,
  readableDiff,
  limitChoices,
  permissionAfterSend,
  turnFrom,
} from "../ui/model.js";

const workspace = (
  id: string,
  path?: string,
  state: Workspace["state"] = "running",
): Workspace => ({
  id,
  repository: path ? `local:${path}` : `https://github.com/example/${id}`,
  provider: path ? "local-worktree" : "local-simulation",
  state,
  createdAt: 1,
  ...(path
    ? {
        local: {
          repositoryPath: path,
          branch: `argent/${id}`,
          baseSha: "a".repeat(40),
          worktreePath: `/worktrees/${id}`,
        },
      }
    : {}),
});

const run = (status: RunView["status"]): RunView => ({
  id: status,
  workspaceId: "w",
  task: "task",
  status,
  simulation: false,
  permissionMode: "edits",
  maxRuntimeMs: 1800000,
  createdAt: 1,
  deadlineAt: null,
  leaseExpiresAt: null,
});

test("workspaces group by repository, keeping order and labelling demos", () => {
  const groups = groupWorkspaces([
    workspace("b", "/repos/api"),
    workspace("demo"),
    workspace("a", "/repos/api"),
    workspace("c", "/repos/web"),
  ]);
  assert.deepEqual(
    groups.map((group) => [
      group.label,
      group.demo,
      group.items.map((item) => item.id),
    ]),
    [
      ["api", false, ["b", "a"]],
      ["example/demo", true, ["demo"]],
      ["web", false, ["c"]],
    ],
  );
});

test("events become the agent's words, its steps and an end reason", () => {
  const event = (
    type: string,
    data: Record<string, unknown>,
    cursor: number,
  ): RunEvent => ({
    cursor,
    runId: "r",
    type,
    data,
    createdAt: cursor * 1000,
  });
  const turn = turnFrom([
    event("run.queued", {}, 1),
    event("agent.log", { kind: "tool", message: "Write: notes.txt" }, 2),
    event("agent.log", { kind: "text", message: "Added notes.txt." }, 3),
    event("agent.log", { kind: "tool_error", message: "Bash denied" }, 4),
    event("run.failed", { reason: "agent_exit_nonzero" }, 5),
  ]);
  assert.deepEqual(turn.says, ["Added notes.txt."]);
  assert.deepEqual(
    turn.steps.map((step) => [step.kind, step.text]),
    [
      ["tool", "Write: notes.txt"],
      ["say", "Added notes.txt."],
      ["tool", "Bash denied"],
    ],
  );
  assert.equal(turn.reason, "Agent exit nonzero");
  assert.equal(turn.lastAt, 5000);
});

test("the composer explains why it cannot send", () => {
  const base = {
    connected: true,
    busy: false,
    workspace: workspace("w", "/repos/api"),
    runs: [] as RunView[],
    pendingHere: false,
    pendingElsewhere: false,
    text: "work",
  };
  assert.deepEqual(composerGate(base), {
    canType: true,
    canSend: true,
    hint: "",
    working: false,
  });
  assert.equal(
    composerGate({ ...base, connected: false }).hint,
    "Reconnect to continue",
  );
  assert.equal(composerGate({ ...base, connected: false }).canType, false);
  const stopped = composerGate({
    ...base,
    workspace: workspace("w", "/repos/api", "stopped"),
  });
  assert.equal(stopped.canType, false);
  assert.equal(stopped.hint, "This workspace is stopped");
  const working = composerGate({ ...base, runs: [run("running")] });
  assert.equal(working.canType, true);
  assert.equal(working.canSend, false);
  assert.equal(working.working, true);
  const review = composerGate({ ...base, runs: [run("needs_attention")] });
  assert.equal(review.canSend, false);
  assert.equal(review.working, false);
  assert.equal(review.hint, "Review the interrupted run first");
  assert.equal(
    composerGate({ ...base, pendingElsewhere: true }).canSend,
    false,
  );
  assert.equal(composerGate({ ...base, pendingHere: true }).canType, false);
  assert.equal(composerGate({ ...base, text: "  " }).canSend, false);
});

test("limits are minutes for local work and seconds for demos; full access never sticks", () => {
  assert.equal(limitChoices(true).fallback, 1800000);
  assert.equal(Math.max(...limitChoices(true).values), 7200000);
  assert.equal(limitChoices(false).fallback, 30000);
  assert.equal(Math.max(...limitChoices(false).values), 300000);
  assert.equal(permissionAfterSend(), "edits");
});

test("diff lines carry old and new line numbers and skip file headers", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -3,3 +3,3 @@ heading",
    " keep",
    "-old",
    "+new",
    "\\ No newline at end of file",
    "@@ -10 +10,2 @@",
    " ten",
    "+eleven",
    "",
  ].join("\n");
  assert.deepEqual(
    diffLines(diff).map((line) => [line.kind, line.old, line.new]),
    [
      ["meta", null, null],
      ["meta", null, null],
      ["meta", null, null],
      ["hunk", null, null],
      ["context", 3, 3],
      ["del", 4, null],
      ["add", null, 4],
      ["note", null, null],
      ["hunk", null, null],
      ["context", 10, 10],
      ["add", null, 11],
    ],
  );
  assert.deepEqual(diffStats(diff), { added: 2, removed: 1 });
  assert.deepEqual(diffStats(""), { added: 0, removed: 0 });
  assert.deepEqual(
    diffStats("+++ only a header\n--- another"),
    { added: 0, removed: 0 },
    "lines before a hunk are never counted",
  );
});

/** The service's whole-file replacement hunk for two texts ending in newlines. */
function wholeFile(before: string[], after: string[]): string {
  return [
    "diff --git a/f b/f",
    "--- a/f",
    "+++ b/f",
    `@@ -1,${before.length} +1,${after.length} @@`,
    ...before.map((line) => `-${line}`),
    ...after.map((line) => `+${line}`),
    "",
  ].join("\n");
}
const shape = (diff: string) =>
  readableDiff(diff)
    .lines.filter((line) => line.kind !== "meta" && line.kind !== "hunk")
    .map((line) => [line.kind, line.text, line.old, line.new]);

test("a whole-file hunk shows only the lines that changed, and keeps every line", () => {
  const before = ["a", "b", "c", "d", "e"];
  const after = ["a", "B", "c", "d", "e", "f"];
  assert.deepEqual(shape(wholeFile(before, after)), [
    ["context", " a", 1, 1],
    ["del", "-b", 2, null],
    ["add", "+B", null, 2],
    ["context", " c", 3, 3],
    ["context", " d", 4, 4],
    ["context", " e", 5, 5],
    ["add", "+f", null, 6],
  ]);
  assert.deepEqual(diffStats(wholeFile(before, after)), {
    added: 2,
    removed: 1,
  });
  assert.equal(readableDiff(wholeFile(before, after)).exact, true);
});

test("a missing final newline is a change and its note stays with its line", () => {
  const diff = [
    "@@ -1,2 +1,2 @@",
    "-a",
    "-b",
    "\\ No newline at end of file",
    "+a",
    "+b",
    "",
  ].join("\n");
  assert.deepEqual(
    shape(diff).map(([kind, text]) => [kind, text]),
    [
      ["context", " a"],
      ["del", "-b"],
      ["note", "\\ No newline at end of file"],
      ["add", "+b"],
    ],
  );
});

test("large files are compared through unique lines, and an uncomparable gap is labelled", () => {
  const before = Array.from({ length: 900 }, (_, i) => `line ${i}`);
  const after = [...before];
  after[10] = "changed near the top";
  after[880] = "changed near the bottom";
  const result = readableDiff(wholeFile(before, after));
  assert.equal(result.exact, true);
  assert.deepEqual(diffStats(wholeFile(before, after)), {
    added: 2,
    removed: 2,
  });
  assert.equal(
    result.lines.filter((line) => line.kind === "context").length,
    898,
    "every unchanged line is still present",
  );
  const repeated = readableDiff(
    wholeFile(
      [...Array(600).fill("x"), "only before"],
      ["only after", ...Array(600).fill("x")],
    ),
  );
  assert.equal(repeated.exact, false, "a fallback is never presented as exact");
  assert.equal(
    repeated.lines.filter((line) => line.kind === "del").length +
      repeated.lines.filter((line) => line.kind === "add").length,
    1202,
  );
});
