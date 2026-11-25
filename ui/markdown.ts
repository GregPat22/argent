// Draws the Markdown subset Claude Code writes in its replies. Every piece of
// reply text reaches the page through `textContent`: the parser only chooses
// which of Argent's own elements hold it, so HTML in a reply stays literal
// text. Links and images never load or navigate; their address is shown.
import { h } from "./dom.js";

/** Longer paragraphs keep their text but skip inline formatting. */
const INLINE_LIMIT = 20_000;
/** Lists nest at most this deep; deeper items join the last level. */
const DEPTH_LIMIT = 4;

type Inline = HTMLElement | string;

/** Finds `marker` at or after `from` that can close a span opened before it. */
function closing(text: string, marker: string, from: number): number {
  let at = text.indexOf(marker, from);
  while (at !== -1 && (at === from || text[at - 1] === " "))
    at = text.indexOf(marker, at + 1);
  return at;
}

const word = (character: string | undefined) =>
  !!character && /[\p{L}\p{N}]/u.test(character);

/** Inline code, emphasis, strikethrough and links, as text-only elements. */
function inline(text: string): Inline[] {
  if (text.length > INLINE_LIMIT) return [text];
  const out: Inline[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push(plain);
    plain = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const character = text[i]!;
    // A backslash keeps the next punctuation literal.
    if (character === "\\" && /^\\[\\`*_~[\]()#>!|-]/.test(rest)) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    if (character === "`") {
      const run = /^`+/.exec(rest)![0];
      const end = text.indexOf(run, i + run.length);
      if (end !== -1) {
        flush();
        let code = text.slice(i + run.length, end);
        if (/^ .* $/.test(code)) code = code.slice(1, -1);
        out.push(h("code", { class: "md-code", text: code }));
        i = end + run.length;
        continue;
      }
      plain += run;
      i += run.length;
      continue;
    }
    const pair = /^(\*\*|__|~~)/.exec(rest)?.[0];
    if (pair && text[i + 2] && text[i + 2] !== " ") {
      const end = closing(text, pair, i + 2);
      const underscore = pair === "__";
      if (
        end !== -1 &&
        (!underscore || (!word(text[i - 1]) && !word(text[end + 2])))
      ) {
        flush();
        out.push(
          h(
            pair === "~~" ? "s" : "strong",
            { class: pair === "~~" ? "md-strike" : "md-strong" },
            ...inline(text.slice(i + 2, end)),
          ),
        );
        i = end + 2;
        continue;
      }
    }
    if (
      (character === "*" || character === "_") &&
      text[i + 1] &&
      text[i + 1] !== " " &&
      text[i + 1] !== character
    ) {
      const end = closing(text, character, i + 1);
      const underscore = character === "_";
      if (
        end !== -1 &&
        text[end + 1] !== character &&
        (!underscore || (!word(text[i - 1]) && !word(text[end + 1])))
      ) {
        flush();
        out.push(
          h("em", { class: "md-em" }, ...inline(text.slice(i + 1, end))),
        );
        i = end + 1;
        continue;
      }
    }
    const link = /^(!?)\[([^\]\n]*)\]\(([^()\s]*)\)/.exec(rest);
    if (link) {
      flush();
      const [whole, image, label, address] = link;
      const shown = image
        ? [h("span", { class: "md-image", text: `Image: ${label || address}` })]
        : label && label !== address
          ? inline(label)
          : [];
      out.push(
        h(
          "span",
          { class: "md-link" },
          ...shown,
          shown.length && address ? " " : null,
          address ? h("span", { class: "md-address", text: address }) : null,
        ),
      );
      i += whole.length;
      continue;
    }
    plain += character;
    i++;
  }
  flush();
  return out;
}

const fence = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/;
const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const rule = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const item = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const quote = /^ {0,3}>\s?(.*)$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
const tableRule = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Block structure: headings, fences, lists, quotes, tables, rules, paragraphs. */
function blocks(lines: string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let i = 0;
  const starts = (line: string) =>
    fence.test(line) ||
    heading.test(line) ||
    rule.test(line) ||
    item.test(line) ||
    quote.test(line);
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const open = fence.exec(line);
    if (open) {
      const marker = open[1]!;
      const body: string[] = [];
      i++;
      while (
        i < lines.length &&
        !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(
          lines[i]!,
        )
      )
        body.push(lines[i++]!);
      i++;
      out.push(
        h(
          "div",
          { class: "md-fence" },
          ...(open[2]
            ? [h("span", { class: "md-fence-label", text: open[2] })]
            : []),
          h("pre", { class: "md-pre", text: body.join("\n") }),
        ),
      );
      continue;
    }
    const title = heading.exec(line);
    if (title) {
      const level = Math.min(title[1]!.length, 3);
      out.push(
        h(
          level === 1 ? "h3" : level === 2 ? "h4" : "h5",
          { class: `md-heading md-h${level}` },
          ...inline(title[2]!),
        ),
      );
      i++;
      continue;
    }
    if (rule.test(line)) {
      out.push(h("hr", { class: "md-rule" }));
      i++;
      continue;
    }
    if (quote.test(line)) {
      const body: string[] = [];
      while (i < lines.length && quote.test(lines[i]!))
        body.push(quote.exec(lines[i++]!)![1]!);
      out.push(h("blockquote", { class: "md-quote" }, ...blocks(body)));
      continue;
    }
    if (item.test(line)) {
      const end = listEnd(lines, i);
      out.push(list(lines.slice(i, end), 0));
      i = end;
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      tableRule.test(lines[i + 1]!) &&
      lines[i + 1]!.includes("-")
    ) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim())
        rows.push(cells(lines[i++]!));
      out.push(
        h(
          "div",
          { class: "md-table-wrap" },
          h(
            "table",
            { class: "md-table" },
            h(
              "thead",
              {},
              h("tr", {}, ...head.map((cell) => h("th", {}, ...inline(cell)))),
            ),
            h(
              "tbody",
              {},
              ...rows.map((row) =>
                h(
                  "tr",
                  {},
                  ...head.map((_, k) => h("td", {}, ...inline(row[k] ?? ""))),
                ),
              ),
            ),
          ),
        ),
      );
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !starts(lines[i]!))
      body.push(lines[i++]!.trim());
    if (!body.length) body.push(lines[i++]!.trim());
    out.push(h("p", { class: "md-p" }, ...inline(body.join("\n"))));
  }
  return out;
}

/**
 * A list runs until a line that is not part of it, or an item of the other
 * kind (bulleted or numbered) at its own level. A blank line is kept only
 * when the list continues after it.
 */
function listEnd(lines: string[], from: number): number {
  const first = item.exec(lines[from]!)!;
  const indent = first[1]!.length,
    ordered = /\d/.test(first[2]!);
  const belongs = (line: string | undefined) => {
    if (line === undefined) return false;
    const match = item.exec(line);
    if (match)
      return match[1]!.length > indent || /\d/.test(match[2]!) === ordered;
    return /^\s+\S/.test(line);
  };
  let i = from + 1;
  while (i < lines.length) {
    if (belongs(lines[i])) i++;
    else if (!lines[i]!.trim() && belongs(lines[i + 1])) i++;
    else break;
  }
  return i;
}

/** One list level; items indented further than the first start a nested list. */
function list(lines: string[], depth: number): HTMLElement {
  const first = item.exec(lines[0]!)!;
  const indent = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const element = h(ordered ? "ol" : "ul", { class: "md-list" });
  if (ordered) {
    const start = parseInt(first[2]!, 10);
    if (start !== 1) element.setAttribute("start", String(start));
  }
  let current: { text: string[]; nested: string[] } | null = null;
  const close = () => {
    if (!current) return;
    const li = h("li", {}, ...inline(current.text.join("\n")));
    const nested = current.nested.filter((line) => line.trim());
    if (nested.length)
      li.append(
        ...(depth + 1 < DEPTH_LIMIT && item.test(nested[0]!)
          ? [list(nested, depth + 1)]
          : blocks(nested.map((line) => line.trim()))),
      );
    element.append(li);
  };
  for (const line of lines) {
    const match = item.exec(line);
    if (match && match[1]!.length <= indent) {
      close();
      current = { text: [match[3]!], nested: [] };
    } else if (current) {
      if (match || current.nested.length) current.nested.push(line);
      else if (line.trim()) current.text.push(line.trim());
    }
  }
  close();
  return element;
}

/** The reply as Markdown blocks built only from text nodes. */
export function markdown(text: string): HTMLElement[] {
  return blocks(text.replace(/\r\n?/g, "\n").split("\n"));
}
