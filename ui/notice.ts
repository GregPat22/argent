// Long safety notices show their first lines and expand in place. The full
// text always stays in the element, so assistive technology reads all of it.
import { byId } from "./dom.js";

function set(id: string, open: boolean) {
  const toggle = byId(`${id}-toggle`);
  byId(id).setAttribute("data-clamped", String(!open));
  toggle.textContent = open ? "Show less" : "Show full notice";
  toggle.setAttribute("aria-expanded", String(open));
}

/** Wires the notice's expand control, `<id>-toggle`. */
export function wireNotice(id: string): void {
  byId(`${id}-toggle`).addEventListener("click", () =>
    set(id, byId(id).getAttribute("data-clamped") === "true"),
  );
  set(id, false);
}

/** Collapses the notice again and offers the control only when text is cut. */
export function resetNotice(id: string): void {
  set(id, false);
  const notice = byId(id);
  byId(`${id}-toggle`).hidden = !(
    notice.scrollHeight >
    notice.clientHeight + 1
  );
}
