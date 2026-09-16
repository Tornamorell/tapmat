import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deckOracleIds, lookupByName } from "@/lib/queries/scan";
import { preferListed } from "@/lib/scan/prefer";

const body = z.object({
  name: z.string().min(2).max(80),
  fixedSet: z.object({ game: z.enum(["mtg", "pokemon", "sports"]), code: z.string().max(20) }).nullish(),
  /** Scanning into a deck's box: its list breaks the ties (D35). */
  deckId: z.uuid().nullish(),
});

/** Scanner fallback: printings matching an OCR'd card title (fuzzy). */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const matches = await lookupByName(parsed.data.name, parsed.data.fixedSet);
  const { deckId } = parsed.data;
  const preferred = deckId
    ? preferListed(matches, await deckOracleIds(session.user.id, deckId))
    : matches;
  return NextResponse.json({ matches: preferred });
}
