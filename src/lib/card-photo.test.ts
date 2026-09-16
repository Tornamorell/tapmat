import { describe, expect, it } from "vitest";
import { centerCardRect, isAlreadyCard } from "./card-photo";

describe("isAlreadyCard", () => {
  it("accepts a picture already cropped to the card", () => {
    expect(isAlreadyCard(300, 419)).toBe(true); // the shared photo's own size
    expect(isAlreadyCard(672, 936)).toBe(true); // Scryfall's «large»
    expect(isAlreadyCard(63, 88)).toBe(true);
  });

  it("rejects an ordinary photo, 3:4 included", () => {
    // 0.75 against a card's 0.716: close, but these are photos OF a card, with a table around
    // it, and they do need finding and straightening.
    expect(isAlreadyCard(1200, 1600)).toBe(false);
    expect(isAlreadyCard(1080, 1920)).toBe(false);
    expect(isAlreadyCard(1000, 1000)).toBe(false);
    expect(isAlreadyCard(1600, 1200)).toBe(false);
  });

  it("copes with an empty picture", () => {
    expect(isAlreadyCard(300, 0)).toBe(false);
    expect(isAlreadyCard(0, 419)).toBe(false);
  });
});

describe("centerCardRect", () => {
  it("takes the tallest card-shaped rectangle from a wide picture", () => {
    const r = centerCardRect(1600, 1200);
    expect(r.h).toBe(1200);
    expect(r.w / r.h).toBeCloseTo(63 / 88, 5);
    expect(r.x + r.w / 2).toBeCloseTo(800);
  });

  it("takes the widest from a tall picture", () => {
    const r = centerCardRect(1080, 1920);
    expect(r.w).toBe(1080);
    expect(r.w / r.h).toBeCloseTo(63 / 88, 5);
    expect(r.y + r.h / 2).toBeCloseTo(960);
  });
});
