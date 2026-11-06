import { expect, test } from "@playwright/test";

function countDraws() {
  const original = WebGL2RenderingContext.prototype.drawArrays;
  Object.assign(window, { argentFrames: 0 });
  WebGL2RenderingContext.prototype.drawArrays = function (...args) {
    (window as unknown as { argentFrames: number }).argentFrames++;
    return original.apply(this, args);
  };
}

test("page hydrates cleanly and every section has a readable heading", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Argent is a good conductor." }),
  ).toBeVisible();
  const sections = page.locator("main > section");
  await expect(sections).toHaveCount(8);
  for (const section of await sections.all()) {
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("h1,h2").first()).toBeVisible();
    expect(
      await section.evaluate((el) => el.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  await expect(page.locator("#roadmap")).toContainText(
    "Prototype complete · review branch",
  );
  await expect(page.locator("#hallmark")).toContainText(
    "example commit and simulated check results",
  );
  expect(errors).toEqual([]);
});

test("mobile navigation supports keyboard, Escape and anchor selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const menu = page.locator("button[aria-controls=mobile-navigation]");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page
    .locator("#mobile-navigation")
    .getByRole("link", { name: "Roadmap" })
    .click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/#roadmap$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("all sections fit at mobile and tablet widths", async ({ page }) => {
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    for (const section of await page.locator("main > section").all()) {
      await section.scrollIntoViewIfNeeded();
      expect(
        await section.evaluate((el) => el.scrollWidth <= window.innerWidth),
        `Section ${await section.getAttribute("aria-labelledby")} overflows at ${width}px`,
      ).toBeTruthy();
    }
    const stage = await page
      .locator("#hallmark .cursor-ew-resize")
      .boundingBox();
    const record = await page.locator("#hallmark dl").first().boundingBox();
    expect(
      stage && record && record.y + record.height <= stage.y + stage.height,
    ).toBeTruthy();
  }
});

test("comparison slider supports limits without clipping its handle", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const slider = page.getByRole("slider");
  await slider.scrollIntoViewIfNeeded();
  await slider.focus();
  for (const [key, value] of [
    ["Home", "0"],
    ["End", "100"],
    ["ArrowLeft", "95"],
  ]) {
    await page.keyboard.press(key);
    await expect(slider).toHaveAttribute("aria-valuenow", value);
    await expect
      .poll(async () => {
        const handle = await slider.boundingBox();
        const container = await page
          .locator("#hallmark .cursor-ew-resize")
          .boundingBox();
        return Boolean(
          handle &&
          container &&
          handle.x >= container.x &&
          handle.x + handle.width <= container.x + container.width,
        );
      })
      .toBeTruthy();
  }
});

test("illustrated reconnect preserves history and worker loss requires attention", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#reconnect").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Close Argent", exact: true }).click();
  await expect(page.locator("#reconnect")).toContainText("new event", {
    timeout: 5000,
  });
  await page
    .getByRole("button", { name: "Reopen Argent", exact: true })
    .first()
    .click();
  await expect(page.locator("#reconnect")).toContainText("Reconnected.");
  await page.getByRole("button", { name: "Cut the worker’s power" }).click();
  await expect(page.locator("#reconnect")).toContainText("Needs attention");
  await expect(
    page.getByRole("button", { name: "Cut the worker’s power" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(
    page.getByRole("button", { name: "Cut the worker’s power" }),
  ).toBeEnabled();
});

test("reduced motion keeps hero copy static and draws one sculpture frame", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(countDraws);
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { argentFrames: number }).argentFrames,
      ),
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const frames = await page.evaluate(
    () => (window as unknown as { argentFrames: number }).argentFrames,
  );
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () => (window as unknown as { argentFrames: number }).argentFrames,
    ),
  ).toBe(frames);
  await expect(
    page.getByRole("button", { name: "Pause sculpture" }),
  ).toBeHidden();
  await page.evaluate(() => scrollTo({ top: 400, behavior: "instant" }));
  expect(
    await page
      .locator("h1")
      .evaluate((el) => getComputedStyle(el.parentElement!).opacity),
  ).toBe("1");
  expect(errors).toEqual([]);
});

test("hero can be paused and WebGL has a static fallback", async ({ page }) => {
  await page.addInitScript(countDraws);
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { argentFrames: number }).argentFrames,
      ),
    )
    .toBeGreaterThan(2);
  const pause = page.getByRole("button", { name: "Pause sculpture" });
  await pause.click();
  await expect(
    page.getByRole("button", { name: "Resume sculpture" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  const frames = await page.evaluate(
    () => (window as unknown as { argentFrames: number }).argentFrames,
  );
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () => (window as unknown as { argentFrames: number }).argentFrames,
    ),
  ).toBe(frames);
  await page.getByRole("button", { name: "Resume sculpture" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { argentFrames: number }).argentFrames,
      ),
    )
    .toBeGreaterThan(frames);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind === "webgl2") return null;
      return original.call(this, kind, ...args);
    } as typeof original;
  });
  await page.reload();
  await expect(page.locator(".silver-fallback")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("copy commands reports success and provides a failure fallback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (text: string) =>
        Object.assign(window, { copiedCommands: text }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Copy commands" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Commands copied to clipboard.",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedCommands: string }).copiedCommands,
    ),
  ).toContain("npm run demo");
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("denied");
      },
    }),
  );
  await expect(page.getByRole("button", { name: "Copy commands" })).toBeVisible(
    { timeout: 4000 },
  );
  await page.getByRole("button", { name: "Copy commands" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Select the commands in the terminal",
  );
  const terminal = page.locator("#run pre[aria-hidden]");
  await expect(terminal).toContainText("limitations");
  expect(await terminal.evaluate((el) => getComputedStyle(el).overflowY)).toBe(
    "auto",
  );
});
