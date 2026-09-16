import { describe, expect, it } from "vitest";
import {
  mapTcgdexCard,
  mapTcgdexSet,
  normalizeRarity,
  pokemonFinishes,
  pokemonTypeLine,
  symbolCandidates,
} from "./map";
import type { TcgdexCard } from "./types";

const fetchedAt = new Date("2026-09-11T12:00:00Z");

// Shapes taken from real responses of api.tcgdex.net/v2/en/cards/{id} (2026-09-11).
const charizardEx: TcgdexCard = {
  id: "sv03.5-199",
  localId: "199",
  name: "Charizard ex",
  image: "https://assets.tcgdex.net/en/sv/sv03.5/199",
  category: "Pokemon",
  rarity: "Special illustration rare",
  stage: "Stage2",
  types: ["Fire"],
  set: { id: "sv03.5", name: "151" },
  variants: { normal: false, reverse: false, holo: true, firstEdition: false, wPromo: false },
  pricing: {
    cardmarket: {
      updated: "2026-09-11T12:16:24.318Z",
      unit: "EUR",
      idProduct: 733794,
      avg: 368.3,
      trend: 377.84,
      "trend-holo": 0,
    },
    tcgplayer: { unit: "USD", holofoil: { marketPrice: 366.83, midPrice: 395 } },
  },
};

const bulbasaur: TcgdexCard = {
  id: "sv03.5-001",
  localId: "001",
  name: "Bulbasaur",
  image: "https://assets.tcgdex.net/en/sv/sv03.5/001",
  category: "Pokemon",
  rarity: "Common",
  set: { id: "sv03.5", name: "151" },
  variants: { normal: true, reverse: true, holo: false },
  pricing: {
    cardmarket: { idProduct: 1, trend: 0.12, "trend-holo": 0.45 },
    tcgplayer: { normal: { marketPrice: 0.1 }, "reverse-holofoil": { marketPrice: 0.5 } },
  },
};

describe("mapTcgdexCard", () => {
  it("maps a holo-only card: printed price, no reverse price", () => {
    const row = mapTcgdexCard(charizardEx, { releasedAt: "2023-09-22" }, fetchedAt);
    expect(row).toMatchObject({
      game: "pokemon",
      externalId: "sv03.5-199",
      oracleId: "pokemon:charizard ex",
      searchName: "charizard ex",
      setCode: "sv03.5",
      collectorNumber: "199",
      rarity: "special illustration rare",
      typeLine: "Pokémon · Fase 2 · Fuego",
      finishes: ["nonfoil"],
      imageSmall: "https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp",
      imageNormal: "https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp",
      releasedAt: "2023-09-22",
      cardmarketId: 733794,
      priceEur: 377.84,
      priceEurFoil: null,
      priceUsd: 366.83,
      priceUsdFoil: null,
    });
    expect(row.pricesUpdatedAt).toEqual(new Date("2026-09-11T12:16:24.318Z"));
  });

  it("maps the reverse holo price onto the foil finish", () => {
    const row = mapTcgdexCard(bulbasaur, { releasedAt: null }, fetchedAt);
    expect(row.finishes).toEqual(["nonfoil", "foil"]);
    expect(row.priceEur).toBe(0.12);
    expect(row.priceEurFoil).toBe(0.45);
    expect(row.priceUsdFoil).toBe(0.5);
  });

  it("treats zero prices as missing and tolerates cards without pricing or image", () => {
    const row = mapTcgdexCard(
      { ...bulbasaur, image: undefined, pricing: { cardmarket: { trend: 0, avg: 0 } } },
      { releasedAt: null },
      fetchedAt,
    );
    expect(row.priceEur).toBeNull();
    expect(row.imageSmall).toBeNull();
    expect(row.pricesUpdatedAt).toBe(fetchedAt);
  });
});

describe("helpers", () => {
  it("normalizes rarity spelling", () => {
    expect(normalizeRarity("Holo Rare")).toBe("rare holo");
    expect(normalizeRarity("Rare Holo")).toBe("rare holo");
    expect(normalizeRarity(undefined)).toBeNull();
  });

  it("derives finishes from variants", () => {
    expect(pokemonFinishes(undefined)).toEqual(["nonfoil"]);
    expect(pokemonFinishes({ reverse: true })).toEqual(["foil"]);
    expect(pokemonFinishes({ normal: true, reverse: true })).toEqual(["nonfoil", "foil"]);
  });

  it("builds a Spanish type line for trainers", () => {
    expect(
      pokemonTypeLine({ ...bulbasaur, category: "Trainer", trainerType: "Supporter", types: undefined }),
    ).toBe("Entrenador · Partidario");
  });

  it("uses the series as set type", () => {
    const row = mapTcgdexSet(
      {
        id: "sv03.5",
        name: "151",
        releaseDate: "2023-09-22",
        serie: { id: "sv", name: "Scarlet & Violet" },
        cardCount: { total: 207, official: 165 },
        cards: [],
      },
      null,
    );
    expect(row).toMatchObject({ game: "pokemon", code: "sv03.5", setType: "sv", cardCount: 207 });
  });
});

describe("symbolCandidates", () => {
  it("tries the language path first, then the one the API advertises", () => {
    // 148 of the 169 sets that advertise a symbol keep it under /en/; me05 only under /univ/.
    expect(symbolCandidates("https://assets.tcgdex.net/univ/me/me01/symbol", "me", "me01")).toEqual([
      "https://assets.tcgdex.net/en/me/me01/symbol.png",
      "https://assets.tcgdex.net/univ/me/me01/symbol.png",
    ]);
  });

  it("builds the usual path for a set that advertises no symbol (me02, mep)", () => {
    expect(symbolCandidates(null, "me", "me02")).toEqual([
      "https://assets.tcgdex.net/en/me/me02/symbol.png",
    ]);
  });

  it("doesn't repeat a candidate", () => {
    expect(symbolCandidates("https://assets.tcgdex.net/en/me/me03/symbol", "me", "me03")).toEqual([
      "https://assets.tcgdex.net/en/me/me03/symbol.png",
    ]);
  });

  it("has nothing to try without a symbol and without a set", () => {
    expect(symbolCandidates(null)).toEqual([]);
    expect(symbolCandidates(undefined, "me")).toEqual([]);
  });
});
