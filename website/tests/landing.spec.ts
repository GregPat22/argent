import { expect, test } from "@playwright/test";

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
    page.getByRole("heading", { name: /Assign a task.*Review the changes/ }),
  ).toBeVisible();
  const sections = page.locator("main > section");
  await expect(sections).toHaveCount(9);
  for (const section of await sections.all()) {
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("h1,h2").first()).toBeVisible();
    expect(
      await section.evaluate((el) => el.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  await expect(page.locator("#roadmap")).toContainText(
    "Prototype complete · simulation",
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

for (const input of ["keyboard", "pointer"] as const) {
  test(`comparison arrival hint yields permanently to ${input} input`, async ({
    page,
  }) => {
    await page.goto("/");
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

test("hero contains no bubble renderer, fallback or pause controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.assign(window, { webglRequests: 0 });
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind === "webgl" || kind === "webgl2")
        (window as unknown as { webglRequests: number }).webglRequests++;
      return original.call(this, kind, ...args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(
    page.locator(
      "#intro canvas, #intro button, .silver-fallback, [data-silver-sculpture]",
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator("#run").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => (window as unknown as { webglRequests: number }).webglRequests,
    ),
  ).toBe(0);
});

test("atom keeps its static fallback without canvas support", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
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
  await page.goto("/");
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
  ).toHaveCount(0);
});

test("hero next steps and prototype status fit the first mobile screen", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [360, 800],
    [390, 844],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/");
    const hero = page.locator("#intro");
    const demo = hero.getByRole("link", { name: "See it in action" });
    const github = hero.getByRole("link", { name: "View on GitHub" });
    await expect(demo).toHaveAttribute("href", "#reconnect");
    await expect(github).toHaveAttribute(
      "href",
      "https://github.com/GregPat22/argent",
    );
    await expect(github).toHaveText("View on GitHub");
    expect((await github.innerText()).trim()).toBe("GitHub");
    const boxes = await Promise.all([demo.boundingBox(), github.boundingBox()]);
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
    const status = await hero
      .getByText("Local prototype · simulated execution.", { exact: false })
      .boundingBox();
    expect(status!.y + status!.height).toBeLessThanOrEqual(height!);
    await demo.click();
    await expect(page).toHaveURL(/#reconnect$/);
    await expect(
      page.getByRole("heading", { name: /Close the app/ }),
    ).toBeInViewport();
  }
});

test("navigation follows the current section and local entry reaches the terminal", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
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
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .locator("#mobile-navigation")
    .getByRole("link", { name: "Try locally" })
    .click();
  await expect(page).toHaveURL(/#run$/);
  await expect(
    page.getByRole("heading", {
      name: "Built in the open. Run the engine today.",
    }),
  ).toBeInViewport();
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`FAQ supports keyboard, rapid toggles and truthful copy (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/#faq");
    const items = page.locator("#faq details");
    await expect(items).toHaveCount(5);
    await expect(items.first()).toHaveAttribute("open", "");
    const item = items.nth(1);
    const summary = item.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(item).toHaveAttribute("open", "");
    await expect(item.locator("p")).toBeVisible();
    await expect(item).toContainText("your Mac must stay awake");
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
      "signed public downloads are still planned",
    );
  });
}

test("FAQ answers remain readable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:3100/#faq");
    const question = page.locator("#faq details").nth(2);
    await question.locator("summary").click();
    await expect(question.locator("p")).toBeVisible();
    await expect(question).toContainText("no AI model or repository connected");
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
  await page.goto("/");
  const link = page
    .locator("#intro")
    .getByRole("link", { name: "See it in action" });
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
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Delegate work.Keep control.",
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
  await page.goto("/");
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
  await expect(header.getByRole("link")).toHaveCount(0);
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect
    .poll(async () => (await logo.boundingBox())!.x)
    .toBeCloseTo(20, 0);
  await expect
    .poll(async () => (await logo.boundingBox())!.y)
    .toBeCloseTo(16, 0);
  await expect
    .poll(async () => (await logo.boundingBox())!.width)
    .toBeCloseTo(48, 0);
  await page.setViewportSize({ width: 360, height: 800 });
  await logo.focus();
  await page.keyboard.press("Enter");
  await expect(logo).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(
    page
      .locator("#mobile-navigation")
      .getByRole("link", { name: "How it works" }),
  ).toBeFocused();
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
  await page.goto("/");
  const button = page
    .locator("#intro")
    .getByRole("link", { name: "See it in action" });
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
  await page.goto("/");
  const statement = page.locator("#statement-title").locator("..");
  await expect(statement).toContainText(
    "code changes, test results and independent review",
  );
  await expect(statement).toContainText(
    "Today’s local desktop prototype runs simulated tasks",
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
  await page.goto("/");
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
  await page.goto("/");
  const widths = await page.evaluate(async () => {
    const samples: number[] = [];
    const started = performance.now();
    window.scrollTo({ top: 500, behavior: "instant" });
    while (performance.now() - started < 850) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      samples.push(
        document.querySelector(".nav-logo-dock")!.getBoundingClientRect().width,
      );
    }
    return samples;
  });
  // Read actual intermediate geometry, rather than inferring animation from props.
  expect(widths.some((width) => width > 49 && width < 63)).toBeTruthy();
  await page.goto("/#faq");
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
    .toBeCloseTo(64, 0);
});
