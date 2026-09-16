import { pool } from "@/db/client";
import { gameById, rarityLabel } from "@/lib/games";
import { numberVariants, type CollectorLine } from "@/lib/scan/parse";
import {
  seriesFirst,
  splitNumber,
  type CardReading,
  type IdentifyContext,
} from "@/lib/scan/reading";
import { normalizeForSearch } from "@/lib/search/normalize";

export type ScanMatch = {
  id: string;
  game: string;
  name: string;
  /** The card behind this printing: what a deck's list is keyed by (D35). */
  oracleId: string | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  imageSmall: string | null;
  rarity: string | null;
  finishes: string[];
  priceEur: number | null;
  priceEurFoil: number | null;
  printedTotal: number | null;
};

const COLUMNS = `
  c.id, c.game, c.name, c.oracle_id as "oracleId", c.set_code as "setCode", s.name as "setName",
  c.collector_number as "collectorNumber", c.image_small as "imageSmall", c.rarity, c.finishes,
  c.price_eur::float8 as "priceEur", c.price_eur_foil::float8 as "priceEurFoil",
  s.printed_total as "printedTotal"`;

// Many sets share a size (a dozen Magic sets have 249 cards) and popular cards have dozens of
// printings, so reads can be ambiguous: return enough candidates, newest first, to pick from.
async function find(where: string, params: unknown[]) {
  const { rows } = await pool.query<ScanMatch>(
    `select ${COLUMNS}
     from catalog_cards c
     join sets s on s.game = c.game and s.code = c.set_code
     where ${where}
     order by s.released_at desc nulls last, c.collector_number
     limit 24`,
    params,
  );
  return rows;
}

/**
 * Finds the printings a collector-line read can refer to. Only catalog hits count, which
 * filters out most OCR noise. Order of evidence:
 *   1. a set chosen by the user ("fixed set" mode: only the number needs reading),
 *   2. a set code read on the card (Magic, Pokémon SV+),
 *   3. the printed total ("001/195"), for cards without a code,
 *   4. a set code one character off ("WCC" read on an NCC card), as a last resort: OCR gets the
 *      number right far more often than the code (14 of 15 against 9 of 15, docs/scanner.md).
 * More than one match means the caller must let the user pick.
 */
export async function lookupScan(
  line: CollectorLine,
  fixedSet?: { game: string; code: string } | null,
): Promise<ScanMatch[]> {
  const numbers = numberVariants(line.number);
  const byNumber = "c.collector_number = any($1::text[])";

  if (fixedSet) {
    return find(`${byNumber} and s.game = $2 and lower(s.code) = lower($3)`, [
      numbers,
      fixedSet.game,
      fixedSet.code,
    ]);
  }

  if (line.setCodes.length) {
    const rows = await find(
      `${byNumber} and (lower(s.code) = any($2::text[]) or upper(s.print_code) = any($3::text[]))`,
      [numbers, line.setCodes.map((c) => c.toLowerCase()), line.setCodes],
    );
    if (rows.length > 1 && line.total) {
      const total = Number(line.total);
      const exact = rows.filter((r) => r.printedTotal === total);
      if (exact.length) return exact;
    }
    if (rows.length) return rows;
  }

  if (line.total) {
    const rows = await find(`${byNumber} and s.printed_total = $2`, [numbers, Number(line.total)]);
    if (rows.length) return rows;
  }

  // Nothing matched the code as read. One wrong character threw away a card whose number was
  // read right ("NCC" as "WCC"), which is the common failure: so accept a code of the same
  // length that differs in a single position. The number still has to match, so this can't
  // invent a card; when several printings fit, the caller shows them to pick from.
  if (line.setCodes.length) {
    return find(
      `${byNumber} and exists (
         select 1
         from unnest($2::text[]) as t(read_code)
         cross join generate_series(1, length(t.read_code)) as pos
         where length(upper(coalesce(s.print_code, s.code))) = length(t.read_code)
           and overlay(upper(coalesce(s.print_code, s.code)) placing '' from pos for 1)
               = overlay(t.read_code placing '' from pos for 1)
       )`,
      [numbers, line.setCodes],
    );
  }
  return [];
}

/**
 * When an OCR'd title counts as a card name: a clearly similar name, or a reasonably similar
 * one that clearly beats the runner-up. ("aerial ee" is 0.45 to "Erial" — Wasteland in
 * Spanish — and 0.44 to four "Aerial …" cards: too close to call.)
 */
const NAME_SIMILARITY_SURE = 0.6;
const NAME_SIMILARITY_MIN = 0.45;
const NAME_MARGIN = 0.1;
/** In an album, how far below the best match a card's name may be and still be offered. */
const ALBUM_NAME_WINDOW = 0.35;

/**
 * Football albums print the name, not a number, on the front, and a player has several cards
 * in the same album (base, Élite and its Power parallel, Special One…), sometimes with the
 * name spelt differently ("Lamin Yamal"). So: every card of the album whose name is close to
 * the best match, or contains what was read, for the user to pick (D29).
 */
async function lookupInAlbum(q: string, album: { game: string; code: string }) {
  const { rows } = await pool.query<{ best: number | null }>(
    `select max(similarity(c.search_name, $1))::float8 as best
     from catalog_cards c
     where c.game = $2 and lower(c.set_code) = lower($3)`,
    [q, album.game, album.code],
  );
  const best = rows[0]?.best ?? 0;
  if (best < NAME_SIMILARITY_MIN) return [];
  return find(
    `c.game = $2 and lower(c.set_code) = lower($3)
     and (similarity(c.search_name, $1) >= $4 or c.search_name like '%' || $1 || '%')`,
    [q, album.game, album.code, Math.max(NAME_SIMILARITY_MIN, best - ALBUM_NAME_WINDOW)],
  );
}

/**
 * Fallback when the collector line can't be read: the card whose English or Spanish name best
 * matches the OCR'd title, and its printings (only the fixed set's, if one is chosen).
 */
export async function lookupByName(
  name: string,
  fixedSet?: { game: string; code: string } | null,
): Promise<ScanMatch[]> {
  const q = normalizeForSearch(name);
  if (q.replace(/[^a-z]/g, "").length < 4) return [];
  if (fixedSet?.game === "sports") return lookupInAlbum(q, fixedSet);

  // OCR tends to put a junk word before the title ("and Hoppip", "fi Lightning Bolt", from the
  // Pokémon stage badge or the frame): also try without it, and keep the best match. (Dropping
  // the last word was tried and discarded: "Aerial EE" → "aerial" matched "Aerial Guide".)
  const words = q.split(" ");
  const variants = [...new Set([q, words.slice(1).join(" ")])].filter(
    (v) => v.replace(/[^a-z]/g, "").length >= 4,
  );

  // Best similarity per card across all variants.
  type NameHit = { oracle_id: string; game: string; sim: number; len: number };
  const byOracle = new Map<string, NameHit>();
  for (const variant of variants) {
    const { rows } = await pool.query<NameHit>(
      `select oracle_id, game, max(sim)::float8 as sim, min(len) as len
       from (
         select c.oracle_id, c.game, similarity(c.search_name, $1) as sim, length(c.search_name) as len
         from catalog_cards c
         where c.search_name % $1
         union all
         select c.oracle_id, c.game, similarity(n.search_name, $1), length(n.search_name)
         from card_names n
         join catalog_cards c on c.id = n.catalog_card_id
         where n.search_name % $1
       ) m
       where oracle_id is not null
       group by oracle_id, game
       order by sim desc, len asc
       limit 3`,
      [variant],
    );
    for (const row of rows) {
      const seen = byOracle.get(row.oracle_id);
      if (!seen || row.sim > seen.sim) byOracle.set(row.oracle_id, row);
    }
  }

  // Ties go to the shortest name: "Lightning Bolt // Lightning Bolt" (an art card) has the
  // same trigrams as "Lightning Bolt".
  const [best, second] = [...byOracle.values()].sort((a, b) => b.sim - a.sim || a.len - b.len);
  if (!best) return [];
  const sure = best.sim >= NAME_SIMILARITY_SURE;
  const clear = best.sim >= NAME_SIMILARITY_MIN && (!second || best.sim - second.sim >= NAME_MARGIN);
  if (!sure && !clear) return [];

  // Pokémon prints the mechanic after the name as a logo (ex, V, GX…) that OCR can't read:
  // "Mew ex" comes out as "BE Mew XA", closest to plain "Mew". So the name also brings the
  // cards named like it plus a suffix ("pokemon:mew ex", "pokemon:mew-ex"), and the image decides.
  const cards = gameById(best.game)?.titleLogoSuffixes
    ? "(c.oracle_id = $1 or starts_with(c.oracle_id, $1 || ' ') or starts_with(c.oracle_id, $1 || '-'))"
    : "c.oracle_id = $1";
  if (fixedSet) {
    return find(`${cards} and s.game = $2 and lower(s.code) = lower($3)`, [
      best.oracle_id,
      fixedSet.game,
      fixedSet.code,
    ]);
  }
  return find(cards, [best.oracle_id]);
}

type FixedSetRef = { game: string; code: string };

/** What the AI identifier is told about the fixed set: its name and a football album's series (D31). */
export async function identifyContext(fixedSet?: FixedSetRef | null): Promise<IdentifyContext> {
  if (!fixedSet) return { game: null, setName: null, series: [] };
  const { rows } = await pool.query<{ name: string; rarities: string[] }>(
    `select s.name,
            array(select distinct c.rarity from catalog_cards c
                  where c.game = s.game and c.set_code = s.code and c.rarity is not null) as rarities
     from sets s
     where s.game = $1 and lower(s.code) = lower($2)`,
    [fixedSet.game, fixedSet.code],
  );
  const game = gameById(fixedSet.game);
  const row = rows[0];
  const series =
    row && game && !game.hasMarketPrices ? row.rarities.map((r) => rarityLabel(game, r)) : [];
  return { game: fixedSet.game, setName: row?.name ?? null, series };
}

/**
 * The catalog cards an AI reading can be (D31):
 *   - football albums: the player's cards in the album, the series the model saw first;
 *   - Magic and Pokémon: the printing with that number and that name if there is one, else the
 *     printings of that name (the name may be in Spanish: lookupByName knows both).
 */
export async function lookupReading(
  reading: CardReading,
  fixedSet?: FixedSetRef | null,
): Promise<ScanMatch[]> {
  const q = normalizeForSearch(reading.name);
  if (q.replace(/[^a-z]/g, "").length < 3) return [];
  if (fixedSet?.game === "sports") return seriesFirst(await lookupInAlbum(q, fixedSet), reading.series);

  const byName = await lookupByName(reading.name, fixedSet);
  const printed = reading.number ? splitNumber(reading.number) : null;
  if (printed) {
    const byNumber = await lookupScan(
      {
        number: printed.number,
        total: printed.total,
        setCodes: reading.setCode ? [reading.setCode.toUpperCase()] : [],
        lang: null,
      },
      fixedSet,
    );
    const both = byNumber.filter((m) => byName.some((n) => n.id === m.id));
    if (both.length) return both;
    if (!byName.length) return byNumber;
  }
  return byName;
}

/**
 * The cards a deck's list holds, to prefer them while scanning into its box (D35). Scoped to the
 * owner, so a deck id from the browser can only ever read that user's own deck.
 */
export async function deckOracleIds(ownerId: string, deckId: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ oracleId: string }>(
    `select dc.oracle_id as "oracleId"
     from deck_cards dc
     join decks d on d.id = dc.deck_id
     where d.id = $1 and d.owner_id = $2`,
    [deckId, ownerId],
  );
  return new Set(rows.map((r) => r.oracleId));
}

/** Cards by id: the one the scanner recognised by its photo (D33). */
export async function lookupIds(ids: string[]): Promise<ScanMatch[]> {
  if (!ids.length) return [];
  return find("c.id = any($1::uuid[])", [ids]);
}

/** The shared photos' hashes (D33), of one set or of all; `hash` is null until computed. */
export async function photoHashRows(set?: FixedSetRef | null) {
  const { rows } = await pool.query<{ id: string; hash: string | null }>(
    `select p.catalog_card_id as id, p.hash
     from catalog_card_photos p
     join catalog_cards c on c.id = p.catalog_card_id
     ${set ? "where c.game = $1 and lower(c.set_code) = lower($2)" : ""}
     limit 20000`,
    set ? [set.game, set.code] : [],
  );
  return rows;
}
