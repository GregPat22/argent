export function mergeHistory<T extends { id: string; createdAt: number }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const records = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) records.set(item.id, item);
  return Array.from(records.values()).sort(
    (a, b) =>
      b.createdAt - a.createdAt || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1),
  );
}
