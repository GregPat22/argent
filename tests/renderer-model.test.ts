import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent, RunView, Workspace } from "../src/domain.js";
import {
  composerGate,
  groupWorkspaces,
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
