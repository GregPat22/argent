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
  await expect(page.locator("[data-silver-sculpture] canvas")).toBeVisible();
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
      if (kind === "webgl2" || kind === "2d") return null;
      return original.call(this, kind, ...args);
    } as typeof original;
  });
  await page.reload();
  await expect(page.locator(".silver-fallback")).toBeVisible();
  await expect(page.locator("[data-atom-fallback]")).toBeVisible();
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

test("section chrome and navbar reading progress are removed", async ({
  page,
}) => {
  await page.goto("/");
  for (const label of [
    "The nature of Argent",
    "A considered process",
    "Conducting what comes next",
    "A continuous thread",
  ]) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator("header > div > div[aria-hidden]")).toHaveCount(0);
  await expect(page.locator("#lifecycle > div[aria-hidden]")).toHaveCount(0);
  for (const section of await page.locator("main > section").all()) {
    expect(
      await section.evaluate((el) => getComputedStyle(el).borderTopWidth),
    ).toBe("0px");
  }
});

test("workflow stages are compact and keyboard selectable", async ({
  page,
}) => {
  await page.goto("/");
  const tabs = page.getByRole("tablist", {
    name: "Explore the planned workflow",
  });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  const first = page.getByRole("tab", { name: "Define the work" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  const run = page.getByRole("tab", { name: "Run within limits" });
  await expect(run).toBeFocused();
  await expect(run).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Room to work. Boundaries in place.",
  );
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Review the evidence" }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "The agent finishes. You decide.",
  );
  await expect(page.getByRole("tabpanel")).toContainText(
    "At most one repair, then recheck",
  );
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Written acceptance criteria",
  );
  expect(
    await page
      .locator("#lifecycle")
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(1500);
});

test("atom animates, pauses, stops offscreen and respects reduced motion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.clearRect;
    Object.assign(window, { atomFrames: 0 });
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.closest("[data-silver-atom]"))
        (window as unknown as { atomFrames: number }).atomFrames++;
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  const atom = page.locator("[data-silver-atom] canvas");
  await atom.scrollIntoViewIfNeeded();
  const image = await atom.evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL(),
  );
  await expect
    .poll(() => atom.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
    .not.toBe(image);
  await page.getByRole("button", { name: "Pause atom", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume atom", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const paused = await atom.evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL(),
  );
  await page.waitForTimeout(400);
  expect(
    (await atom.evaluate((el) => (el as HTMLCanvasElement).toDataURL())) ===
      paused,
  ).toBe(true);
  await page.getByRole("button", { name: "Resume atom", exact: true }).click();
  await expect
    .poll(() => atom.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
    .not.toBe(paused);
  await page.locator("#roadmap").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const frames = await page.evaluate(
    () => (window as unknown as { atomFrames: number }).atomFrames,
  );
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      () => (window as unknown as { atomFrames: number }).atomFrames,
    ),
  ).toBe(frames);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await atom.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const still = await atom.evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL(),
  );
  await page.waitForTimeout(400);
  expect(
    (await atom.evaluate((el) => (el as HTMLCanvasElement).toDataURL())) ===
      still,
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Pause atom", exact: true }),
  ).toBeHidden();
  expect(
    await page
      .locator(".conductor-silver")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

test("hover changes the silver geometry and leaving restores it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const names = new WeakMap<WebGLUniformLocation, string>();
    const getLocation = WebGL2RenderingContext.prototype.getUniformLocation;
    const setFloat = WebGL2RenderingContext.prototype.uniform1f;
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    Object.assign(window, { captureSilver: false, silverPixels: -1 });
    WebGL2RenderingContext.prototype.getUniformLocation = function (
      program,
      name,
    ) {
      const location = getLocation.call(this, program, name);
      if (location) names.set(location, name);
      return location;
    };
    WebGL2RenderingContext.prototype.uniform1f = function (location, value) {
      // Freeze ambient time so the pixel-area change can only come from hover.
      return setFloat.call(
        this,
        location,
        location && names.get(location) === "uTime" ? 4 : value,
      );
    };
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      draw.apply(this, args);
      const state = window as unknown as {
        captureSilver: boolean;
        silverPixels: number;
      };
      if (!state.captureSilver) return;
      const w = this.drawingBufferWidth,
        h = this.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, pixels);
      let filled = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 200) filled++;
      state.silverPixels = filled;
      state.captureSilver = false;
    };
  });
  await page.goto("/");
  const capture = async () => {
    await page.evaluate(() => Object.assign(window, { captureSilver: true }));
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { captureSilver: boolean }).captureSilver,
        ),
      )
      .toBe(false);
    return page.evaluate(
      () => (window as unknown as { silverPixels: number }).silverPixels,
    );
  };
  await page.mouse.move(10, 10);
  const rest = await capture();
  expect(rest).toBeGreaterThan(1000);
  await page.mouse.move(1260, 400, { steps: 12 });
  await expect
    .poll(async () => Math.abs((await capture()) - rest) / rest)
    .toBeGreaterThan(0.015);
  await page.mouse.move(10, 10, { steps: 12 });
  await expect
    .poll(async () => Math.abs((await capture()) - rest) / rest)
    .toBeLessThan(0.005);
});
