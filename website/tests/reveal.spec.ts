import { expect, test } from "@playwright/test";

type Geometry = {
  box: number[];
  section: number[];
  words: { text: string; box: number[] }[];
};
type RevealSample = { section: string; before: Geometry; after: Geometry };
type RevealWindow = Window & { revealSamples: RevealSample[] };

for (const width of [390, 768, 1440]) {
  test(`reveal cleanup preserves text and section geometry at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      const win = window as unknown as RevealWindow;
      win.revealSamples = [];
      const replace = Element.prototype.replaceChildren;
      // Observe the exact cleanup boundary, including the last split frame.
      // Waiting for a settled screenshot alone misses the transient expansion.
      Element.prototype.replaceChildren = function (...nodes) {
        const section = this.closest("section");
        const restoring =
          section &&
          this.querySelector("[data-split-word]") &&
          (this.matches("h2") ||
            this.parentElement?.parentElement?.matches("h1"));
        const rect = (box: DOMRect) => [
          box.x + scrollX,
          box.y + scrollY,
          box.width,
          box.height,
        ];
        const measure = (): Geometry => {
          const words: Geometry["words"] = [];
          const walker = document.createTreeWalker(this, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            for (const match of (node.textContent ?? "").matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              words.push({
                text: match[0],
                box: rect(range.getBoundingClientRect()),
              });
            }
          }
          return {
            box: rect(this.getBoundingClientRect()),
            section: rect(section!.getBoundingClientRect()),
            words,
          };
        };
        const before = restoring ? measure() : null;
        replace.apply(this, nodes);
        if (before) {
          win.revealSamples.push({
            section: section!.id,
            before,
            after: measure(),
          });
        }
      };
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
    const sections = page.locator(
      "main > section:not(#intro):not([data-entrance-skip])",
    );
    for (const section of await sections.all()) {
      await section.evaluate((el) =>
        el.scrollIntoView({ behavior: "instant", block: "center" }),
      );
      const id = await section.getAttribute("id");
      await expect
        .poll(
          () =>
            page.evaluate(
              (id) =>
                (window as unknown as RevealWindow).revealSamples.some(
                  (sample) => sample.section === id,
                ),
              id,
            ),
          { timeout: 10_000 },
        )
        .toBe(true);
    }
    const samples = await page.evaluate(
      () => (window as unknown as RevealWindow).revealSamples,
    );
    expect(samples).toHaveLength((await sections.count()) + 2);
    for (const { section, before, after } of samples) {
      expect(
        after.words.map((word) => word.text),
        section,
      ).toEqual(before.words.map((word) => word.text));
      const original = [
        ...before.box,
        ...before.section,
        ...before.words.flatMap((word) => word.box),
      ];
      const restored = [
        ...after.box,
        ...after.section,
        ...after.words.flatMap((word) => word.box),
      ];
      const shift = Math.max(
        ...original.map((value, index) => Math.abs(value - restored[index]!)),
      );
      expect(
        shift,
        `${section}: cleanup must not move or resize text/content`,
      ).toBeLessThan(0.5);
    }
    await expect(page.locator("[data-split-word]")).toHaveCount(0);
  });
}
