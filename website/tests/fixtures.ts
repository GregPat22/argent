import { test as base, type Browser } from "@playwright/test";

// Context isolation does not reset Chromium's shared software-rendering process.
// Opt affected regressions into a fresh browser without cold-starting every
// other test's software renderer.
export const test = base.extend<{ testBrowser: Browser }>({
  testBrowser: async (
    { playwright, browserName, launchOptions, headless, channel },
    use,
  ) => {
    const browser = await playwright[browserName].launch({
      ...launchOptions,
      headless,
      channel,
    });
    try {
      await use(browser);
    } finally {
      await browser.close();
    }
  },
  context: async ({ testBrowser }, use) => {
    // Contexts created through the runner's Playwright instance inherit `use`
    // options, including baseURL, viewport and per-describe media/script modes.
    const context = await testBrowser.newContext();
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
});
