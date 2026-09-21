import { describe, expect, it } from "vitest";
import { itemValueEur, priceSource, sumValue, unitPriceEur } from "./pricing";

const card = { priceEur: 2.06, priceEurFoil: 12.5 };

describe("unitPriceEur", () => {
  it("uses the price matching the finish", () => {
    expect(unitPriceEur("nonfoil", card)).toBe(2.06);
    expect(unitPriceEur("foil", card)).toBe(12.5);
  });

  it("has no price for etched foils or cards without catalog entry", () => {
    expect(unitPriceEur("etched", card)).toBeNull();
    expect(unitPriceEur("nonfoil", null)).toBeNull();
  });
});

describe("itemValueEur", () => {
  it("prefers your own estimate over the market price", () => {
    expect(itemValueEur("nonfoil", card, 450)).toBe(450);
    expect(itemValueEur("etched", card, 30)).toBe(30);
    expect(itemValueEur("nonfoil", null, 12)).toBe(12);
  });

  it("falls back to the market price for the finish", () => {
    expect(itemValueEur("foil", card, null)).toBe(12.5);
    expect(itemValueEur("etched", card, undefined)).toBeNull();
  });
});

describe("sumValue", () => {
  it("counts an estimate instead of the market price", () => {
    const value = sumValue([
      { quantity: 1, finish: "nonfoil", card, estimatedValueEur: 100 },
      { quantity: 2, finish: "nonfoil", card },
    ]);
    expect(value).toEqual({ valueEur: 104.12, cardCount: 3, unpricedCount: 0 });
  });

  it("multiplies by quantity and reports unpriced copies separately", () => {
    const value = sumValue([
      { quantity: 3, finish: "nonfoil", card },
      { quantity: 1, finish: "foil", card },
      { quantity: 2, finish: "foil", card: { priceEur: 1, priceEurFoil: null } },
    ]);
    expect(value).toEqual({ valueEur: 18.68, cardCount: 6, unpricedCount: 2 });
  });

  it("is zero for an empty collection", () => {
    expect(sumValue([])).toEqual({ valueEur: 0, cardCount: 0, unpricedCount: 0 });
  });
});

describe("priceSource", () => {
  it("says so when the value is your own estimate", () => {
    expect(priceSource({ estimatedValueEur: 450, unitPriceEur: 450 })).toBe("estimate");
    // An estimate wins even on a slab: that's the case we want people to reach.
    expect(priceSource({ estimatedValueEur: 450, gradingCompany: "PSA", unitPriceEur: 450 })).toBe(
      "estimate",
    );
  });

  it("flags a slab still valued at the loose card's price", () => {
    expect(priceSource({ gradingCompany: "PSA", unitPriceEur: 591.15 })).toBe("graded-raw");
    expect(priceSource({ estimatedValueEur: null, gradingCompany: "BGS", unitPriceEur: 10 })).toBe(
      "graded-raw",
    );
  });

  it("is plain market data for an ungraded copy", () => {
    expect(priceSource({ unitPriceEur: 2.06 })).toBe("market");
    expect(priceSource({ estimatedValueEur: null, gradingCompany: null, unitPriceEur: 2.06 })).toBe(
      "market",
    );
  });

  it("has no source without a price, graded or not", () => {
    expect(priceSource({ unitPriceEur: null })).toBe("none");
    expect(priceSource({ gradingCompany: "PSA", unitPriceEur: null })).toBe("none");
    expect(priceSource({})).toBe("none");
  });
});
