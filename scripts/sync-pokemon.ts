/**
 * Pokémon catalog + prices from TCGdex. TCGdex has no bulk download and only the per-card
 * endpoint carries prices, so a full sync is ~21k requests (~20 min). Hence two modes (D17):
 *
 *   npm run sync:pokemon                  # full: sets, every card, Spanish names (weekly)
 *   npm run sync:pokemon -- --owned-only  # prices of the printings you own only (daily)
 *   npm run sync:pokemon -- --sets-only   # set metadata only
 *
 * Both end with the day's price snapshot.
 */
import { pool } from "../src/db/client";
import {
  refreshSetCounts,
  upsertCatalogCards,
  upsertNamesByExternalId,
  upsertSets,
} from "../src/lib/catalog/upsert";
import { mapLimit } from "../src/lib/concurrency";
import { snapshotPrices } from "../src/lib/prices/snapshot";
import type { CatalogCardRow } from "../src/lib/scryfall/map";
import { normalizeForSearch } from "../src/lib/search/normalize";
import { assetExists, getCard, getSet, listCards, listSets } from "../src/lib/tcgdex/client";
import { EXCLUDED_SERIES, mapTcgdexCard, mapTcgdexSet, symbolCandidates } from "../src/lib/tcgdex/map";

const ownedOnly = process.argv.includes("--owned-only");
// Only refresh set metadata (~1 min), e.g. after adding a column to `sets`.
const setsOnly = process.argv.includes("--sets-only");
const CONCURRENCY = 6;
const BATCH_SIZE = 500;
const fetchedAt = new Date();
const today = fetchedAt.toISOString().slice(0, 10);
const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;

const releaseBySet = new Map<string, string | null>();
let cardIds: string[];

if (ownedOnly) {
  const { rows } = await pool.query<{ external_id: string; set_code: string; released_at: string | null }>(
    `select distinct c.external_id, c.set_code, c.released_at::text as released_at
     from catalog_cards c
     join items i on i.catalog_card_id = c.id
     where c.game = 'pokemon'`,
  );
  for (const r of rows) releaseBySet.set(r.set_code, r.released_at);
  cardIds = rows.map((r) => r.external_id);
  console.log(`Owned Pokémon printings to refresh: ${cardIds.length}`);
} else {
  const briefs = await listSets("en");
  const details = await mapLimit(briefs, CONCURRENCY, (b) => getSet(b.id));
  const sets = details.filter((s) => !EXCLUDED_SERIES.includes(s.serie.id));

  const setRows = await mapLimit(sets, CONCURRENCY, async (s) => {
    // The API advertises the symbol under /univ/, where it almost never is: 148 of the 169 sets
    // that advertise one keep it under the language path instead, me05 only under /univ/, and a
    // few that advertise none at all still have one where the rest do. So try each in turn and
    // keep the first that really is an image — the asset host answers 200 with a 295-byte HTML
    // page for anything it hasn't got, so assetExists checks the content type and not the
    // status. Checked 2026-09-16, docs/data-sources.md.
    let icon: string | null = null;
    for (const url of symbolCandidates(s.symbol, s.serie.id, s.id)) {
      if (await assetExists(url)) {
        icon = url;
        break;
      }
    }
    return mapTcgdexSet(s, icon);
  });
  await upsertSets(setRows);
  for (const s of sets) releaseBySet.set(s.id, s.releaseDate ?? null);
  cardIds = sets.flatMap((s) => s.cards.map((c) => c.id));
  console.log(`Sets: ${sets.length} (${briefs.length - sets.length} digital skipped), cards: ${cardIds.length} (${elapsed()})`);

  if (setsOnly) {
    await refreshSetCounts();
    await pool.end();
    process.exit(0);
  }
}

let batch: CatalogCardRow[] = [];
let fetched = 0;
let missing = 0;

async function flush() {
  const rows = batch;
  batch = [];
  await upsertCatalogCards(rows);
}

await mapLimit(cardIds, CONCURRENCY, async (id) => {
  const card = await getCard(id);
  fetched++;
  if (!card) {
    missing++;
    return;
  }
  batch.push(mapTcgdexCard(card, { releasedAt: releaseBySet.get(card.set.id) ?? null }, fetchedAt));
  if (batch.length >= BATCH_SIZE) await flush();
  if (fetched % 2000 === 0) console.log(`  ${fetched}/${cardIds.length} cards (${elapsed()})`);
});
await flush();
console.log(`Cards: ${fetched - missing} upserted, ${missing} not found (${elapsed()})`);

if (!ownedOnly) {
  const spanish = await listCards("es");
  for (let i = 0; i < spanish.length; i += 2000) {
    await upsertNamesByExternalId(
      "pokemon",
      spanish.slice(i, i + 2000).map((c) => ({
        externalId: c.id,
        lang: "es",
        printedName: c.name,
        searchName: normalizeForSearch(c.name),
      })),
    );
  }
  await refreshSetCounts();
  console.log(`Spanish names: ${spanish.length} listed (${elapsed()})`);
}

const snapshot = await snapshotPrices(today);
console.log(`Snapshot ${today}: ${snapshot.printings} printings, ${snapshot.owners} inventories (${elapsed()})`);

await pool.end();
