import { pool } from "@/db/client";
import { normalizeForSearch } from "@/lib/search/normalize";
import type { PrintingQuery } from "@/lib/search/printing-query";

export interface CardSearchResult {
  /** Groups printings of the same card: Scryfall oracle_id, or "pokemon:<name>" (D19). */
  oracleId: string;
  game: string;
  name: string;
  /** Spanish name, when the match came from it (or the card has one). */
  printedName: string | null;
  /**
   * The most recent printing with an image — used for the thumbnail and as the default link
   * target. The newest outright when none has one (football albums).
   */
  printingId: string;
  imageSmall: string | null;
  printings: number;
  /** Only on printing matches ("obf 125"): `printingId` is then the exact printing typed. */
  setCode?: string;
  setName?: string | null;
  collectorNumber?: string;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Card-level (oracle) search over English and Spanish names of every game, accent-insensitive.
 * Prefix matches rank first, then trigram similarity.
 */
export async function searchCards(query: string, limit = 12): Promise<CardSearchResult[]> {
  const q = normalizeForSearch(query);
  if (q.length < 2) return [];

  const { rows } = await pool.query<CardSearchResult>(
    `with matches as (
       select c.oracle_id, c.search_name as s, null::text as printed_name
       from catalog_cards c
       where c.oracle_id is not null and c.search_name like $1
       union all
       select c.oracle_id, n.search_name, n.printed_name
       from card_names n
       join catalog_cards c on c.id = n.catalog_card_id
       where n.search_name like $1 and c.oracle_id is not null
     ),
     ranked as (
       select oracle_id,
              max(printed_name) as printed_name,
              bool_or(s like $2) as prefix,
              max(similarity(s, $3)) as sim
       from matches
       group by oracle_id
       order by prefix desc, sim desc
       limit $4
     )
     select r.oracle_id as "oracleId", latest.game, latest.name, r.printed_name as "printedName",
            latest.id as "printingId", latest.image_small as "imageSmall",
            latest.printings::int as printings
     from ranked r
     cross join lateral (
       select c.id, c.game, c.name, c.image_small, count(*) over () as printings
       from catalog_cards c
       where c.oracle_id = r.oracle_id
       -- An image first: the newest printing is often one the source hasn't pictured yet (a
       -- Trainer Gallery «Pikachu V»), and a result without a picture looked broken.
       order by c.image_small is null, c.released_at desc nulls last
       limit 1
     ) latest
     order by r.prefix desc, r.sim desc, latest.name`,
    [`%${escapeLike(q)}%`, `${escapeLike(q)}%`, q, limit],
  );
  return rows;
}

/**
 * Printing-level search for queries like "obf 125" or "125/197" (parsePrintingQuery): the
 * collector number must match, and every other word must be the set code (or the code printed
 * on the cards) or part of the English or Spanish name. Newest sets first.
 */
export async function searchPrintings(query: PrintingQuery, limit = 12): Promise<CardSearchResult[]> {
  const { rows } = await pool.query<CardSearchResult>(
    `select c.oracle_id as "oracleId", c.game, c.name, null as "printedName",
            c.id as "printingId", c.image_small as "imageSmall", 1 as printings,
            c.set_code as "setCode", s.name as "setName", c.collector_number as "collectorNumber"
     from catalog_cards c
     join sets s on s.game = c.game and s.code = c.set_code
     where c.oracle_id is not null
       and lower(c.collector_number) = any($1::text[])
       and ($2::int is null or s.printed_total = $2)
       and not exists (
         select 1 from unnest($3::text[]) w
         where w <> lower(s.code)
           and w <> coalesce(lower(s.print_code), '')
           and c.search_name not like '%' || w || '%'
           and not exists (
             select 1 from card_names n
             where n.catalog_card_id = c.id and n.search_name like '%' || w || '%'
           )
       )
     order by s.released_at desc nulls last, c.name
     limit $4`,
    [query.numbers, query.total, query.words.map(escapeLike), limit],
  );
  return rows;
}
