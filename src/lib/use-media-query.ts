"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, following it as it changes. False on the server and in the
 * first client render, so the markup hydrates; it corrects itself right after.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
