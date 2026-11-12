/*
 * Masked split text for entrance reveals, after the Motion UI split-reveal
 * section: text is cut into words, words are grouped into the lines they
 * actually render on, and each line clips its words so they can rise into
 * place. The split is temporary: `restore()` puts the original nodes back once
 * the reveal settles, so React keeps ownership of the text and no extra spans
 * remain for assistive technology.
 */

const MASK_BREATHING = "0.16em";

export type SplitText = {
  words: HTMLElement[];
  restore: () => void;
};

type Options = {
  /** Put the whole text on `el` as its accessible name while split. */
  label?: boolean;
};

function visibleBreak(node: Node) {
  return (
    node instanceof HTMLBRElement && getComputedStyle(node).display !== "none"
  );
}

/** Text of each forced line, joining hidden breaks with a space. */
function segmentsOf(el: HTMLElement) {
  const segments = [""];
  el.childNodes.forEach((node) => {
    if (node instanceof HTMLBRElement) {
      if (visibleBreak(node)) segments.push("");
      else segments[segments.length - 1] += " ";
      return;
    }
    segments[segments.length - 1] += node.textContent ?? "";
  });
  return segments.map((text) => text.trim()).filter(Boolean);
}

function maskLine(words: HTMLElement[]) {
  const line = document.createElement("span");
  line.dataset.splitLine = "";
  line.style.display = "block";
  // Expand the paint clip for ascenders/descenders without changing line
  // geometry. Padding with negative margins collapses across these wrappers,
  // making headings taller until restore() removes them.
  line.style.clipPath = `inset(-${MASK_BREATHING} 0)`;
  const last = words.at(-1);
  if (last) {
    last.textContent = last.textContent?.trimEnd() ?? "";
    last.style.marginInlineEnd = "";
  }
  words.forEach((word, index) => {
    if (index) line.append(" ");
    line.append(word);
  });
  return line;
}

/** Splits `el` into masked lines of words. Call `restore()` when done. */
export function splitWords(el: HTMLElement, options: Options = {}): SplitText {
  const original = Array.from(el.childNodes);
  const label = el.getAttribute("aria-label");
  const segments = segmentsOf(el);
  const words: HTMLElement[] = [];

  const blocks = segments.map((segment) => {
    const block = document.createElement("span");
    block.style.display = "block";
    block.setAttribute("aria-hidden", "true");
    const tokens = segment.split(/\s+/);
    tokens.forEach((text, index) => {
      const word = document.createElement("span");
      word.dataset.splitWord = "";
      word.style.display = "inline-block";
      // Keep the following space in the shaping run: fonts can kern punctuation
      // against it. The external space still owns the line-breaking opportunity.
      word.style.whiteSpace = "pre";
      word.textContent = text + (index < tokens.length - 1 ? " " : "");
      if (index) block.append(" ");
      block.append(word);
      words.push(word);
    });
    return block;
  });
  if (options.label) el.setAttribute("aria-label", segments.join(" "));
  el.replaceChildren(...blocks);

  // Cancel only the retained space's advance, leaving normal wrapping between
  // words. Read all advances before writing margins to avoid repeated layout.
  const spaces = words.map((word) => {
    const text = word.firstChild!;
    const length = text.textContent!.length;
    if (!text.textContent!.endsWith(" ")) return 0;
    const range = document.createRange();
    range.setStart(text, length - 1);
    range.setEnd(text, length);
    return range.getBoundingClientRect().width;
  });
  words.forEach((word, index) => {
    if (spaces[index]) word.style.marginInlineEnd = `-${spaces[index]}px`;
  });

  // Group words by their rendered line before wrapping each line in a mask.
  for (const block of blocks) {
    const own = Array.from(
      block.querySelectorAll<HTMLElement>("[data-split-word]"),
    );
    const lines: HTMLElement[][] = [];
    let top = Number.NaN;
    for (const word of own) {
      const y = Math.round(word.getBoundingClientRect().top);
      if (!lines.length || Math.abs(y - top) > 2) {
        lines.push([]);
        top = y;
      }
      lines[lines.length - 1]!.push(word);
    }
    block.replaceChildren(...lines.map(maskLine));
  }

  return {
    words,
    restore: () => {
      el.replaceChildren(...original);
      if (!options.label) return;
      if (label === null) el.removeAttribute("aria-label");
      else el.setAttribute("aria-label", label);
    },
  };
}

/**
 * Keeps a background-clip gradient continuous across split words: each word
 * paints the parent's gradient at the parent's size, offset to its position.
 */
export function carryGradient(parent: HTMLElement, words: HTMLElement[]) {
  const style = getComputedStyle(parent);
  const image = style.backgroundImage;
  if (!image || image === "none") return () => {};
  // Measure everything before the first write so layout is read only once.
  const box = parent.getBoundingClientRect();
  const rects = words.map((word) => word.getBoundingClientRect());
  words.forEach((word, index) => {
    const rect = rects[index]!;
    Object.assign(word.style, {
      backgroundImage: image,
      backgroundSize: `${box.width}px ${box.height}px`,
      backgroundPosition: `${box.left - rect.left}px ${box.top - rect.top}px`,
      backgroundRepeat: "no-repeat",
      backgroundClip: "text",
      webkitBackgroundClip: "text",
      color: "transparent",
    });
  });
  parent.style.backgroundImage = "none";
  return () => {
    parent.style.backgroundImage = "";
  };
}
