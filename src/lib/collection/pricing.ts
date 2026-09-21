import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { catalogCards, items } from "@/db/schema";

type Finish = (typeof items.$inferSelect)["finish"];

interface PricedCard {
  priceEur: number | null;
  priceEurFoil: number | null;
}

/**
 * Unit price in EUR (Cardmarket, via Scryfall) for a copy with the given finish.
 * Scryfall has no EUR price for etched foils, so those stay unpriced.
 * Keep in sync with unitPriceEurSql below.
 */
export function unitPriceEur(finish: Finish, card: PricedCard | null): number | null {
  if (!card) return null;
  if (finish === "nonfoil") return card.priceEur;
  if (finish === "foil") return card.priceEurFoil;
  return null;
}

/**
 * SQL twin of unitPriceEur() over any pair of price columns: today's catalog prices, or a
 * day's row in price_snapshots.
 */
export function unitPriceSql(
  finish: SQLWrapper,
  eur: SQLWrapper,
  eurFoil: SQLWrapper,
): SQL<number | null> {
  return sql`(case ${finish} when 'nonfoil' then ${eur} when 'foil' then ${eurFoil} end)`;
}

/** Today's market price of each stack, for queries over items joined to catalog_cards. */
export const unitPriceEurSql = unitPriceSql(
  items.finish,
  catalogCards.priceEur,
  catalogCards.priceEurFoil,
);

/**
 * What a copy is worth: the user's own estimate when set (graded, signed…), else the market
 * price for its finish (D27). Keep in sync with itemValueEurSql.
 */
export function itemValueEur(
  finish: Finish,
  card: PricedCard | null,
  estimatedValueEur: number | null | undefined,
): number | null {
  return estimatedValueEur ?? unitPriceEur(finish, card);
}

/** SQL twin of itemValueEur(): the per-copy value every total uses. */
export const itemValueEurSql: SQL<number | null> =
  sql`coalesce(${items.estimatedValueEur}, ${unitPriceEurSql})`;

/** Where a copy's value comes from, so the UI can say it instead of implying it's all market data. */
export type PriceSource = "estimate" | "graded-raw" | "market" | "none";

/**
 * Which rule in itemValueEur() actually produced the value (D39). "graded-raw" is the one worth
 * noticing: a slab priced as the loose card, which is almost never what it's worth — it needs an
 * estimate (D27). Pass `unitPriceEur` as the value shown; the market price works too, because
 * when there's an estimate the first branch wins anyway.
 */
export function priceSource(copy: {
  estimatedValueEur?: number | null;
  gradingCompany?: string | null;
  unitPriceEur?: number | null;
}): PriceSource {
  if (copy.estimatedValueEur != null) return "estimate";
  if (copy.unitPriceEur == null) return "none";
  return copy.gradingCompany ? "graded-raw" : "market";
}

export interface StackValue {
  valueEur: number;
  cardCount: number;
  /** Copies with no known price. Reported separately instead of counted as zero. */
  unpricedCount: number;
}

export function sumValue(
  stacks: Array<{
    quantity: number;
    finish: Finish;
    card: PricedCard | null;
    estimatedValueEur?: number | null;
  }>,
): StackValue {
  let valueEur = 0;
  let cardCount = 0;
  let unpricedCount = 0;
  for (const s of stacks) {
    cardCount += s.quantity;
    const unit = itemValueEur(s.finish, s.card, s.estimatedValueEur);
    if (unit == null) unpricedCount += s.quantity;
    else valueEur += unit * s.quantity;
  }
  return { valueEur: Math.round(valueEur * 100) / 100, cardCount, unpricedCount };
}
