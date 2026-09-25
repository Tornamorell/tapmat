import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { cardNames, catalogCards, items, locations, sets } from "@/db/schema";
import { unitPriceEurSql } from "@/lib/collection/pricing";

const printingColumns = {
  id: catalogCards.id,
  game: catalogCards.game,
  oracleId: catalogCards.oracleId,
  name: catalogCards.name,
  setCode: catalogCards.setCode,
  setName: sets.name,
  setIcon: sets.iconUri,
  collectorNumber: catalogCards.collectorNumber,
  rarity: catalogCards.rarity,
  typeLine: catalogCards.typeLine,
  finishes: catalogCards.finishes,
  imageSmall: catalogCards.imageSmall,
  imageNormal: catalogCards.imageNormal,
  releasedAt: catalogCards.releasedAt,
  cardmarketId: catalogCards.cardmarketId,
  priceEur: catalogCards.priceEur,
  priceEurFoil: catalogCards.priceEurFoil,
  priceUsd: catalogCards.priceUsd,
  priceUsdFoil: catalogCards.priceUsdFoil,
  pricesUpdatedAt: catalogCards.pricesUpdatedAt,
};

const setJoin = and(eq(sets.game, catalogCards.game), eq(sets.code, catalogCards.setCode));

export type Printing = Awaited<ReturnType<typeof getPrintingsOf>>[number];

export async function getPrinting(id: string) {
  const [row] = await db
    .select(printingColumns)
    .from(catalogCards)
    .leftJoin(sets, setJoin)
    .where(eq(catalogCards.id, id));
  return row ?? null;
}

/** Every paper printing of a card, newest first. */
export async function getPrintingsOf(oracleId: string) {
  return db
    .select(printingColumns)
    .from(catalogCards)
    .leftJoin(sets, setJoin)
    .where(eq(catalogCards.oracleId, oracleId))
    .orderBy(desc(catalogCards.releasedAt), catalogCards.setCode, catalogCards.collectorNumber);
}

export async function getSpanishName(oracleId: string) {
  const [row] = await db
    .select({ printedName: cardNames.printedName })
    .from(cardNames)
    .innerJoin(catalogCards, eq(catalogCards.id, cardNames.catalogCardId))
    .where(and(eq(catalogCards.oracleId, oracleId), eq(cardNames.lang, "es")))
    .limit(1);
  return row?.printedName ?? null;
}

/** The user's stacks of any printing of this card, with what the card page's ⋯ menu edits. */
export async function getOwnedStacks(ownerId: string, oracleId: string) {
  return db
    .select({
      id: items.id,
      quantity: items.quantity,
      finish: items.finish,
      condition: items.condition,
      language: items.language,
      gradingCompany: items.gradingCompany,
      grade: items.grade,
      certNumber: items.certNumber,
      estimatedValueEur: items.estimatedValueEur,
      purchasePriceEur: items.purchasePriceEur,
      notes: items.notes,
      sectionId: items.sectionId,
      name: catalogCards.name,
      game: catalogCards.game,
      finishes: catalogCards.finishes,
      /** Cardmarket's price for the finish: "raw" for a graded copy. */
      marketPriceEur: sql<number | null>`${unitPriceEurSql}::float8`,
      locationId: locations.id,
      locationName: locations.name,
      printingId: catalogCards.id,
      setCode: catalogCards.setCode,
      collectorNumber: catalogCards.collectorNumber,
      /** Each stack may be a different printing of the card: its own art tells them apart. */
      imageSmall: catalogCards.imageSmall,
    })
    .from(items)
    .innerJoin(catalogCards, eq(catalogCards.id, items.catalogCardId))
    .leftJoin(locations, eq(locations.id, items.locationId))
    .where(and(eq(items.ownerId, ownerId), eq(catalogCards.oracleId, oracleId)))
    .orderBy(desc(catalogCards.releasedAt), sql`${items.quantity} desc`);
}
