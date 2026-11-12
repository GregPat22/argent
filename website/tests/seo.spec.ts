import { expect, test } from "@playwright/test";
import { isSiteIndexable } from "../src/lib/seo";

const canonical = "https://argent.build";
const indexable = isSiteIndexable();

test("production and preview indexing are explicit build-time choices", () => {
  expect(isSiteIndexable({})).toBe(true);
  expect(isSiteIndexable({ VERCEL_ENV: "production" })).toBe(true);
  for (const VERCEL_ENV of ["preview", "development", "unexpected"]) {
    expect(isSiteIndexable({ VERCEL_ENV })).toBe(false);
  }
  expect(isSiteIndexable({ ARGENT_SITE_NOINDEX: "1" })).toBe(false);
  expect(
    isSiteIndexable({ VERCEL_ENV: "production", ARGENT_SITE_NOINDEX: "1" }),
  ).toBe(false);
});

test.describe("crawler-visible HTML", () => {
  test.use({ javaScriptEnabled: false });

  test("search and social metadata agree before hydration, including campaign URLs", async ({
    page,
  }) => {
    const response = await page.goto("/?utm_source=seo-test");
    expect(response?.status()).toBe(200);
    await expect(page.locator("head title")).toHaveCount(1);
    await expect(page).toHaveTitle("Argent: AI coding agents you can verify");
    const description = page.locator('head meta[name="description"]');
    await expect(description).toHaveCount(1);
    const content = await description.getAttribute("content");
    expect(content).toContain("Claude Code in local Git worktrees");
    expect(content).toContain("trusted checks planned");
    expect(content!.length).toBeLessThanOrEqual(160);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonical,
    );
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      "content",
      canonical,
    );
    for (const selector of [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      await expect(page.locator(`head ${selector}`)).toHaveAttribute(
        "content",
        content!,
      );
    }
    await expect(
      page.locator('head meta[name="twitter:card"]'),
    ).toHaveAttribute("content", "summary_large_image");
    const robots = await page
      .locator('head meta[name="robots"]')
      .getAttribute("content");
    expect(robots?.split(", ")).toContain(indexable ? "index" : "noindex");
    if (indexable) expect(robots).not.toContain("noindex");
  });

  test("structured data identifies only the supported product and official links", async ({
    page,
  }) => {
    await page.goto("/");
    const scripts = page.locator('script[type="application/ld+json"]');
    await expect(scripts).toHaveCount(1);
    const data = JSON.parse((await scripts.textContent())!);
    expect(data["@context"]).toBe("https://schema.org");
    expect(
      data["@graph"].map((node: Record<string, unknown>) => node["@type"]),
    ).toEqual(["WebSite", "WebPage", "SoftwareApplication"]);
    const [site, webPage, app] = data["@graph"];
    expect(webPage.isPartOf["@id"]).toBe(site["@id"]);
    expect(webPage.about["@id"]).toBe(app["@id"]);
    for (const node of data["@graph"]) expect(node.url).toBe(canonical);
    expect(app.operatingSystem).toBe("macOS (Apple silicon)");
    expect(app.sameAs).toEqual([
      "https://github.com/GregPat22/argent",
      "https://x.com/Argent_build",
    ]);
    expect(app.description).toContain(
      "Early prototype; trusted checks planned",
    );
    for (const key of [
      "offers",
      "aggregateRating",
      "review",
      "downloadUrl",
      "softwareVersion",
    ]) {
      expect(app).not.toHaveProperty(key);
    }
  });

  test("content, limitations, FAQ and internal links work without scripts", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".hero-status")).toContainText(
      "trusted checks planned",
    );
    await expect(page.locator("#faq details")).toHaveCount(8);
    for (const details of await page.locator("#faq details").all()) {
      if (!(await details.evaluate((node) => node.hasAttribute("open")))) {
        await details.locator("summary").click();
      }
      await expect(details.locator("p")).toBeVisible();
    }
    for (const href of await page
      .locator('a[href^="#"]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")!),
      )) {
      expect(await page.locator(`[id="${href.slice(1)}"]`).count(), href).toBe(
        1,
      );
    }
  });

  test("Open Graph and X reference a fetchable PNG with the declared dimensions", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const imageUrl = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(imageUrl).toMatch(/^https:\/\/argent\.build\/opengraph-image/);
    await expect(
      page.locator('meta[property="og:image:width"]'),
    ).toHaveAttribute("content", "1200");
    await expect(
      page.locator('meta[property="og:image:height"]'),
    ).toHaveAttribute("content", "630");
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      "content",
      /trusted checks planned/i,
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      "content",
      imageUrl!,
    );
    const url = new URL(imageUrl!);
    const response = await request.get(`${url.pathname}${url.search}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(bytes.length).toBeLessThan(1_000_000);
  });

  test("the header serves a responsive image smaller than the original artwork", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const wordmark = page.locator(".nav-wordmark");
    await expect(wordmark).toHaveAttribute(
      "sizes",
      "(max-width: 767px) 180px, 204px",
    );
    await expect
      .poll(() =>
        wordmark.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const source = await wordmark.evaluate(
      (node) => (node as HTMLImageElement).currentSrc,
    );
    expect(new URL(source).pathname).toBe("/_next/image");
    const optimized = await request.get(source, {
      headers: { Accept: "image/webp" },
    });
    const original = await request.get("/brand/argent-wordmark-800.webp");
    expect(optimized.ok()).toBe(true);
    expect((await optimized.body()).length).toBeLessThan(
      (await original.body()).length / 2,
    );
    const box = await wordmark.boundingBox();
    expect(box?.width).toBe(180);
    expect(box?.height).toBe(60);
  });

  test("unknown URLs return a real 404 and noindex", async ({ page }) => {
    const response = await page.goto("/seo-page-that-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(
      page.locator('meta[name="robots"][content="noindex"]'),
    ).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });
});

test("robots and sitemap expose only the canonical page on production", async ({
  request,
  page,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  const text = await robots.text();
  expect(text).toContain("User-Agent: *");
  expect(text).toContain("Allow: /");
  expect(text).not.toContain("Disallow:");
  expect(text.includes(`Sitemap: ${canonical}/sitemap.xml`)).toBe(indexable);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const xml = await sitemap.text();
  const locations = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, "application/xml");
    if (document.querySelector("parsererror"))
      throw new Error("Invalid sitemap XML");
    return [...document.querySelectorAll("loc")].map(
      (node) => node.textContent,
    );
  }, xml);
  expect(locations).toEqual(indexable ? [canonical] : []);
  expect(xml).not.toContain("<lastmod>");
});
