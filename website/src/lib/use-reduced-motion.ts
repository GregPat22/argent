"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/*
 * Chromium queues a MediaQueryList's `change` event for the next frame and
 * drops it if `.matches` was read on that same list in between. React reads
 * the snapshot on every render, so reads and listeners must use separate
 * lists or a render in that window silently swallows the update.
 */
let reader: MediaQueryList | undefined;
const snapshot = () => (reader ??= window.matchMedia(QUERY)).matches;
const serverSnapshot = () => false;
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** Motion 14.10's hook snapshots at mount; canvas loops must also react live. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
