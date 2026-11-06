import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const shell = ts.transpileModule(
  readFileSync(new URL("../ui/shell.js", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

// Exercise the compiled shell with no bridge: navigation cannot dispatch work.
function launch() {
  type Handler = (event: { preventDefault(): void }) => void;
  class Element {
    value = "";
    readOnly = false;
    disabled = false;
    hidden = false;
    open = false;
    listeners = new Map<string, Handler>();
    addEventListener(name: string, callback: Handler) {
      this.listeners.set(name, callback);
    }
    click() {
      if (!this.disabled) this.fire("click");
    }
    fire(name: string) {
      this.listeners.get(name)?.({ preventDefault() {} });
    }
    showModal() {
      this.open = true;
    }
    focus() {}
    setAttribute() {}
  }
  const elements = new Map<string, Element>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  let reviews = 0;
  get("new-task").addEventListener("click", () => {
    reviews++;
    get("task-dialog").showModal();
  });
  runInNewContext(shell, {
    exports: {},
    document: {
      getElementById: get,
      querySelectorAll: () => [],
      addEventListener() {},
    },
  });
  return { get, reviews: () => reviews };
}

test("composer opens runtime review without dispatching execution", () => {
  const ui = launch();
  ui.get("composer-input").value = "  inspect the change  ";
  ui.get("composer-form").fire("submit");
  assert.equal(ui.reviews(), 1);
  assert.equal(ui.get("task-dialog").open, true);
  assert.equal(ui.get("task-input").value, "inspect the change");
});

test("composer preserves uncertain pending submission fields", () => {
  const ui = launch();
  ui.get("task-input").value = "original uncertain submission";
  ui.get("task-input").readOnly = true;
  ui.get("composer-input").value = "different task";
  ui.get("composer-form").fire("submit");
  assert.equal(ui.reviews(), 1);
  assert.equal(ui.get("task-input").value, "original uncertain submission");
});

test("disabled workspace and blank composer cannot open submission review", () => {
  const ui = launch();
  ui.get("new-task").disabled = true;
  ui.get("composer-input").value = "do work";
  ui.get("composer-form").fire("submit");
  ui.get("new-task").disabled = false;
  ui.get("composer-input").value = "   ";
  ui.get("composer-form").fire("submit");
  assert.equal(ui.reviews(), 0);
  assert.equal(ui.get("task-dialog").open, false);
});
