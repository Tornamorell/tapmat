import { pool } from "@/db/client";
import type { DeckCardInfo } from "@/lib/decks/analysis";

export type DeckRow = {
  id: string;
  name: string;
  format: string;
  description: string | null;
  /** Its box (D35). Null if someone deleted the location; «Traer al mazo» makes a new one. */
  locationId: string | null;
  locationName: string | null;
  updatedAt: string;
};

const DECK_COLUMNS = `
  d.id, d.name, d.format, d.description, d.location_id as "locationId", l.name as "locationName",
  d.updated_at::text as "updatedAt"`;

export async function listDecks(ownerId: string): Promise<DeckRow[]> {
  const { rows } = await pool.query<DeckRow>(
    `select ${DECK_COLUMNS} from decks d left join locations l on l.id = d.location_id
     where d.owner_id = $1 order by d.updated_at desc`,
    [ownerId],
  );
  return rows;
}

export async function getDeck(ownerId: string, id: string): Promise<DeckRow | null> {
  const { rows } = await pool.query<DeckRow>(
    `select ${DECK_COLUMNS} from decks d left join locations l on l.id = d.location_id
     where d.owner_id = $1 and d.id = $2`,
    [ownerId, id],
  );
  return rows[0] ?? null;
}

export type DeckCardRow = DeckCardInfo & {
  deckId: string;
  oracleId: string;
  /** The printing the owner chose, if any. */
  preferredPrintingId: string | null;
  /** Roles the owner set for this card; null: guessed from its text (roles.ts). */
  manualRoles: string[] | null;
  /**
   * The one shown and priced: the owner's copy in the deck's box, else the chosen printing,
   * else the newest with a picture.
   */
  printingId: string | null;
  /** The printing of the owner's copy in the box, if there's one there. */
  boxedPrintingId: string | null;
  imageSmall: string | null;
  /** The same printing's bigger picture (Scryfall's «normal»): the test hand shows cards big. */
  imageNormal: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  /** Copies of this card (any printing, ungraded) in the deck's box. */
  inBox: number;
  /** Copies elsewhere, not in any deck's box: they can be brought in. */
  free: number;
  freeWhere: string[];
  /** Copies in other decks' boxes. */
  inOtherDecks: number;
};

/**
 * A deck's cards (or all the owner's decks' cards) with their rules data, price and where
 * the owner's copies are (D35). Graded copies aren't counted: slabs don't go in decks.
 */
export async function deckCardRows(ownerId: string, deckId?: string): Promise<DeckCardRow[]> {
  const { rows } = await pool.query<DeckCardRow>(
    `select dc.deck_id as "deckId", dc.board, dc.quantity, dc.oracle_id as "oracleId",
            o.name, o.type_line as "typeLine", o.mana_cost as "manaCost", o.cmc::float8 as cmc,
            o.color_identity as "colorIdentity", o.produced_mana as "producedMana",
            o.oracle_text as "oracleText", o.keywords,
            o.legalities->>'commander' as "commanderLegality", o.game_changer as "gameChanger",
            dc.catalog_card_id as "preferredPrintingId", dc.roles as "manualRoles",
            coalesce(boxed.id, pref.id, latest.id) as "printingId",
            boxed.id as "boxedPrintingId",
            coalesce(boxed.image_small, pref.image_small, latest.image_small) as "imageSmall",
            coalesce(boxed.image_normal, pref.image_normal, latest.image_normal) as "imageNormal",
            coalesce(boxed.set_code, pref.set_code, latest.set_code) as "setCode",
            coalesce(boxed.collector_number, pref.collector_number, latest.collector_number) as "collectorNumber",
            coalesce(boxed.value, pref.price_eur, cheap.price_eur)::float8 as "priceEur",
            coalesce(own.in_box, 0)::int as "inBox",
            coalesce(own.free, 0)::int as free,
            coalesce(own.free_where, '{}') as "freeWhere",
            coalesce(own.in_other_decks, 0)::int as "inOtherDecks"
     from deck_cards dc
     join decks d on d.id = dc.deck_id
     join oracle_cards o on o.oracle_id = dc.oracle_id
     left join catalog_cards pref on pref.id = dc.catalog_card_id
     left join lateral (
       select c.price_eur from catalog_cards c
       where c.game = 'mtg' and c.oracle_id = dc.oracle_id and c.price_eur is not null
       order by c.price_eur limit 1
     ) cheap on true
     left join lateral (
       select c.id, c.image_small, c.image_normal, c.set_code, c.collector_number from catalog_cards c
       where c.game = 'mtg' and c.oracle_id = dc.oracle_id and c.image_small is not null
       order by c.released_at desc nulls last limit 1
     ) latest on true
     -- The owner's copy in the box: the chosen printing if it's there, else the most valuable.
     -- Its value is itemValueEurSql's (pricing.ts): the owner's estimate, else the market price.
     left join lateral (
       select c.id, c.image_small, c.image_normal, c.set_code, c.collector_number,
              coalesce(i.estimated_value_eur,
                       case i.finish when 'nonfoil' then c.price_eur when 'foil' then c.price_eur_foil end) as value
       from items i
       join catalog_cards c on c.id = i.catalog_card_id
       where i.owner_id = $1 and i.location_id = d.location_id and c.oracle_id = dc.oracle_id
         and i.grading_company is null
       order by c.id = dc.catalog_card_id desc nulls last, value desc nulls last
       limit 1
     ) boxed on true
     left join lateral (
       select sum(i.quantity) filter (where i.location_id = d.location_id) as in_box,
              sum(i.quantity) filter (where i.location_id is distinct from d.location_id and od.id is null) as free,
              array_agg(distinct coalesce(l.name, 'Sin ubicación'))
                filter (where i.location_id is distinct from d.location_id and od.id is null) as free_where,
              sum(i.quantity) filter (where od.id is not null and od.id <> d.id) as in_other_decks
       from items i
       join catalog_cards c on c.id = i.catalog_card_id
       left join locations l on l.id = i.location_id
       left join decks od on od.location_id = i.location_id
       where i.owner_id = $1 and c.oracle_id = dc.oracle_id and i.grading_company is null
     ) own on true
     where d.owner_id = $1 ${deckId ? "and d.id = $2" : ""}
     order by o.name`,
    deckId ? [ownerId, deckId] : [ownerId],
  );
  return rows;
}

/**
 * What's in a deck's box, by card: to spot copies there that the list doesn't have, and to put
 * them in it («Añadir a la lista lo de la caja»). `listable` says whether that last part is
 * possible: a deck's list holds Magic cards by `oracle_id`, so anything from another game, or a
 * card whose rules data the Scryfall sync hasn't brought yet, can't go into it.
 */
export async function boxContents(ownerId: string, locationId: string) {
  const { rows } = await pool.query<{
    oracleId: string;
    name: string;
    copies: number;
    /** The printing of the copy in the box worth the most: the one the list will point at. */
    printingId: string | null;
    listable: boolean;
  }>(
    `select c.oracle_id as "oracleId", min(c.name) as name, sum(i.quantity)::int as copies,
            (array_agg(c.id order by coalesce(i.estimated_value_eur,
                                              case i.finish when 'nonfoil' then c.price_eur
                                                            when 'foil' then c.price_eur_foil end)
                       desc nulls last))[1] as "printingId",
            (bool_and(c.game = 'mtg')
             and exists (select 1 from oracle_cards o where o.oracle_id = c.oracle_id)) as listable
     from items i join catalog_cards c on c.id = i.catalog_card_id
     where i.owner_id = $1 and i.location_id = $2 and c.oracle_id is not null
     group by c.oracle_id
     order by min(c.name)`,
    [ownerId, locationId],
  );
  return rows;
}
