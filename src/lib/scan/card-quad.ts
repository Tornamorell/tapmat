// Finds a card's four corners in a photo and flattens it to a straight, card-shaped image, like
// a scan (D32). Pure: RGBA arrays in and out, so it runs on canvas ImageData in the browser and
// in tests. The canvas side is in src/lib/card-photo.ts.

export type Pt = { x: number; y: number };
export type Side = "left" | "right" | "top" | "bottom";
export type Quad = {
  tl: Pt;
  tr: Pt;
  br: Pt;
  bl: Pt;
  /** A side that wasn't visible, deduced from the other three and the card's 63×88 shape. */
  inferred?: Side;
};

const CARD_RATIO = 63 / 88;
const LINES = 48; // scan lines per side
const MIN_EDGE = 90; // weakest gradient (sum of the three Sobel channels) considered at all
const MIN_SUPPORT = 12; // scan lines that must agree on a side
const PEAKS_PER_LINE = 5;
const STEP_GAPS = [2, 3, 4, 5, 6]; // px from a candidate, each side, where the mat may show
const MATCH = 0.25; // colours this close to the mat, per unit of the candidate's contrast, are the mat's

/** A 3×3 box blur of the RGB channels: cloth or wood texture shouldn't look like an edge. */
export function blurRgb(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            sum += rgba[(yy * w + xx) * 4 + c];
            n++;
          }
        }
        out[(y * w + x) * 3 + c] = sum / n;
      }
    }
  }
  return out;
}

/** Horizontal and vertical Sobel, summed over R, G and B: a red cloth next to a white border counts. */
export function gradients(rgb: Float32Array, w: number, h: number) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const p = (x: number, y: number, c: number) => rgb[(y * w + x) * 3 + c];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0;
      let sy = 0;
      for (let c = 0; c < 3; c++) {
        sx += Math.abs(
          p(x + 1, y - 1, c) + 2 * p(x + 1, y, c) + p(x + 1, y + 1, c) -
            p(x - 1, y - 1, c) - 2 * p(x - 1, y, c) - p(x - 1, y + 1, c),
        );
        sy += Math.abs(
          p(x - 1, y + 1, c) + 2 * p(x, y + 1, c) + p(x + 1, y + 1, c) -
            p(x - 1, y - 1, c) - 2 * p(x, y - 1, c) - p(x + 1, y - 1, c),
        );
      }
      gx[y * w + x] = sx;
      gy[y * w + x] = sy;
    }
  }
  return { gx, gy };
}

type Candidate = Pt & { line: number; /** Distance from the image edge. */ depth: number };

/**
 * Along scan lines across one side of the image, the strongest local maxima of the gradient.
 * The card's border is one of them, though not always the strongest (green grass printed next
 * to a green mat) nor the first from outside (a mat's texture). Corners are skipped: rounded.
 *
 * Not a clear sleeve's edge: a thin glint with the mat on both sides, seen through the plastic
 * inside. It's straight and further out than the card, so `fitSide` would take it for its side.
 */
function edgeCandidates(
  side: Side,
  rgb: Float32Array,
  g: { gx: Float32Array; gy: Float32Array },
  w: number,
  h: number,
  band: number,
): Candidate[] {
  const out: Candidate[] = [];
  const horizontal = side === "left" || side === "right"; // the scan line runs along x
  const size = horizontal ? w : h;
  const len = Math.round(band * size);
  const fromStart = side === "left" || side === "top";
  const values = new Float32Array(len);
  const at = (fixed: number, k: number) => {
    const kk = Math.min(size - 1, Math.max(0, k));
    const pos = fromStart ? kk : size - 1 - kk;
    return (horizontal ? fixed * w + pos : pos * w + fixed) * 3;
  };
  const diff = (o: number, i: number) =>
    Math.abs(rgb[o] - rgb[i]) + Math.abs(rgb[o + 1] - rgb[i + 1]) + Math.abs(rgb[o + 2] - rgb[i + 2]);
  // Seen through on both sides: a few px outside the candidate and a few inside, the mat's colour
  // (the line's outer end), compared with how far from it the candidate strays. Each side at its
  // own distance: the glint is a pixel or two, the plastic beyond it may be as narrow.
  const seeThrough = (fixed: number, k: number) => {
    const mat = at(fixed, 1);
    let contrast = 0;
    for (let d = 0; d <= STEP_GAPS.at(-1)!; d++) {
      contrast = Math.max(contrast, diff(at(fixed, k - d), mat), diff(at(fixed, k + d), mat));
    }
    const isMat = (d: number) => diff(at(fixed, k + d), mat) < MATCH * contrast;
    return STEP_GAPS.some((d) => isMat(-d)) && STEP_GAPS.some(isMat);
  };
  for (let i = 0; i < LINES; i++) {
    const fixed = Math.round((0.12 + (0.76 * i) / (LINES - 1)) * (horizontal ? h : w));
    let max = 0;
    for (let k = 1; k < len; k++) {
      const pos = fromStart ? k : size - 1 - k;
      values[k] = horizontal ? g.gx[fixed * w + pos] : g.gy[pos * w + fixed];
      if (values[k] > max) max = values[k];
    }
    const peaks: { k: number; v: number }[] = [];
    for (let k = 2; k < len - 1; k++) {
      const v = values[k];
      if (v >= MIN_EDGE && v >= 0.15 * max && v >= values[k - 1] && v > values[k + 1]) peaks.push({ k, v });
    }
    peaks.sort((a, b) => b.v - a.v);
    const solid = peaks.filter(({ k }) => !seeThrough(fixed, k));
    for (const { k } of solid.slice(0, PEAKS_PER_LINE)) {
      const pos = fromStart ? k : size - 1 - k;
      out.push({ ...(horizontal ? { x: pos, y: fixed } : { x: fixed, y: pos }), line: i, depth: k });
    }
  }
  return out;
}

export type Line = { a: number; b: number }; // vertical sides: x = a·y + b; horizontal: y = a·x + b

/**
 * The card's side among the candidates: of the straight lines that many scan lines agree on,
 * the outermost. The design's inner frame is straight too, but inside.
 */
function fitSide(cands: Candidate[], vertical: boolean, tol = 1.5): Line | null {
  const u = (p: Pt) => (vertical ? p.y : p.x);
  const v = (p: Pt) => (vertical ? p.x : p.y);
  const found: { support: number; depth: number; inliers: Candidate[] }[] = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      // Points far apart along the side pin the line down; neighbours don't.
      if (Math.abs(cands[i].line - cands[j].line) < 8) continue;
      const a = (v(cands[j]) - v(cands[i])) / (u(cands[j]) - u(cands[i]));
      if (Math.abs(a) > 0.3) continue; // no side is tilted more than ~17° in the guide
      const b = v(cands[i]) - a * u(cands[i]);
      // Per scan line, the candidate closest to the line, if within tolerance.
      const byLine = new Map<number, Candidate>();
      for (const c of cands) {
        const d = Math.abs(v(c) - (a * u(c) + b));
        if (d > tol) continue;
        const seen = byLine.get(c.line);
        if (!seen || d < Math.abs(v(seen) - (a * u(seen) + b))) byLine.set(c.line, c);
      }
      if (byLine.size < MIN_SUPPORT) continue;
      const inliers = [...byLine.values()];
      found.push({ support: inliers.length, depth: inliers.reduce((s, c) => s + c.depth, 0) / inliers.length, inliers });
    }
  }
  if (!found.length) return null;
  const best = Math.max(...found.map((f) => f.support));
  const pick = found
    .filter((f) => f.support >= 0.6 * best)
    .reduce((p, f) => (f.depth < p.depth - 1 || (Math.abs(f.depth - p.depth) <= 1 && f.support > p.support) ? f : p));

  // Least squares on the chosen line's points.
  const pts = pick.inliers;
  const n = pts.length;
  const su = pts.reduce((s, p) => s + u(p), 0);
  const sv = pts.reduce((s, p) => s + v(p), 0);
  const suu = pts.reduce((s, p) => s + u(p) * u(p), 0);
  const suv = pts.reduce((s, p) => s + u(p) * v(p), 0);
  const den = n * suu - su * su;
  if (Math.abs(den) < 1e-9) return null;
  const a = (n * suv - su * sv) / den;
  return { a, b: (sv - a * su) / n };
}

/** Where a vertical-ish side (x = a·y + b) meets a horizontal-ish one (y = a·x + b). */
export function meet(vertical: Line, horizontal: Line): Pt {
  const x = (vertical.a * horizontal.b + vertical.b) / (1 - vertical.a * horizontal.a);
  return { x, y: horizontal.a * x + horizontal.b };
}

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
const along = (p: Pt, dx: number, dy: number, len: number): Pt => {
  const n = Math.hypot(dx, dy);
  return { x: p.x + (dx / n) * len, y: p.y + (dy / n) * len };
};

/** The quad from three sides: the fourth is where a 63×88 card would end. */
function complete(s: Record<Side, Line | null>, missing: Side): Quad | null {
  const { left, right, top, bottom } = s;
  if (missing === "bottom" && left && right && top) {
    const tl = meet(left, top);
    const tr = meet(right, top);
    const len = dist(tl, tr) / CARD_RATIO;
    return { tl, tr, br: along(tr, right.a, 1, len), bl: along(tl, left.a, 1, len), inferred: "bottom" };
  }
  if (missing === "top" && left && right && bottom) {
    const bl = meet(left, bottom);
    const br = meet(right, bottom);
    const len = dist(bl, br) / CARD_RATIO;
    return { tl: along(bl, -left.a, -1, len), tr: along(br, -right.a, -1, len), br, bl, inferred: "top" };
  }
  if (missing === "left" && right && top && bottom) {
    const tr = meet(right, top);
    const br = meet(right, bottom);
    const len = dist(tr, br) * CARD_RATIO;
    return { tl: along(tr, -1, -top.a, len), tr, br, bl: along(br, -1, -bottom.a, len), inferred: "left" };
  }
  if (missing === "right" && left && top && bottom) {
    const tl = meet(left, top);
    const bl = meet(left, bottom);
    const len = dist(tl, bl) * CARD_RATIO;
    return { tl, tr: along(tl, 1, top.a, len), br: along(bl, 1, bottom.a, len), bl, inferred: "right" };
  }
  return null;
}

/**
 * The card's corners in an RGBA image where it fills most of the frame (the scanner's guide
 * with a margin, or a photo of one card). Its edges are searched in the outer `band` of each
 * side. Null when they aren't clear enough to trust: better the plain crop than a wrong one.
 */
export function detectCardQuad(rgba: ArrayLike<number>, w: number, h: number, band = 0.3): Quad | null {
  const rgb = blurRgb(rgba, w, h);
  const g = gradients(rgb, w, h);
  const sides: Record<Side, Line | null> = {
    left: fitSide(edgeCandidates("left", rgb, g, w, h, band), true),
    right: fitSide(edgeCandidates("right", rgb, g, w, h, band), true),
    top: fitSide(edgeCandidates("top", rgb, g, w, h, band), false),
    bottom: fitSide(edgeCandidates("bottom", rgb, g, w, h, band), false),
  };
  const missing = (Object.keys(sides) as Side[]).filter((s) => !sides[s]);
  if (missing.length > 1) return null;
  const quad: Quad | null = missing.length
    ? complete(sides, missing[0])
    : {
        tl: meet(sides.left!, sides.top!),
        tr: meet(sides.right!, sides.top!),
        br: meet(sides.right!, sides.bottom!),
        bl: meet(sides.left!, sides.bottom!),
      };
  if (!quad) return null;

  // A card: about 63×88, and most of the frame.
  const width = (dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) / 2;
  const height = (dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) / 2;
  if (Math.abs(width / height - CARD_RATIO) > 0.12) return null;
  if (width * height < 0.35 * w * h) return null;
  return quad;
}

/** Solves A·x = b (n×n) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** The homography (8 coefficients, the 9th is 1) taking each of 4 `from` points to its `to` point. */
export function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  from.forEach((p, i) => {
    const q = to[i];
    A.push([p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x]);
    b.push(q.x);
    A.push([0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y]);
    b.push(q.y);
  });
  return solve(A, b);
}

export function applyHomography(H: number[], p: Pt): Pt {
  const d = H[6] * p.x + H[7] * p.y + 1;
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / d, y: (H[3] * p.x + H[4] * p.y + H[5]) / d };
}

/**
 * The card flattened to outW×outH RGBA, bilinear. `inset` trims a sliver (a fraction of the
 * width) so no background shows along the edges.
 */
export function warpCard(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  quad: Quad,
  outW: number,
  outH: number,
  inset = 0.01,
): Uint8ClampedArray<ArrayBuffer> {
  const e = inset * outW;
  const H = homography(
    [
      { x: -e, y: -e },
      { x: outW + e, y: -e },
      { x: outW + e, y: outH + e },
      { x: -e, y: outH + e },
    ],
    [quad.tl, quad.tr, quad.br, quad.bl],
  );
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const src = applyHomography(H, { x: u + 0.5, y: v + 0.5 });
      const x = Math.min(w - 1.001, Math.max(0, src.x - 0.5));
      const y = Math.min(h - 1.001, Math.max(0, src.y - 0.5));
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const o = (v * outW + u) * 4;
      for (let c = 0; c < 3; c++) {
        const i00 = (y0 * w + x0) * 4 + c;
        const i10 = i00 + 4;
        const i01 = i00 + w * 4;
        const i11 = i01 + 4;
        out[o + c] =
          rgba[i00] * (1 - fx) * (1 - fy) + rgba[i10] * fx * (1 - fy) + rgba[i01] * (1 - fx) * fy + rgba[i11] * fx * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Stretches brightness so the darkest 0.5 % is black and the brightest 0.5 % white. The same
 * curve on every channel, so colours keep their hue.
 */
export function autoLevels(rgba: Uint8ClampedArray<ArrayBuffer>): Uint8ClampedArray<ArrayBuffer> {
  const hist = new Array<number>(256).fill(0);
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    hist[Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2])]++;
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= q * n) return v;
    return 255;
  };
  const lo = pct(0.005);
  const hi = pct(0.995);
  if (hi - lo < 60) return rgba; // a flat image: stretching would only add noise
  const out = new Uint8ClampedArray(rgba.length);
  const k = 255 / (hi - lo);
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) out[i + c] = (rgba[i + c] - lo) * k;
    out[i + 3] = 255;
  }
  return out;
}
