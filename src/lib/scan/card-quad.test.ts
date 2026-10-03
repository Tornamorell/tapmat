import { describe, expect, it } from "vitest";
import { applyHomography, autoLevels, detectCardQuad, homography, warpCard, type Pt, type Quad } from "./card-quad";

type Rgb = [number, number, number];
const W = 360;
const H = 480;

/** A card-shaped quad: `width` px wide, centred, turned `deg` clockwise. */
function cardAt(width: number, deg: number): Pt[] {
  const t = (deg * Math.PI) / 180;
  const hw = width / 2;
  const hh = width / (63 / 88) / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => ({ x: W / 2 + x * Math.cos(t) - y * Math.sin(t), y: H / 2 + x * Math.sin(t) + y * Math.cos(t) }));
}

const UNIT = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/**
 * A photo: a noisy cloth, and the card at `corners` painted by `design(u, v)` (0–1 across and
 * down the card). With `sleeve`, the card is in a clear sleeve with those corners: a thin glint
 * along its edge, the cloth a shade lighter through the plastic.
 */
function photo(
  corners: Pt[],
  cloth: Rgb,
  design: (u: number, v: number) => Rgb,
  sleeve?: Pt[],
  /** A thicker, hazier sleeve: no glint, the cloth paler through it. */
  hazy = false,
): Uint8ClampedArray {
  const toCard = homography(corners, UNIT);
  const toSleeve = sleeve && homography(sleeve, UNIT);
  const sleeveW = sleeve ? Math.hypot(sleeve[1].x - sleeve[0].x, sleeve[1].y - sleeve[0].y) : 1;
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 30;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { x: u, y: v } = applyHomography(toCard, { x: x + 0.5, y: y + 0.5 });
      const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      const n = noise();
      let rgb = inside ? design(u, v) : (cloth.map((c) => c + n) as Rgb);
      if (toSleeve && !inside) {
        const s = applyHomography(toSleeve, { x: x + 0.5, y: y + 0.5 });
        // Distance to the sleeve's edge, in pixels (roughly: the sleeve is nearly upright).
        const d = Math.min(s.x, 1 - s.x, (s.y * 88) / 63, ((1 - s.y) * 88) / 63) * sleeveW;
        if (hazy && d >= 0) rgb = rgb.map((c, i) => c * 0.85 + [160, 160, 150][i] * 0.15) as Rgb;
        else if (d > -1 && d < 1.5) rgb = [225, 225, 225];
        else if (d >= 1.5) rgb = rgb.map((c) => c + 15) as Rgb;
      }
      img.set([...rgb, 255], (y * W + x) * 4);
    }
  }
  return img;
}

/** A printed design: white border, a gold inner frame, diagonal purple stripes. */
function design(u: number, v: number): Rgb {
  if (u < 0.03 || u > 0.97 || v < 0.02 || v > 0.98) return [235, 235, 230];
  if (Math.abs(u - 0.08) < 0.01 || Math.abs(u - 0.92) < 0.01 || Math.abs(v - 0.06) < 0.008) return [200, 160, 60];
  return Math.floor((u + v) * 12) % 2 ? [90, 40, 140] : [150, 90, 200];
}

const RED_CLOTH: Rgb = [150, 30, 40];

function worstError(q: Quad | null, corners: Pt[]) {
  expect(q).not.toBeNull();
  const got = [q!.tl, q!.tr, q!.br, q!.bl];
  return Math.max(...got.map((p, i) => Math.hypot(p.x - corners[i].x, p.y - corners[i].y)));
}

describe("detectCardQuad", () => {
  it("finds a turned card on a cloth", () => {
    const corners = cardAt(250, 7);
    const q = detectCardQuad(photo(corners, RED_CLOTH, design), W, H);
    expect(worstError(q, corners)).toBeLessThan(2.5);
    expect(q!.inferred).toBeUndefined();
  });

  it("finds a weak edge: green grass printed next to a green mat", () => {
    const corners = cardAt(250, -5);
    const mat: Rgb = [40, 120, 60];
    const grassy = (u: number, v: number): Rgb => (v > 0.75 ? [52, 132, 72] : design(u, v));
    const q = detectCardQuad(photo(corners, mat, grassy), W, H);
    expect(worstError(q, corners)).toBeLessThan(3);
  });

  it("finds the card, not the clear sleeve around it", () => {
    const corners = cardAt(250, 6);
    const sleeve = cardAt(262, 6); // ~1.5 mm of plastic on each side
    const q = detectCardQuad(photo(corners, RED_CLOTH, design, sleeve), W, H);
    expect(worstError(q, corners)).toBeLessThan(2.5);
  });

  it("finds the card in a sleeve on a dark mat", () => {
    const corners = cardAt(240, -4);
    const sleeve = cardAt(254, -4);
    const q = detectCardQuad(photo(corners, [30, 30, 35], design, sleeve), W, H);
    expect(worstError(q, corners)).toBeLessThan(2.5);
  });

  it("finds the card in a hazy sleeve, with the cloth paler through the plastic", () => {
    // Measured on a real photo (2026-10-03): red mat 205/58/55, through the sleeve 190/76/68,
    // ~7 px of plastic on the sides and ~12 above the card at this size.
    const corners = cardAt(250, 2);
    const sleeve = cardAt(264, 2).map((p) => ({ x: p.x, y: p.y - 3 }));
    const q = detectCardQuad(photo(corners, [205, 58, 55], design, sleeve, true), W, H);
    expect(worstError(q, corners)).toBeLessThan(2.5);
  });

  it("keeps a card's border that is close to the cloth but not the cloth", () => {
    // A pale pink border on a red cloth: the border's colour differs from the cloth by as much
    // as the design inside does, so it isn't taken for plastic.
    const corners = cardAt(250, 3);
    const pink = (u: number, v: number): Rgb =>
      u < 0.03 || u > 0.97 || v < 0.02 || v > 0.98 ? [230, 140, 140] : design(u, v);
    const q = detectCardQuad(photo(corners, RED_CLOTH, pink), W, H);
    expect(worstError(q, corners)).toBeLessThan(2.5);
  });

  it("finds the card slid to the bottom of its sleeve", () => {
    const corners = cardAt(250, 0);
    // 15 px of empty plastic above the card, 1 px below.
    const sleeve = cardAt(262, 0).map((p) => ({ x: p.x, y: p.y - 7 }));
    const q = detectCardQuad(photo(corners, [40, 120, 60], design, sleeve), W, H);
    expect(worstError(q, corners)).toBeLessThan(2.5);
  });

  it("deduces a side that fades into the background", () => {
    const corners = cardAt(250, 4);
    // The card's lower part fades smoothly into the cloth: no edge to find there.
    const fading = (u: number, v: number): Rgb => {
      if (v < 0.6) return design(u, v);
      const t = Math.min(1, (v - 0.6) / 0.3);
      const d = design(u, 0.59);
      return d.map((c, i) => c + (RED_CLOTH[i] - c) * t) as Rgb;
    };
    const q = detectCardQuad(photo(corners, RED_CLOTH, fading), W, H);
    expect(q?.inferred).toBe("bottom");
    expect(worstError(q, corners)).toBeLessThan(4);
  });

  it("gives up rather than return the wrong shape", () => {
    const corners = cardAt(250, 3);
    // The bottom fifth of the card is exactly the cloth's colour: the only bottom edge in
    // sight is the design's, and that shape isn't a card.
    const cut = (u: number, v: number): Rgb => (v > 0.8 ? RED_CLOTH : design(u, v));
    expect(detectCardQuad(photo(corners, RED_CLOTH, cut), W, H)).toBeNull();
  });

  it("finds nothing on an empty cloth", () => {
    expect(detectCardQuad(photo([], RED_CLOTH, design).fill(128), W, H)).toBeNull();
  });
});

describe("homography", () => {
  it("maps the four points exactly", () => {
    const from = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 419 },
      { x: 0, y: 419 },
    ];
    const to = cardAt(250, 9);
    const Hm = homography(from, to);
    from.forEach((p, i) => {
      const q = applyHomography(Hm, p);
      expect(q.x).toBeCloseTo(to[i].x, 6);
      expect(q.y).toBeCloseTo(to[i].y, 6);
    });
  });
});

describe("warpCard", () => {
  it("flattens the card: border at the edges, design inside, no cloth", () => {
    const corners = cardAt(250, 7);
    const img = photo(corners, RED_CLOTH, design);
    const [tl, tr, br, bl] = corners;
    const flat = warpCard(img, W, H, { tl, tr, br, bl }, 300, 419);
    const px = (u: number, v: number) => [...flat.slice((v * 300 + u) * 4, (v * 300 + u) * 4 + 3)];
    // Edges: the white border, not the red cloth.
    for (const [u, v] of [[2, 200], [297, 200], [150, 2], [150, 416]]) {
      expect(px(u, v)[0]).toBeGreaterThan(200);
      expect(px(u, v)[1]).toBeGreaterThan(200);
    }
    // Middle: a purple stripe.
    const mid = px(150, 210);
    expect(mid[2]).toBeGreaterThan(mid[1]);
  });
});

describe("autoLevels", () => {
  it("stretches a dull image to full range", () => {
    const img = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) img.set([50 + i, 50 + i, 50 + i, 255], i * 4);
    const out = autoLevels(img);
    expect(out[0]).toBeLessThanOrEqual(3);
    expect(out[99 * 4]).toBeGreaterThanOrEqual(252);
  });

  it("leaves a flat image alone", () => {
    const img = new Uint8ClampedArray(40).fill(120);
    expect(autoLevels(img)).toBe(img);
  });
});
