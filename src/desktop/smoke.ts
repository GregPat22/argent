import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RunView, Workspace, Page } from "../domain.js";
import type { DesktopClient } from "./bridge.js";

export async function runDesktopSmoke(
  initial: BrowserWindow,
  client: DesktopClient,
): Promise<void> {
  const suite = process.env.ARGENT_DESKTOP_SMOKE_SUITE;
  assert.ok(
    suite === "welcome" || suite === "workspace" || suite === "commands",
    "known smoke suite",
  );
  const started = Date.now();
  const progress = (stage: string) =>
    console.log(
      `[ARGENT_SMOKE_STAGE]${JSON.stringify({ suite, stage, elapsedMs: Date.now() - started })}`,
    );
  let window = initial;
  const js = <T>(script: string) =>
    window.webContents.executeJavaScript(script) as Promise<T>;
  const until = async (predicate: () => Promise<unknown>, label: string) => {
    progress(label);
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await predicate()) return;
      await delay(50);
    }
    throw new Error(
      `Desktop smoke timed out: ${label}; UI ${await js(`JSON.stringify({service: document.querySelector('#service-status')?.textContent, error: document.querySelector('#error-banner')?.hidden ? '' : document.querySelector('#error-text')?.textContent, status: document.querySelector('#composer-status')?.textContent, pill: document.querySelector('#workspace-state')?.textContent})`)}`,
    );
  };
  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    const result = await client.call(method, args);
    if (!result.ok) throw new Error(result.error);
    return result.value as T;
  };
  const shots = process.env.ARGENT_SCREENSHOT_PATH;
  if (shots) mkdirSync(dirname(shots), { recursive: true });
  const capture = async (name: string) => {
    progress(`capture: ${name}`);
    if (!shots) return;
    // A modal can settle in the DOM while an occluded macOS window retains
    // an older compositor frame. Capture the visible, painted fixture window.
    window.show();
    window.focus();
    window.webContents.setBackgroundThrottling(false);
    await js(
      `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    );
    await delay(260);
    writeFileSync(
      shots.replace(/\.png$/, `-${name}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  const ready = () =>
    until(
      () =>
        js(
          `!!window.argent && !!document.querySelector('#composer-input') && document.querySelector('#service-status').textContent === 'Service online'`,
        ),
      "renderer and service",
    );
  const text = (selector: string) =>
    js<string>(
      `document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`,
    );
  const send = async (message: string, workspaceId: string) => {
    await until(
      () => js(`!document.querySelector('#composer-input').disabled`),
      "composer enabled",
    );
    await js(
      `{ const input = document.querySelector('#composer-input'); input.value = ${JSON.stringify(message)}; input.dispatchEvent(new Event('input')); }`,
    );
    await until(
      () =>
        js(
          `!document.querySelector('#composer-submit').hidden && !document.querySelector('#composer-submit').disabled`,
        ),
      "send enabled",
    );
    await js(
      `document.querySelector('#composer-input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))`,
    );
    await until(
      () =>
        js(
          `document.querySelector('#transcript').textContent.includes(${JSON.stringify(message)})`,
        ),
      `message sent: ${message}`,
    );
    assert.equal(
      await js(`document.querySelector('#composer-input').value`),
      "",
      "an accepted message clears the composer",
    );
    return (await call<Page<RunView>>("listRuns", [workspaceId])).items.find(
      (run) => run.task === message,
    )!;
  };

  const createLocalWorkspace = async (button: string): Promise<Workspace> => {
    await js(`document.querySelector(${JSON.stringify(button)}).click()`);
    await until(
      () =>
        js(
          `document.querySelector('#workspace-title').textContent === 'repository' && document.querySelector('#composer-agent-note').textContent.includes('Not a sandbox')`,
        ),
      "local workspace created from the chosen folder",
    );
    const local = (await call<Page<Workspace>>("listWorkspaces", [])).items[0]!;
    assert.equal(local.provider, "local-worktree");
    assert.equal(await text("#workspace-branch"), local.local!.branch);
    assert.deepEqual(
      await js(
        `[document.querySelector('#permission-toggle').textContent.trim(), document.querySelector('#limit-select').value]`,
      ),
      ["Edits only", "1800000"],
    );
    assert.equal(
      await js(`document.querySelector('.repo-add').disabled`),
      false,
      "the sidebar can create another workspace after the folder picker returns",
    );
    assert.equal(
      await js(
        `document.querySelector('li > button.workspace-row[aria-current="true"]:not([role])') !== null`,
      ),
      true,
      "the selected workspace retains native button semantics",
    );
    await capture("local-workspace");
    await js(`document.querySelector('#workspace-changes').click()`);
    await until(
      () =>
        js(
          `document.querySelector('#changes-status').textContent.includes('No changes')`,
        ),
      "empty local changes",
    );
    await js(`document.querySelector('#changes-close').click()`);

    return local;
  };

  const checkCommands = async (local: Workspace) => {
    // Review and approve the base commit's command configuration. Approval
    // records a review: it creates no run and executes nothing.
    const beforeApproval = await call("listRuns", [local.id]);
    await js(
      `document.querySelector('#workspace-commands').focus(); document.querySelector('#workspace-commands').click()`,
    );
    await until(
      () =>
        js(
          `!document.querySelector('#commands-content').hidden && !document.querySelector('#commands-approve').disabled`,
        ),
      "command configuration shown for review",
    );
    assert.deepEqual(
      await js(
        `Array.from(document.querySelectorAll('#commands-list .command-action')).map(action => [action.querySelector('h3').textContent, ...Array.from(action.querySelectorAll('li'), item => item.textContent)])`,
      ),
      [
        ["setup", '"node"', '"-e"', '"process.exit(0)"'],
        [
          "test",
          '"node"',
          '"-e"',
          '"process.exit(0)"',
          '"<img src=x onerror=window.untrustedCommand=true>"',
        ],
        ["run", '"node"', '"-e"', "\"console.log('run fixture')\""],
      ],
    );
    assert.match(await text("#commands-approval"), /Not approved/);
    assert.match(
      await text("#commands-notice"),
      /Approving records your review/,
    );
    assert.equal(
      await js(
        `!!window.untrustedCommand || !!document.querySelector('#commands-list img')`,
      ),
      false,
      "configured arguments stay literal text",
    );
    assert.equal(
      await js(
        `getComputedStyle(document.querySelector('#commands-list li')).fontVariantLigatures`,
      ),
      "none",
      "reviewed arguments are not drawn with ligatures",
    );
    await capture("command-review");
    await js(`document.querySelector('#commands-approve').click()`);
    await until(
      () =>
        js(
          `document.querySelector('#commands-approval').textContent.startsWith('Approved ') && document.querySelector('#commands-approve').disabled`,
        ),
      "approval recorded and read back",
    );
    assert.equal(await text("#commands-approve"), "Approved");
    assert.match(await text("#commands-status"), /Review the commit/);
    assert.equal(
      await js(
        `document.documentElement.scrollWidth <= innerWidth && document.querySelector('#commands-dialog').getBoundingClientRect().right <= innerWidth`,
      ),
      true,
      "the command dialog fits the window",
    );
    await capture("command-approved");
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await until(
      () => js(`!document.querySelector('#commands-dialog').open`),
      "Escape closes the command configuration",
    );
    assert.equal(await js(`document.activeElement.id`), "workspace-commands");
    assert.deepEqual(await call("listRuns", [local.id]), beforeApproval);
    // Review a committed fixture through the real renderer and service.
    const reviewFiles = {
      "review.test.js":
        '// <script>window.untrustedCandidate=true</script>\n//\t\u202e\u200b\ntest.skip("example", () => {});\n',
      "package.json": JSON.stringify({ scripts: { check: "node --version" } }),
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/sample": {
            version: "1.0.0",
            resolved: "file:sample.tgz",
            hasInstallScript: true,
          },
        },
      }),
    };
    for (const [path, content] of Object.entries(reviewFiles))
      writeFileSync(join(local.local!.worktreePath, path), content);
    for (const args of [
      ["add", "--", ...Object.keys(reviewFiles)],
      ["commit", "--quiet", "-m", "review fixture"],
    ])
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Argent Smoke",
          "-c",
          "user.email=smoke@example.invalid",
          ...args,
        ],
        { cwd: local.local!.worktreePath, stdio: "ignore" },
      );
    await js(`document.querySelector('#workspace-commands').click()`);
    await until(
      () => js(`!document.querySelector('#commands-review').disabled`),
      "candidate review available",
    );
    await js(`document.querySelector('#commands-review').click()`);
    await until(
      () =>
        js(
          `!document.querySelector('#candidate-content').hidden && !document.querySelector('#candidate-consent').disabled`,
        ),
      "complete committed review",
    );
    assert.match(await text("#candidate-files"), /review\.test\.js/);
    const report = await text("#candidate-files section");
    assert.match(report, /Judging changes/);
    assert.match(report, /1 changed test path/);
    assert.match(report, /test\.skip · line 3/);
    assert.match(report, /added · "check"/);
    assert.match(
      report,
      /added · "node_modules\/sample".*newly declares an install script.*local path/,
    );

    assert.match(await text("#candidate-files"), /\\t\\u202e\\u200b/);
    assert.equal(
      await js(
        `Array.from(document.querySelectorAll('#candidate-files, #candidate-files *')).every(element => getComputedStyle(element).fontVariantLigatures === 'none')`,
      ),
      true,
      "reviewed commands and changes are not drawn with ligatures",
    );
    assert.equal(
      await js(
        `!!window.untrustedCandidate || !!document.querySelector('#candidate-files script')`,
      ),
      false,
    );
    assert.equal(
      await js(
        `document.documentElement.scrollWidth <= innerWidth && document.querySelector('#candidate-dialog').getBoundingClientRect().right <= innerWidth`,
      ),
      true,
    );
    await capture("candidate-review");
    await js(`document.querySelector('#candidate-consent').click()`);
    await until(
      () =>
        js(
          `document.querySelector('#candidate-status').textContent.includes('Consent matches this reading')`,
        ),
      "consent recorded and freshly matched",
    );
    assert.equal(
      await js(`document.querySelector('#candidate-consent').disabled`),
      true,
    );
    assert.deepEqual(await call("listRuns", [local.id]), beforeApproval);
    await capture("candidate-consented");
    await js(`document.querySelector('#candidate-run').click()`);
    await until(
      () => js(`document.querySelector('#checks-dialog').open`),
      "check result dialog",
    );
    await until(async () => {
      if ((await text("#checks-status")).includes("Checks passed")) return true;
      await js(`document.querySelector('#checks-refresh').click()`);
      return false;
    }, "setup and test passed");
    assert.match(await text("#checks-result"), /setup.*exit 0/s);
    assert.match(await text("#checks-result"), /test.*exit 0/s);
    assert.equal(
      await text("#checks-result > p:first-child"),
      "4 reported judging changes",
    );
    await capture("checks-passed");
    await js(`document.querySelector('#checks-close').click()`);
    await js(`document.querySelector('#workspace-commands').click()`);
    await until(
      () => js(`!document.querySelector('#commands-review').disabled`),
      "review after check",
    );
    await js(`document.querySelector('#commands-review').click()`);
    await until(
      () => js(`!document.querySelector('#candidate-run').disabled`),
      "consent after check",
    );

    // Run uses a separate review acknowledgement, checkout and result namespace.
    await js(`document.querySelector('#candidate-close').click()`);
    await js(`document.querySelector('#workspace-commands').click()`);
    await until(
      () => js(`!document.querySelector('#commands-review-run').disabled`),
      "run review available",
    );
    await js(`document.querySelector('#commands-review-run').click()`);
    await until(
      () => js(`!document.querySelector('#candidate-consent').disabled`),
      "run requires separate consent",
    );
    assert.equal(
      await js(`document.querySelector('#candidate-run').disabled`),
      true,
    );
    assert.match(await text("#candidate-notice"), /not test evidence/);
    assert.match(await text("#candidate-files"), /run fixture/);
    await js(`document.querySelector('#candidate-consent').click()`);
    await until(
      () => js(`!document.querySelector('#candidate-run').disabled`),
      "run consent recorded",
    );
    await capture("run-consented");
    await js(`document.querySelector('#candidate-run').click()`);
    await until(
      () => js(`document.querySelector('#checks-dialog').open`),
      "run result dialog",
    );
    await until(async () => {
      if ((await text("#checks-status")).includes("Run command succeeded"))
        return true;
      await js(`document.querySelector('#checks-refresh').click()`);
      return false;
    }, "setup and run succeeded");
    assert.match(await text("#checks-status"), /not test evidence/);
    assert.doesNotMatch(await text("#checks-status"), /Checks passed/);
    assert.match(await text("#checks-result"), /run.*exit 0/s);
    await capture("run-succeeded");
    await js(`document.querySelector('#checks-close').click()`);
    await js(`document.querySelector('#workspace-commands').click()`);
    await until(
      () => js(`!document.querySelector('#commands-review').disabled`),
      "test review remains separate",
    );
    await js(`document.querySelector('#commands-review').click()`);
    await until(
      () => js(`!document.querySelector('#candidate-run').disabled`),
      "test consent remains valid",
    );

    // A later commit must not inherit the earlier consent. Remove only this fixture.
    for (const path of Object.keys(reviewFiles))
      unlinkSync(join(local.local!.worktreePath, path));
    for (const args of [
      ["add", "--", ...Object.keys(reviewFiles)],
      ["commit", "--quiet", "-m", "restore review fixture"],
    ])
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Argent Smoke",
          "-c",
          "user.email=smoke@example.invalid",
          ...args,
        ],
        { cwd: local.local!.worktreePath, stdio: "ignore" },
      );
    await js(`document.querySelector('#candidate-refresh').click()`);
    await until(
      () =>
        js(
          `!document.querySelector('#candidate-consent').disabled && document.querySelector('#candidate-files').textContent.includes('No changes from the base')`,
        ),
      "new commit has no matching consent",
    );

    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await until(
      () => js(`!document.querySelector('#candidate-dialog').open`),
      "Escape closes candidate review",
    );
    assert.equal(await js(`document.activeElement.id`), "workspace-commands");
    await js(`document.querySelector('#workspace-checks').click()`);
    await until(
      () =>
        js(
          `document.querySelector('#checks-status').textContent.includes('stale')`,
        ),
      "later commit makes check stale",
    );
    assert.equal(
      await text("#checks-result > p:first-child"),
      "4 reported judging changes",
    );
    await capture("checks-stale");
    await js(`document.querySelector('#checks-close').click()`);
  };

  // Each suite starts in a fresh app and service with its own outer deadline.
  if (suite === "welcome") {
    await ready();
    const firstMessage = "Inspect this repository";
    await js(`document.querySelector('#welcome-input').value = ${JSON.stringify(firstMessage)};
      document.querySelector('#welcome-input').dispatchEvent(new Event('input'));
      document.querySelector('#welcome-input').focus();`);
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
    await until(
      () => js(`document.querySelector('#transcript .record') !== null`),
      "first message completes in the chosen local workspace",
    );
    const workspaces = (await call<Page<Workspace>>("listWorkspaces", []))
      .items;
    assert.equal(workspaces.length, 1);
    assert.equal(workspaces[0]!.provider, "local-worktree");
    const runs = (await call<Page<RunView>>("listRuns", [workspaces[0]!.id]))
      .items;
    assert.deepEqual(
      runs.map((run) => [run.task, run.permissionMode, run.status]),
      [[firstMessage, "edits", "completed"]],
    );
    console.log(
      `[ARGENT_SMOKE]${JSON.stringify({ passed: true, suite, elapsedMs: Date.now() - started })}`,
    );
    return;
  }
  if (suite === "commands") {
    await ready();
    await checkCommands(await createLocalWorkspace("#welcome-create"));
    console.log(
      `[ARGENT_SMOKE]${JSON.stringify({
        passed: true,
        suite,
        commandConfigurationApproved: true,
        candidateConsentRecorded: true,
        separateRunConsentAndOutcome: true,
        elapsedMs: Date.now() - started,
      })}`,
    );
    return;
  }

  // First launch: draft a message, choose a local repository or try the demo.
  await ready();
  await until(
    () => js(`!document.querySelector('#welcome').hidden`),
    "welcome",
  );
  await js(`document.querySelector('.welcome-art').decode()`);
  await capture("welcome");
  window.setSize(900, 620);
  await capture("welcome-compact");
  assert.equal(
    await js(`['#welcome-input', '#welcome-create', '#welcome-demo', '#welcome-send'].every(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth &&
        rect.top >= 0 && rect.bottom <= innerHeight;
    })`),
    true,
    "the first-message field and its actions fit the compact window",
  );
  await js(
    `document.querySelector('#service-menu').click(); document.querySelector('#service-toggle').click(); document.querySelector('#service-stop-confirm').click()`,
  );
  await until(
    () =>
      js(`document.querySelector('#reconnect-inline').checkVisibility() &&
      !document.querySelector('#reconnect-inline').disabled &&
      document.querySelector('#welcome-create').disabled`),
    "first-launch recovery remains accessible before choosing a repository",
  );
  await js(`document.querySelector('#reconnect-inline').click()`);
  await ready();
  window.setSize(1380, 900);
  assert.equal(
    await js(
      `Array.from(document.querySelectorAll('#welcome button')).filter(b => b.getClientRects().length).length`,
    ),
    3,
    "welcome shows repository, scripted demo and send actions",
  );

  // Bundled fonts, icons and brand images load through the asset allowlist.
  assert.equal(
    await js(
      `document.fonts.ready.then(() => Promise.all(['13px Manrope', '600 15px Inter', '12px "JetBrains Mono"'].map(font => document.fonts.load(font)))).then(sets => sets.every(set => set.length > 0))`,
    ),
    true,
    "bundled fonts load",
  );
  assert.equal(
    await js(
      `Promise.all(Array.from(document.images).map(img => img.decode().then(() => img.naturalWidth > 0, () => false))).then(all => all.every(Boolean))`,
    ),
    true,
    "brand images load",
  );
  assert.equal(
    await js(
      `Array.from(document.querySelectorAll('.icon')).every(icon => getComputedStyle(icon).maskImage !== 'none')`,
    ),
    true,
  );
  assert.equal(
    await js(
      `Math.min(...Array.from(document.querySelectorAll('.icon-button, .button, .send-button')).filter(button => button.getClientRects().length).map(button => button.getBoundingClientRect().height)) >= 24`,
    ),
    true,
  );

  // Settings is one page and returns focus on Escape.
  await js(
    `document.querySelector('#settings-open').focus(); document.querySelector('#settings-open').click()`,
  );
  assert.equal(
    await js(`document.querySelector('#settings-dialog').open`),
    true,
  );
  assert.match(
    await text("#settings-dialog"),
    /Not connected|planned and not connected/,
  );
  await capture("settings");
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await until(
    () => js(`!document.querySelector('#settings-dialog').open`),
    "Escape closes settings",
  );
  assert.equal(await js(`document.activeElement.id`), "settings-open");

  // Opening the scripted demo carries the draft without submitting it.
  await js(
    `document.querySelector('#welcome-input').value = 'Draft from welcome'; document.querySelector('#welcome-input').dispatchEvent(new Event('input'));`,
  );
  await js(`document.querySelector('#welcome-demo').click()`);
  assert.equal(
    await js(`document.querySelector('#workspace-dialog').open`),
    true,
  );
  await js(
    `document.querySelector('#repository-input').value = 'https://example.com/repository'; document.querySelector('#workspace-form').requestSubmit();`,
  );
  await until(
    () => js(`!document.querySelector('#workspace-form-error').hidden`),
    "rejected repository URL",
  );
  assert.equal(
    await js(
      `document.querySelector('#repository-input').getAttribute('aria-invalid')`,
    ),
    "true",
  );
  await capture("form-error");
  await js(
    `document.querySelector('#repository-input').value = 'https://github.com/GregPat22/argent'; document.querySelector('#workspace-form').requestSubmit();`,
  );
  await until(
    () =>
      js(
        `!document.querySelector('#workspace-dialog').open && !!document.querySelector('[data-workspace-id]') && !document.querySelector('#composer-input').disabled`,
      ),
    "demo workspace created",
  );
  const workspace = (await call<Page<Workspace>>("listWorkspaces", []))
    .items[0]!;
  assert.equal(await text("#workspace-title"), "argent");
  assert.equal(
    await js(`document.querySelector('#permission-toggle').hidden`),
    true,
  );
  assert.equal(
    await js(`document.querySelector('#composer-input').value`),
    "Draft from welcome",
  );
  assert.equal(
    (await call<Page<RunView>>("listRuns", [workspace.id])).items.length,
    0,
  );
  await capture("demo-empty");
  await js(`document.querySelector('#workspace-changes').click()`);
  assert.match(await text("#changes-status"), /Scripted demo.*no real diff/);
  assert.equal(
    await js(`document.querySelector('#changes-refresh').disabled`),
    true,
  );
  await js(`document.querySelector('#changes-close').click()`);
  await js(`document.querySelector('#workspace-commands').click()`);
  assert.match(
    await text("#commands-status"),
    /Scripted demo.*no command configuration/,
  );
  assert.deepEqual(
    await js(
      `[document.querySelector('#commands-refresh').disabled, document.querySelector('#commands-approve').disabled]`,
    ),
    [true, true],
  );
  await js(`document.querySelector('#commands-close').click()`);

  // Search jumps to workspaces with arrows and Enter.
  await js(`document.querySelector('#search-nav').click()`);
  assert.equal(
    await js(`document.querySelector('#navigation-dialog').open`),
    true,
  );
  await js(
    `document.querySelector('#workspace-search').value = 'no-match-anywhere'; document.querySelector('#workspace-search').dispatchEvent(new Event('input'));`,
  );
  assert.match(await text("#search-summary"), /No matches/);
  await js(
    `document.querySelector('#workspace-search').value = 'argent'; document.querySelector('#workspace-search').dispatchEvent(new Event('input'));`,
  );
  assert.ok(
    (await js<number>(`document.querySelectorAll('.search-result').length`)) >=
      1,
  );
  await capture("palette");
  await js(
    `document.querySelector('#workspace-search').focus(); document.querySelector('#navigation-dialog').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true})); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));`,
  );
  await until(
    () => js(`!document.querySelector('#navigation-dialog').open`),
    "search selection closes the palette",
  );

  for (const [width, height] of [
    [900, 620],
    [1380, 900],
  ]) {
    window.setSize(width!, height!);
    await delay(120);
    assert.equal(
      await js(`document.documentElement.scrollWidth <= innerWidth`),
      true,
    );
    assert.equal(
      await js(
        `(() => { const r = document.querySelector('#composer-submit').getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight; })()`,
      ),
      true,
    );
  }

  // Reduced motion removes animation and transitions.
  await window.webContents.debugger.attach("1.3");
  await window.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await js(`document.querySelector('#settings-open').click()`);
  assert.equal(
    await js(
      `getComputedStyle(document.querySelector('#settings-dialog')).animationName`,
    ),
    "none",
  );
  assert.equal(
    await js(
      `getComputedStyle(document.querySelector('#settings-open')).transitionDuration`,
    ),
    "0s",
  );
  assert.equal(
    await js(
      `getComputedStyle(document.querySelector('#settings-dialog'), '::backdrop').animationName`,
    ),
    "none",
    "the dialog backdrop also respects reduced motion",
  );
  await js(`document.querySelector('#settings-dialog').close()`);
  await window.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  window.webContents.debugger.detach();

  // Send straight from the composer; the record ends the turn.
  const task = "Inspect durable execution and independently verified artifacts";
  const first = await send(task, workspace.id);
  await until(
    async () =>
      (await call<RunView>("getRun", [first.id])).status === "completed",
    "independent completion",
  );
  await until(
    () =>
      js(
        `!!document.querySelector('.record') && document.querySelector('.record-raw pre').textContent.includes(${JSON.stringify(task)})`,
      ),
    "simulation record rendered",
  );
  assert.match(await text(".record"), /Simulation/);
  window.setSize(900, 620);
  await delay(120);
  await capture("compact");
  window.setSize(1380, 900);
  await delay(120);
  await capture("demo-record");

  const second = await send(
    "Continue this task after the application window closes",
    workspace.id,
  );
  await until(
    async () =>
      (await call<RunView>("getRun", [second.id])).status === "running",
    "run active before window close",
  );
  assert.equal(await js(`document.querySelector('#cancel-run').hidden`), false);
  await capture("demo-working");
  window.close();
  await until(
    async () =>
      (await call<RunView>("getRun", [second.id])).status === "completed",
    "background execution without a window",
  );
  app.emit("activate");
  await until(
    async () => BrowserWindow.getAllWindows().length > 0,
    "reopened window",
  );
  window = BrowserWindow.getAllWindows()[0]!;
  await ready();
  await until(
    () =>
      js(
        `!document.querySelector('#welcome').hidden && !!document.querySelector(${JSON.stringify(`[data-workspace-id="${workspace.id}"]`)})`,
      ),
    "reopened window starts on the welcome screen",
  );
  await js(
    `document.querySelector(${JSON.stringify(`[data-workspace-id="${workspace.id}"]`)}).click()`,
  );
  await until(
    () =>
      js(
        `document.querySelector('#transcript').textContent.includes(${JSON.stringify(second.task)})`,
      ),
    "persisted workspace and conversation restored",
  );

  // Stop from the composer.
  const third = await send("Cancel this simulated task", workspace.id);
  await until(
    () =>
      js(
        `!document.querySelector('#cancel-run').hidden && !document.querySelector('#cancel-run').disabled`,
      ),
    "stop available",
  );
  await js(`document.querySelector('#cancel-run').click()`);
  await until(
    async () =>
      (await call<RunView>("getRun", [third.id])).status === "cancelled",
    "cancellation acknowledged",
  );

  // Stopping the service interrupts a run; it needs review, never a replay.
  const uncertain = await send(
    "Review an interrupted simulation without replaying it",
    workspace.id,
  );
  await until(
    async () =>
      (await call<RunView>("getRun", [uncertain.id])).status === "running",
    "run active before service stop",
  );
  await js(`document.querySelector('#service-menu').click()`);
  await capture("service-popover");
  await js(`document.querySelector('#service-toggle').click()`);
  await until(
    () => js(`document.querySelector('#stop-dialog').open`),
    "stop confirmation",
  );
  await js(`document.querySelector('#service-stop-confirm').click()`);
  await until(
    () =>
      js(
        `document.querySelector('#service-status').textContent === 'Service offline'`,
      ),
    "explicit service stop",
  );
  await until(
    () => js(`!document.querySelector('#disconnected-banner').hidden`),
    "offline notice",
  );
  assert.equal(
    await js(`document.querySelector('#composer-input').disabled`),
    true,
  );
  await capture("offline");
  await js(`document.querySelector('#reconnect-inline').click()`);
  await ready();
  await until(
    () => js(`!!document.querySelector('[data-action="resolve"]')`),
    "uncertain run review",
  );
  assert.equal(
    (await call<RunView>("getRun", [uncertain.id])).status,
    "needs_attention",
  );
  assert.equal(await text("#workspace-state"), "Needs review");
  await capture("needs-review");
  await js(`document.querySelector('[data-action="resolve"]').click()`);
  await capture("resolve-dialog");
  await js(
    `document.querySelector('#resolution-input').value = 'Reviewed native UX smoke interruption; abandon the simulation without replay.'; document.querySelector('#resolve-form').requestSubmit();`,
  );
  await until(
    async () =>
      (await call<RunView>("getRun", [uncertain.id])).status === "failed",
    "audited simulation resolution",
  );
  await until(
    () =>
      js(
        `!document.querySelector('#resolve-dialog').open && document.querySelector('#resolution-submit').getAttribute('aria-busy') === 'false'`,
      ),
    "resolution form released",
  );

  // A local repository with a fake Claude Code CLI (set by the harness).
  const before = (await call<Page<Workspace>>("listWorkspaces", [])).items
    .length;
  const local = await createLocalWorkspace("#new-workspace");
  await js(`document.querySelector('#permission-toggle').click()`);
  assert.equal(
    await js(
      `document.querySelector('#full-access-confirm').matches(':popover-open')`,
    ),
    true,
  );
  assert.equal(await text("#permission-toggle"), "Edits only");
  await capture("local-full-access");
  await js(`document.querySelector('#full-access-allow').click()`);
  assert.equal(await text("#permission-toggle"), "Full access");
  const localTask = "Write a short note about this repository";
  const localRun = await send(localTask, local.id);
  assert.equal(
    await text("#permission-toggle"),
    "Edits only",
    "full access resets",
  );
  await until(
    () =>
      js(
        `document.querySelector('#transcript').textContent.includes('Added notes.txt') && !!document.querySelector('.record')`,
      ),
    "local Claude Code run recorded",
  );
  const finished = await call<RunView>("getRun", [localRun.id]);
  assert.equal(finished.simulation, false);
  assert.equal(finished.permissionMode, "full");
  assert.equal(finished.maxRuntimeMs, 1800000);
  assert.deepEqual(
    await js(
      `[document.querySelectorAll('.record .mark.struck').length, document.querySelectorAll('.record .mark.unstruck').length, document.querySelector('.record .tag').textContent, document.querySelector('#transcript').textContent.includes('Write: notes.txt'), document.querySelector('.message-meta').textContent.includes('Full access')]`,
    ),
    [2, 2, "Not tested", true, true],
    "a Claude Code record strikes only the marks Argent has data for",
  );
  await capture("local-session");
  await js(
    `document.querySelector('.steps-disclosure').open = true; document.querySelector('#conversation').scrollTop = 1e6`,
  );
  await capture("local-record");

  // Real temporary Git content; inspection must not create runs or replace evidence.
  const worktree = local.local!.worktreePath;
  renameSync(join(worktree, "README.md"), join(worktree, "renamed.md"));
  unlinkSync(join(worktree, "delete-me.txt"));
  writeFileSync(join(worktree, "binary.bin"), Buffer.from([0, 1, 2, 255]));
  const hostilePath = "<img src=x onerror=alert(1)>\n\u202e.txt";
  writeFileSync(
    join(worktree, hostilePath),
    "<script>window.untrustedChanges = true</script>\n",
  );
  const beforeInspection = await call("artifact", [localRun.id]);
  const beforeRuns = await call("listRuns", [local.id]);
  await js(
    `document.querySelector('#workspace-changes').focus(); document.querySelector('#workspace-changes').click()`,
  );
  await until(
    () => js(`document.querySelectorAll('#changes-files button').length === 5`),
    "live changes list",
  );
  assert.match(await text("#changes-files"), /renamed.*renamed.md/);
  assert.match(await text("#changes-files"), /deleted.*delete-me.txt/);
  await js(
    `Array.from(document.querySelectorAll('#changes-files button')).find(button => button.dataset.path === 'notes.txt').click()`,
  );
  assert.match(
    await text("#changes-diff"),
    /\+Write a short note about this repository/,
  );
  assert.match(await text("#changes-status"), /not tested/);
  await capture("local-changes");
  await js(
    `Array.from(document.querySelectorAll('#changes-files button')).find(button => button.dataset.path === 'binary.bin').click()`,
  );
  assert.match(await text("#changes-diff"), /Binary or non-UTF-8/);
  await js(
    `Array.from(document.querySelectorAll('#changes-files button')).find(button => button.dataset.path === ${JSON.stringify(hostilePath)}).click()`,
  );
  assert.match(
    await text("#changes-diff"),
    /<script>window.untrustedChanges = true<\/script>/,
  );
  assert.equal(
    await js(
      `!!window.untrustedChanges || !!document.querySelector('#changes-files img, #changes-diff script')`,
    ),
    false,
  );
  for (const width of [900, 1380]) {
    window.setSize(width, 700);
    await delay(100);
    assert.equal(
      await js(
        `document.documentElement.scrollWidth <= innerWidth && document.querySelector('#changes-dialog').getBoundingClientRect().right <= innerWidth`,
      ),
      true,
    );
  }
  writeFileSync(join(worktree, "notes.txt"), "Updated by smoke fixture\n");
  await js(`document.querySelector('#changes-refresh').click()`);
  await until(
    () => js(`!document.querySelector('#changes-refresh').disabled`),
    "manual refresh settles",
  );
  await js(
    `Array.from(document.querySelectorAll('#changes-files button')).find(button => button.dataset.path === 'notes.txt').click()`,
  );
  assert.match(await text("#changes-diff"), /Updated by smoke fixture/);
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await until(
    () => js(`!document.querySelector('#changes-dialog').open`),
    "Escape closes changes",
  );
  assert.equal(await js(`document.activeElement.id`), "workspace-changes");
  assert.deepEqual(await call("artifact", [localRun.id]), beforeInspection);
  assert.deepEqual(await call("listRuns", [local.id]), beforeRuns);

  await js(`document.querySelector('#workspace-menu-button').click()`);
  await capture("workspace-menu");
  await js(`document.querySelector('#workspace-parallel').click()`);
  await until(
    async () =>
      (await call<Page<Workspace>>("listWorkspaces", [])).items.length ===
      before + 2,
    "parallel local workspace",
  );
  const parallel = (await call<Page<Workspace>>("listWorkspaces", []))
    .items[0]!;
  assert.equal(parallel.local?.repositoryPath, local.local!.repositoryPath);
  assert.notEqual(parallel.local?.branch, local.local!.branch);
  await until(
    () =>
      js(
        `document.querySelector('#workspace-branch').textContent === ${JSON.stringify(parallel.local!.branch)}`,
      ),
    "parallel workspace selected",
  );
  assert.equal(
    await js(`document.querySelectorAll('.repo-group').length`),
    2,
    "workspaces group by repository",
  );
  await capture("parallel");
  const screenshot = shots;
  if (shots) {
    await delay(200);
    writeFileSync(shots, (await window.webContents.capturePage()).toPNG());
  }
  console.log(
    `[ARGENT_SMOKE]${JSON.stringify({
      passed: true,
      suite,
      elapsedMs: Date.now() - started,
      simulation: true,
      welcome: true,
      composerSendsDirectly: true,
      fullAccessConfirmedAndReset: true,
      desktopSizes: [
        [900, 620],
        [1380, 900],
      ],
      bundledFonts: true,
      keyboardSearch: true,
      reducedMotion: true,
      localIconAssets: true,
      formValidation: true,
      uncertaintyRecovery: true,
      localWorkspace: true,
      honestRecord: true,
      liveChanges: true,
      changesKeyboardClose: true,
      parallelWorkspace: true,
      workspaceId: workspace.id,
      verifiedRun: first.id,
      backgroundRun: second.id,
      cancelledRun: third.id,
      rendererIsolation: true,
      windowReopened: true,
      serviceRestarted: true,
      screenshot,
    })}`,
  );
}
