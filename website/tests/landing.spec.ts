import { expect, test, type Page } from "@playwright/test";

type EntranceWindow = Window & {
  entrance: { states: string[]; split: number; animations: number };
  headingSplit: number;
};

/** Open a page and wait until the first-load entrance has settled. */
async function visit(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => {
    const state = document.documentElement.dataset.entrance;
    return state === undefined || state === "done";
  });
}

test("page hydrates cleanly and every section has a readable heading", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await visit(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Silver conducts better than any metal/,
    }),
  ).toBeVisible();
  const sections = page.locator("main > section");
  await expect(sections).toHaveCount(11);
  for (const section of await sections.all()) {
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("h1,h2").first()).toBeVisible();
    expect(
      await section.evaluate((el) => el.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  await expect(page.locator("#roadmap")).toContainText(
    "In development · Claude Code runs today",
  );
  await expect(page.locator("#hallmark")).toContainText("Illustrative example");
  await expect(page.locator("#reconnect")).toContainText(
    "An illustration of the planned experience, not a live system.",
  );
  expect(errors).toEqual([]);
});

test("mobile navigation supports keyboard, Escape and anchor selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await visit(page, "/");
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

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`closed navigation retires links before rapid reopening (${reducedMotion})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ reducedMotion });
    await visit(page);
    const toggle = page.locator("button[aria-controls=mobile-navigation]");
    const menu = page.locator("#mobile-navigation");
    for (let turn = 0; turn < 3; turn++) {
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      // Check immediately: waiting for an exit animation would hide the race.
      expect(await menu.getByRole("link").count()).toBe(0);
      await expect(toggle).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await menu.getByRole("link", { name: "Roadmap", exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#roadmap$/);
  });
}

test("all sections fit at mobile and tablet widths", async ({ page }) => {
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await visit(page, "/");
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
  await visit(page, "/");
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

for (const input of ["keyboard", "pointer"] as const) {
  test(`comparison arrival hint yields permanently to ${input} input`, async ({
    page,
  }) => {
    await visit(page, "/");
    const stage = page.locator("#hallmark .cursor-ew-resize");
    const slider = page.getByRole("slider");
    await stage.evaluate((el) =>
      el.scrollIntoView({ behavior: "instant", block: "center" }),
    );
    if (input === "keyboard") {
      await slider.focus();
      await page.keyboard.press("End");
      await expect(slider).toHaveAttribute("aria-valuenow", "100");
    } else {
      const box = (await stage.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
      await expect(slider).toHaveAttribute("aria-valuenow", "90");
    }
    const selected = await slider.getAttribute("aria-valuenow");
    // Stay beyond the delayed spring's full lifetime, then change OS preference.
    await page.waitForTimeout(2200);
    await expect(slider).toHaveAttribute("aria-valuenow", selected!);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(slider).toHaveAttribute("aria-valuenow", selected!);
  });
}

test("the journey follows the scroll from desk to cloud to phone", async ({
  page,
}) => {
  await visit(page, "/");
  const journey = page.locator("#reconnect");
  const steps = journey.locator(".journey-step");
  await expect(steps).toHaveCount(3);
  await expect(journey).toContainText("Local MVP");
  await expect(steps.filter({ hasText: "Planned" })).toHaveCount(2);
  await expect(journey.locator(".journey-stage")).toHaveAttribute(
    "aria-hidden",
    "true",
  );

  const scrollTo = (fraction: number) =>
    page.locator(".journey-track").evaluate((track, f) => {
      const top = track.getBoundingClientRect().top + window.scrollY;
      const travel = (track as HTMLElement).offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + travel * f, behavior: "instant" });
    }, fraction);

  await scrollTo(0.02);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  await scrollTo(0.55);
  await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(journey.locator(".journey-desktop")).toHaveAttribute(
    "data-closed",
    "true",
  );
  await scrollTo(1);
  await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(journey.locator(".journey-notice")).toHaveAttribute(
    "data-shown",
    "true",
  );

  // Reduced motion shows the finished hand-off with every step readable.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await scrollTo(0);
  for (const step of await steps.all())
    await expect(step).toHaveAttribute("data-active", "true");
  await expect(journey.locator(".journey-notice")).toHaveAttribute(
    "data-shown",
    "true",
  );
});

/** Brightest pixel (0-255 mean of RGB) inside a page region. */
async function peakBrightness(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let peak = 0;
    for (let i = 0; i < pixels.length; i += 4)
      peak = Math.max(peak, (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3);
    return peak;
  }, png.toString("base64"));
}

test("hero centers the copy inside a field of interactive liquid silver", async ({
  page,
}) => {
  await visit(page, "/");
  const liquid = page.locator("#intro [data-liquid-silver]");
  const canvas = liquid.locator("canvas");
  await expect(liquid).toHaveAttribute("aria-hidden", "true");
  await expect(canvas).toHaveAttribute("data-state", "animating", {
    timeout: 15_000,
  });
  await expect(page.locator("#intro button")).toHaveCount(0);

  // The copy is centered and the metal fills the whole hero behind it.
  const viewport = page.viewportSize()!;
  const heading = (await page
    .getByRole("heading", { level: 1 })
    .boundingBox())!;
  const actions = (await page.locator("#intro .hero-actions").boundingBox())!;
  const box = (await canvas.boundingBox())!;
  expect(
    Math.abs(heading.x + heading.width / 2 - viewport.width / 2),
  ).toBeLessThan(2);
  expect(
    Math.abs(actions.x + actions.width / 2 - viewport.width / 2),
  ).toBeLessThan(2);
  expect(box.x).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(box.y).toBeLessThanOrEqual(heading.y);
  expect(box.y + box.height).toBeGreaterThan(actions.y + actions.height);

  // Two masses sit on opposite sides of the copy and render lit highlights.
  const masses = (await canvas.getAttribute("data-masses"))!
    .split(" ")
    .map((pair) => pair.split(",").map(Number) as [number, number]);
  expect(masses).toHaveLength(2);
  expect(masses[0]![0]).toBeLessThan(heading.x);
  expect(masses[1]![0]).toBeGreaterThan(heading.x + heading.width);
  for (const [x, y] of masses) {
    const cx = Math.min(Math.max(x, 70), viewport.width - 70);
    await expect
      .poll(
        () =>
          peakBrightness(page, {
            x: cx - 60,
            y: box.y + y - 60,
            width: 120,
            height: 120,
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(110);
  }

  // Beside the copy, the nearest mass reaches for the pointer; over the copy
  // it lets go so reading and clicking never drag the metal around.
  const [ax, ay] = masses[0]!;
  await page.mouse.move(ax + 100, box.y + ay);
  await page.mouse.move(ax + 230, box.y + ay - 60, { steps: 8 });
  await expect(canvas).toHaveAttribute("data-engaged", "mass", {
    timeout: 15_000,
  });
  await page.mouse.move(heading.x + 40, heading.y + 20, { steps: 6 });
  await expect(canvas).toHaveAttribute("data-engaged", "none", {
    timeout: 15_000,
  });
  await expect(
    page.locator("#intro").getByRole("link", { name: "Try it locally" }),
  ).toBeVisible();
});

test("liquid silver pauses offscreen and holds a still frame under reduced motion", async ({
  page,
}) => {
  // Software WebGL renders this raymarched shader on the CPU.
  test.slow();
  // Count draws instead of comparing screenshots: software compositing adds
  // ±1 colour-level noise between captures of an unchanged canvas.
  await page.addInitScript(() => {
    const counted = window as typeof window & { __liquidDraws?: number };
    counted.__liquidDraws = 0;
    for (const proto of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      const draw = proto.drawArrays;
      proto.drawArrays = function (...args: Parameters<typeof draw>) {
        counted.__liquidDraws! += 1;
        return draw.apply(this, args);
      };
    }
  });
  const draws = () =>
    page.evaluate(
      () =>
        (window as typeof window & { __liquidDraws?: number }).__liquidDraws,
    );
  await visit(page, "/");
  const canvas = page.locator("#intro [data-liquid-silver] canvas");
  await expect(canvas).toHaveAttribute("data-state", "animating", {
    timeout: 15_000,
  });
  await page.locator("#run").scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute("data-state", "paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(canvas).toHaveAttribute("data-state", "animating");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-state", "still", {
    timeout: 15_000,
  });
  const box = (await canvas.boundingBox())!;
  const settled = await draws();
  expect(settled).toBeGreaterThan(0);
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(700);
  expect(await draws()).toBe(settled);
});

test("hero keeps a static liquid fallback without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind === "webgl" || kind === "webgl2") return null;
      return original.call(this, kind, ...args);
    } as typeof original;
  });
  await visit(page, "/");
  await expect(page.locator("#intro [data-liquid-fallback]")).toBeVisible();
  await expect(page.locator("#intro canvas")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The atom's 2D canvas is unaffected.
  await expect(page.locator("[data-atom-fallback]")).toHaveCount(0);
});

test("liquid silver frames the centered copy on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/");
  const canvas = page.locator("#intro [data-liquid-silver] canvas");
  await expect(canvas).toHaveAttribute("data-state", "animating", {
    timeout: 15_000,
  });
  const box = (await canvas.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const heading = (await page
    .getByRole("heading", { level: 1 })
    .boundingBox())!;
  const actions = (await page.locator("#intro .hero-actions").boundingBox())!;
  expect(Math.abs(heading.x + heading.width / 2 - 195)).toBeLessThan(2);
  // One mass above the copy, one below it.
  const masses = (await canvas.getAttribute("data-masses"))!
    .split(" ")
    .map((pair) => Number(pair.split(",")[1]));
  expect(Math.min(...masses)).toBeLessThan(heading.y - box.y);
  expect(Math.max(...masses)).toBeGreaterThan(
    actions.y + actions.height - box.y,
  );
});

test("atom keeps its static fallback without canvas support", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await visit(page, "/");
  await expect(page.locator("[data-atom-fallback]")).toBeVisible();
  await expect(page.locator("[data-atom-electron]")).toHaveCount(47);
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
  await visit(page, "/");
  await page.getByRole("button", { name: "Copy commands" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Commands copied to clipboard.",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedCommands: string }).copiedCommands,
    ),
  ).toContain("npm run desktop");
  const terminal = page.locator("#run pre[aria-hidden]");
  await expect(terminal).toContainText("Not a sandbox");
  await page.getByRole("tab", { name: "Engine demo" }).click();
  await expect(terminal).toContainText("limitations");
  await expect(terminal).toContainText("No real repository");
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
  await expect(terminal).toContainText("limitations");
  expect(await terminal.evaluate((el) => getComputedStyle(el).overflowY)).toBe(
    "auto",
  );
});

test("section chrome and navbar reading progress are removed", async ({
  page,
}) => {
  await visit(page, "/");
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

test("how it works plays its three objects once and labels local mode honestly", async ({
  page,
}) => {
  await visit(page, "/");
  const section = page.locator("#lifecycle");
  const list = section.locator(".hiw-list");
  await expect(section.locator(".hiw-plate")).toHaveCount(3);
  await expect(list).toHaveAttribute("data-playing", "false");
  await list.scrollIntoViewIfNeeded();
  await expect(list).toHaveAttribute("data-playing", "true");
  await expect(section).toContainText("Local mode is not a sandbox");
  await expect(section).toContainText("Claude Code first, then Codex");
  await expect(section.getByText("In development")).toHaveCount(1);
});

test("agents section shows Claude Code and Codex with their models and a manual pick sticks", async ({
  page,
}) => {
  await visit(page, "/");
  const section = page.locator("#agents");
  await section.scrollIntoViewIfNeeded();
  const claude = section.getByRole("button", { name: /Claude Code/ });
  const codex = section.getByRole("button", { name: /Codex/ });
  await expect(claude.locator("svg path")).toHaveCount(1);
  await expect(codex.locator("svg path")).toHaveCount(1);
  await expect(claude).toContainText("Claude models");
  await expect(codex).toContainText("GPT models");
  await expect(section).toContainText("Cursor");
  await expect(section).toContainText("OpenCode");
  await expect(section).toContainText("not affiliated");

  // The preview alternates on its own until someone picks an agent.
  await expect(claude).toHaveAttribute("aria-pressed", "true");
  await expect(codex).toHaveAttribute("aria-pressed", "true", {
    timeout: 6000,
  });
  await claude.click();
  await expect(claude).toHaveAttribute("aria-pressed", "true");
  await expect(section.locator(".agents-composer")).toContainText(
    "Claude models",
  );
  await page.waitForTimeout(4000);
  await expect(claude).toHaveAttribute("aria-pressed", "true");
  await codex.focus();
  await page.keyboard.press("Enter");
  await expect(section.locator(".agents-composer")).toContainText("GPT models");
});

test("larger silver atom has no pause control, stops offscreen and respects reduced motion", async ({
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
  await visit(page, "/");
  const atom = page.locator("[data-silver-atom] canvas");
  await atom.scrollIntoViewIfNeeded();
  const image = await atom.evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL(),
  );
  await expect
    .poll(() => atom.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
    .not.toBe(image);
  await expect(page.locator("[data-silver-atom] button")).toHaveCount(0);
  expect((await atom.boundingBox())!.width).toBeGreaterThanOrEqual(440);
  await expect(page.locator("[data-silver-atom] p")).toHaveCount(0);
  await expect(page.locator("[data-silver-atom] [role=img]")).toHaveAttribute(
    "aria-label",
    /47 electrons/,
  );
  await page.locator("#roadmap").scrollIntoViewIfNeeded();
  await atom.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        // Scrolling completes before intersection notifications are delivered.
        // Wait for the offscreen notification and rendering turns, rather than
        // assuming the component has stopped after a fixed wall-clock delay.
        const observer = new IntersectionObserver(([entry]) => {
          if (entry?.isIntersecting) return;
          observer.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        observer.observe(el);
      }),
  );
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
  ).toHaveCount(0);
});

test("hero next steps fit the first mobile screen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [360, 800],
    [390, 844],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await visit(page, "/");
    const hero = page.locator("#intro");
    const demo = hero.getByRole("link", { name: "Try it locally" });
    const github = hero.getByRole("link", { name: "Star Argent on GitHub" });
    await expect(demo).toHaveAttribute("href", "#run");
    await expect(github).toHaveAttribute(
      "href",
      "https://github.com/GregPat22/argent",
    );
    await expect(github).toHaveText("Star on GitHub");
    expect((await github.innerText()).trim()).toBe("Star");
    const boxes = await Promise.all([demo.boundingBox(), github.boundingBox()]);
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
    expect(boxes[0]!.y + boxes[0]!.height).toBeLessThanOrEqual(height!);
    await demo.click();
    await expect(page).toHaveURL(/#run$/);
    await expect(
      page.getByRole("heading", { name: /Run it on/ }),
    ).toBeInViewport();
  }
});

test("navigation follows the current section and local entry reaches the terminal", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/");
  for (const id of ["lifecycle", "hallmark", "faq", "roadmap"]) {
    await page
      .locator(`#${id}`)
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    await expect(page.locator(`.nav-full a[href='#${id}']`)).toHaveAttribute(
      "aria-current",
      "location",
    );
  }
  // Both sections intersect the observer band, then only the FAQ leaves it.
  // The roadmap must become active again without a fresh enter notification.
  for (const [offset, active] of [
    [200, "faq"],
    [330, "roadmap"],
  ] as const) {
    await page.locator("#faq").evaluate((el, top) => {
      window.scrollTo({
        top: window.scrollY + el.getBoundingClientRect().top - top,
        behavior: "instant",
      });
    }, offset);
    await expect(
      page.locator(`.nav-full a[href='#${active}']`),
    ).toHaveAttribute("aria-current", "location");
  }
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .locator("#mobile-navigation")
    .getByRole("link", { name: "Try it locally" })
    .click();
  await expect(page).toHaveURL(/#run$/);
  await expect(
    page.getByRole("heading", { name: /Run it on/ }),
  ).toBeInViewport();
  await expect(
    page.locator("#join").getByRole("heading", { name: "Join the build." }),
  ).toHaveCount(1);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`FAQ supports keyboard, rapid toggles and truthful copy (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await visit(page, "/#faq");
    const items = page.locator("#faq details");
    await expect(items).toHaveCount(8);
    await expect(items.first()).toHaveAttribute("open", "");
    const item = items.nth(3);
    const summary = item.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(item).toHaveAttribute("open", "");
    await expect(item.locator("p")).toBeVisible();
    await expect(item).toContainText("your computer has to stay awake");
    await page.keyboard.press("Space");
    await expect(item).not.toHaveAttribute("open");
    for (let i = 0; i < 5; i++) await summary.click();
    await expect(item).toHaveAttribute("open", "");
    await expect(item.locator("p")).toBeVisible();
    await expect(summary).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(item).toHaveAttribute("open", "");
    expect(
      await item.evaluate(
        (el) => getComputedStyle(el, "::details-content").transitionDuration,
      ),
    ).toBe("0s");
    await expect(items.first()).toContainText(
      "runs Claude Code on your local repositories",
    );
    await expect(items.first()).toContainText("Macs with Apple silicon");
    await expect(
      page.locator("#faq details", {
        hasText: "What happens to my work if Argent goes away?",
      }),
    ).toContainText("ordinary Git branch and worktree");
  });
}

test("FAQ answers remain readable without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("/#faq");
    const question = page.locator("#faq details").nth(2);
    await question.locator("summary").click();
    await expect(question.locator("p")).toBeVisible();
    await expect(question).toContainText("Local mode is not a sandbox");
    expect(
      await question
        .locator("p")
        .evaluate((el) => getComputedStyle(el.parentElement!).opacity),
    ).toBe("1");
  } finally {
    await context.close();
  }
});

test("magnetic links keep their hit area stable and stop moving under reduced motion", async ({
  page,
}) => {
  await visit(page, "/");
  const link = page
    .locator("#intro")
    .getByRole("link", { name: "Try it locally" });
  await expect(link).toBeVisible();
  // Measure after the hero's delayed arrival has actually settled.
  await expect(page.locator("#intro .hero-actions").locator("..")).toHaveCSS(
    "transform",
    "none",
  );
  const before = (await link.boundingBox())!;
  await page.mouse.move(before.x + before.width - 8, before.y + 8);
  const after = (await link.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  const content = link.locator(":scope > span");
  await expect
    .poll(() => content.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => content.evaluate((el) => getComputedStyle(el).transform))
    .toBe("none");
  await link.focus();
  await expect(link).toBeFocused();
});

test("official Argent icon loads consistently and the headline is concise", async ({
  page,
  request,
}) => {
  await visit(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Argent is a good conductor.",
  );
  const marks = page.locator("img.argent-mark");
  expect(await marks.count()).toBeGreaterThanOrEqual(2);
  for (const mark of await marks.all()) {
    await expect(mark).toHaveAttribute("src", "/brand/argent-icon-96.webp");
    expect(
      await mark.evaluate(
        (el) =>
          (el as HTMLImageElement).complete &&
          (el as HTMLImageElement).naturalWidth > 0,
      ),
    ).toBeTruthy();
  }
  const icons = await page
    .locator("link[rel=icon],link[rel=apple-touch-icon]")
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  expect(icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of icons) {
    const response = await request.get(icon);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toMatch(/image\//);
  }
});

test("borderless navigation compacts to one logo and preserves keyboard access", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/");
  const header = page.locator("header");
  await expect(header).toHaveAttribute("data-compact", "false");
  await expect(page.getByRole("link", { name: "Argent home" })).toHaveText("");
  expect(await header.evaluate((el) => getComputedStyle(el).borderWidth)).toBe(
    "0px",
  );
  await page
    .locator("#roadmap")
    .evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
  await expect(header).toHaveAttribute("data-compact", "true");
  const logo = page.locator(
    ".nav-logo-control[aria-controls=mobile-navigation]",
  );
  await expect(logo).toBeInViewport();
  // Compact: one logo control, plus the pill that keeps the main action in reach.
  await expect(header.getByRole("link")).toHaveCount(1);
  await expect(
    header.getByRole("link", { name: "Try it locally" }),
  ).toHaveAttribute("href", "#run");
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect
    .poll(async () => (await logo.boundingBox())!.x)
    .toBeCloseTo(20, 0);
  await expect
    .poll(async () => (await logo.boundingBox())!.y)
    .toBeCloseTo(12, 0);
  await expect
    .poll(async () => (await logo.boundingBox())!.width)
    .toBeCloseTo(68, 0);
  await page.setViewportSize({ width: 360, height: 800 });
  await logo.focus();
  await page.keyboard.press("Enter");
  await expect(logo).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(
    page.locator("#mobile-navigation").getByRole("link", { name: "Proof" }),
  ).toBeFocused();
  // The open menu already offers the action, so the pill steps aside.
  await expect(page.locator(".nav-pill")).toHaveCount(0);
  for (const target of await page.locator("#mobile-navigation a").all()) {
    const rect = (await target.boundingBox())!;
    expect(rect.height).toBeGreaterThanOrEqual(48);
    expect(rect.width).toBeGreaterThanOrEqual(48);
  }
  await page.keyboard.press("Escape");
  await expect(logo).toBeFocused();
  await expect(logo).toHaveAttribute("aria-expanded", "false");
});

test("liquid buttons reflect on hover without moving the target and respect reduced motion", async ({
  page,
}) => {
  await visit(page, "/");
  const button = page
    .locator("#intro")
    .getByRole("link", { name: "Try it locally" });
  const before = (await button.boundingBox())!;
  const reflectionBefore = await button.evaluate(
    (el) => getComputedStyle(el, "::before").transform,
  );
  await button.hover();
  await expect
    .poll(() =>
      button.evaluate((el) => getComputedStyle(el, "::before").transform),
    )
    .not.toBe(reflectionBefore);
  await expect
    .poll(() =>
      button.evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    )
    .toBe("26px");
  const after = (await button.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.width).toBeCloseTo(before.width, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await button.evaluate(
      (el) => getComputedStyle(el, "::before").transitionDuration,
    ),
  ).toBe("0s");
  await button.focus();
  expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "solid",
  );
});

test("headings use Inter and product paragraphs describe the actual workflow", async ({
  page,
}) => {
  await visit(page, "/");
  const statement = page.locator("#statement-title").locator("..");
  await expect(statement).toContainText(
    "you hold the baton when it’s time to merge",
  );
  await expect(page.locator("#statement")).toContainText(
    "Without a conductor, agents are just noise",
  );
  await expect(
    page.getByText("Silver connects. Argent coordinates.", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.locator("[data-silver-atom] p, [data-silver-atom] button"),
  ).toHaveCount(0);
  for (const heading of await page.locator("h1, h2, h3").all()) {
    expect(
      await heading.evaluate((el) => getComputedStyle(el).fontFamily),
    ).toMatch(/Inter/i);
  }
});

test("footer uses the supplied artwork as a working home link", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/");
  const footer = page.locator("footer");
  const home = footer.getByRole("link", {
    name: "Argent — back to top",
    exact: true,
  });
  await home.scrollIntoViewIfNeeded();
  const wordmark = home.getByRole("img", { name: "Argent", exact: true });
  await expect
    .poll(() =>
      wordmark.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(wordmark).toHaveAttribute(
    "src",
    "/brand/argent-wordmark-1600.webp",
  );
  expect(
    (await request.get("/brand/argent-wordmark-800.webp")).ok(),
  ).toBeTruthy();
  await expect(footer).not.toContainText("Italian");
  await expect(footer).not.toContainText("conducts electricity");
  await expect(footer.locator("a a")).toHaveCount(0);
  await expect(
    footer.getByRole("link", { name: "GitHub", exact: true }),
  ).toHaveAttribute("href", "https://github.com/GregPat22/argent");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await footer.evaluate((el) => el.scrollWidth <= innerWidth),
    ).toBeTruthy();
  }
  await home.click();
  await expect(page).toHaveURL(/#top$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
});

test("scroll compaction reverses, handles deep links and respects live reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await visit(page, "/");
  const dock = page.locator(".nav-logo-dock");
  await expect
    .poll(async () => (await dock.boundingBox())!.width)
    .toBeCloseTo(204, 0);
  const intermediate = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const dock = document.querySelector<HTMLElement>(".nav-logo-dock")!;
        dock.addEventListener("transitionrun", function sample(event) {
          if (event.target !== dock || event.propertyName !== "width") return;
          dock.removeEventListener("transitionrun", sample);
          const transition = dock
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSTransition &&
                animation.transitionProperty === "width",
            )!;
          // Control the real CSS transition's clock: software rendering can skip
          // every intermediate frame in a wall-clock sampling window.
          transition.pause();
          transition.currentTime =
            Number(transition.effect!.getTiming().duration) / 2;
          const width = dock.getBoundingClientRect().width;
          transition.finish();
          resolve(width);
        });
        window.scrollTo({ top: 500, behavior: "instant" });
      }),
  );
  expect(intermediate).toBeGreaterThan(69);
  expect(intermediate).toBeLessThan(203);
  await expect
    .poll(async () => (await dock.boundingBox())!.width)
    .toBeCloseTo(68, 0);
  await visit(page, "/#faq");
  const header = page.locator("header");
  await expect(header).toHaveAttribute("data-compact", "true");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .locator("#mobile-navigation")
    .getByRole("link", { name: "Back to top", exact: true })
    .click();
  await expect(header).toHaveAttribute("data-compact", "false");
  await expect(
    page.getByRole("link", { name: "Argent home" }),
  ).toBeInViewport();
  for (const top of [500, 0, 500])
    await page.evaluate(
      (top) => window.scrollTo({ top, behavior: "instant" }),
      top,
    );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(header).toHaveAttribute("data-compact", "true");
  await expect
    .poll(async () => (await page.locator(".nav-logo-dock").boundingBox())!.x)
    .toBeCloseTo(20, 0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(header).toHaveAttribute("data-compact", "false");
  await expect
    .poll(
      async () => (await page.locator(".nav-logo-dock").boundingBox())!.width,
    )
    .toBeCloseTo(204, 0);
});

test("scrolling transfers keyboard focus when navigation controls are replaced", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/");
  const home = page.getByRole("link", { name: "Argent home", exact: true });
  const logo = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  const menu = page.locator("#mobile-navigation");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await menu.getByRole("link", { name: "How it works", exact: true }).focus();
  // Native PageDown can keep scrolling after the compact threshold is crossed.
  // Wait for its scrollend before reversing, so this verifies focus continuity
  // rather than racing an unfinished browser scroll animation.
  await Promise.all([
    page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.addEventListener("scrollend", () => resolve(), { once: true });
        }),
    ),
    page.keyboard.press("PageDown"),
  ]);
  await expect(logo).toBeFocused();
  await expect(menu).toBeHidden();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(home).toBeFocused();
  // Native PageDown can keep scrolling after the compact threshold is crossed.
  // Wait for its scrollend before reversing, so this verifies focus continuity
  // rather than racing an unfinished browser scroll animation.
  await Promise.all([
    page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.addEventListener("scrollend", () => resolve(), { once: true });
        }),
    ),
    page.keyboard.press("PageDown"),
  ]);
  await expect(logo).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(
    menu.getByRole("link", { name: "Proof", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(home).toBeFocused();
  await expect(menu).toBeHidden();
});

test("first load choreographs the header, hero and liquid silver", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const seen = { states: [] as string[], split: 0, animations: 0 };
    (window as unknown as EntranceWindow).entrance = seen;
    const tick = () => {
      const state = document.documentElement?.dataset.entrance;
      if (state && seen.states.at(-1) !== state) seen.states.push(state);
      seen.split = Math.max(
        seen.split,
        document.querySelectorAll("#intro h1 [data-split-word]").length,
      );
      seen.animations = Math.max(
        seen.animations,
        document.getAnimations().length,
      );
      if (state !== "done") requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto("/");
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.dataset.entrance),
      {
        timeout: 15_000,
      },
    )
    .toBe("done");
  const seen = await page.evaluate(
    () => (window as unknown as EntranceWindow).entrance,
  );
  expect(seen.states).toEqual(["pending", "running", "done"]);
  // Five headline words rose individually alongside nav, copy and liquid.
  expect(seen.split).toBe(5);
  expect(seen.animations).toBeGreaterThan(10);

  // Settled state: original markup, accessible name and no leftover styles.
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Argent is a good conductor.");
  expect(await title.getAttribute("aria-label")).toBeNull();
  await expect(page.locator("#intro [data-split-word]")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              ".site-header .nav-logo-dock, .site-header .nav-links > li, #intro .hero-copy > div > *, #intro .hero-actions > *, #intro [data-liquid-silver]",
            ),
          ].filter(
            (el) => el.style.opacity || el.style.transform || el.style.filter,
          ).length,
      ),
    )
    .toBe(0);
});

test("sections reveal their heading word by word as they scroll in", async ({
  page,
}) => {
  await visit(page);
  const heading = page.locator("#roadmap h2");
  expect(await heading.evaluate((el) => el.style.opacity)).toBe("0");
  await page.evaluate(() => {
    const target = document.querySelector("#roadmap h2")!;
    const win = window as unknown as EntranceWindow;
    win.headingSplit = 0;
    new MutationObserver(() => {
      win.headingSplit = Math.max(
        win.headingSplit,
        target.querySelectorAll("[data-split-word]").length,
      );
    }).observe(target, { childList: true, subtree: true });
  });
  await heading.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as EntranceWindow).headingSplit),
    )
    .toBe(5);
  await expect
    .poll(() => heading.evaluate((el) => el.innerHTML), { timeout: 10_000 })
    .toBe("Early, and honest<br>about it.");
  expect(await heading.getAttribute("aria-label")).toBeNull();
  await expect(page.locator("#roadmap li").last()).toHaveCSS("opacity", "1");
});

test("reduced motion skips the entrance and shows everything at once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.dataset.entrance),
  ).toBeUndefined();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator("#roadmap h2")).toHaveCSS("opacity", "1");
  await expect(page.locator(".site-header .nav-logo-dock")).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator("[data-split-word]")).toHaveCount(0);
});

test("content appears even if the app scripts never load", async ({ page }) => {
  await page.route(/\/_next\/static\/chunks\/.+\.js/, (route) => route.abort());
  await page.goto("/");
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.dataset.entrance),
      {
        timeout: 8_000,
      },
    )
    .toBe("done");
  await expect(page.locator("#intro .hero-layout > *").first()).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(page.locator("#roadmap")).toHaveCSS("opacity", "1");
});

test("try it offers the desktop app and the engine demo as keyboard tabs", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/#run");
  const section = page.locator("#run");
  const desktop = section.getByRole("tab", { name: "Desktop app" });
  const engine = section.getByRole("tab", { name: "Engine demo" });
  const panel = section.getByRole("tabpanel");
  await expect(desktop).toHaveAttribute("aria-selected", "true");
  await expect(engine).toHaveAttribute("tabindex", "-1");
  await expect(panel).toHaveAttribute("aria-labelledby", "try-tab-desktop");
  await expect(section).toContainText("Claude Code command-line tool");
  await expect(section).toContainText("Local mode is not a sandbox");
  await expect(panel.locator("pre.sr-only")).toContainText("npm run desktop");

  await desktop.focus();
  await page.keyboard.press("ArrowRight");
  await expect(engine).toBeFocused();
  await expect(engine).toHaveAttribute("aria-selected", "true");
  await expect(panel).toHaveAttribute("aria-labelledby", "try-tab-engine");
  await expect(section).toContainText("No account, model key or cloud");
  await expect(panel.locator("pre.sr-only")).toContainText("npm run demo");
  await page.keyboard.press("Home");
  await expect(desktop).toBeFocused();
  await expect(desktop).toHaveAttribute("aria-selected", "true");
  for (const tab of [desktop, engine]) {
    const box = (await tab.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("the headline's descenders are not clipped by its reveal mask", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await visit(page, "/");
    const room = await page.locator(".hero-proof").evaluate((line) => {
      const size = parseFloat(getComputedStyle(line).fontSize);
      const mask = line.parentElement!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(line);
      const text = range.getBoundingClientRect();
      const painted = line.getBoundingClientRect();
      return {
        // The text rectangle ends at the font's descender line, which hangs
        // below a 1.08 line box. Both the reveal mask and the box the gradient
        // paints in must reach past it.
        mask: (mask.bottom - text.bottom) / size,
        painted: (painted.bottom - text.bottom) / size,
      };
    });
    expect(room.mask).toBeGreaterThanOrEqual(0.05);
    expect(room.painted).toBeGreaterThanOrEqual(0.05);
  }
});

test("liquid silver lowers its resolution on a software renderer and keeps moving", async ({
  page,
}) => {
  await visit(page, "/");
  const canvas = page.locator("#intro [data-liquid-silver] canvas");
  await expect(canvas).toHaveAttribute("data-state", "animating", {
    timeout: 15_000,
  });
  // The test browser has no GPU: every pixel is ray-marched on the CPU.
  await expect(canvas).toHaveAttribute("data-renderer", "software");
  const ratio = await canvas.evaluate(
    (el: HTMLCanvasElement) => el.width / el.clientWidth,
  );
  expect(ratio).toBeLessThanOrEqual(0.36);
  expect(ratio).toBeGreaterThanOrEqual(0.24);
  // Frames must actually arrive: the old governor ignored every frame slower
  // than 100 ms, so the slowest devices stayed at full resolution.
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0;
        const start = performance.now();
        const tick = (now: number) => {
          count++;
          if (now - start < 1500) requestAnimationFrame(tick);
          else resolve(count);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(frames).toBeGreaterThan(15);
  await expect(canvas).toHaveAttribute("data-state", "animating");
});

test("the compact logo keeps a feathered halo and the final band follows the pointer", async ({
  page,
}) => {
  await visit(page, "/");
  const halo = () =>
    page
      .locator(".nav-logo-dock")
      .evaluate((el) => getComputedStyle(el, "::before").opacity);
  expect(await halo()).toBe("0");
  await page
    .locator("#join")
    .evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
  await expect(page.locator("header")).toHaveAttribute("data-compact", "true");
  await expect.poll(halo).toBe("1");
  expect(
    await page
      .locator(".nav-logo-dock")
      .evaluate((el) => getComputedStyle(el, "::before").borderTopWidth),
  ).toBe("0px");

  const band = page.locator("#join .cta-band");
  const drop = band.locator(".cta-drops > span").nth(2);
  await expect(band.locator(".cta-drops i")).toHaveCount(4);
  const before = (await drop.boundingBox())!;
  const box = (await band.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5);
  await expect
    .poll(async () => (await drop.boundingBox())!.x - before.x)
    .toBeGreaterThan(8);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(box.x + box.width * 0.5, box.y - 40);
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
  await expect
    .poll(async () => Math.abs((await drop.boundingBox())!.x - before.x))
    .toBeLessThanOrEqual(2);
});

test("sections lead with proof and leave the planned journey for later", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/");
  const ids = await page
    .locator("main > section")
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(ids).toEqual([
    "intro",
    "statement",
    "hallmark",
    "lifecycle",
    "agents",
    "open",
    "reconnect",
    "roadmap",
    "faq",
    "run",
    "join",
  ]);
  // The navigation lists its links in the same order as the page.
  expect(
    await page
      .locator(".nav-links a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual(["#hallmark", "#lifecycle", "#roadmap", "#faq"]);
  // The first problem is the one the next section answers.
  await expect(page.locator("#statement .problem-card h3").first()).toHaveText(
    "“Done” is only a claim",
  );
});

test("hero states the promise once and today's facts under the actions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [360, 800],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await visit(page, "/");
    const hero = page.locator("#intro");
    await expect(hero.locator(".hero-description")).toHaveText(
      "We’re building the open-source desktop app for your coding agents. Every task runs in its own branch, and nothing merges until you’ve seen the proof.",
    );
    const status = hero.locator(".hero-status");
    await expect(status).toContainText(
      "Claude Code runs today on Apple-silicon Macs",
    );
    await expect(status).toContainText("Free and MIT");
    await expect(status).toContainText("built from source, no download yet");
    await expect(status).toContainText(
      "Live changes panel · trusted checks planned",
    );
    // The liquid keeps clear of it, and it fits the first screen.
    await expect(status).toHaveAttribute("data-liquid-avoid");
    // The live dot never animates a painted property, with or without motion.
    expect(
      await status
        .locator(".hero-status-dot")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    const box = (await status.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(height!);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width!);
  }
});

test("the compact pill keeps the main action in reach and rests where the page already offers it", async ({
  page,
}) => {
  // Each step waits for the page to notice a scroll, and a software renderer
  // draws few frames while the hero is on screen.
  test.slow();
  await visit(page, "/");
  const pill = page.locator(".nav-pill a");
  // Over the hero the full navigation and the hero's own button do the job.
  await expect(pill).toHaveCount(0, { timeout: 15_000 });
  await page
    .locator("#lifecycle")
    .evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await expect(pill).toHaveText(/Try it locally/);
  const box = (await pill.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // Opening the menu shows the same action there, so the pill leaves.
  const logo = page.getByRole("button", { name: "Open navigation" });
  await logo.click();
  await expect(pill).toHaveCount(0, { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(pill).toBeVisible({ timeout: 15_000 });
  // It lands on the try-it section and then rests there and on the last band.
  await pill.click();
  await expect(page).toHaveURL(/#run$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Run it on/ })).toBeInViewport(
    { timeout: 15_000 },
  );
  await expect(pill).toHaveCount(0, { timeout: 15_000 });
  await page
    .locator("#join")
    .evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
  await expect(pill).toHaveCount(0, { timeout: 15_000 });
  // Content fades under the compact header instead of colliding with the logo.
  await expect
    .poll(
      () =>
        page
          .locator("header")
          .evaluate((el) => getComputedStyle(el, "::before").opacity),
      { timeout: 15_000 },
    )
    .toBe("1");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect
    .poll(
      () =>
        page
          .locator("header")
          .evaluate((el) => getComputedStyle(el, "::before").opacity),
      { timeout: 15_000 },
    )
    .toBe("0");
});

test("the pill and the compact logo rest apart at phone and tablet widths", async ({
  page,
}) => {
  // This is about where the two come to rest, not how they travel there, so
  // the travel is switched off and each width gets a fresh page.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await visit(page, "/");
    await page
      .locator("#lifecycle")
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    const pill = page.locator(".nav-pill a");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveCSS("opacity", "1");
    const narrow = (await pill.boundingBox())!;
    const dock = (await page.locator(".nav-logo-dock").boundingBox())!;
    expect(dock.x + dock.width).toBeLessThan(narrow.x);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(width);
  }
});

test("proof separates today's record from planned checks and strikes four hallmarks", async ({
  page,
}) => {
  await visit(page, "/");
  const section = page.locator("#hallmark");
  const ledger = section.locator(".proof-ledger > div");
  await expect(ledger).toHaveCount(2);
  await expect(ledger.nth(0)).toContainText("Works today");
  await expect(ledger.nth(0)).toContainText("not a test result");
  await expect(ledger.nth(1)).toContainText("Planned");
  await expect(ledger.nth(1)).toContainText("arrive with the local MVP");
  await expect(section).toContainText("The app strikes two of them today");
  const list = section.locator(".mark-list");
  const plates = list.locator(".mark-plate");
  await expect(plates).toHaveCount(4);
  await expect(list).toHaveAttribute("data-struck", "false");
  await list.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expect(list).toHaveAttribute("data-struck", "true");
  for (const plate of await plates.all()) {
    await expect(plate).toHaveCSS("opacity", "1", { timeout: 10_000 });
    // Opacity can reach one while the spring transform is still moving.
    await expect(plate).toHaveCSS("transform", "none", { timeout: 10_000 });
    await expect(plate).toHaveAttribute("aria-hidden", "true");
  }
  // As in the desktop app's record: the maker's mark and the date letter are
  // struck today, the standard and assay marks are still blank plates.
  expect(
    await plates.evaluateAll((all) =>
      all.map((plate) => (plate as HTMLElement).dataset.state),
    ),
  ).toEqual(["struck", "blank", "blank", "struck"]);
  const items = list.locator("li");
  await expect(items.nth(0)).toContainText("Works today");
  await expect(items.nth(1)).toContainText("Not struck");
  await expect(items.nth(1)).toContainText("Planned");
  await expect(items.nth(2)).toContainText("Planned");
  await expect(items.nth(3)).toContainText("Works today");
  await expect(plates.nth(1).locator(".mark-relief-line")).toBeHidden();
  // The marks are decoration; their meaning is in the headings beside them.
  await expect(list.getByRole("heading", { level: 3 })).toHaveCount(4);
  // The plates stand two abreast on a phone instead of four in a column.
  await page.setViewportSize({ width: 360, height: 800 });
  const geometry = await plates.evaluateAll((all) => {
    const first = all[0]!.getBoundingClientRect();
    const second = all[1]!.getBoundingClientRect();
    return { difference: Math.abs(first.y - second.y), right: second.right };
  });
  expect(geometry.difference).toBeLessThan(2);
  expect(geometry.right).toBeLessThanOrEqual(360);
});

test("problem glyphs draw themselves once and stay visible without scripts", async ({
  page,
  browser,
  baseURL,
}) => {
  await visit(page, "/");
  const list = page.locator("#statement .problem-list");
  await list.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expect(list).toHaveAttribute("data-drawn", "true");
  const strokes = list.locator(".problem-glyph > :not(.problem-dash)");
  expect(await strokes.count()).toBeGreaterThanOrEqual(6);
  // Every stroke ends fully drawn: an attribute selector once left them hidden.
  for (const stroke of await strokes.all())
    await expect(stroke).toHaveCSS("stroke-dashoffset", "0px", {
      timeout: 10_000,
    });

  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  const plain = await context.newPage();
  try {
    await plain.goto("/");
    await expect(
      plain.locator("#statement .problem-glyph > :not(.problem-dash)").first(),
    ).toHaveCSS("stroke-dashoffset", "0px");
  } finally {
    await context.close();
  }
});

test("how it works says which steps work today", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/");
  const plates = page.locator("#lifecycle .hiw-plate");
  await expect(plates.nth(0)).toContainText("Works today");
  await expect(plates.nth(1)).toContainText("Works today");
  await expect(plates.nth(2)).toContainText("In development");
  await expect(plates.nth(2)).not.toContainText("Works today");
  await expect(page.locator("#lifecycle")).toContainText(
    "The first two steps work today; the third is being built.",
  );
});

test("the journey stage stays in view on a phone while its steps scroll beneath it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/");
  const journey = page.locator("#reconnect");
  const stage = journey.locator(".journey-stage");
  const steps = journey.locator(".journey-step");
  const scrollBy = (offset: number) =>
    page.locator(".journey-track").evaluate((track, by) => {
      const top = track.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + by, behavior: "instant" });
    }, offset);

  await scrollBy(-60);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  await scrollBy(160);
  await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
  // The stage is pinned under the header, above the step being read.
  const pinned = (await stage.boundingBox())!;
  expect(pinned.y).toBeGreaterThanOrEqual(70);
  expect(pinned.y).toBeLessThanOrEqual(90);
  const reading = (await steps.nth(1).boundingBox())!;
  expect(reading.y).toBeGreaterThanOrEqual(pinned.y + pinned.height - 4);
  expect(reading.y).toBeLessThan(844);
  await scrollBy(400);
  await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(journey.locator(".journey-notice")).toHaveAttribute(
    "data-shown",
    "true",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("plates catch the pointer's light and the closing band uses the hero's metal", async ({
  page,
  request,
}) => {
  await visit(page, "/");
  const plate = page.locator("#lifecycle .hiw-plate").first();
  await plate.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  // The section's entrance lifts the plate into place; measure once it rests.
  await expect(plate).toHaveCSS("opacity", "1");
  await expect(plate).toHaveCSS("transform", "none");
  const box = (await plate.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 60);
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 4 });
  await expect
    .poll(() => plate.evaluate((el) => el.style.getPropertyValue("--lx")))
    .toBe("120px");
  expect(await plate.evaluate((el) => el.style.getPropertyValue("--ly"))).toBe(
    "90px",
  );
  await expect
    .poll(() =>
      plate.evaluate((el) => getComputedStyle(el, "::before").opacity),
    )
    .toBe("1");
  // The position stays on the plate and its two lights: content inside the
  // plate is not restyled as the pointer moves.
  expect(
    await plate.evaluate((el) =>
      getComputedStyle(el.firstElementChild!).getPropertyValue("--lx"),
    ),
  ).toBe("50%");
  expect(
    await plate.evaluate((el) =>
      getComputedStyle(el, "::before").getPropertyValue("--lx"),
    ),
  ).toBe("120px");
  // The light never takes clicks or text selection away from the content.
  expect(
    await plate.evaluate((el) => getComputedStyle(el, "::after").pointerEvents),
  ).toBe("none");

  for (const name of ["drop-large", "drop-medium", "drop-small", "drop-pair"]) {
    const response = await request.get(`/liquid/${name}.webp`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toMatch(/image\/webp/);
  }
  const drop = page.locator("#join .cta-drops i").first();
  expect(
    await drop.evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain("/liquid/drop-large.webp");
});
