import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { collectionCards, collections } from "@/db/schema";
import { ownedByPrinting } from "./items";

/**
 * A collection is a list of printings with the copies wanted of each; what the user owns is
 * matched from the inventory (D23). For each collection:
 * - cardCount: printings listed; completeCount: listed printings owned in full
 * - wanted / ownedCopies: copies wanted and owned (owned capped at wanted)
 * - ownedValue: value of the owned copies that count towards the list
 * - missingCost: what the missing copies would cost at today's price
 */
export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  /** Only for one collection (getCollection): lists don't show it. */
  notes: string | null;
  /** «Wants» is presented as its own list, not as a collection (D23). */
  kind: "collection" | "wants";
  cardCount: number;
  completeCount: number;
  wanted: number;
  ownedCopies: number;
  ownedValue: number;
  missingCost: number;
};

async function summaries(
  ownerId: string,
  opts: { collectionId?: string; kind?: "collection" | "wants" } = {},
) {
  const { collectionId, kind } = opts;
  const result = await db.execute<CollectionSummary>(sql`
    with owned as ${ownedByPrinting(ownerId)}
    select c.id, c.name, c.description, c.kind,
           ${collectionId ? sql`c.notes` : sql`null`} as notes,
           count(cc.catalog_card_id)::int as "cardCount",
           (count(cc.catalog_card_id) filter (where coalesce(o.qty, 0) >= cc.quantity))::int as "completeCount",
           coalesce(sum(cc.quantity), 0)::int as wanted,
           coalesce(sum(least(coalesce(o.qty, 0), cc.quantity)), 0)::int as "ownedCopies",
           coalesce(sum(case when o.qty > 0 then o.value * least(o.qty, cc.quantity) / o.qty end), 0)::float8 as "ownedValue",
           coalesce(sum(greatest(cc.quantity - coalesce(o.qty, 0), 0) * cat.price_eur), 0)::float8 as "missingCost"
    from collections c
    left join collection_cards cc on cc.collection_id = c.id
    left join catalog_cards cat on cat.id = cc.catalog_card_id
    left join owned o on o.catalog_card_id = cc.catalog_card_id
    where c.owner_id = ${ownerId}
      ${collectionId ? sql`and c.id = ${collectionId}` : sql``}
      ${kind ? sql`and c.kind = ${kind}` : sql``}
    group by c.id
    order by c.name
  `);
  return result.rows;
}

/** The collections proper. «Wants» is the same shape but has its own tab (getWants). */
export const listCollections = (ownerId: string) => summaries(ownerId, { kind: "collection" });

/** By id, whatever its kind: the wants list's own page loads it this way too. */
export async function getCollection(ownerId: string, id: string) {
  const [row] = await summaries(ownerId, { collectionId: id });
  return row ?? null;
}

/** The wants list, or null until something is put on it. */
export async function getWants(ownerId: string) {
  const [row] = await summaries(ownerId, { kind: "wants" });
  return row ?? null;
}

/** For pickers: collections only, so «Wants» doesn't show up when entering or scanning cards. */
export async function collectionOptions(ownerId: string) {
  return db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(and(eq(collections.ownerId, ownerId), eq(collections.kind, "collection")))
    .orderBy(asc(collections.name));
}

export type CollectionCard = {
  id: string;
  game: string;
  name: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string;
  rarity: string | null;
  imageSmall: string | null;
  finishes: string[];
  priceEur: number | null;
  wanted: number;
  owned: number;
  addedAt: string;
};

/** The printings a collection lists, with copies wanted and owned. Check ownership first. */
export async function listCollectionCards(ownerId: string, collectionId: string) {
  const result = await db.execute<CollectionCard>(sql`
    with owned as ${ownedByPrinting(ownerId)}
    select cat.id, cat.game, cat.name, cat.set_code as "setCode", s.name as "setName",
           cat.collector_number as "collectorNumber", cat.rarity, cat.image_small as "imageSmall",
           cat.finishes, cat.price_eur::float8 as "priceEur",
           cc.quantity as wanted, coalesce(o.qty, 0)::int as owned, cc.created_at::text as "addedAt"
    from collection_cards cc
    join catalog_cards cat on cat.id = cc.catalog_card_id
    left join sets s on s.game = cat.game and s.code = cat.set_code
    left join owned o on o.catalog_card_id = cc.catalog_card_id
    where cc.collection_id = ${collectionId}
    order by cc.created_at desc
  `);
  return result.rows;
}

/** The user's collections that list a printing. */
export async function collectionsOfCard(ownerId: string, catalogCardId: string) {
  return db
    .select({ id: collections.id, name: collections.name, wanted: collectionCards.quantity })
    .from(collectionCards)
    .innerJoin(collections, eq(collections.id, collectionCards.collectionId))
    .where(and(eq(collections.ownerId, ownerId), eq(collectionCards.catalogCardId, catalogCardId)))
    .orderBy(asc(collections.name));
}
