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
    throw new Error(`Desktop smoke timed out: ${label}`);
  };
  const js = <T>(script: string) =>
    window.webContents.executeJavaScript(script) as Promise<T>;
  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    const result = await client.call(method, args);
    if (!result.ok) throw new Error(result.error);
    return result.value as T;
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
  assert.equal(await js(`typeof window.require`), "undefined");
  assert.equal(await js(`typeof window.process`), "undefined");
  assert.equal(await js(`Object.keys(window.argent).includes('token')`), false);
  await js(
    `document.querySelector('#new-workspace').click(); document.querySelector('#repository-input').value = 'https://github.com/GregPat22/argent'; document.querySelector('#workspace-form').requestSubmit();`,
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
  await until(
    async () =>
      (await call<RunView>("getRun", [first.id])).status === "completed",
    "independent completion",
  );
  await js(`document.querySelector('#verification-tab').click()`);
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
    writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
  }
  const second = await submit(
    "Continue this task after the application window closes",
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
  await js(`document.querySelector('#service-toggle').click()`);
  await ready();
  assert.equal(
    (await call<Page<Workspace>>("listWorkspaces", [])).items[0]?.id,
    workspace.id,
  );
  console.log(
    `[ARGENT_SMOKE]${JSON.stringify({
      passed: true,
      simulation: true,
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
