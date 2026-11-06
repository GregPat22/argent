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
  const until = async (predicate: () => Promise<unknown>, label: string) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await predicate()) return;
      await delay(50);
    }
    throw new Error(
      `Desktop smoke timed out: ${label}; UI ${await js(`JSON.stringify({service: document.querySelector('#service-status')?.textContent, error: document.querySelector('#error-text')?.textContent, stopDialog: document.querySelector('#stop-dialog')?.open, serviceDisabled: document.querySelector('#service-toggle')?.disabled, run: document.querySelector('#run-state')?.textContent})`)}`,
    );
  };
  const js = <T>(script: string) =>
    window.webContents.executeJavaScript(script) as Promise<T>;
  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    const result = await client.call(method, args);
    if (!result.ok) throw new Error(result.error);
    return result.value as T;
  };
  const capture = async (name: string) => {
    const base = process.env.ARGENT_SCREENSHOT_PATH;
    if (!base) return;
    await delay(220);
    writeFileSync(
      base.replace(/\.png$/, `-${name}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  const ready = () =>
    until(
      () =>
        js(
          `!!window.argent && !!document.querySelector('#new-task') && document.querySelector('#service-status').textContent === 'Service online'`,
        ),
      "renderer and service",
    );
  await ready();
  await capture("welcome");
  await js(
    `document.querySelector('#settings-open').focus(); document.querySelector('#settings-open').click()`,
  );
  assert.equal(
    await js(`document.querySelector('#settings-dialog').open`),
    true,
  );
  await js(`document.querySelector('[data-provider="Cursor"]').click()`);
  assert.equal(
    await js(`document.querySelector('#provider-name').textContent`),
    "Cursor",
  );
  await js(`document.querySelector('[data-provider="OpenCode"]').click()`);
  assert.equal(
    await js(
      `document.querySelector('#provider-note').textContent.includes('provider catalog')`,
    ),
    true,
  );
  await js(
    `document.querySelector('[data-provider="Claude Code"]').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true}));`,
  );
  assert.equal(
    await js(`document.querySelector('#provider-name').textContent`),
    "Codex",
  );
  assert.equal(
    await js(`document.activeElement.getAttribute('aria-selected')`),
    "true",
  );
  await js(
    `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'End', bubbles:true}));`,
  );
  assert.equal(
    await js(`document.querySelector('#provider-name').textContent`),
    "OpenCode",
  );
  await js(
    `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Home', bubbles:true}));`,
  );
  assert.equal(
    await js(`document.querySelector('#provider-name').textContent`),
    "Claude Code",
  );
  await js(`document.querySelector('[data-settings="mobile"]').click()`);
  assert.equal(
    await js(`document.querySelector('#settings-mobile').hidden`),
    false,
  );
  await capture("mobile-preview");
  await js(`document.querySelector('[data-settings="continuity"]').click()`);
  assert.equal(
    await js(`document.querySelector('#settings-continuity').hidden`),
    false,
  );
  await js(
    `document.querySelector('#settings-dialog').close(); document.querySelector('[data-inspector="files"]').click()`,
  );
  assert.equal(
    await js(`document.querySelector('#inspector-files').hidden`),
    false,
  );
  await js(`document.querySelector('[data-inspector="changes"]').click()`);
  assert.equal(
    await js(`document.querySelector('#inspector-changes').hidden`),
    false,
  );
  await js(`document.querySelector('[data-terminal="Run"]').click()`);
  assert.equal(
    await js(
      `document.querySelector('#terminal-description').textContent.includes('No command is running')`,
    ),
    true,
  );

  assert.equal(
    await js(
      `document.querySelector('.brand-symbol').getBoundingClientRect().height <= 24`,
    ),
    true,
  );
  await js(
    `document.querySelector('[data-inspector="files"]').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'End', bubbles:true}));`,
  );
  assert.equal(
    await js(`document.querySelector('#inspector-checks').hidden`),
    false,
  );
  await js(
    `document.querySelector('[data-terminal="Terminal"]').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Home', bubbles:true}));`,
  );
  assert.equal(
    await js(
      `document.querySelector('#terminal-description').textContent.includes('Setup')`,
    ),
    true,
  );
  await js(
    `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'End', bubbles:true}));`,
  );
  assert.equal(
    await js(
      `document.querySelector('#terminal-description').textContent.includes('terminal')`,
    ),
    true,
  );
  assert.equal(
    await js(
      `Array.from(document.querySelectorAll('.icon')).every(icon => getComputedStyle(icon).maskImage !== 'none')`,
    ),
    true,
  );
  assert.equal(
    await js(
      `new Promise(resolve => { const image = new Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = 'argent://app/icons/house.svg'; })`,
    ),
    true,
  );
  assert.equal(
    await js(
      `Math.min(...Array.from(document.querySelectorAll('.icon-button')).filter(button => button.getClientRects().length).map(button => button.getBoundingClientRect().height)) >= 32`,
    ),
    true,
  );
  assert.equal(await js(`typeof window.require`), "undefined");
  assert.equal(await js(`typeof window.process`), "undefined");
  assert.equal(await js(`Object.keys(window.argent).includes('token')`), false);
  await js(
    `document.querySelector('#new-workspace').click(); document.querySelector('#repository-input').value = 'https://example.com/repository'; document.querySelector('#workspace-form').requestSubmit();`,
  );
  await until(
    () => js(`!document.querySelector('#workspace-form-error').hidden`),
    "workspace validation error",
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
        `!!document.querySelector('[data-workspace-id]') && !document.querySelector('#new-task').disabled`,
      ),
    "workspace creation",
  );
  const workspace = (await call<Page<Workspace>>("listWorkspaces", []))
    .items[0]!;
  await js(`document.querySelector('#inspector-toggle').click()`);
  assert.equal(await js(`document.querySelector('#inspector').hidden`), true);
  assert.equal(
    await js(
      `document.querySelector('#inspector-toggle').getAttribute('aria-expanded')`,
    ),
    "false",
  );
  await js(`document.querySelector('#inspector-toggle').click()`);
  assert.equal(await js(`document.querySelector('#inspector').hidden`), false);
  await js(
    `document.dispatchEvent(new KeyboardEvent('keydown', {key:'k', metaKey:true, bubbles:true}));`,
  );
  assert.equal(
    await js(`document.querySelector('#navigation-dialog').open`),
    true,
  );
  await js(
    `document.querySelector('#workspace-search').value = 'no-match'; document.querySelector('#workspace-search').dispatchEvent(new Event('input'));`,
  );
  assert.equal(
    await js(
      `document.querySelector('#search-summary').textContent.includes('No matching')`,
    ),
    true,
  );
  await js(
    `document.querySelector('#workspace-search').value = 'argent'; document.querySelector('#workspace-search').dispatchEvent(new Event('input'));`,
  );
  assert.equal(
    await js(`document.querySelectorAll('.search-result').length`),
    1,
  );
  await js(
    `document.querySelector('#workspace-search').focus(); document.querySelector('#navigation-dialog').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', bubbles:true})); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true})); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); document.querySelector('#composer-input').value = 'Review composer simulation'; document.querySelector('#composer-input').dispatchEvent(new Event('input')); document.querySelector('#composer-input').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', metaKey:true, bubbles:true}));`,
  );
  assert.equal(await js(`document.querySelector('#task-dialog').open`), true);
  assert.equal(
    await js(`document.querySelector('#task-input').value`),
    "Review composer simulation",
  );
  assert.equal(
    (await call<Page<RunView>>("listRuns", [workspace.id])).items.length,
    0,
  );
  await js(
    `document.querySelector('#task-dialog').close(); document.querySelector('#settings-open').focus(); document.querySelector('#settings-open').click();`,
  );
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await until(
    () => js(`!document.querySelector('#settings-dialog').open`),
    "Escape closes settings",
  );
  assert.equal(await js(`document.activeElement.id`), "settings-open");
  for (const [width, height] of [
    [900, 620],
    [1380, 900],
  ]) {
    window.setSize(width!, height!);
    await delay(100);
    assert.equal(
      await js(`document.documentElement.scrollWidth <= innerWidth`),
      true,
    );
    assert.equal(
      await js(
        `document.querySelector('#composer-submit').getBoundingClientRect().right <= innerWidth`,
      ),
      true,
    );
  }
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
  await js(`document.querySelector('[data-inspector="artifacts"]').click()`);
  const task = "Inspect durable execution and independently verified artifacts";
  const submit = async (text: string) => {
    await until(
      () => js(`!document.querySelector('#new-task').disabled`),
      "task enabled",
    );
    await js(
      `document.querySelector('#new-task').click(); document.querySelector('#task-input').value = ${JSON.stringify(text)}; document.querySelector('#task-form').requestSubmit();`,
    );
    await until(
      () =>
        js(
          `document.querySelector('#run-title').textContent === ${JSON.stringify(text)}`,
        ),
      "task submission",
    );
    return (await call<Page<RunView>>("listRuns", [workspace.id])).items.find(
      (run) => run.task === text,
    )!;
  };
  const first = await submit(task);
  assert.equal(
    await js(`document.querySelector('#composer-input').value`),
    "Review composer simulation",
    "submitting a different reviewed task must preserve the unsent draft",
  );
  await until(
    async () =>
      (await call<RunView>("getRun", [first.id])).status === "completed",
    "independent completion",
  );
  await until(
    () =>
      js(`document.querySelector('#run-state').textContent === 'Completed'`),
    "completed activity rendered",
  );
  window.setSize(900, 620);
  await delay(100);
  assert.equal(
    await js(
      `document.querySelector('#composer-submit').getBoundingClientRect().bottom <= innerHeight`,
    ),
    true,
  );
  await capture("compact");
  window.setSize(1380, 900);
  await delay(100);
  const screenshotBase = process.env.ARGENT_SCREENSHOT_PATH;
  if (screenshotBase) {
    mkdirSync(dirname(screenshotBase), { recursive: true });
    await delay(200);
    writeFileSync(
      screenshotBase.replace(/\.png$/, "-workspace.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    await js(
      `document.querySelector('#settings-open').click(); document.querySelector('[data-settings="agents"]').click(); document.querySelector('[data-provider="Claude Code"]').click()`,
    );
    await delay(200);
    writeFileSync(
      screenshotBase.replace(/\.png$/, "-agents.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    await js(`document.querySelector('#settings-dialog').close()`);
  }
  await js(`document.querySelector('#inspect-artifact').click()`);
  await until(
    () =>
      js(
        `!document.querySelector('#verification-result').hidden && document.querySelector('#artifact-content').textContent.includes(${JSON.stringify(task)})`,
      ),
    "verified artifact inspector",
  );
  const screenshot = process.env.ARGENT_SCREENSHOT_PATH;
  if (screenshot) {
    mkdirSync(dirname(screenshot), { recursive: true });
    await delay(200);
    writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
  }
  await js(
    `document.querySelector('#composer-input').value = 'Continue this task after the application window closes'; document.querySelector('#composer-input').dispatchEvent(new Event('input'));`,
  );
  const second = await submit(
    "Continue this task after the application window closes",
  );
  assert.equal(
    await js(`document.querySelector('#composer-input').value`),
    "",
    "an accepted task clears its submitted composer draft",
  );
  await until(
    async () =>
      (await call<RunView>("getRun", [second.id])).status === "running",
    "run active before window close",
  );
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
        `!!document.querySelector('[data-workspace-id]') && document.body.textContent.includes(${JSON.stringify(second.task)})`,
      ),
    "persisted workspace and task restored",
  );
  const third = await submit("Cancel this simulated task");
  await until(
    () =>
      js(
        `!document.querySelector('#cancel-run').hidden && !document.querySelector('#cancel-run').disabled`,
      ),
    "cancellation available",
  );
  await js(`document.querySelector('#cancel-run').click()`);
  await until(
    async () =>
      (await call<RunView>("getRun", [third.id])).status === "cancelled",
    "cancellation acknowledged",
  );
  const uncertain = await submit(
    "Review an interrupted simulation without replaying it",
  );
  await until(
    async () =>
      (await call<RunView>("getRun", [uncertain.id])).status === "running",
    "run active before service stop",
  );
  await js(`document.querySelector('#service-toggle').click()`);
  await until(
    () => js(`document.querySelector('#stop-dialog').open`),
    "service stop confirmation",
  );
  await js(`document.querySelector('#service-stop-confirm').click()`);
  await until(
    () =>
      js(
        `document.querySelector('#service-status').textContent === 'Service offline'`,
      ),
    "explicit service stop",
  );
  await capture("offline");
  await js(`document.querySelector('#service-toggle').click()`);
  await ready();
  await until(
    () => js(`!document.querySelector('#attention-panel').hidden`),
    "uncertain run review UI",
  );
  assert.equal(
    (await call<RunView>("getRun", [uncertain.id])).status,
    "needs_attention",
  );
  await capture("needs-review");
  await js(`document.querySelector('#resolve-run').click()`);
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
  assert.equal(
    (await call<Page<Workspace>>("listWorkspaces", [])).items[0]?.id,
    workspace.id,
  );
  console.log(
    `[ARGENT_SMOKE]${JSON.stringify({
      passed: true,
      simulation: true,
      shellNavigation: true,
      composerReviewOnly: true,
      providerPreviews: true,
      desktopSizes: [
        [900, 620],
        [1380, 900],
      ],
      keyboardTabsAndSearch: true,
      reducedMotion: true,
      localIconAssets: true,
      formValidation: true,
      uncertaintyRecovery: true,
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
