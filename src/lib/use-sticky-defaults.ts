"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { CONDITIONS } from "./format";

/**
 * Remembered entry settings, so adding hundreds of cards doesn't mean re-picking the same
 * location, collection, language, finish and condition every time — "from now on, everything
 * goes to Caja 1". Per device (localStorage).
 */
export interface StickyDefaults {
  finish: "nonfoil" | "foil" | "etched";
  condition: (typeof CONDITIONS)[number];
  language: string;
  lastLocationId: string | null;
  /** The divider of that location entries go behind (D28). */
  lastSectionId: string | null;
  lastSetCode: string | null;
  /** Optional: also list what's entered in this collection (D23). Null = no collection. */
  entryCollectionId: string | null;
  /**
   * Where the scanner guide is («Ajustar recuadro», GuidePlace in scan/geometry.ts): its size,
   * 0.3–1 of the full one, and its centre's offset from the middle. A card slinger holds the
   * card in one place at a fixed distance: the guide is fitted to it once.
   */
  guideScale: number;
  guideDx: number;
  guideDy: number;
  /** The scanner looks for the card in the whole view and reads it where it is (D36). */
  findCard: boolean;
  /**
   * When the reader gets stuck on a card, ask the AI on its own instead of waiting for the
   * button (D31). Off by default: every call costs money and the daily limit is 150.
   */
  autoIdentify: boolean;
}

const DEFAULTS: StickyDefaults = {
  finish: "nonfoil",
  condition: "NM",
  // Most cards are in English (the owner, 2026-09-15); a Spanish collection is picked when entering it.
  language: "en",
  lastLocationId: null,
  lastSectionId: null,
  lastSetCode: null,
  entryCollectionId: null,
  guideScale: 1,
  guideDx: 0,
  guideDy: 0,
  findCard: true,
  autoIdentify: false,
};

const KEY = "cardllector:defaults";
const listeners = new Set<() => void>();
// Fallback when storage is unavailable (private mode, blocked site data).
let memory = "";

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot() {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function parse(raw: string): StickyDefaults {
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<StickyDefaults>) };
  } catch {
    return DEFAULTS;
  }
}

export function useStickyDefaults() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const defaults = useMemo(() => parse(raw), [raw]);

  const update = useCallback((patch: Partial<StickyDefaults>) => {
    memory = JSON.stringify({ ...parse(getSnapshot()), ...patch });
    try {
      localStorage.setItem(KEY, memory);
    } catch {
      // Keep the in-memory copy.
    }
    listeners.forEach((l) => l());
  }, []);

  return [defaults, update] as const;
}

/** A remembered id, if it still exists among the options (it may have been deleted). */
export function validId(id: string | null, options: Array<{ id: string }>): string | null {
  return id && options.some((o) => o.id === id) ? id : null;
}
