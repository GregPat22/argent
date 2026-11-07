// Small DOM helpers. Rendering code uses only these and plain properties, so the
// renderer runs against the minimal fake document used in the Node tests.

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as T;
}

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  data?: Record<string, string>;
  on?: Record<string, (event: Event) => void>;
}

/** Creates an element. `attrs` with `false` or `undefined` values are skipped. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (props.class) result.className = props.class;
  if (props.text !== undefined) result.textContent = props.text;
  if (props.title) result.title = props.title;
  for (const [name, value] of Object.entries(props.attrs ?? {}))
    if (value !== undefined && value !== false)
      result.setAttribute(name, value === true ? "" : String(value));
  for (const [name, value] of Object.entries(props.data ?? {}))
    result.dataset[name] = value;
  for (const [name, listener] of Object.entries(props.on ?? {}))
    result.addEventListener(name, listener);
  for (const child of children) if (child) result.append(child);
  return result;
}

/** A decorative Lucide icon drawn through a CSS mask. */
export function icon(name: string, extra = ""): HTMLSpanElement {
  return h("span", {
    class: `icon icon-${name}${extra ? ` ${extra}` : ""}`,
    attrs: { "aria-hidden": "true" },
  });
}

/** Sets or removes one class without depending on `classList`. */
export function setClass(target: HTMLElement, name: string, on: boolean): void {
  const names = new Set(target.className.split(" ").filter(Boolean));
  if (on) names.add(name);
  else names.delete(name);
  target.className = Array.from(names).join(" ");
}

export function setText(id: string, text: string): void {
  const target = byId(id);
  if (target.textContent !== text) target.textContent = text;
}

export function show(id: string, visible: boolean): void {
  byId(id).hidden = !visible;
}

export function enable(id: string, enabled: boolean): void {
  (byId(id) as HTMLButtonElement).disabled = !enabled;
}

const SVG = "http://www.w3.org/2000/svg";

/** Creates an SVG element with attributes. Used only for hallmark punches. */
export function svg(
  tag: string,
  attrs: Record<string, string | number> = {},
  ...children: (SVGElement | string)[]
): SVGElement {
  const result = document.createElementNS(SVG, tag) as SVGElement;
  for (const [name, value] of Object.entries(attrs))
    result.setAttribute(name, String(value));
  for (const child of children) result.append(child);
  return result;
}
