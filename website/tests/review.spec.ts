import { expect, test } from "@playwright/test";

for (const liveChange of [false, true]) {
  test(`comparison has no spring travel with reduced motion (live change: ${liveChange})`, async ({
    page,
  }) => {
    await page.emulateMedia({
      reducedMotion: liveChange ? "no-preference" : "reduce",
    });
    await page.goto("/");
    await page.waitForFunction(() => {
      const state = document.documentElement.dataset.entrance;
      return state === undefined || state === "done";
    });
    const slider = page.getByRole("slider");
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(page.locator(".proof-record")).toHaveCSS(
      "clip-path",
      "inset(0px 0px 0px 0%)",
    );
    if (liveChange) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    }
    const clip = await slider.evaluate(async (element) => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return getComputedStyle(document.querySelector(".proof-record")!)
        .clipPath;
    });
    expect(clip).toBe("inset(0px 0px 0px 100%)");
  });
}

test("roadmap preserves the approved post-release sequence and recovery limit", async ({
  page,
}) => {
  await page.goto("/");
  const roadmap = page.locator("#roadmap");
  await expect(roadmap).toContainText(
    /Codex[\s\S]*checked links[\s\S]*project rules[\s\S]*Cursor and OpenCode/,
  );
  await expect(roadmap).toContainText(
    "A link grants no access and carries no messages between agents",
  );
  await expect(roadmap).toContainText("Process reconciliation after a crash");
  await expect(page.locator("#open")).toContainText(
    "guidance, a check, a gate or a prevention control",
  );
  await expect(page.locator("#open")).toContainText("no prevention control");
});

test("an untested local record uses silver rather than verified green", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#run");
  const record = page.locator("#run pre[aria-hidden] > span", {
    hasText: "recorded, not tested",
  });
  await expect(record).toBeVisible();
  await expect(record).toHaveCSS("color", "rgb(238, 241, 245)");
});

test("clipboard failure reveals the complete commands without waiting for typing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async () => {
        throw new Error("denied");
      },
    });
  });
  await page.goto("/#run");
  await page.getByRole("button", { name: "Copy commands" }).click();
  await expect(page.getByRole("status")).toContainText("Select the commands");
  await expect(page.locator("#run pre[aria-hidden]")).toContainText(
    "npm run desktop",
    { timeout: 1000 },
  );
});

test("journey meter fills without changing layout width", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#reconnect");
  const meter = page.locator(".journey-meter span");
  await expect(meter).toHaveCSS("transform", "matrix(0.78, 0, 0, 1, 0, 0)");
  const widths = await meter.evaluate((element) => [
    element.getBoundingClientRect().width,
    element.parentElement!.getBoundingClientRect().width,
  ]);
  expect(widths[0]! / widths[1]!).toBeCloseTo(0.78, 2);
});

test("journey pulse pauses offscreen and resumes on return", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => {
    const state = document.documentElement.dataset.entrance;
    return state === undefined || state === "done";
  });
  const journey = page.locator("#reconnect");
  const showJourney = () =>
    page.locator(".journey-track").evaluate((element) => {
      window.scrollTo({
        top:
          element.getBoundingClientRect().top +
          window.scrollY +
          element.clientHeight -
          window.innerHeight,
        behavior: "instant",
      });
    });
  await showJourney();
  await expect(page.locator(".journey-cloud")).toHaveAttribute(
    "data-on",
    "true",
  );
  const playState = () =>
    page
      .locator(".journey-pulse")
      .evaluate(
        (element) => getComputedStyle(element, "::after").animationPlayState,
      );
  await expect(journey).toHaveAttribute("data-onscreen", "true");
  await expect.poll(playState).toBe("running");
  await page.locator("#intro").scrollIntoViewIfNeeded();
  await expect(journey).toHaveAttribute("data-onscreen", "false");
  await expect.poll(playState).toBe("paused");
  await showJourney();
  await expect(journey).toHaveAttribute("data-onscreen", "true");
  await expect.poll(playState).toBe("running");
});
