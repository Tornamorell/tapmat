import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getPrinting, getPrintingsOf } from "@/lib/queries/cards";

/**
 * Every paper printing of a card. Two ways in, one answer: the card picker asks by `oracleId`,
 * and «Cambiar expansión…» by the `cardId` of the copy it's re-filing, which resolves to the
 * same card. Asked for only when needed: a popular card has dozens of printings.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;

  // Re-filing a stack: the copy's printing says which card it is.
  const cardId = z.uuid().safeParse(params.get("cardId"));
  if (cardId.success) {
    const card = await getPrinting(cardId.data);
    // A card with no oracle id (football, D29) has no other editions to move between.
    if (!card?.oracleId) return NextResponse.json([]);
    return NextResponse.json(await getPrintingsOf(card.oracleId));
  }

  // Not only UUIDs: Pokémon groups printings by name, "pokemon:charizard ex" (D19).
  const oracleId = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .safeParse(params.get("oracleId"));
  if (!oracleId.success) return NextResponse.json({ error: "Bad oracleId" }, { status: 400 });

  return NextResponse.json(await getPrintingsOf(oracleId.data));
}
