import { DomainError } from "./domain.js";

const MAX_EVENT_BYTES = 1 << 20;
const MAX_STREAM_BYTES = 64 << 20;
export interface StreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  is_error?: boolean;
  num_turns?: number;
  duration_ms?: number;
  result?: unknown;
  message?: { content?: unknown };
}

function parse(line: Buffer): StreamEvent {
  const invalid = () =>
    new DomainError(409, "Claude Code returned an invalid event");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(line));
  } catch {
    throw invalid();
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  const event = value as Record<string, unknown>;
  if (typeof event.type !== "string") throw invalid();
  for (const key of ["subtype", "session_id", "model"])
    if (event[key] !== undefined && typeof event[key] !== "string")
      throw invalid();
  for (const key of ["num_turns", "duration_ms"])
    if (
      event[key] !== undefined &&
      (!Number.isSafeInteger(event[key]) || (event[key] as number) < 0)
    )
      throw invalid();
  if (event.is_error !== undefined && typeof event.is_error !== "boolean")
    throw invalid();
  if (
    event.type === "result" &&
    (typeof event.subtype !== "string" || typeof event.is_error !== "boolean")
  )
    throw invalid();
  if (["assistant", "user"].includes(event.type)) {
    const message = event.message;
    if (!message || typeof message !== "object" || Array.isArray(message))
      throw invalid();
    const content = (message as Record<string, unknown>).content;
    if (
      !Array.isArray(content) ||
      content.some(
        (block) => !block || typeof block !== "object" || Array.isArray(block),
      )
    )
      throw invalid();
  }
  return event as unknown as StreamEvent;
}

/** Bound raw JSONL before decoding/parsing, including a stream without newlines. */
export async function* readAgentEvents(
  source: AsyncIterable<Buffer>,
): AsyncIterable<StreamEvent> {
  let pending = Buffer.alloc(0);
  let total = 0;
  for await (const chunk of source) {
    total += chunk.length;
    if (total > MAX_STREAM_BYTES)
      throw new DomainError(409, "Claude Code output exceeds its byte limit");
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const end = pending.indexOf(10);
      if ((end < 0 ? pending.length : end) > MAX_EVENT_BYTES)
        throw new DomainError(409, "Claude Code event exceeds its byte limit");
      if (end < 0) break;
      const line = pending.subarray(0, end);
      pending = pending.subarray(end + 1);
      if (line.toString("utf8").trim()) yield parse(line);
    }
  }
  if (pending.length) yield parse(pending);
}
