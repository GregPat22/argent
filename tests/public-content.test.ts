import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Guards AGENTS.md section 1: this repository is public and its history is
// permanent. Each rule scans tracked text files for one kind of material that
// must never be committed. It cannot catch everything; review the diff too.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const self = "tests/public-content.test.ts";
const textFile = /\.(?:md|txt|ts|tsx|cts|mts|js|mjs|html|css|json|ya?ml)$/;

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(
    (path) =>
      path &&
      textFile.test(path) &&
      path !== self &&
      !path.endsWith("package-lock.json"),
  )
  .map((path) => ({ path, text: readFileSync(resolve(root, path), "utf8") }));

const docs = (path: string) => path.endsWith(".md");
const copy = (path: string) =>
  docs(path) ||
  path.startsWith("website/src/") ||
  path === "website/index.html" ||
  path === "ui/index.html";
const any = () => true;

interface Rule {
  name: string;
  pattern: RegExp;
  scope: (path: string) => boolean;
  allow?: string[];
}

const rules: Rule[] = [
  {
    name: "absolute home-directory paths",
    pattern: /\/Users\/[A-Za-z0-9_-]+\//,
    scope: any,
  },
  {
    name: "personal email addresses",
    pattern: /[\w.%+-]+@(?:icloud|gmail|me|outlook|hotmail|yahoo)\.com\b/i,
    scope: any,
  },
  {
    name: "local log paths in documentation",
    pattern: /\.context\/[\w.-]/,
    scope: docs,
  },
  {
    name: "links to maintainer-only documents",
    pattern: /\b(?:HANDOFF|START_HERE|PROJECT_CONTEXT|FOUNDING_BRIEF)\.md\b/,
    scope: copy,
  },
  {
    name: "branch names in documentation or copy",
    pattern: /\bGregPat22\/(?!argent\b)[\w.-]+|`codex\/[\w.\/-]+`/,
    scope: copy,
  },
  {
    name: "founder narration",
    pattern: /\bthe founder\b|\bfounder['’]s\b/i,
    scope: copy,
    allow: ["AGENTS.md"],
  },
  {
    name: "asset-generator provenance notes",
    pattern: /ChatGPT Image|generated (?:by|with) (?:ChatGPT|DALL|Midjourney)/i,
    scope: any,
  },
  {
    name: "name etymology",
    pattern: /\bargento\b/i,
    scope: any,
  },
  {
    name: "hard-coded test counts in website copy",
    pattern: /\b\d+ of \d+ tests\b/i,
    scope: (path) => path.startsWith("website/src/"),
  },
  {
    name: "real-looking GitHub tokens",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/,
    scope: (path) => !path.startsWith("tests/"),
  },
  {
    name: "real-looking GitHub App client IDs",
    pattern: /\bIv\d{2}(?!x+\b)[A-Za-z0-9]{14,}\b/,
    scope: copy,
  },
];

for (const rule of rules) {
  test(`public content: no ${rule.name}`, () => {
    const hits: string[] = [];
    for (const { path, text } of tracked) {
      if (!rule.scope(path) || rule.allow?.includes(path)) continue;
      text.split("\n").forEach((line, index) => {
        if (rule.pattern.test(line)) hits.push(`${path}:${index + 1}`);
      });
    }
    assert.deepEqual(
      hits,
      [],
      `Found ${rule.name}; see AGENTS.md section 1. Remove it, or move it to the maintainers' private repository.`,
    );
  });
}

test("public content scan sees the repository", () => {
  assert.ok(tracked.some(({ path }) => path === "README.md"));
  assert.ok(tracked.length > 50);
});
