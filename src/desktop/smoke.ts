import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RunView, Workspace, Page } from "../domain.js";
import type { DesktopClient } from "./bridge.js";

export async function runDesktopSmoke(
  initial: BrowserWindow,
  client: DesktopClient,
): Promise<void> {
  let window = initial;
  const js = <T>(script: string) =>
    window.webContents.executeJavaScript(script) as Promise<T>;
  const until = async (predicate: () => Promise<unknown>, label: string) => {
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
    if (!shots) return;
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

  // First launch: the welcome offers one decision.
  await ready();
  await until(
    () => js(`!document.querySelector('#welcome').hidden`),
    "welcome",
  );
  await capture("welcome");
  assert.equal(
    await js(
      `Array.from(document.querySelectorAll('#welcome button')).filter(b => b.getClientRects().length).length`,
    ),
    2,
    "welcome shows the repository action and the demo link only",
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

  // A scripted demo workspace, with form validation.
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
  await capture("demo-empty");

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
        `!!document.querySelector('[data-workspace-id]') && document.querySelector('#transcript').textContent.includes(${JSON.stringify(second.task)})`,
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
  await js(`document.querySelector('#new-workspace').click()`);
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
  await capture("local-workspace");
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
