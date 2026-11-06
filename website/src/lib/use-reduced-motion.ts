"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
let preference: MediaQueryList | undefined;
const media = () => (preference ??= window.matchMedia(QUERY));
const snapshot = () => media().matches;
const serverSnapshot = () => false;
const subscribe = (notify: () => void) => {
  const query = media();
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** Motion 14.10's hook snapshots at mount; canvas loops must also react live. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
