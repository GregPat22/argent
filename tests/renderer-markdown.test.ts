import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDocument, type FakeElement } from "./renderer-loader.js";

// The Markdown module builds elements through the global document.
Object.assign(globalThis, { document: fakeDocument().document });
const { markdown } = await import("../ui/markdown.js");

const render = (text: string) => markdown(text) as unknown as FakeElement[];
function all(nodes: FakeElement[]): FakeElement[] {
  return nodes.flatMap((node) => [node, ...all(node.children)]);
}
/** The tree as tag names and literal text, for readable assertions. */
function shape(node: FakeElement): unknown {
  if (node.isText) return node.textContent;
  const children = node.children.map(shape);
  return node.textContent
    ? [node.tagName, node.textContent, ...children]
    : [node.tagName, ...children];
}

test("replies render headings, lists, code, quotes, tables and inline marks", () => {
  const nodes = render(
    [
      "## Summary",
      "",
      "Updated **two** files and *one* `test`; kept snake_case_name.",
      "",
      "- first",
      "  - nested",
      "- second",
      "",
      "3. three",
      "4. four",
      "",
      "```ts",
      "const a = 1;",
      "  indented();",
      "```",
      "",
      "> quoted",
      "",
      "---",
      "",
      "| File | Lines |",
      "| --- | ---: |",
      "| `a.ts` | 4 |",
    ].join("\n"),
  );
  assert.deepEqual(nodes.map(shape), [
    ["H4", "Summary"],
    [
      "P",
      "Updated ",
      ["STRONG", "two"],
      " files and ",
      ["EM", "one"],
      " ",
      ["CODE", "test"],
      "; kept snake_case_name.",
    ],
    ["UL", ["LI", "first", ["UL", ["LI", "nested"]]], ["LI", "second"]],
    ["OL", ["LI", "three"], ["LI", "four"]],
    ["DIV", ["SPAN", "ts"], ["PRE", "const a = 1;\n  indented();"]],
    ["BLOCKQUOTE", ["P", "quoted"]],
    ["HR"],
    [
      "DIV",
      [
        "TABLE",
        ["THEAD", ["TR", ["TH", "File"], ["TH", "Lines"]]],
        ["TBODY", ["TR", ["TD", ["CODE", "a.ts"]], ["TD", "4"]]],
      ],
    ],
  ]);
  assert.equal(nodes[3]!.getAttribute("start"), "3");
});

test("HTML, scripts and links in a reply stay literal text and never navigate", () => {
  const nodes = render(
    [
      '<img src=x onerror="alert(1)"> <script>alert(2)</script>',
      "",
      "[click](javascript:alert(3)) and ![logo](https://example.invalid/a.png)",
      "",
      "- <b>not bold</b>",
      "",
      "```html",
      "<iframe src=x></iframe>",
      "```",
    ].join("\n"),
  );
  const elements = all(nodes).filter((node) => !node.isText);
  for (const element of elements) {
    // No href, src, style or handler: only an ordered list's start number.
    assert.deepEqual(
      [...element.attributes.keys()].filter((name) => name !== "start"),
      [],
    );
    assert.equal(element.listeners.size, 0);
    assert.ok(
      ["P", "SPAN", "UL", "LI", "DIV", "PRE"].includes(element.tagName),
      element.tagName,
    );
  }
  const text = nodes.map((node) => node.text).join(" ");
  for (const literal of [
    '<img src=x onerror="alert(1)">',
    "<script>alert(2)</script>",
    "javascript:alert(3)",
    "Image: logo",
    "https://example.invalid/a.png",
    "<b>not bold</b>",
    "<iframe src=x></iframe>",
  ])
    assert.ok(text.includes(literal), literal);
});

test("unclosed marks stay literal and long replies render in bounded time", () => {
  assert.deepEqual(render("a * b ** c `d _e").map(shape), [
    ["P", "a * b ** c `d _e"],
  ]);
  const long = "`*_~[".repeat(10_000);
  const started = Date.now();
  const nodes = render(long);
  assert.ok(Date.now() - started < 1000);
  assert.equal(nodes[0]!.text.replace(/ /g, ""), long);
});
