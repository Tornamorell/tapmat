import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogCards, decks, items, locationSections, locations } from "@/db/schema";
import { stackAggregates } from "./items";

export type SectionOption = {
  id: string;
  name: string;
  position: number;
  capacity: number | null;
  /** Copies in it now. */
  count: number;
};

const sectionWithCount = {
  id: locationSections.id,
  name: locationSections.name,
  position: locationSections.position,
  capacity: locationSections.capacity,
  count: sql<number>`coalesce(sum(${items.quantity}), 0)::int`,
};

/** For pickers: the user's locations, alphabetical, each with its dividers and how full they are. */
export async function locationOptions(ownerId: string) {
  const [rows, sections] = await Promise.all([
    db
      // A deck's box is a location (D35), and `decks_location_uq` makes that one-to-one, so this
      // join can't duplicate a row. The scanner uses it to know it's filling a deck.
      .select({
        id: locations.id,
        name: locations.name,
        autoAdvance: locations.autoAdvance,
        deckId: decks.id,
      })
      .from(locations)
      .leftJoin(decks, eq(decks.locationId, locations.id))
      .where(eq(locations.ownerId, ownerId))
      .orderBy(asc(locations.name)),
    db
      .select({ ...sectionWithCount, locationId: locationSections.locationId })
      .from(locationSections)
      .innerJoin(locations, eq(locations.id, locationSections.locationId))
      .leftJoin(items, eq(items.sectionId, locationSections.id))
      .where(eq(locations.ownerId, ownerId))
      .groupBy(locationSections.id)
      .orderBy(asc(locationSections.position)),
  ]);
  return rows.map((l) => ({
    ...l,
    sections: sections
      .filter((s) => s.locationId === l.id)
      .map(({ id, name, position, capacity, count }) => ({ id, name, position, capacity, count })),
  }));
}

export async function listLocations(ownerId: string) {
  return db
    .select({
      id: locations.id,
      name: locations.name,
      description: locations.description,
      ...stackAggregates,
    })
    .from(locations)
    .leftJoin(items, eq(items.locationId, locations.id))
    .leftJoin(catalogCards, eq(catalogCards.id, items.catalogCardId))
    .where(eq(locations.ownerId, ownerId))
    .groupBy(locations.id)
    .orderBy(asc(locations.name));
}

/** Totals for copies with no location yet. */
export async function unlocatedSummary(ownerId: string) {
  const [row] = await db
    .select(stackAggregates)
    .from(items)
    .leftJoin(catalogCards, eq(catalogCards.id, items.catalogCardId))
    .where(and(eq(items.ownerId, ownerId), isNull(items.locationId)));
  return row;
}

export async function getLocation(ownerId: string, id: string) {
  const [row] = await db
    .select({
      id: locations.id,
      name: locations.name,
      description: locations.description,
      sectionCapacity: locations.sectionCapacity,
      autoAdvance: locations.autoAdvance,
      ...stackAggregates,
    })
    .from(locations)
    .leftJoin(items, eq(items.locationId, locations.id))
    .leftJoin(catalogCards, eq(catalogCards.id, items.catalogCardId))
    .where(and(eq(locations.ownerId, ownerId), eq(locations.id, id)))
    .groupBy(locations.id);
  return row ?? null;
}

/** A location's dividers in order, with how many copies each holds. */
export async function listSections(locationId: string): Promise<SectionOption[]> {
  return db
    .select(sectionWithCount)
    .from(locationSections)
    .leftJoin(items, eq(items.sectionId, locationSections.id))
    .where(eq(locationSections.locationId, locationId))
    .groupBy(locationSections.id)
    .orderBy(asc(locationSections.position));
}

/** Copies of a location that aren't behind any divider. */
export async function unsectionedCount(locationId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${items.quantity}), 0)::int` })
    .from(items)
    .where(and(eq(items.locationId, locationId), isNull(items.sectionId)));
  return row?.n ?? 0;
}
