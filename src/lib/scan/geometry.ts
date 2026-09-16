/** Magic and Pokémon cards share the 63 × 88 mm format. */
export const CARD_RATIO = 63 / 88;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The largest card-shaped box that fits in `fill` of a frame, centered. */
export function guideRect(frameW: number, frameH: number, fill = 0.86): Rect {
  const h = Math.min(frameH * fill, (frameW * fill) / CARD_RATIO);
  const w = h * CARD_RATIO;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

/** At its full size, the guide takes this much of the space between the scanner's bars. */
export const GUIDE_FILL = 0.94;
/** How small the owner can make it: a card slinger shows cards small, and always in one place. */
export const GUIDE_SCALE_MIN = 0.3;
export const GUIDE_SCALE_MAX = 1;

/**
 * Where the owner put the guide («Ajustar recuadro»): its size, from 0.3 to 1 of the full one,
 * and its centre's offset from the middle, in fractions of the area.
 */
export type GuidePlace = { scale: number; dx: number; dy: number };
export const DEFAULT_GUIDE: GuidePlace = { scale: 1, dx: 0, dy: 0 };

export function clampGuideScale(scale: number): number {
  return Number.isFinite(scale) ? Math.min(GUIDE_SCALE_MAX, Math.max(GUIDE_SCALE_MIN, scale)) : 1;
}

/** The guide in an area, as the owner placed it but never outside the area. Stored values may be anything. */
export function placeGuide(area: Rect, place: GuidePlace): Rect {
  const full = guideRect(area.w, area.h, GUIDE_FILL);
  const scale = clampGuideScale(place.scale);
  const w = full.w * scale;
  const h = full.h * scale;
  const offset = (v: number) => (Number.isFinite(v) ? v : 0);
  const cx = Math.min(area.w - w / 2, Math.max(w / 2, area.w / 2 + offset(place.dx) * area.w));
  const cy = Math.min(area.h - h / 2, Math.max(h / 2, area.h / 2 + offset(place.dy) * area.h));
  return { x: area.x + cx - w / 2, y: area.y + cy - h / 2, w, h };
}

/** The same, inside an area of the screen (the space between the scanner's bars). */
export function guideIn(area: Rect, fill = 0.92): Rect {
  const g = guideRect(area.w, area.h, fill);
  return { ...g, x: g.x + area.x, y: g.y + area.y };
}

/**
 * Bottom-left info strip (number, set code, language), relative to the card. Slightly larger
 * than the text itself to tolerate imperfect alignment. Measured on Magic 2014+ and Pokémon
 * card scans (docs/scanner.md).
 */
export const INFO_STRIP = { x0: 0.02, x1: 0.5, y0: 0.895, y1: 0.99 };

type Strip = { x0: number; x1: number; y0: number; y1: number };

/**
 * What a card found in the view (D36) can be, and where its info strip is then:
 * - card: the whole card was found (a table, a mat, a screen), so the number is on it, where
 *   the guide has it;
 * - frame: down a card slinger a black border doesn't stand out from the dark floor, so what's
 *   found is the frame inside it, and the number is printed in that border, below it.
 * Neither strip covers the other's number (measured 2026-09-14, docs/scanner.md): the scanner
 * tries both in turn and keeps the one that reads.
 */
export type FoundStrip = "card" | "frame";
export const FOUND_INFO_STRIPS: Record<FoundStrip, Strip> = {
  card: INFO_STRIP,
  // Below the frame, starting at its bottom edge. What findCard locks onto is the card's inner
  // frame, and that frame's bottom IS the type line: starting at 93 % put that line — big, bold
  // and high contrast — inside the crop, where it drowned the collector line beneath it, and
  // reaching to 55 % of the width dragged in the artist's column as well. Measured 2026-09-16 on
  // a photo and a screenshot from the phone: the number sits at y 100–108 % of the box, and the
  // strip as it was read "NCC" as "WCC" while this one reads it right (docs/scanner.md).
  frame: { x0: 0, x1: 0.45, y0: 0.98, y1: 1.09 },
};

/** The smallest strip covering both: what the scanner marks while it doesn't know which reads. */
export function stripUnion(a: Strip, b: Strip): Strip {
  return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
}

/** Reads in a row without a line on the kept strip before the other one gets a look. */
export const FOUND_STRIP_PROBE = 4;

/**
 * Which strip to read a found card with (D36). The one that last read a card the catalog knows
 * is kept for the whole session: the setup (a table, a slinger) doesn't change from one card to
 * the next. Until one has, they take turns (`turn`); and every FOUND_STRIP_PROBE reads in a row
 * without a line (`misses`), the other one gets a look, in case the setup did change.
 */
export function pickFoundStrip(kept: FoundStrip | null, misses: number, turn: number): FoundStrip {
  if (!kept) return turn % 2 ? "frame" : "card";
  const other: FoundStrip = kept === "card" ? "frame" : "card";
  return misses > 0 && misses % FOUND_STRIP_PROBE === 0 ? other : kept;
}

/** Title line: the fallback when the info strip can't be read. */
export const TITLE_STRIP = { x0: 0.04, x1: 0.76, y0: 0.025, y1: 0.1 };

/**
 * Where an album prints the player's name on the front, for albums with no collector number
 * there (D29), and how to read it: turned upright (degrees clockwise) and inverted when it's
 * light text on a dark band, which Tesseract reads far better as dark on light.
 */
export type NameLayout = {
  strip: { x0: number; x1: number; y0: number; y1: number };
  rotate: 0 | 90 | -90;
  invert: boolean;
};

/**
 * By product line (sets.set_type). Megacracks: the name runs up the right edge, white on a
 * black band (measured on a 2025-26 base card: "LAMINE YAMAL" read at 78 % confidence).
 */
export const NAME_LAYOUTS: Record<string, NameLayout> = {
  megacracks: { strip: { x0: 0.87, x1: 0.945, y0: 0.17, y1: 0.68 }, rotate: 90, invert: true },
};

export function stripRect(card: Rect, strip = INFO_STRIP): Rect {
  return {
    x: card.x + card.w * strip.x0,
    y: card.y + card.h * strip.y0,
    w: card.w * (strip.x1 - strip.x0),
    h: card.h * (strip.y1 - strip.y0),
  };
}

/**
 * How a video frame maps onto an element showing it with `object-fit: cover`: scaled to fill
 * and centered, cropping what overflows.
 */
export function coverTransform(videoW: number, videoH: number, boxW: number, boxH: number) {
  const scale = Math.max(boxW / videoW, boxH / videoH);
  return { scale, offX: (boxW - videoW * scale) / 2, offY: (boxH - videoH * scale) / 2 };
}

/** A point in video pixels → on screen (relative to the video element): the inverse of `toVideo`. */
export function fromVideo(p: { x: number; y: number }, t: ReturnType<typeof coverTransform>) {
  return { x: p.x * t.scale + t.offX, y: p.y * t.scale + t.offY };
}

/** A rectangle on screen (relative to the video element) → video pixels. */
export function toVideo(r: Rect, t: ReturnType<typeof coverTransform>): Rect {
  return { x: (r.x - t.offX) / t.scale, y: (r.y - t.offY) / t.scale, w: r.w / t.scale, h: r.h / t.scale };
}
