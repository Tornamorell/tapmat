import type { CatalogCardRow, SetRow } from "@/lib/scryfall/map";
import { normalizeForSearch } from "@/lib/search/normalize";
import type {
  TcgdexCard,
  TcgdexSet,
  TcgdexTcgplayerPrice,
  TcgdexTcgplayerVariantPrice,
  TcgdexVariants,
} from "./types";

/** Pokémon TCG Pocket is digital-only: not part of the catalog. */
export const EXCLUDED_SERIES = ["tcgp"];

// TCGdex spells some rarities two ways.
const RARITY_ALIASES: Record<string, string> = { "holo rare": "rare holo" };

/** Rarities are stored lowercased; labels live in src/lib/games.ts. */
export function normalizeRarity(rarity: string | null | undefined): string | null {
  if (!rarity) return null;
  const value = rarity.trim().toLowerCase();
  return RARITY_ALIASES[value] ?? value;
}

function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function tcgplayerMarket(tp: TcgdexTcgplayerPrice | null | undefined, variants: string[]) {
  for (const key of variants) {
    const v = tp?.[key];
    if (v && typeof v === "object") {
      const p = v as TcgdexTcgplayerVariantPrice;
      const price = positive(p.marketPrice) ?? positive(p.midPrice);
      if (price != null) return price;
    }
  }
  return null;
}

/**
 * Pokémon variants mapped onto our finishes: `nonfoil` is the card as printed (normal or
 * holo — for holo rares the holo *is* the standard print) and `foil` is the reverse holo.
 * See D18 in docs/decisions.md.
 */
export function pokemonFinishes(v: TcgdexVariants | undefined): string[] {
  const finishes: string[] = [];
  if (!v || v.normal || v.holo || v.firstEdition || !v.reverse) finishes.push("nonfoil");
  if (v?.reverse) finishes.push("foil");
  return finishes;
}

const CATEGORY_ES: Record<string, string> = {
  Pokemon: "Pokémon",
  Trainer: "Entrenador",
  Energy: "Energía",
};
const STAGE_ES: Record<string, string> = {
  Basic: "Básico",
  Stage1: "Fase 1",
  Stage2: "Fase 2",
  BREAK: "TURBO",
  LEVEL_UP: "Nivel superior",
  RESTORED: "Restaurado",
};
const TYPE_ES: Record<string, string> = {
  Grass: "Planta",
  Fire: "Fuego",
  Water: "Agua",
  Lightning: "Rayo",
  Psychic: "Psíquico",
  Fighting: "Lucha",
  Darkness: "Oscuridad",
  Metal: "Metálico",
  Fairy: "Hada",
  Dragon: "Dragón",
  Colorless: "Incoloro",
};
const TRAINER_ES: Record<string, string> = {
  Item: "Objeto",
  Supporter: "Partidario",
  Stadium: "Estadio",
  Tool: "Herramienta",
};
const ENERGY_ES: Record<string, string> = { Normal: "Básica", Special: "Especial" };

/** "Pokémon · Fase 2 · Fuego", "Entrenador · Partidario", "Energía · Básica". */
export function pokemonTypeLine(card: TcgdexCard): string | null {
  const parts = [
    card.category ? (CATEGORY_ES[card.category] ?? card.category) : null,
    card.stage ? (STAGE_ES[card.stage] ?? card.stage) : null,
    card.types?.length ? card.types.map((t) => TYPE_ES[t] ?? t).join("/") : null,
    card.trainerType ? (TRAINER_ES[card.trainerType] ?? card.trainerType) : null,
    card.energyType ? (ENERGY_ES[card.energyType] ?? card.energyType) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Maps a full TCGdex card to a catalog row. Prices: Cardmarket `trend` (EUR) for the card as
 * printed and `trend-holo` for its reverse holo; TCGplayer market price as USD reference.
 */
export function mapTcgdexCard(
  card: TcgdexCard,
  set: { releasedAt: string | null },
  fetchedAt: Date,
): CatalogCardRow {
  const cm = card.pricing?.cardmarket ?? null;
  const tp = card.pricing?.tcgplayer ?? null;
  const finishes = pokemonFinishes(card.variants);
  const hasReverse = finishes.includes("foil");

  return {
    game: "pokemon",
    externalId: card.id,
    // No cross-set card identity in TCGdex: group "other printings" by name (D19).
    oracleId: `pokemon:${normalizeForSearch(card.name)}`,
    name: card.name,
    searchName: normalizeForSearch(card.name),
    setCode: card.set.id,
    collectorNumber: card.localId,
    rarity: normalizeRarity(card.rarity),
    typeLine: pokemonTypeLine(card),
    finishes,
    imageSmall: card.image ? `${card.image}/low.webp` : null,
    imageNormal: card.image ? `${card.image}/high.webp` : null,
    releasedAt: set.releasedAt,
    cardmarketId: cm?.idProduct ?? null,
    priceEur: positive(cm?.trend) ?? positive(cm?.avg),
    priceEurFoil: hasReverse ? (positive(cm?.["trend-holo"]) ?? positive(cm?.["avg-holo"])) : null,
    // TCGplayer variant keys as returned by TCGdex (kebab-case), e.g. "reverse-holofoil".
    priceUsd: tcgplayerMarket(tp, [
      "normal",
      "holofoil",
      "1st-edition-holofoil",
      "1st-edition-normal",
      "unlimited-holofoil",
    ]),
    priceUsdFoil: hasReverse ? tcgplayerMarket(tp, ["reverse-holofoil", "reverseHolofoil"]) : null,
    pricesUpdatedAt: cm?.updated ? new Date(cm.updated) : fetchedAt,
  };
}

/**
 * Where a set's symbol may really be, best first. The API advertises it under `/univ/`, but that
 * file is almost never there: of the 169 sets that advertise a symbol, 148 keep it under the
 * language path (`/en/…`) and exactly one (me05) only under `/univ/`. And four sets don't
 * advertise one at all yet still keep it where the others do (me02, mep, ex5.5, exu), so the
 * conventional path is built from the serie and the code as a last try.
 *
 * Checked 2026-09-16. The caller keeps the first that really is an image (`assetExists`), because
 * the asset host answers 200 with an HTML page for anything it hasn't got.
 */
export function symbolCandidates(
  symbol: string | undefined | null,
  serie?: string,
  code?: string,
): string[] {
  const urls = symbol ? [`${symbol.replace("/univ/", "/en/")}.png`, `${symbol}.png`] : [];
  if (serie && code) urls.push(`https://assets.tcgdex.net/en/${serie}/${code}/symbol.png`);
  return [...new Set(urls)];
}

export function mapTcgdexSet(set: TcgdexSet, iconUri: string | null): SetRow {
  return {
    game: "pokemon",
    code: set.id,
    name: set.name,
    // Pokémon sets have no type; the series (sv, swsh, sm…) drives browsing groups instead.
    setType: set.serie.id,
    parentSetCode: null,
    releasedAt: set.releaseDate ?? null,
    iconUri,
    cardCount: set.cardCount.total,
    // Printed on Scarlet & Violet cards onwards ("PAL EN"); older ones only show a symbol.
    printCode: set.abbreviation?.official ?? null,
    printedTotal: set.cardCount.official || null,
  };
}
