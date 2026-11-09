import assert from "node:assert/strict";
import { test } from "node:test";
import { readAgentEvents } from "../src/agent-stream.js";

async function collect(...chunks: Buffer[]) {
  async function* source() {
    yield* chunks;
  }
  const result = [];
  for await (const event of readAgentEvents(source())) result.push(event);
  return result;
}

test("JSONL handles split UTF-8, CRLF and a final line without a newline", async () => {
  const data = Buffer.from(
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "hello ☀" }] },
    }) +
      "\r\n" +
      JSON.stringify({ type: "result", subtype: "success", is_error: false }),
  );
  const split = data.indexOf(Buffer.from("☀")) + 1;
  const events = await collect(data.subarray(0, split), data.subarray(split));
  assert.equal(events.length, 2);
  assert.deepEqual(events[0]!.message!.content, [
    { type: "text", text: "hello ☀" },
  ]);
});

test("oversized newline-free output is rejected before JSON parsing", async () => {
  await assert.rejects(collect(Buffer.alloc((1 << 20) + 1, 120)), /byte limit/);
});

test("untrusted JSON cannot use invalid shapes or truthy result fields", async () => {
  for (const value of [
    null,
    [],
    { type: "assistant", message: { content: [null] } },
    { type: "result", subtype: "success", is_error: "false" },
    { type: "result", subtype: "success" },
    { type: "system", model: {} },
  ]) {
    await assert.rejects(
      collect(Buffer.from(JSON.stringify(value))),
      /invalid event/,
    );
  }
});
