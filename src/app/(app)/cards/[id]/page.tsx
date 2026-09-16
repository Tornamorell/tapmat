import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConditionBadge, LanguageFlag } from "@/components/card-attributes";
import { CardPhotoButton } from "@/components/card-photo-button";
import { SetIcon } from "@/components/card-thumb";
import { HoloCard } from "@/components/holo-card";
import { ItemActions, QuantityControl, type ActionItem } from "@/components/item-actions";
import { RarityMark } from "@/components/rarity-mark";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur } from "@/lib/format";
import { finishLabel, gameById, rarityLabel } from "@/lib/games";
import { gradeLabel } from "@/lib/grading";
import { getOwnedStacks, getPrinting, getPrintingsOf, getSpanishName } from "@/lib/queries/cards";
import { collectionOptions, collectionsOfCard } from "@/lib/queries/collections";
import { locationOptions } from "@/lib/queries/locations";
import { priceHistory } from "@/lib/queries/value";
import { isAdmin, requireUser } from "@/lib/session";
import { ValueChart } from "@/components/value-chart";
import { cn } from "@/lib/utils";
import { isCardPhoto } from "@/lib/card-photo";
import { EntryControls } from "../../collections/[id]/entry-controls";
import { AddCopy } from "./add-copy";
import { WantInCollection } from "./want-in-collection";

async function load(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const printing = await getPrinting(id);
  if (!printing) notFound();
  return printing;
}

export async function generateMetadata({ params }: PageProps<"/cards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const printing = await load(id);
  return { title: printing.name };
}

export default async function CardPage({ params }: PageProps<"/cards/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const printing = await load(id);
  const oracleId = printing.oracleId;

  const [printings, spanishName, owned, collections, locations, lists, history] = await Promise.all([
    oracleId ? getPrintingsOf(oracleId) : Promise.resolve([printing]),
    oracleId ? getSpanishName(oracleId) : Promise.resolve(null),
    oracleId ? getOwnedStacks(user.id, oracleId) : Promise.resolve([]),
    collectionOptions(user.id),
    locationOptions(user.id),
    collectionsOfCard(user.id, printing.id),
    priceHistory(printing.id),
  ]);
  const historySeries = [
    {
      key: "nonfoil",
      label: finishLabel(printing.game, "nonfoil"),
      color: "var(--chart-1)",
      values: history.map((h) => h.eur),
    },
    {
      key: "foil",
      label: finishLabel(printing.game, "foil"),
      color: "var(--chart-2)",
      values: history.map((h) => h.eurFoil),
    },
  ].filter((s) => s.values.some((v) => v != null));

  const updated = printing.pricesUpdatedAt
    ? new Date(printing.pricesUpdatedAt).toLocaleDateString("es-ES")
    : null;
  const game = gameById(printing.game);
  const setHref = game ? `/catalog/${game.slug}/${printing.setCode}` : null;
  const setName = printing.setName ?? printing.setCode.toUpperCase();

  return (
    <div className="space-y-8">
      {game && setHref && (
        <Breadcrumbs
          items={[
            { label: "Catálogo", href: "/catalog" },
            { label: game.name, href: `/catalog/${game.slug}` },
            { label: setName, href: setHref },
            { label: printing.name },
          ]}
        />
      )}
      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          <HoloCard
            src={printing.imageNormal}
            alt={printing.name}
            label={`#${printing.collectorNumber}`}
            foil={printing.finishes.includes("foil") && !printing.finishes.includes("nonfoil")}
          />
          {/* No catalog image: anyone can share a photo of theirs (D30). */}
          {(!printing.imageNormal || isCardPhoto(printing.imageNormal)) && (
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <CardPhotoButton
                catalogCardId={printing.id}
                hasPhoto={!!printing.imageNormal}
                canDelete={isAdmin(user)}
              />
              <span className="text-muted-foreground text-xs">
                {printing.imageNormal ? "Foto de un coleccionista" : "Sin imagen: la tuya la verán todos"}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{printing.name}</h1>
            {spanishName && <p className="text-muted-foreground">{spanishName}</p>}
            {printing.typeLine && <p className="text-sm">{printing.typeLine}</p>}
            <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
              <SetIcon src={printing.setIcon} alt="" />
              {setHref ? (
                <Link href={setHref} className="hover:text-foreground underline-offset-2 hover:underline">
                  {setName}
                </Link>
              ) : (
                setName
              )}{" "}
              · #{printing.collectorNumber}
              {game && printing.rarity && (
                <>
                  {" · "}
                  <RarityMark rarity={printing.rarity} />
                  {rarityLabel(game, printing.rarity)}
                </>
              )}
            </p>
          </div>

          {game?.hasMarketPrices !== false && (
            <>
              <dl className="grid max-w-md grid-cols-3 gap-3">
                <Price label={finishLabel(printing.game, "nonfoil")} value={printing.priceEur} />
                <Price label={finishLabel(printing.game, "foil")} value={printing.priceEurFoil} />
                <Price label="USD" value={printing.priceUsd} format={(v) => `$${v.toFixed(2)}`} />
              </dl>
              <p className="text-muted-foreground text-xs">
                Precios de Cardmarket vía {game?.sourceName ?? "Scryfall"}
                {updated && `, actualizados el ${updated}`}.{" "}
                {printing.cardmarketId && (
                  <a
                    className="underline"
                    href={`https://www.cardmarket.com/es/${game?.cardmarketCategory ?? "Magic"}/Products?idProduct=${printing.cardmarketId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver en Cardmarket
                  </a>
                )}
              </p>
            </>
          )}

          <AddCopy
            printingId={printing.id}
            finishes={printing.finishes}
            finishLabels={game?.finishLabels}
            locations={locations}
            collections={collections}
          />
          <WantInCollection
            printingId={printing.id}
            collections={collections}
            listedIn={lists.map((l) => l.id)}
          />

          {owned.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">En tus cartas</h2>
              {/* Each stack with the same −/+ and ⋯ menu as in «Mis cartas»: edit, grade, move, split, delete. */}
              <ul className="space-y-2 text-sm">
                {owned.map((s) => (
                  <li
                    key={s.id}
                    className="bg-card flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      {s.setCode.toUpperCase()} #{s.collectorNumber}, {finishLabel(printing.game, s.finish)}{" "}
                      <ConditionBadge condition={s.condition} /> <LanguageFlag code={s.language} withName />
                      {s.gradingCompany && (
                        <>
                          , <strong>{gradeLabel(s.gradingCompany, s.grade)}</strong>
                          {s.certNumber && ` (certificado ${s.certNumber})`}
                          {s.marketPriceEur != null && (
                            <span className="text-muted-foreground" title="Precio de Cardmarket sin gradear">
                              , raw {formatEur(s.marketPriceEur)}
                            </span>
                          )}
                        </>
                      )}
                      {s.estimatedValueEur != null && (
                        <>
                          , valor estimado{" "}
                          <span className="text-primary font-medium">{formatEur(s.estimatedValueEur)}</span>
                        </>
                      )}
                      {s.locationId && (
                        <>
                          {" en "}
                          <Link href={`/locations/${s.locationId}`} className="underline">
                            {s.locationName}
                          </Link>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <QuantityControl itemId={s.id} quantity={s.quantity} />
                      <ItemActions item={actionItem(s)} locations={locations} collections={collections} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lists.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">En tus colecciones</h2>
              {/* This printing in each list: copies wanted −/+ and taking it off, as on the collection's page. */}
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {lists.map((l) => (
                  <li key={l.id} className="bg-card rounded-lg border px-3 py-2">
                    <Link href={`/collections/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <EntryControls collectionId={l.id} catalogCardId={printing.id} wanted={l.wanted} name={printing.name} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Histórico de precio</h2>
        {history.length >= 2 && historySeries.length > 0 ? (
          <div className="bg-card rounded-xl border p-4">
            <ValueChart dates={history.map((h) => h.date)} series={historySeries} height={200} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Se guarda un precio al día de las cartas que tienes, desde que añades la primera copia.
            {history.length === 1 && " De momento hay uno."}
          </p>
        )}
      </section>

      {printings.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Ediciones ({printings.length})</h2>
          <div className="bg-card overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Edición</TableHead>
                  <TableHead>Nº</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">{finishLabel(printing.game, "nonfoil")}</TableHead>
                  <TableHead className="text-right">{finishLabel(printing.game, "foil")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printings.map((p) => (
                  <TableRow key={p.id} className={cn(p.id === printing.id && "bg-primary/8")}>
                    <TableCell>
                      <Link href={`/cards/${p.id}`} className="flex items-center gap-1.5 hover:underline">
                        <SetIcon src={p.setIcon} alt="" />
                        {p.setName ?? p.setCode.toUpperCase()}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{p.collectorNumber}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{p.releasedAt?.slice(0, 4)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur(p.priceEur)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur(p.priceEurFoil)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

/** A stack as the ⋯ menu wants it (the same menu as in «Mis cartas»). */
function actionItem(s: Awaited<ReturnType<typeof getOwnedStacks>>[number]): ActionItem {
  return {
    id: s.id,
    catalogCardId: s.printingId,
    game: s.game,
    name: s.name,
    quantity: s.quantity,
    finish: s.finish,
    condition: s.condition,
    language: s.language,
    locationId: s.locationId,
    sectionId: s.sectionId,
    notes: s.notes,
    purchasePriceEur: s.purchasePriceEur,
    estimatedValueEur: s.estimatedValueEur,
    gradingCompany: s.gradingCompany,
    grade: s.grade,
    certNumber: s.certNumber,
    finishes: s.finishes,
  };
}

function Price({
  label,
  value,
  format = formatEur,
}: {
  label: string;
  value: number | null;
  format?: (v: number) => string;
}) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value == null ? "—" : format(value)}</dd>
    </div>
  );
}
