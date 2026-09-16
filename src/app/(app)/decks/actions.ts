"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, pool } from "@/db/client";
import { catalogCards, deckCards, decks, locations, oracleCards } from "@/db/schema";
import { BOARDS, parseDecklist, type Board } from "@/lib/decks/decklist";
import { resolveDecklist, type ResolvedLine } from "@/lib/decks/resolve";
import { ROLES, type Role } from "@/lib/decks/roles";
import { boxContents, deckCardRows } from "@/lib/queries/decks";
import { requireUser } from "@/lib/session";
import { moveItems } from "../inventory/actions";

// Magic decks (D35): a list of cards by board, and a box (a location) with the copies that are
// in the deck. Every action re-checks the session and that the deck is the user's.

const refresh = () => revalidatePath("/", "layout");
const board = z.enum(BOARDS);
const deckName = z.string().trim().min(1, "Ponle un nombre").max(80);

async function ownedDeck(userId: string, deckId: string) {
  const [row] = await db
    .select({ id: decks.id, name: decks.name, locationId: decks.locationId })
    .from(decks)
    .where(and(eq(decks.id, z.uuid().parse(deckId)), eq(decks.ownerId, userId)));
  if (!row) throw new Error("Mazo no encontrado");
  return row;
}

/** A free name for a deck's box: "Mazo · Atraxa", or "Mazo · Atraxa (2)" if that one is taken. */
async function boxName(ownerId: string, name: string) {
  const base = `Mazo · ${name}`.slice(0, 76);
  const { rows } = await pool.query<{ name: string }>(
    `select lower(name) as name from locations where owner_id = $1 and starts_with(lower(name), lower($2))`,
    [ownerId, base],
  );
  const taken = new Set(rows.map((r) => r.name));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
}

/** Adds lines to a deck; a card already on that board gets the copies added. */
async function addLines(deckId: string, lines: ResolvedLine[]) {
  if (!lines.length) return;
  await db
    .insert(deckCards)
    .values(lines.map((l) => ({ deckId, board: l.board, oracleId: l.oracleId, quantity: l.quantity, catalogCardId: l.printingId })))
    .onConflictDoUpdate({
      target: [deckCards.deckId, deckCards.board, deckCards.oracleId],
      set: {
        quantity: sql`${deckCards.quantity} + excluded.quantity`,
        catalogCardId: sql`coalesce(excluded.catalog_card_id, ${deckCards.catalogCardId})`,
      },
    });
  await db.update(decks).set({ updatedAt: new Date() }).where(eq(decks.id, deckId));
}

export type ImportResult = { id: string; added: number; unknown: string[]; unreadable: string[] };

/**
 * A new deck with its box, and the list pasted in, if any. A deck with the same name created
 * seconds ago is a double tap: that one is returned.
 */
export async function createDeck(input: { name: string; list?: string }): Promise<ImportResult> {
  const user = await requireUser();
  const name = deckName.parse(input.name);
  const [recent] = await db
    .select({ id: decks.id })
    .from(decks)
    .where(
      and(
        eq(decks.ownerId, user.id),
        sql`lower(${decks.name}) = lower(${name})`,
        gt(decks.createdAt, sql`now() - interval '15 seconds'`),
      ),
    );
  if (recent) return { id: recent.id, added: 0, unknown: [], unreadable: [] };

  const parsed = parseDecklist(z.string().max(30_000).parse(input.list ?? ""));
  const { resolved, unknown } = await resolveDecklist(parsed.lines);
  const box = await boxName(user.id, name);
  const id = await db.transaction(async (tx) => {
    const [location] = await tx
      .insert(locations)
      .values({ ownerId: user.id, name: box, description: `La caja del mazo «${name}».` })
      .returning({ id: locations.id });
    const [deck] = await tx
      .insert(decks)
      .values({ ownerId: user.id, name, locationId: location.id })
      .returning({ id: decks.id });
    return deck.id;
  });
  await addLines(id, resolved);
  refresh();
  return { id, added: resolved.reduce((n, l) => n + l.quantity, 0), unknown, unreadable: parsed.unreadable };
}

/** Pastes a list into a deck: its cards are added to what's there. */
export async function importIntoDeck(deckId: string, list: string): Promise<ImportResult> {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  const parsed = parseDecklist(z.string().max(30_000).parse(list));
  const { resolved, unknown } = await resolveDecklist(parsed.lines);
  await addLines(deck.id, resolved);
  refresh();
  return { id: deck.id, added: resolved.reduce((n, l) => n + l.quantity, 0), unknown, unreadable: parsed.unreadable };
}

/** Adds a printing's card to a board; that printing becomes the one shown and priced. */
export async function addDeckCard(input: { deckId: string; printingId: string; board: Board; quantity: number }) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, input.deckId);
  const [printing] = await db
    .select({ oracleId: catalogCards.oracleId, name: catalogCards.name, game: catalogCards.game })
    .from(catalogCards)
    .where(eq(catalogCards.id, z.uuid().parse(input.printingId)));
  if (!printing || printing.game !== "mtg" || !printing.oracleId) throw new Error("Solo cartas de Magic");
  const [rules] = await db
    .select({ id: oracleCards.oracleId })
    .from(oracleCards)
    .where(eq(oracleCards.oracleId, printing.oracleId));
  // The rules data comes with the daily Scryfall sync (D35).
  if (!rules) return { added: false as const, name: printing.name };
  await addLines(deck.id, [
    {
      board: board.parse(input.board),
      quantity: z.number().int().min(1).max(99).parse(input.quantity),
      oracleId: printing.oracleId,
      printingId: input.printingId,
    },
  ]);
  refresh();
  return { added: true as const, name: printing.name };
}

/** Sets a card's copies on a board; 0 takes it off. */
export async function setDeckCardQuantity(deckId: string, from: Board, oracleId: string, quantity: number) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  const where = and(eq(deckCards.deckId, deck.id), eq(deckCards.board, board.parse(from)), eq(deckCards.oracleId, oracleId));
  const n = z.number().int().min(0).max(99).parse(quantity);
  if (n === 0) await db.delete(deckCards).where(where);
  else await db.update(deckCards).set({ quantity: n }).where(where);
  await db.update(decks).set({ updatedAt: new Date() }).where(eq(decks.id, deck.id));
  refresh();
}

/** Sets what a card does in the deck, overriding the guess; null goes back to the guess. */
export async function setDeckCardRoles(deckId: string, from: Board, oracleId: string, roles: Role[] | null) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  const value = roles === null ? null : [...new Set(z.array(z.enum(ROLES)).max(ROLES.length).parse(roles))];
  await db
    .update(deckCards)
    .set({ roles: value })
    .where(and(eq(deckCards.deckId, deck.id), eq(deckCards.board, board.parse(from)), eq(deckCards.oracleId, oracleId)));
  refresh();
}

/** Moves a card to another board (into «Comandante», out to the sideboard…), joining it there. */
export async function moveDeckCard(deckId: string, from: Board, oracleId: string, to: Board) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  const [row] = await db
    .delete(deckCards)
    .where(and(eq(deckCards.deckId, deck.id), eq(deckCards.board, board.parse(from)), eq(deckCards.oracleId, oracleId)))
    .returning();
  if (!row) return;
  await addLines(deck.id, [{ board: board.parse(to), quantity: row.quantity, oracleId, printingId: row.catalogCardId }]);
  refresh();
}

/** Renames a deck, and its box if it still has the name it was given. */
export async function renameDeck(deckId: string, name: string) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  const newName = deckName.parse(name);
  await db.update(decks).set({ name: newName }).where(eq(decks.id, deck.id));
  if (deck.locationId) {
    const [box] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, deck.locationId));
    if (box?.name.startsWith("Mazo · ")) {
      await db.update(locations).set({ name: await boxName(user.id, newName) }).where(eq(locations.id, deck.locationId));
    }
  }
  refresh();
}

/** Deletes a deck and its box. Its copies stay in the inventory, with no location. */
export async function deleteDeck(deckId: string) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  await db.transaction(async (tx) => {
    await tx.delete(decks).where(eq(decks.id, deck.id));
    if (deck.locationId) await tx.delete(locations).where(eq(locations.id, deck.locationId));
  });
  refresh();
}

/**
 * «Traer al mazo»: moves into the deck's box the copies it lacks (commander and main deck)
 * from wherever they are free — never from another deck's box, never graded ones. Copies of
 * the printing the list names go first (the full art you chose), then copies with no location,
 * then the cheapest printings. One card, or the whole deck.
 */
export async function pullIntoDeck(deckId: string, oracleId?: string) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  let locationId = deck.locationId;
  if (!locationId) {
    const [box] = await db
      .insert(locations)
      .values({ ownerId: user.id, name: await boxName(user.id, deck.name), description: `La caja del mazo «${deck.name}».` })
      .returning({ id: locations.id });
    locationId = box.id;
    await db.update(decks).set({ locationId }).where(eq(decks.id, deck.id));
  }

  const rows = (await deckCardRows(user.id, deck.id)).filter((r) => !oracleId || r.oracleId === oracleId);
  const needed = new Map<string, { want: number; inBox: number; printingId: string | null }>();
  for (const r of rows) {
    if (r.board !== "commander" && r.board !== "main") continue;
    const seen = needed.get(r.oracleId);
    needed.set(r.oracleId, {
      want: (seen?.want ?? 0) + r.quantity,
      inBox: r.inBox,
      printingId: seen?.printingId ?? r.preferredPrintingId,
    });
  }

  const stacks: Array<{ itemId: string; count: number }> = [];
  for (const [id, { want, inBox, printingId }] of needed) {
    let missing = want - inBox;
    if (missing <= 0) continue;
    const { rows: free } = await pool.query<{ id: string; quantity: number }>(
      `select i.id, i.quantity
       from items i
       join catalog_cards c on c.id = i.catalog_card_id
       left join decks od on od.location_id = i.location_id
       where i.owner_id = $1 and c.oracle_id = $2 and i.grading_company is null and od.id is null
         and i.location_id is distinct from $3
       order by coalesce(c.id = $4, false) desc, (i.location_id is null) desc, c.price_eur asc nulls last`,
      [user.id, id, locationId, printingId],
    );
    for (const s of free) {
      if (missing <= 0) break;
      const count = Math.min(missing, s.quantity);
      stacks.push({ itemId: s.id, count });
      missing -= count;
    }
  }
  if (stacks.length) await moveItems({ stacks, locationId, sectionId: null });
  refresh();
  return { moved: stacks.reduce((n, s) => n + s.count, 0) };
}

/**
 * «Añadir a la lista lo de la caja»: the other way round from pullIntoDeck. What's in the deck's
 * box beyond what its list asks for — the page's «de más» — goes onto the main board, with the
 * printing of the copy that's in the box. Cards the list can't hold (another game, or rules data
 * the Scryfall sync hasn't brought yet) are counted apart and left alone; nothing is moved or
 * removed from the box.
 */
export async function addBoxToDeck(deckId: string) {
  const user = await requireUser();
  const deck = await ownedDeck(user.id, deckId);
  if (!deck.locationId) return { added: 0, skipped: 0 };
  const [box, rows] = await Promise.all([boxContents(user.id, deck.locationId), deckCardRows(user.id, deck.id)]);

  // What the list already asks for, on every board: the same count the deck's page calls «de más».
  const listed = new Map<string, number>();
  for (const r of rows) listed.set(r.oracleId, (listed.get(r.oracleId) ?? 0) + r.quantity);

  const lines: ResolvedLine[] = [];
  let skipped = 0;
  for (const b of box) {
    const missing = b.copies - (listed.get(b.oracleId) ?? 0);
    if (missing <= 0) continue;
    if (!b.listable) skipped += missing;
    else lines.push({ board: "main", quantity: missing, oracleId: b.oracleId, printingId: b.printingId });
  }
  await addLines(deck.id, lines);
  refresh();
  return { added: lines.reduce((n, l) => n + l.quantity, 0), skipped };
}
