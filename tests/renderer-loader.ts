// Runs the compiled renderer modules in a VM against a minimal fake DOM.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

export type Listener = (event?: unknown) => void;

export class FakeElement {
  textContent = "";
  hidden = false;
  disabled = false;
  readOnly = false;
  className = "";
  title = "";
  placeholder = "";
  value: string | undefined = undefined;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Listener>();
  open = false;
  popoverOpen = false;
  focused = false;
  parent: FakeElement | null = null;
  private adopt(child: FakeElement): FakeElement {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    return child;
  }
  append(...children: (FakeElement | string)[]): void {
    for (const child of children)
      if (typeof child !== "string") this.children.push(this.adopt(child));
  }
  prepend(child: FakeElement): void {
    this.children.unshift(this.adopt(child));
  }
  after(sibling: FakeElement): void {
    const parent = this.parent!;
    parent.adopt(sibling);
    parent.children.splice(parent.children.indexOf(this) + 1, 0, sibling);
  }
  replaceWith(next: FakeElement): void {
    const parent = this.parent!;
    const index = parent.children.indexOf(this);
    parent.adopt(next);
    parent.children.splice(index, 1, next);
    this.parent = null;
  }
  remove(): void {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get nextElementSibling(): FakeElement | null {
    const siblings = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  /** All text below this element, like `textContent` on a real node. */
  get text(): string {
    return [this.textContent, ...this.children.map((child) => child.text)].join(
      " ",
    );
  }
  replaceChildren(): void {
    for (const child of this.children) child.parent = null;
    this.children = [];
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  addEventListener(name: string, callback: Listener): void {
    this.listeners.set(name, callback);
  }
  fire(name: string, event: Record<string, unknown> = {}): void {
    this.listeners.get(name)?.({ preventDefault() {}, ...event });
  }
  click(): void {
    if (!this.disabled) this.fire("click");
  }
  focus(): void {
    this.focused = true;
  }
  showModal(): void {
    this.open = true;
  }
  close(): void {
    this.open = false;
  }
  showPopover(): void {
    this.popoverOpen = true;
  }
  hidePopover(): void {
    this.popoverOpen = false;
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  /** Depth-first search through appended children. */
  find(predicate: (element: FakeElement) => boolean): FakeElement | undefined {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    return undefined;
  }
}

/**
 * Loads `ui/app.js` and its relative imports from `dist/ui`, transpiled to
 * CommonJS. Only sibling renderer modules may be required.
 */
export function loadRenderer(globals: Record<string, unknown>): void {
  const cache = new Map<string, unknown>();
  const load = (name: string): unknown => {
    assert.match(name, /^\.\/[a-z0-9-]+\.js$/, `unexpected import ${name}`);
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const code = ts.transpileModule(
      readFileSync(new URL(`../ui/${name.slice(2)}`, import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText;
    runInNewContext(code, { ...globals, exports, require: load });
    return exports;
  };
  load("./app.js");
}

export function fakeDocument() {
  const elements = new Map<string, FakeElement>();
  const element = (id: string): FakeElement => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id)!;
  };
  element("error-banner").hidden = true;
  const document = {
    getElementById: element,
    createElement: () => new FakeElement(),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
  };
  return { element, document };
}

export const settle = async (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));
