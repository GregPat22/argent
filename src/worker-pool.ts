import { setTimeout as delay } from "node:timers/promises";
import { requireInteger } from "./domain.js";
import type { Worker } from "./worker.js";

/** Bounded dispatch; the store still serializes all claims and workspace writers. */
export async function runWorkers(
  worker: Worker,
  shutdown: AbortSignal,
  concurrency = 2,
): Promise<void> {
  requireInteger(concurrency, "concurrency", 1, 8);
  const failure = new AbortController();
  const signal = AbortSignal.any([shutdown, failure.signal]);
  const slots = Array.from({ length: concurrency }, async () => {
    try {
      while (!signal.aborted) {
        const worked = await worker.tick(signal);
        if (!worked && !signal.aborted) {
          try {
            await delay(100, undefined, { signal });
          } catch (error) {
            if (!signal.aborted) throw error;
          }
        }
      }
    } catch (error) {
      failure.abort();
      throw error;
    }
  });
  // Do not close the store until every live execution has drained, even when a
  // sibling slot fails. Reconnecting never calls this dispatch function.
  const results = await Promise.allSettled(slots);
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
}
