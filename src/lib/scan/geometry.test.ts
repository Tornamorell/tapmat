import { describe, expect, it } from "vitest";
import {
  CARD_RATIO,
  coverTransform,
  fromVideo,
  DEFAULT_GUIDE,
  FOUND_INFO_STRIPS,
  GUIDE_FILL,
  guideIn,
  guideRect,
  pickFoundStrip,
  placeGuide,
  stripRect,
  stripUnion,
  toVideo,
} from "./geometry";

describe("placeGuide", () => {
  const area = { x: 0, y: 64, w: 400, h: 700 };
  const full = guideIn(area, GUIDE_FILL);
  const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2];

  it("is the full guide, centred, by default", () => {
    expect(placeGuide(area, DEFAULT_GUIDE)).toEqual(full);
  });

  it("shrinks around its centre and keeps the card's shape", () => {
    const g = placeGuide(area, { scale: 0.5, dx: 0, dy: 0 });
    expect(g.w).toBeCloseTo(full.w / 2);
    expect(g.w / g.h).toBeCloseTo(CARD_RATIO);
    expect(centre(g)).toEqual(centre(full));
  });

  it("moves by fractions of the area, but never out of it", () => {
    const moved = placeGuide(area, { scale: 0.5, dx: 0.1, dy: 0.2 });
    expect(centre(moved)[0]).toBeCloseTo(240);
    expect(centre(moved)[1]).toBeCloseTo(64 + 350 + 140);
    const far = placeGuide(area, { scale: 0.5, dx: 5, dy: -5 });
    expect(far.x + far.w).toBeCloseTo(400);
    expect(far.y).toBeCloseTo(64);
  });

  it("copes with whatever was stored", () => {
    expect(placeGuide(area, { scale: 0.05, dx: Number.NaN, dy: 0 }).w).toBeCloseTo(full.w * 0.3);
    expect(placeGuide(area, { scale: 9, dx: 0, dy: 0 })).toEqual(full);
  });
});

describe("guideRect", () => {
  it("is limited by height on a landscape frame and centered", () => {
    const g = guideRect(1920, 1080);
    expect(g.h).toBeCloseTo(1080 * 0.86);
    expect(g.w / g.h).toBeCloseTo(CARD_RATIO);
    expect(g.x + g.w / 2).toBeCloseTo(960);
  });

  it("is limited by width on a narrow portrait frame", () => {
    const g = guideRect(600, 1400);
    expect(g.w).toBeCloseTo(600 * 0.86);
    expect(g.y + g.h / 2).toBeCloseTo(700);
  });
});

describe("guideIn", () => {
  it("offsets the guide into the given area", () => {
    const g = guideIn({ x: 0, y: 60, w: 390, h: 580 });
    expect(g.y + g.h / 2).toBeCloseTo(60 + 290);
    expect(g.w / g.h).toBeCloseTo(CARD_RATIO);
  });
});

describe("stripRect", () => {
  it("maps the info strip into frame coordinates", () => {
    const s = stripRect({ x: 100, y: 50, w: 630, h: 880 });
    expect(s.x).toBeCloseTo(100 + 630 * 0.02);
    expect(s.y).toBeCloseTo(50 + 880 * 0.895);
    expect(s.w).toBeCloseTo(630 * 0.48);
    expect(s.h).toBeCloseTo(880 * 0.095);
  });
});

describe("stripUnion", () => {
  it("covers both strips of a found card: on the card and below its inner frame", () => {
    expect(stripUnion(FOUND_INFO_STRIPS.card, FOUND_INFO_STRIPS.frame)).toEqual({
      x0: 0,
      x1: 0.5,
      y0: 0.895,
      y1: 1.09,
    });
  });
});

describe("pickFoundStrip", () => {
  it("takes turns until one strip has read a card", () => {
    expect([0, 1, 2, 3].map((turn) => pickFoundStrip(null, 0, turn))).toEqual(["card", "frame", "card", "frame"]);
  });

  it("keeps the one that read, and looks at the other every fourth miss in a row", () => {
    expect([0, 1, 3, 4, 5, 8].map((misses) => pickFoundStrip("card", misses, 7))).toEqual([
      "card",
      "card",
      "card",
      "frame",
      "card",
      "frame",
    ]);
  });
});

describe("coverTransform + toVideo", () => {
  it("maps a screen rect back to video pixels for a cropped portrait view", () => {
    // 1080×1920 portrait video shown full screen on a 390×844 phone.
    const t = coverTransform(1080, 1920, 390, 844);
    expect(t.scale).toBeCloseTo(844 / 1920);
    const r = toVideo({ x: 0, y: 0, w: 390, h: 844 }, t);
    expect(r.y).toBeCloseTo(0);
    expect(r.h).toBeCloseTo(1920);
    // The sides are cropped: the visible width is less than the video's.
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + r.w / 2).toBeCloseTo(540);
  });
});

describe("fromVideo", () => {
  it("puts a video pixel back where toVideo took it from", () => {
    // A 16:9 portrait stream on a phone: cropped top and bottom.
    const t = coverTransform(2160, 3840, 390, 635);
    const r = toVideo({ x: 40, y: 100, w: 120, h: 160 }, t);
    const p = fromVideo({ x: r.x, y: r.y }, t);
    expect(p.x).toBeCloseTo(40);
    expect(p.y).toBeCloseTo(100);
  });
});
