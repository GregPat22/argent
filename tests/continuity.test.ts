import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { LocalWorkspace, ScriptedAgent } from "../src/adapters.js";
import type { SimulationEvidence } from "../src/domain.js";
import { exportHistory } from "../src/continuity-export.js";
import { readHistoryFile, writeHistoryFile } from "../src/continuity-files.js";
import { ContinuityStore } from "../src/continuity-store.js";
import {
  CONTINUITY_LIMITS,
  decodeHistory,
  digest,
  type ContinuityBundle,
} from "../src/continuity.js";
import { Store } from "../src/store.js";
import { Worker } from "../src/worker.js";

const cliPath = fileURLToPath(
  new URL("../scripts/continuity.js", import.meta.url),
);

function fixture(t: TestContext) {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-history-")),
  );
  chmodSync(directory, 0o700);
  const source = join(directory, "source");
  mkdirSync(source, { mode: 0o700 });
  const database = join(source, "platform.sqlite");
  const root = join(source, "workspaces");
  mkdirSync(root, { mode: 0o700 });
  const store = new Store(database);
  const workspace = store.createWorkspace("https://github.com/example/project");
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    source,
    database,
    root,
    store,
    workspace,
    export: (includeText = false) =>
      Buffer.from(exportHistory(database, root, workspace.id, includeText)),
    worker: new Worker(store, new LocalWorkspace(root), new ScriptedAgent(1)),
  };
}

function parsed(bytes: Uint8Array): ContinuityBundle {
  return decodeHistory(bytes);
}

function reseal(bundle: ContinuityBundle): Buffer {
  bundle.sha256 = digest(JSON.stringify(bundle.payload));
  return Buffer.from(JSON.stringify(bundle));
}

function cli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    env: {},
    encoding: "utf8",
    timeout: 10000,
  });
}

test("real simulator history round-trips with matching artifacts, cursors and selected text", async (t) => {
  const f = fixture(t);
  const run = f.store.createRun(
    f.workspace.id,
    "Preserve this task",
    "private-request-key",
  );
  assert.equal(await f.worker.tick(), true);
  const bytes = f.export(true);
  const archive = parsed(bytes);
  const historical = archive.payload.runs[0]!;
  assert.equal(historical.task, run.task);
  assert.equal(historical.artifact?.availability, "included");
  assert.equal(
    digest(historical.artifact!.content!),
    (f.store.evidence(run.id) as SimulationEvidence).sha256,
  );
  assert.deepEqual(
    historical.events.map((event) => event.cursor),
    f.store.events(run.id).map((event) => event.cursor),
  );
  assert.ok(
    historical.events.some((event) => event.type === "agent.log" && event.text),
  );
  assert.equal(bytes.includes(Buffer.from("private-request-key")), false);

  const history = new ContinuityStore(join(f.directory, "history.sqlite"));
  t.after(() => history.close());
  const receipt = history.restore(bytes);
  const view = history.show(receipt.id);
  assert.equal(view.readOnly, true);
  assert.equal(view.executionAllowed, false);
  assert.equal(view.trust, "historical-untrusted");
  assert.equal(view.verification, "historical-simulation-only");
  assert.equal(view.runs[0]!.originalStatus, "completed");
  assert.equal(f.store.getRun(run.id).status, "completed");
  const db = new DatabaseSync(join(f.directory, "history.sqlite"), {
    readOnly: true,
  });
  t.after(() => db.close());
  assert.deepEqual(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name),
    ["history_bundles", "history_events"],
  );
  assert.equal(
    db.prepare("SELECT type FROM history_events").get()!.type,
    "history.imported",
  );
});

test("metadata default excludes free text, arbitrary payloads, credentials, leases and discovered files", (t) => {
  const f = fixture(t);
  const secret = "ghs_synthetic_canary_1234567890";
  const run = f.store.createRun(f.workspace.id, secret, "REQUEST_KEY_CANARY");
  const claimed = f.store.claim(5000)!;
  f.store.appendLog(run.id, claimed.leaseToken!, secret);
  writeFileSync(join(f.root, ".env"), `TOKEN=${secret}`);
  const db = new DatabaseSync(f.database);
  db.prepare(
    "INSERT INTO events (run_id, type, data, created_at) VALUES (?, ?, ?, ?)",
  ).run(
    run.id,
    secret,
    JSON.stringify({ token: secret, nested: { privateKey: secret } }),
    Date.now(),
  );
  db.close();
  const bytes = f.export();
  for (const canary of [secret, "REQUEST_KEY_CANARY", claimed.leaseToken!])
    assert.equal(bytes.includes(Buffer.from(canary)), false);
  const archive = parsed(bytes);
  assert.equal(archive.payload.runs[0]!.task, null);
  assert.ok(
    archive.payload.runs[0]!.events.every((event) => event.text === null),
  );
  assert.equal(archive.payload.runs[0]!.events.at(-1)!.type, "source.unknown");
  assert.ok(
    archive.payload.omissions.includes("credentials-and-lease-authority"),
  );
  assert.throws(() => f.export(true), /credential marker/);
});

for (const marker of [
  "github_pat_synthetic1234567890",
  "ghp_synthetic1234567890",
  "sk-synthetic1234567890",
  "-----BEGIN RSA PRIVATE KEY-----",
  "Bearer synthetic1234567890",
]) {
  test(`selected text rejects credential marker ${marker.split("_")[0]!.slice(0, 12)}`, (t) => {
    const f = fixture(t);
    f.store.createRun(f.workspace.id, marker, "key");
    assert.throws(() => f.export(true), /credential marker/);
    assert.doesNotThrow(() => f.export());
  });
}

test("all history beyond API page boundaries is included without truncation", (t) => {
  const f = fixture(t);
  for (let index = 0; index < 120; index++) {
    const run = f.store.createRun(
      f.workspace.id,
      `Task ${index}`,
      `key-${index}`,
    );
    f.store.cancel(run.id);
  }
  const payload = parsed(f.export()).payload;
  assert.equal(payload.runs.length, 120);
  assert.equal(payload.runs.flatMap((run) => run.events).length, 240);
});

for (const state of [
  "queued",
  "running",
  "cancelling",
  "needs_attention",
] as const) {
  test(`restore preserves ${state} as historical needs_attention without changing its source`, (t) => {
    const f = fixture(t);
    const run = f.store.createRun(
      f.workspace.id,
      "Uncertain work",
      "key",
      1000,
      1000,
    );
    if (state !== "queued") f.store.claim(100, 1000);
    if (state === "cancelling") f.store.cancel(run.id, 1001);
    if (state === "needs_attention") f.store.reconcile(1100);
    const history = new ContinuityStore(join(f.directory, "history.sqlite"));
    t.after(() => history.close());
    const view = history.show(history.restore(f.export()).id);
    assert.equal(view.runs[0]!.originalStatus, state);
    assert.equal(view.runs[0]!.status, "needs_attention");
    assert.equal(view.executionAllowed, false);
    assert.equal(f.store.getRun(run.id).status, state);
  });
}

test("duplicate restore survives restart with one atomic import receipt and event", (t) => {
  const f = fixture(t);
  f.store.createRun(f.workspace.id, "Task", "key");
  const bytes = f.export();
  const path = join(f.directory, "history.sqlite");
  const history = new ContinuityStore(path);
  const receipt = history.restore(bytes);
  history.close();
  const second = new ContinuityStore(path);
  t.after(() => second.close());
  assert.deepEqual(second.restore(bytes), receipt);
  assert.deepEqual(second.list().items, [receipt]);
  const db = new DatabaseSync(path);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM history_events").get()!.n,
    1,
  );
  db.close();
});

test("failed event insertion rolls back the imported bundle", (t) => {
  const f = fixture(t);
  const path = join(f.directory, "history.sqlite");
  const history = new ContinuityStore(path);
  t.after(() => history.close());
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TRIGGER reject_import BEFORE INSERT ON history_events BEGIN SELECT RAISE(ABORT, 'fixture'); END",
  );
  assert.throws(() => history.restore(f.export()), /did not commit/);
  assert.equal(history.list().items.length, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM history_events").get()!.n,
    0,
  );
  db.exec("DROP TRIGGER reject_import");
  db.close();
  assert.equal(history.restore(f.export()).readOnly, true);
});

test("read-only SQLite export sees one committed snapshot during an outstanding writer", (t) => {
  const f = fixture(t);
  const run = f.store.createRun(f.workspace.id, "Task", "key");
  const db = new DatabaseSync(f.database);
  db.exec("BEGIN IMMEDIATE");
  db.prepare("UPDATE runs SET status = 'cancelled' WHERE id = ?").run(run.id);
  db.prepare(
    "INSERT INTO events (run_id, type, data, created_at) VALUES (?, 'run.cancelled', '{}', ?)",
  ).run(run.id, Date.now());
  const before = parsed(f.export()).payload.runs[0]!;
  assert.equal(before.status, "queued");
  assert.equal(before.events.length, 1);
  db.exec("COMMIT");
  db.close();
  const after = parsed(f.export()).payload.runs[0]!;
  assert.equal(after.status, "cancelled");
  assert.equal(after.events.length, 2);
});

test("lifecycle-enrolled history rejects rather than omitting cloud cleanup obligations", (t) => {
  const f = fixture(t);
  f.store.lifecycle.request(f.workspace.id, "create", "cloud-key");
  assert.throws(() => f.export(), /Cloud lifecycle history is not supported/);
});

for (const availability of ["missing", "changed", "unsafe"] as const) {
  test(`artifact inventory records ${availability} without reading other files`, async (t) => {
    const f = fixture(t);
    const run = f.store.createRun(f.workspace.id, "Task", "key");
    await f.worker.tick();
    const path = join(f.root, f.workspace.id, `${run.id}.json`);
    if (availability === "missing") rmSync(path);
    else if (availability === "changed") writeFileSync(path, "changed");
    else {
      rmSync(path);
      symlinkSync(f.database, path);
    }
    const artifact = parsed(f.export(true)).payload.runs[0]!.artifact!;
    assert.equal(artifact.availability, availability);
    assert.equal(artifact.content, null);
    assert.equal(
      parsed(f.export()).payload.runs[0]!.artifact!.availability,
      "excluded",
    );
  });
}

test("artifact directory symlinks, hardlinks and FIFOs are never followed", async (t) => {
  const f = fixture(t);
  const run = f.store.createRun(f.workspace.id, "Task", "key");
  await f.worker.tick();
  const folder = join(f.root, f.workspace.id);
  const path = join(folder, `${run.id}.json`);
  linkSync(path, join(f.directory, "artifact-hardlink"));
  assert.equal(
    parsed(f.export(true)).payload.runs[0]!.artifact!.availability,
    "unsafe",
  );
  rmSync(path);
  execFileSync("mkfifo", [path]);
  assert.equal(
    parsed(f.export(true)).payload.runs[0]!.artifact!.availability,
    "unsafe",
  );
  rmSync(path);
  renameSync(folder, join(f.directory, "moved-artifacts"));
  symlinkSync(join(f.directory, "moved-artifacts"), folder);
  writeFileSync(
    join(f.directory, "moved-artifacts", `${run.id}.json`),
    "outside content",
  );
  assert.equal(
    parsed(f.export(true)).payload.runs[0]!.artifact!.availability,
    "unsafe",
  );
});

const mutations: [string, (bundle: ContinuityBundle) => void][] = [
  [
    "unknown version",
    (b) => {
      (b as { version: number }).version = 2;
    },
  ],
  [
    "unknown envelope field",
    (b) => {
      Object.assign(b, { token: "secret" });
    },
  ],
  [
    "unknown payload field",
    (b) => {
      Object.assign(b.payload, { script: "touch /tmp/forbidden" });
    },
  ],
  [
    "traversal identity",
    (b) => {
      b.payload.workspace.id = "../../outside";
    },
  ],
  [
    "newline identity",
    (b) => {
      b.payload.workspace.id += "\n";
    },
  ],
  [
    "newline repository",
    (b) => {
      b.payload.workspace.repository += "\n";
    },
  ],
  [
    "credential repository URL",
    (b) => {
      b.payload.workspace.repository = "https://token@github.com/org/repo";
    },
  ],
  [
    "missing omissions",
    (b) => {
      b.payload.omissions.pop();
    },
  ],
  [
    "duplicate run",
    (b) => {
      b.payload.runs.push(structuredClone(b.payload.runs[0]!));
    },
  ],
  [
    "invalid status",
    (b) => {
      Object.assign(b.payload.runs[0]!, { status: "approved" });
    },
  ],
  [
    "duplicate cursor",
    (b) => {
      b.payload.runs[0]!.events.push(
        structuredClone(b.payload.runs[0]!.events[0]!),
      );
    },
  ],
  [
    "invalid cursor",
    (b) => {
      b.payload.runs[0]!.events[0]!.cursor = -1;
    },
  ],
  [
    "invalid event type",
    (b) => {
      b.payload.runs[0]!.events[0]!.type = "agent.authorized";
    },
  ],
  [
    "metadata text smuggling",
    (b) => {
      b.payload.runs[0]!.task = "not selected";
    },
  ],
  [
    "completed without evidence",
    (b) => {
      b.payload.runs[0]!.status = "completed";
    },
  ],
  [
    "invalid timestamp",
    (b) => {
      b.payload.exportedAt = -1;
    },
  ],
];
for (const [name, mutate] of mutations) {
  test(`restore rejects ${name} before persisting any import`, (t) => {
    const f = fixture(t);
    f.store.createRun(f.workspace.id, "Task", "key");
    const archive = parsed(f.export());
    mutate(archive);
    const history = new ContinuityStore(join(f.directory, "history.sqlite"));
    t.after(() => history.close());
    assert.throws(
      () => history.restore(reseal(archive)),
      /Invalid or unsupported/,
    );
    assert.equal(history.list().items.length, 0);
  });
}

test("digest corruption, malformed bytes and oversized archives are rejected", (t) => {
  const f = fixture(t);
  f.store.createRun(f.workspace.id, "Task", "key");
  const archive = parsed(f.export());
  archive.payload.workspace.repository =
    "https://github.com/changed/repository";
  for (const bytes of [
    Buffer.from(JSON.stringify(archive)),
    Buffer.from("{"),
    Buffer.from([0xff]),
    Buffer.alloc(CONTINUITY_LIMITS.bytes + 1),
  ])
    assert.throws(() => parsed(bytes), /Invalid or unsupported/);
});

test("included artifact bytes, identity, schema and digest must all match", async (t) => {
  const f = fixture(t);
  f.store.createRun(f.workspace.id, "Task", "key");
  await f.worker.tick();
  for (const kind of [
    "missing",
    "hash",
    "identity",
    "path",
    "duplicate-key",
  ] as const) {
    const archive = parsed(f.export(true));
    const artifact = archive.payload.runs[0]!.artifact!;
    if (kind === "missing") artifact.content = null;
    if (kind === "hash") artifact.content += " ";
    if (kind === "identity") {
      artifact.content = JSON.stringify({
        runId: "wrong",
        task: "Task",
        simulation: true,
      });
      artifact.sha256 = digest(artifact.content);
    }
    if (kind === "path") Object.assign(artifact, { path: "../../outside" });
    if (kind === "duplicate-key") {
      const id = archive.payload.runs[0]!.id;
      artifact.content = `{"runId":"${id}","task":"hidden secret","task":"Task","simulation":true}`;
      artifact.sha256 = digest(artifact.content);
    }
    assert.throws(() => parsed(reseal(archive)), /Invalid or unsupported/);
  }
});

test("export rejects run, event and byte overflow instead of truncating", (t) => {
  const f = fixture(t);
  const run = f.store.createRun(f.workspace.id, "Task", "key");
  const db = new DatabaseSync(f.database);
  const insert = db.prepare(
    "INSERT INTO events (run_id, type, data, created_at) VALUES (?, 'agent.log', ?, ?)",
  );
  db.exec("BEGIN");
  for (let index = 0; index < CONTINUITY_LIMITS.events; index++)
    insert.run(run.id, "{}", Date.now());
  db.exec("COMMIT");
  assert.throws(() => f.export(), /exceeds export limits/);
  db.prepare("DELETE FROM events WHERE run_id = ? AND type = 'agent.log'").run(
    run.id,
  );
  insert.run(run.id, "x".repeat(CONTINUITY_LIMITS.bytes + 1), Date.now());
  assert.throws(() => f.export(), /exceeds export limits/);
  db.prepare("DELETE FROM events WHERE run_id = ? AND type = 'agent.log'").run(
    run.id,
  );
  db.close();
  f.store.cancel(run.id);
  for (let index = 0; index < CONTINUITY_LIMITS.runs; index++) {
    const other = f.store.createRun(f.workspace.id, "Task", `key-${index}`);
    f.store.cancel(other.id);
  }
  assert.throws(() => f.export(), /exceeds export limits/);
});

test("private atomic archive output refuses overwrite and unsafe parent directories", (t) => {
  const f = fixture(t);
  const path = join(f.directory, "bundle.json");
  const content = f.export().toString();
  writeHistoryFile(path, content);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(path).nlink, 1);
  assert.equal(
    readHistoryFile(path, CONTINUITY_LIMITS.bytes).toString(),
    content,
  );
  assert.throws(
    () => writeHistoryFile(path, "replacement"),
    /requires a new file/,
  );
  assert.equal(readFileSync(path, "utf8"), content);
  const publicFolder = join(f.directory, "public");
  mkdirSync(publicFolder, { mode: 0o755 });
  assert.throws(
    () => writeHistoryFile(join(publicFolder, "bundle.json"), content),
    /private directory/,
  );
  const alias = join(f.directory, "alias");
  symlinkSync(f.directory, alias);
  assert.throws(() => writeHistoryFile(join(alias, "escaped.json"), content));
  assert.equal(existsSync(join(f.directory, "escaped.json")), false);
});

test("bundle loaders reject symlinks, hardlinks, directories, oversize files and FIFO without hanging", (t) => {
  const f = fixture(t);
  const path = join(f.directory, "bundle.json");
  writeHistoryFile(path, f.export().toString());
  const alias = join(f.directory, "alias");
  symlinkSync(path, alias);
  assert.throws(
    () => readHistoryFile(alias, CONTINUITY_LIMITS.bytes),
    /unsafe/,
  );
  const hardlink = join(f.directory, "hardlink");
  linkSync(path, hardlink);
  assert.throws(
    () => readHistoryFile(hardlink, CONTINUITY_LIMITS.bytes),
    /unsafe/,
  );
  assert.throws(
    () => readHistoryFile(f.directory, CONTINUITY_LIMITS.bytes),
    /unsafe/,
  );
  assert.throws(() => readHistoryFile(f.database, 1), /unsafe/);
  const fifo = join(f.directory, "fifo");
  execFileSync("mkfifo", [fifo]);
  const result = cli(["inspect", "--bundle", fifo]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe/);
});

test("history store refuses source execution DB, newer versions, symlinks and permissive modes", (t) => {
  const f = fixture(t);
  chmodSync(f.database, 0o600);
  assert.throws(
    () => new ContinuityStore(f.database),
    /private Argent history database/,
  );
  assert.equal(f.store.listWorkspaces().items.length, 1);
  const path = join(f.directory, "history.sqlite");
  new ContinuityStore(path).close();
  const db = new DatabaseSync(path);
  db.exec("PRAGMA user_version = 2");
  db.close();
  assert.throws(
    () => new ContinuityStore(path),
    /private Argent history database/,
  );
  chmodSync(path, 0o644);
  assert.throws(() => new ContinuityStore(path));
  chmodSync(path, 0o600);
  const alias = join(f.directory, "alias");
  symlinkSync(path, alias);
  assert.throws(() => new ContinuityStore(alias));
});

test("offline CLI restores to another directory and reads from a fresh process without source data", async (t) => {
  const f = fixture(t);
  f.store.createRun(f.workspace.id, "Retained task context", "key");
  await f.worker.tick();
  const bundle = join(f.directory, "bundle.json");
  const exported = cli([
    "export",
    "--database",
    f.database,
    "--workspaces",
    f.root,
    "--workspace",
    f.workspace.id,
    "--out",
    bundle,
    "--include-text",
  ]);
  assert.equal(exported.status, 0, exported.stderr);
  assert.equal(exported.stdout.includes("Retained task context"), false);
  const destination = join(f.directory, "independent");
  mkdirSync(destination, { mode: 0o700 });
  const history = join(destination, "history.sqlite");
  const restored = cli(["restore", "--bundle", bundle, "--history", history]);
  assert.equal(restored.status, 0, restored.stderr);
  const receipt = JSON.parse(restored.stdout) as { id: string };
  renameSync(f.source, join(f.directory, "source-unavailable"));
  rmSync(bundle);
  const listed = cli(["list", "--history", history]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).items[0].id, receipt.id);
  const shown = cli(["show", "--history", history, "--id", receipt.id]);
  assert.equal(shown.status, 0, shown.stderr);
  const view = JSON.parse(shown.stdout);
  assert.equal(view.executionAllowed, false);
  assert.equal(view.runs[0].task, "Retained task context");
  assert.equal(view.runs[0].artifact.availability, "included");
  assert.equal(dirname(history), destination);
});

test("history pagination and CLI input errors are bounded and do not echo sensitive arguments", (t) => {
  const f = fixture(t);
  const history = new ContinuityStore(join(f.directory, "history.sqlite"));
  t.after(() => history.close());
  for (let index = 0; index < 3; index++) history.restore(f.export());
  const first = history.list(2);
  const second = history.list(2, first.nextCursor!);
  assert.equal(first.items.length, 2);
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.throws(() => history.list(101));
  assert.throws(
    () => history.list(1, "a".repeat(64) + "\n"),
    /Invalid history page/,
  );
  assert.throws(() => history.show("../../escape"));
  assert.throws(
    () => history.show("a".repeat(64) + "\n"),
    /Invalid history identity/,
  );
  assert.throws(() => history.show("0".repeat(64)), /not found/);
  for (const args of [
    ["export", "--out", "SECRET", "--out", "SECRET"],
    ["inspect", "--bundle"],
    ["unknown-SECRET"],
    ["inspect", "--token", "SECRET"],
  ]) {
    const result = cli(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes("SECRET"), false);
    assert.equal(result.stderr.includes("SECRET"), false);
  }
});
