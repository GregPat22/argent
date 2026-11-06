import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeHistory } from "../ui/history.js";

interface HistoryRecord {
  id: string;
  createdAt: number;
  status: string;
}

function records(count: number): HistoryRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `record-${String(index).padStart(5, "0")}`,
    createdAt: count - index,
    status: "completed",
  }));
}

test("all explicitly loaded history pages remain accessible beyond 1000 records", () => {
  const source = records(1450);
  let loaded: HistoryRecord[] = [];
  for (let offset = 0; offset < source.length; offset += 50) {
    loaded = mergeHistory(loaded, source.slice(offset, offset + 50));
  }
  assert.equal(loaded.length, source.length);
  assert.deepEqual(
    loaded.map((record) => record.id),
    source.map((record) => record.id),
  );
  assert.equal(new Set(loaded.map((record) => record.id)).size, source.length);
  assert.equal(loaded.at(-1)?.id, source.at(-1)?.id);
});

test("a directly restored old selection survives pagination and recent-page refreshes", () => {
  const source = records(1800);
  const selected = source[1750]!;
  let loaded = mergeHistory(source.slice(0, 50), [selected]);
  for (let offset = 50; offset < 1300; offset += 50) {
    loaded = mergeHistory(loaded, source.slice(offset, offset + 50));
  }
  const refreshed = { ...source[0]!, status: "failed" };
  loaded = mergeHistory(loaded, [refreshed, ...source.slice(1, 50)]);
  assert.equal(loaded.length, 1301);
  assert.equal(
    loaded.find((record) => record.id === selected.id),
    selected,
  );
  assert.equal(loaded.at(-1), selected);
  assert.equal(loaded[0], refreshed);
});

test("overlapping pages update records without duplication or mutating existing input", () => {
  const existing = records(60);
  const before = existing.slice();
  const changed = { ...existing[35]!, status: "needs_attention" };
  const merged = mergeHistory(existing, [changed, ...existing.slice(40)]);
  assert.equal(merged.length, existing.length);
  assert.equal(
    merged.find((record) => record.id === changed.id),
    changed,
  );
  assert.deepEqual(existing, before);
  assert.notEqual(existing[35], changed);
});

test("equal-timestamp history follows descending identity order deterministically", () => {
  const loaded = mergeHistory(
    [{ id: "a", createdAt: 100 }],
    [
      { id: "c", createdAt: 100 },
      { id: "b", createdAt: 100 },
    ],
  );
  assert.deepEqual(
    loaded.map((record) => record.id),
    ["c", "b", "a"],
  );
});
