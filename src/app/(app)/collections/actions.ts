"use server";

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { catalogCards, collectionCards, collections } from "@/db/schema";
import { addToCollection } from "@/lib/collections/entries";
import { requireUser } from "@/lib/session";

// Collections are lists of printings (owned or not) with the copies wanted (D23). Every action
// re-checks the session and ownership.

async function ownedCollection(userId: string, collectionId: string) {
  const [row] = await db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.ownerId, userId)));
  if (!row) throw new Error("Colección no encontrada");
  return row;
}

const refresh = () => revalidatePath("/", "layout");

const collectionFields = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(80),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
});

/**
 * Creates a collection, unless one with the same name was created seconds ago: that's a double
 * tap or a retried request, not a second list, so it returns the first one.
 */
async function insertCollection(
  ownerId: string,
  fields: z.output<typeof collectionFields>,
  kind: "collection" | "wants" = "collection",
) {
  const [recent] = await db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(
      and(
        eq(collections.ownerId, ownerId),
        sql`lower(${collections.name}) = lower(${fields.name})`,
        gt(collections.createdAt, sql`now() - interval '15 seconds'`),
      ),
    )
    .limit(1);
  if (recent) return recent;
  const [created] = await db
    .insert(collections)
    .values({ ...fields, ownerId, kind })
    .returning({ id: collections.id, name: collections.name });
  refresh();
  return created;
}

/**
 * The wants list, made the first time a card goes on it: one per user, so «Lo quiero» never asks
 * which list. Kept out of the pickers by its kind (collectionOptions).
 */
export async function wantsList() {
  const user = await requireUser();
  const [existing] = await db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(and(eq(collections.ownerId, user.id), eq(collections.kind, "wants")))
    .limit(1);
  if (existing) return existing;
  return insertCollection(
    user.id,
    collectionFields.parse({ name: "Wants", description: "" }),
    "wants",
  );
}

const setScope = z.object({
  game: z.enum(["mtg", "pokemon", "sports"]),
  setCode: z.string().trim().min(1).max(20),
  /** Only the cards of this rarity ("solo las Rare"). */
  rarity: z.string().trim().max(60).nullish(),
});

/** The printings of a set, or of one of its rarities. Throws for an unknown set. */
async function setPrintingIds(scope: z.output<typeof setScope>) {
  const rows = await db
    .select({ id: catalogCards.id })
    .from(catalogCards)
    .where(
      and(
        eq(catalogCards.game, scope.game),
        eq(catalogCards.setCode, scope.setCode),
        scope.rarity ? eq(catalogCards.rarity, scope.rarity) : undefined,
      ),
    );
  if (!rows.length) throw new Error("Expansión no encontrada");
  return rows.map((r) => r.id);
}

/** Lists printings wanting one of each; ones already listed keep their wanted count. */
async function listOneOfEach(collectionId: string, ids: string[]) {
  await addToCollection(
    collectionId,
    ids.map((catalogCardId) => ({ catalogCardId, quantity: 1 })),
  );
  refresh();
}

/** The collections page form: a name and, optionally, a set ("game:code") to fill it with. */
export async function createCollection(formData: FormData) {
  const user = await requireUser();
  const fields = collectionFields.parse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  const set = formData.get("set");
  const ids =
    typeof set === "string" && set.includes(":")
      ? await setPrintingIds(
          setScope.parse({
            game: set.slice(0, set.indexOf(":")),
            setCode: set.slice(set.indexOf(":") + 1),
          }),
        )
      : [];
  const created = await insertCollection(user.id, fields);
  if (ids.length) await listOneOfEach(created.id, ids);
  redirect(`/collections/${created.id}`);
}

/** A new collection with every card of a set (or of one of its rarities). */
export async function createCollectionFromSet(input: z.input<typeof setScope> & { name: string }) {
  const user = await requireUser();
  const ids = await setPrintingIds(setScope.parse(input));
  const created = await insertCollection(
    user.id,
    collectionFields.parse({ name: input.name, description: "" }),
  );
  await listOneOfEach(created.id, ids);
  return { id: created.id, added: ids.length };
}

/** Adds every card of a set (or of one of its rarities) to an existing collection. */
export async function addSetToCollection(collectionId: string, input: z.input<typeof setScope>) {
  const user = await requireUser();
  const collection = await ownedCollection(user.id, collectionId);
  const ids = await setPrintingIds(setScope.parse(input));
  await listOneOfEach(collection.id, ids);
  return { added: ids.length, collectionName: collection.name };
}

/** Creates a collection from a picker ("+ Nueva colección…") and returns it. */
export async function createCollectionNamed(name: string): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  return insertCollection(user.id, collectionFields.parse({ name, description: "" }));
}

export async function updateCollection(collectionId: string, formData: FormData) {
  const user = await requireUser();
  await ownedCollection(user.id, collectionId);
  const fields = collectionFields.parse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  await db.update(collections).set(fields).where(eq(collections.id, collectionId));
  refresh();
}

/** The collection's notes (the «Notas» on its page): free text; empty clears them. */
export async function updateCollectionNotes(collectionId: string, notes: string) {
  const user = await requireUser();
  await ownedCollection(user.id, collectionId);
  const value = z.string().max(5000).parse(notes).trim() || null;
  await db.update(collections).set({ notes: value }).where(eq(collections.id, collectionId));
  refresh();
}

/** Deletes the list. The copies in the inventory stay. */
export async function deleteCollection(collectionId: string) {
  const user = await requireUser();
  await ownedCollection(user.id, collectionId);
  await db.delete(collections).where(eq(collections.id, collectionId));
  refresh();
  redirect("/collections");
}

const wanted = z.number().int().min(1).max(999);

/** Lists a printing in a collection (owned or not). Already listed: keeps the larger quantity. */
export async function addCardToCollection(
  collectionId: string,
  catalogCardId: string,
  quantity = 1,
) {
  const user = await requireUser();
  const collection = await ownedCollection(user.id, collectionId);
  const cardId = z.uuid().parse(catalogCardId);
  const [card] = await db
    .select({ name: catalogCards.name })
    .from(catalogCards)
    .where(eq(catalogCards.id, cardId));
  if (!card) throw new Error("Carta no encontrada en el catálogo");
  await addToCollection(collection.id, [
    { catalogCardId: cardId, quantity: wanted.parse(quantity) },
  ]);
  refresh();
  return { name: card.name, collectionName: collection.name };
}

/**
 * «Lo quiero» on a card page: this printing goes on the wants list, which is made on the spot if
 * it's the first one. Listing it again is harmless — addToCollection keeps the larger quantity.
 */
export async function addCardToWants(catalogCardId: string) {
  const list = await wantsList();
  return addCardToCollection(list.id, catalogCardId, 1);
}

export async function setWanted(collectionId: string, catalogCardId: string, quantity: number) {
  const user = await requireUser();
  await ownedCollection(user.id, collectionId);
  await db
    .update(collectionCards)
    .set({ quantity: wanted.parse(quantity) })
    .where(
      and(
        eq(collectionCards.collectionId, collectionId),
        eq(collectionCards.catalogCardId, z.uuid().parse(catalogCardId)),
      ),
    );
  refresh();
}

/**
 * The album's order, saved (D23): the ids in their new order take positions 0…n-1, in one
 * statement. Every entry is rewritten on purpose — a partial order would leave some cards on a
 * saved position and others on the printed fallback, and the two can't be interleaved.
 */
export async function reorderCollectionCards(collectionId: string, orderedCardIds: string[]) {
  const user = await requireUser();
  await ownedCollection(user.id, collectionId);
  const ids = z.array(z.uuid()).max(5000).parse(orderedCardIds);
  if (!ids.length) return;
  const values = sql.join(
    ids.map((id, i) => sql`(${id}::uuid, ${i})`),
    sql`, `,
  );
  await db.execute(sql`
    update collection_cards as cc
    set position = v.pos
    from (values ${values}) as v(card_id, pos)
    where cc.collection_id = ${collectionId}::uuid and cc.catalog_card_id = v.card_id
  `);
  refresh();
}

/** Takes a printing off the list. Owned copies stay in the inventory. */
export async function removeCardFromCollection(collectionId: string, catalogCardId: string) {
  const user = await requireUser();
  await ownedCollection(user.id, collectionId);
  await db
    .delete(collectionCards)
    .where(
      and(
        eq(collectionCards.collectionId, collectionId),
        eq(collectionCards.catalogCardId, z.uuid().parse(catalogCardId)),
      ),
    );
  refresh();
}

const cardIds = z.array(z.uuid()).min(1).max(2000);

const moveCardsInput = z.object({
  from: z.uuid(),
  to: z.uuid(),
  catalogCardIds: cardIds,
  /** Copy instead of move: they stay in `from` too. */
  keep: z.boolean().default(false),
});

/**
 * Moves printings from one collection to another (or copies them, `keep`), each with its copies
 * wanted. One the target already lists keeps the larger count (addToCollection): each list
 * counts owned copies on its own, so adding the two up would ask for copies that aren't needed.
 */
export async function moveCollectionCards(input: z.input<typeof moveCardsInput>) {
  const user = await requireUser();
  const { from, to, catalogCardIds, keep } = moveCardsInput.parse(input);
  if (from === to) throw new Error("Es la misma colección");
  await ownedCollection(user.id, from);
  const target = await ownedCollection(user.id, to);
  const rows = await db
    .select({ catalogCardId: collectionCards.catalogCardId, quantity: collectionCards.quantity })
    .from(collectionCards)
    .where(
      and(
        eq(collectionCards.collectionId, from),
        inArray(collectionCards.catalogCardId, catalogCardIds),
      ),
    );
  await addToCollection(target.id, rows);
  if (!keep && rows.length) {
    await db.delete(collectionCards).where(
      and(
        eq(collectionCards.collectionId, from),
        inArray(
          collectionCards.catalogCardId,
          rows.map((r) => r.catalogCardId),
        ),
      ),
    );
  }
  refresh();
  return { moved: rows.length, collectionName: target.name };
}

/** Takes several printings off the list at once. Owned copies stay in the inventory. */
export async function removeCardsFromCollection(collectionId: string, catalogCardIds: string[]) {
  const user = await requireUser();
  await ownedCollection(user.id, collectionId);
  const gone = await db
    .delete(collectionCards)
    .where(
      and(
        eq(collectionCards.collectionId, collectionId),
        inArray(collectionCards.catalogCardId, cardIds.parse(catalogCardIds)),
      ),
    )
    .returning({ id: collectionCards.catalogCardId });
  refresh();
  return { removed: gone.length };
}
