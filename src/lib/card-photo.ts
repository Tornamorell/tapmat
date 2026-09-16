// Shared card photos (D30): URLs and the card-shaped image, for both server and browser. The
// canvas functions only run in the browser.
import { autoLevels, detectCardQuad, warpCard, type Pt, type Quad } from "@/lib/scan/card-quad";
import { findCard } from "@/lib/scan/find-card";

export const CARD_PHOTO_PREFIX = "/api/card-photos/";

/** Versioned so browsers can cache a photo for a year and still see a new one. */
export function cardPhotoUrl(catalogCardId: string, updatedAt: Date) {
  return `${CARD_PHOTO_PREFIX}${catalogCardId}?v=${Math.floor(updatedAt.getTime() / 1000)}`;
}

/** Whether a card's image is a shared photo rather than the catalog source's image. */
export function isCardPhoto(url: string | null | undefined) {
  return !!url?.startsWith(CARD_PHOTO_PREFIX);
}

const RATIO = 63 / 88;
const WIDTH = 300;
const HEIGHT = 419; // 63×88
const DETECT_WIDTH = 360; // px the edges are searched at: enough, and fast on a phone
const GUIDE_MARGIN = 0.12; // the card may stick out of the guide: search this much around it
/**
 * How close to 63×88 a picture must be to count as already cropped to the card. Tight on
 * purpose: an ordinary 3:4 portrait photo is 0.75 against a card's 0.716, only 0.034 away, and
 * those do need finding and straightening.
 */
const CROPPED_TOLERANCE = 0.02;

/**
 * Whether a picture is already the card, edge to edge. Then there is nothing around it to find:
 * its outer edge IS the image's border, which has no gradient for `detectCardQuad` to see, so
 * the only straight lines left are the design's inner frame — and straightening to that crops
 * the card's borders off. Such a picture is taken as it is (D32).
 */
export function isAlreadyCard(width: number, height: number): boolean {
  return height > 0 && width > 0 && Math.abs(width / height - RATIO) <= CROPPED_TOLERANCE;
}

type Rect = { x: number; y: number; w: number; h: number };

/** The largest card-shaped (63×88) rectangle in the middle of a picture. */
export function centerCardRect(width: number, height: number): Rect {
  if (width / height > RATIO) {
    const w = height * RATIO;
    return { x: (width - w) / 2, y: 0, w, h: height };
  }
  const h = width / RATIO;
  return { x: 0, y: (height - h) / 2, w: width, h };
}

function sourceSize(source: CanvasImageSource) {
  if (source instanceof HTMLVideoElement) return { w: source.videoWidth, h: source.videoHeight };
  if (source instanceof HTMLImageElement) return { w: source.naturalWidth, h: source.naturalHeight };
  const { width, height } = source as ImageBitmap; // bitmaps and canvases
  return { w: Number(width), h: Number(height) };
}

/** `r` of `source` on a new canvas `width` px wide. */
function draw(source: CanvasImageSource, r: Rect, width: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round((r.h * canvas.width) / r.w));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return { canvas, pixels: () => ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

/**
 * The card found in `search`, straightened and trimmed to its edges like a scan, with its
 * brightness evened out (D32), as outW×outH RGBA. Null if its edges aren't clear.
 */
function straighten(source: CanvasImageSource, search: Rect, outW: number, outH: number) {
  const small = draw(source, search, DETECT_WIDTH);
  const quad = detectCardQuad(small.pixels(), small.canvas.width, small.canvas.height);
  if (!quad) return null;
  // Sampled at ~2× the output, not from a possibly 4K frame.
  const big = draw(source, search, Math.min(search.w, outW * 2.5));
  const k = big.canvas.width / small.canvas.width;
  const at = (p: { x: number; y: number }) => ({ x: p.x * k, y: p.y * k });
  const scaled: Quad = { tl: at(quad.tl), tr: at(quad.tr), br: at(quad.br), bl: at(quad.bl) };
  return autoLevels(warpCard(big.pixels(), big.canvas.width, big.canvas.height, scaled, outW, outH));
}

/** The card straightened on an outW×outH canvas or, if its edges aren't clear, `fallback` as it is. */
function cardImage(
  source: CanvasImageSource,
  search: Rect,
  fallback: Rect,
  outW: number,
  outH: number,
  /** Off when the picture is already the card: there are no edges around it left to find. */
  findEdges = true,
) {
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d")!;
  try {
    const flat = findEdges ? straighten(source, search, outW, outH) : null;
    if (flat) {
      ctx.putImageData(new ImageData(flat, outW, outH), 0, 0);
      return out;
    }
  } catch {
    // The plain crop below: better than a wrong one.
  }
  ctx.drawImage(source, fallback.x, fallback.y, fallback.w, fallback.h, 0, 0, outW, outH);
  return out;
}

const jpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));

/** Where to look for the card: the guide and a margin around it, which is only where it should be. */
function aroundGuide(source: CanvasImageSource, guide: Rect): Rect {
  const { w, h } = sourceSize(source);
  const mx = guide.w * GUIDE_MARGIN;
  const my = guide.h * GUIDE_MARGIN;
  const x = Math.max(0, guide.x - mx);
  const y = Math.max(0, guide.y - my);
  return { x, y, w: Math.min(w, guide.x + guide.w + mx) - x, h: Math.min(h, guide.y + guide.h + my) - y };
}

/**
 * The card in the scanner's guide (`guide`, in `source` pixels), `height` px tall. 300×419 is
 * the shared photo (~30 KB); the AI and «Para luego» take it bigger.
 */
export function cardInGuideBlob(source: CanvasImageSource, guide: Rect, height = HEIGHT, quality = 0.82) {
  const width = height === HEIGHT ? WIDTH : Math.round(height * RATIO);
  return jpeg(cardImage(source, aroundGuide(source, guide), guide, width, height), quality);
}

/**
 * The card in the guide straightened as the shared photos are, as 300×419 RGBA: what the
 * scanner hashes to recognise it by its photo (D33). Null if its edges aren't clear: a plain
 * crop's hash drifts too far to trust.
 */
export function cardInGuidePixels(source: CanvasImageSource, guide: Rect) {
  try {
    const data = straighten(source, aroundGuide(source, guide), WIDTH, HEIGHT);
    return data && { data, width: WIDTH, height: HEIGHT };
  } catch {
    return null;
  }
}

/**
 * The card anywhere in `area` of `source` (D36): its corners in `source` pixels, or null. What
 * the scanner reads, instead of the guide, when it finds one.
 */
export function findCardIn(source: CanvasImageSource, area: Rect): Quad | null {
  const small = draw(source, area, DETECT_WIDTH);
  const found = findCard(small.pixels(), small.canvas.width, small.canvas.height);
  if (!found) return null;
  const k = area.w / small.canvas.width;
  const at = (p: Pt) => ({ x: area.x + p.x * k, y: area.y + p.y * k });
  const { tl, tr, br, bl } = found.quad;
  return { tl: at(tl), tr: at(tr), br: at(br), bl: at(bl) };
}

/**
 * The card in a picture of it (camera or gallery), as a 300×419 shared photo. A picture that is
 * already cropped to the card is kept whole (`isAlreadyCard`): looking for its edges would find
 * the design's inner frame and cut the borders off.
 */
export function cardInPictureBlob(source: CanvasImageSource) {
  const { w, h } = sourceSize(source);
  const cropped = isAlreadyCard(w, h);
  const whole = { x: 0, y: 0, w, h };
  return jpeg(
    cardImage(source, whole, cropped ? whole : centerCardRect(w, h), WIDTH, HEIGHT, !cropped),
    0.82,
  );
}
