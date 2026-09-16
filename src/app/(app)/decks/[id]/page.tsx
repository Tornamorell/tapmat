import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CardThumb } from "@/components/card-thumb";
import { ColorIdentity, colorDotClass } from "@/components/mana-cost";
import { ProgressMeter } from "@/components/progress-meter";
import {
  analyzeDeck,
  bracketHint,
  MANA_KEYS,
  MANA_LABELS,
  openingHandLands,
  TYPE_GROUPS,
  TYPE_LABELS,
  typeGroup,
  type DeckAnalysis,
} from "@/lib/decks/analysis";
import { BOARD_LABELS, formatDecklist, type Board } from "@/lib/decks/decklist";
import { cardRoles, ROLE_LABELS, ROLE_REFERENCE, ROLES, roleCounts, type Role } from "@/lib/decks/roles";
import { formatEur } from "@/lib/format";
import { boxContents, deckCardRows, getDeck, type DeckCardRow } from "@/lib/queries/decks";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { DeckAdder } from "./deck-adder";
import { DeckCardRow as CardRow, type DeckCardView } from "./deck-card-row";
import { DeckTools } from "./deck-tools";
import { OpeningHand } from "./opening-hand";

export const metadata: Metadata = { title: "Mazo" };

const CURVE_LABELS = ["0", "1", "2", "3", "4", "5", "6", "7+"];

/** A deck: its cards, where their copies are, and its analysis (D35). */
export default async function DeckPage({ params }: PageProps<"/decks/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const deck = await getDeck(user.id, id);
  if (!deck) notFound();
  const [rows, box] = await Promise.all([
    deckCardRows(user.id, id),
    deck.locationId ? boxContents(user.id, deck.locationId) : Promise.resolve([]),
  ]);
  const a = analyzeDeck(rows);

  // Copies wanted of each played card (commander and main deck), against what's in the box.
  const want = new Map<string, number>();
  for (const r of rows) if (r.board === "commander" || r.board === "main") want.set(r.oracleId, (want.get(r.oracleId) ?? 0) + r.quantity);
  let covered = 0;
  let pullable = 0;
  let toBuy = 0;
  for (const [oracleId, n] of want) {
    const r = rows.find((x) => x.oracleId === oracleId)!;
    const inBox = Math.min(n, r.inBox);
    const canPull = Math.min(n - inBox, r.free);
    covered += inBox;
    pullable += canPull;
    toBuy += (n - inBox - canPull) * (r.priceEur ?? 0);
  }
  const listed = new Map<string, number>();
  for (const r of rows) listed.set(r.oracleId, (listed.get(r.oracleId) ?? 0) + r.quantity);
  const extras = box.filter((b) => b.copies > (listed.get(b.oracleId) ?? 0));
  // Copies in the box beyond what the list asks for: a double scan, or a card of another deck.
  const extraCopies = extras.reduce((n, e) => n + e.copies - (listed.get(e.oracleId) ?? 0), 0);
  // Of those, the ones the list can hold (Magic, with its rules data): what the button adds.
  const listableCopies = extras
    .filter((e) => e.listable)
    .reduce((n, e) => n + e.copies - (listed.get(e.oracleId) ?? 0), 0);

  // What each card does: the owner's choice, or the guess from its text.
  const rolesOf = (r: DeckCardRow) => (r.manualRoles as Role[] | null) ?? cardRoles(r);
  const roles = roleCounts(rows.map((r) => ({ board: r.board, quantity: r.quantity, roles: rolesOf(r) })));
  const library = rows
    .filter((r) => r.board === "main")
    .map((r) => ({
      oracleId: r.oracleId,
      name: r.name,
      imageSmall: r.imageSmall,
      imageNormal: r.imageNormal,
      printingId: r.printingId,
      isLand: typeGroup(r.typeLine) === "land",
      quantity: r.quantity,
    }));

  const view = (r: DeckCardRow): DeckCardView => ({
    roles: rolesOf(r),
    manualRoles: r.manualRoles !== null,
    board: r.board,
    oracleId: r.oracleId,
    quantity: r.quantity,
    name: r.name,
    manaCost: r.manaCost,
    printingId: r.printingId,
    imageSmall: r.imageSmall,
    priceEur: r.priceEur,
    status:
      r.board === "commander" || r.board === "main"
        ? { inBox: r.inBox, want: want.get(r.oracleId) ?? r.quantity, free: r.free, freeWhere: r.freeWhere, inOtherDecks: r.inOtherDecks }
        : null,
  });
  const commanders = rows.filter((r) => r.board === "commander");
  const exportText = formatDecklist(
    rows.map((r) => ({
      board: r.board,
      quantity: r.quantity,
      name: r.name,
      // The printing chosen or the one in the box; with neither, any printing will do.
      setCode: r.preferredPrintingId || r.boxedPrintingId ? r.setCode : null,
      collectorNumber: r.preferredPrintingId || r.boxedPrintingId ? r.collectorNumber : null,
    })),
  );

  const section = (title: string, cards: DeckCardRow[]) =>
    cards.length ? (
      <section key={title} className="space-y-1">
        <h3 className="text-muted-foreground border-b pb-1 text-sm font-semibold">
          {title} <span className="font-normal tabular-nums">({cards.reduce((n, c) => n + c.quantity, 0)})</span>
        </h3>
        <ul className="divide-y">
          {cards.map((c) => (
            <CardRow key={`${c.board}-${c.oracleId}`} deckId={deck.id} card={view(c)} />
          ))}
        </ul>
      </section>
    ) : null;
  const onBoard = (b: Board) => rows.filter((r) => r.board === b);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Mazos", href: "/decks" }, { label: deck.name }]} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex shrink-0 items-start -space-x-10">
          {commanders.length ? (
            commanders.map((c) => <CardThumb key={c.oracleId} src={c.imageSmall} alt={c.name} size="md" />)
          ) : (
            <CardThumb src={null} alt="Sin comandante" size="md" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{deck.name}</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <span>Commander</span>
              <ColorIdentity colors={a.identity} />
              <span className="tabular-nums">{a.size}/100 cartas</span>
              <span className="text-primary font-semibold">{formatEur(a.price)}</span>
            </p>
          </div>
          <div className="max-w-md space-y-1">
            <p className="text-sm">
              En la caja{" "}
              {deck.locationId ? (
                <Link href={`/locations/${deck.locationId}`} className="font-medium hover:underline">
                  «{deck.locationName}»
                </Link>
              ) : (
                "del mazo"
              )}
              : <strong>{covered}</strong> de {a.size}
              {toBuy > 0 && <span className="text-muted-foreground"> · comprar lo que falta, ~{formatEur(toBuy)}</span>}
              {extraCopies > 0 && (
                <>
                  {" · "}
                  <a href="#de-mas" className="text-amber-700 hover:underline dark:text-amber-400">
                    {extraCopies} de más
                  </a>
                </>
              )}
            </p>
            <ProgressMeter value={covered} max={Math.max(a.size, 1)} showLabel={false} className="w-full" />
          </div>
          <DeckTools deckId={deck.id} name={deck.name} pullable={pullable} listable={listableCopies} exportText={exportText}>
            <OpeningHand cards={library} />
          </DeckTools>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <DeckAdder deckId={deck.id} hasCommander={commanders.length > 0} />
          {!rows.length && (
            <p className="text-muted-foreground text-sm">
              El mazo está vacío. Busca cartas arriba, o pega su lista con «Pegar lista».
            </p>
          )}
          {section(BOARD_LABELS.commander, commanders)}
          {TYPE_GROUPS.map((g) => section(TYPE_LABELS[g], onBoard("main").filter((r) => typeGroup(r.typeLine) === g)))}
          {section(BOARD_LABELS.side, onBoard("side"))}
          {section(BOARD_LABELS.maybe, onBoard("maybe"))}
          {extras.length > 0 && (
            <section id="de-mas" className="scroll-mt-20 space-y-1">
              <h3 className="text-muted-foreground border-b pb-1 text-sm font-semibold">
                En la caja, de más <span className="font-normal tabular-nums">({extraCopies})</span>
              </h3>
              <p className="text-muted-foreground text-xs">
                Copias que la lista no pide: un escaneo repetido o una carta de otro mazo. Añádelas a la lista
                con «Añadir a la lista lo de la caja», o quítalas y muévelas{" "}
                {deck.locationId ? (
                  <Link href={`/locations/${deck.locationId}`} className="hover:text-foreground underline">
                    desde la caja
                  </Link>
                ) : (
                  "desde la caja"
                )}
                .
              </p>
              <ul className="text-sm">
                {extras.map((e) => {
                  const inList = listed.get(e.oracleId) ?? 0;
                  return (
                    <li key={e.oracleId}>
                      {e.copies - inList} {e.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {inList ? `la lista pide ${inList} y hay ${e.copies}` : "no está en la lista"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <Analysis a={a} roles={roles} />
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Analysis({ a, roles }: { a: DeckAnalysis; roles: Record<Role, number> }) {
  const maxCurve = Math.max(1, ...a.curve);
  const totalPips = MANA_KEYS.reduce((n, k) => n + a.pips[k], 0);
  const colors = MANA_KEYS.filter((k) => a.pips[k] || a.landSources[k] || a.otherSources[k]);
  const hand = openingHandLands(a.copies.main, a.types.land);
  const pct = (p: number) => `${Math.round(p * 100)} %`;
  return (
    <>
      <Panel title="Reglas de Commander">
        {a.issues.length ? (
          <ul className="space-y-2 text-sm">
            {a.issues.map((issue) => (
              <li key={issue.message} className="text-amber-800 dark:text-amber-300">
                {issue.message}
                {issue.cards && <span className="text-foreground block text-xs">{issue.cards.join(", ")}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Cumple las reglas de Commander.</p>
        )}
        <div className="space-y-1 border-t pt-3 text-sm">
          <p>
            <strong>Game Changers:</strong> {a.gameChangers.length ? a.gameChangers.join(", ") : "ninguno"}
          </p>
          <p className="text-muted-foreground text-xs">{bracketHint(a.gameChangers.length)}</p>
        </div>
      </Panel>

      <Panel title="Curva de maná">
        <div
          className="flex h-36 items-end gap-1.5"
          role="img"
          aria-label={a.curve.map((n, i) => `${CURVE_LABELS[i]}: ${n}`).join(", ")}
        >
          {a.curve.map((n, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs tabular-nums">{n || ""}</span>
              <div
                className="bg-primary w-full rounded-t-sm"
                style={{ height: `${Math.round((n / maxCurve) * 100)}px` }}
                title={`${n} con valor ${CURVE_LABELS[i]}`}
              />
              <span className="text-muted-foreground text-xs">{CURVE_LABELS[i]}</span>
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Valor de maná medio</dt>
            <dd className="font-semibold tabular-nums">{a.averageCmc == null ? "—" : a.averageCmc.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Tierras</dt>
            <dd className="font-semibold tabular-nums">
              {a.types.land}
              {a.mdfcLands > 0 && <span className="text-muted-foreground font-normal"> +{a.mdfcLands} de doble cara</span>}
            </dd>
          </div>
          {a.copies.main >= 7 && (
            <div className="col-span-2">
              <dt className="text-muted-foreground text-xs">Mano inicial con 2 a 4 tierras</dt>
              <dd className="font-semibold tabular-nums">
                {pct(hand.twoToFour)}
                <span className="text-muted-foreground font-normal"> · 2 o más: {pct(hand.atLeastTwo)}</span>
              </dd>
            </div>
          )}
        </dl>
      </Panel>

      <Panel title="Funciones">
        <ul className="space-y-1 text-sm">
          {ROLES.map((r) => (
            <li key={r} className="flex justify-between gap-2">
              <span>{ROLE_LABELS[r]}</span>
              <span className="tabular-nums">
                {roles[r]}
                {ROLE_REFERENCE[r] != null && <span className="text-muted-foreground text-xs"> / ~{ROLE_REFERENCE[r]}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Deducidas del texto de cada carta; corrígelas con la etiqueta de su fila. La cifra con «~» es una
          referencia habitual en Commander, no una regla.
        </p>
      </Panel>

      <Panel title="Tipos">
        <ul className="space-y-1 text-sm">
          {TYPE_GROUPS.filter((g) => a.types[g]).map((g) => (
            <li key={g} className="flex justify-between">
              <span>{TYPE_LABELS[g]}</span>
              <span className="tabular-nums">{a.types[g]}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Colores">
        {colors.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="text-left font-normal">Color</th>
                <th className="text-right font-normal">Símbolos</th>
                <th className="text-right font-normal">Tierras</th>
                <th className="text-right font-normal">Otras fuentes</th>
              </tr>
            </thead>
            <tbody>
              {colors.map((k) => (
                <tr key={k}>
                  <td className="py-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("size-3 rounded-full", k === "C" ? "bg-muted ring-foreground/20 ring-1" : colorDotClass(k))} />
                      {MANA_LABELS[k]}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {a.pips[k]}
                    {totalPips > 0 && a.pips[k] > 0 && (
                      <span className="text-muted-foreground text-xs"> ({Math.round((a.pips[k] / totalPips) * 100)} %)</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{a.landSources[k]}</td>
                  <td className="text-right tabular-nums">{a.otherSources[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground text-sm">Sin cartas todavía.</p>
        )}
        <p className="text-muted-foreground text-xs">
          Símbolos de color en los costes, frente a las cartas que dan maná de ese color.
        </p>
      </Panel>

      {a.unpriced > 0 && (
        <p className="text-muted-foreground text-xs">
          {a.unpriced} {a.unpriced === 1 ? "copia no tiene" : "copias no tienen"} precio en Cardmarket y no cuentan en el total.
        </p>
      )}
    </>
  );
}
