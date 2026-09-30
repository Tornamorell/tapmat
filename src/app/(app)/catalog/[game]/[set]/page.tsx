import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SetIcon } from "@/components/card-thumb";
import { EntrySettings } from "@/components/entry-target";
import { OwnedCardTile } from "@/components/owned-card-tile";
import { ProgressMeter } from "@/components/progress-meter";
import { RarityMark } from "@/components/rarity-mark";
import { buttonVariants } from "@/components/ui/button";
import { formatEur, formatInt } from "@/lib/format";
import { gameBySlug, rarityLabel, rarityRank, setTypeLabel } from "@/lib/games";
import { listSetCards, listSets } from "@/lib/queries/catalog";
import { collectionOptions } from "@/lib/queries/collections";
import { locationOptions } from "@/lib/queries/locations";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { SaveSetAsCollection } from "./save-as-collection";

const OWNED_FILTERS = { all: "Todas", have: "Tengo", missing: "Me faltan" } as const;
const SORTS = { number: "Número", price: "Precio", name: "Nombre" } as const;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function pick<T extends Record<string, string>>(options: T, value: string | undefined, fallback: keyof T) {
  return (value && value in options ? value : fallback) as keyof T & string;
}

async function load(gameSlug: string, setCode: string, userId: string) {
  const game = gameBySlug(gameSlug);
  if (!game?.available) notFound();
  const [set] = await listSets(game.id, userId, { code: decodeURIComponent(setCode) });
  if (!set) notFound();
  return { game, set };
}

export async function generateMetadata({
  params,
}: PageProps<"/catalog/[game]/[set]">): Promise<Metadata> {
  const { set } = await params;
  return { title: set.toUpperCase() };
}

export default async function SetPage({ params, searchParams }: PageProps<"/catalog/[game]/[set]">) {
  const user = await requireUser();
  const { game: slug, set: code } = await params;
  const { game, set } = await load(slug, code, user.id);

  const [cards, collections, locations] = await Promise.all([
    listSetCards(game.id, set.code, user.id),
    collectionOptions(user.id),
    locationOptions(user.id),
  ]);

  const sp = await searchParams;
  const rarity = param(sp.rarity);
  const owned = pick(OWNED_FILTERS, param(sp.owned), "all");
  const sort = pick(SORTS, param(sp.sort), "number");

  // Chips come from the data, so rarities missing from the game config still show up.
  const rarities = [...new Set(cards.map((c) => c.rarity).filter((r): r is string => !!r))]
    .sort((a, b) => rarityRank(game, a) - rarityRank(game, b))
    .map((value) => {
      const ofRarity = cards.filter((c) => c.rarity === value);
      return {
        value,
        label: rarityLabel(game, value),
        total: ofRarity.length,
        owned: ofRarity.filter((c) => c.owned > 0).length,
      };
    });

  const activeRarity = rarities.find((r) => r.value === rarity) ?? null;

  let shown = cards.filter(
    (c) =>
      (!rarity || c.rarity === rarity) &&
      (owned === "all" || (owned === "have" ? c.owned > 0 : c.owned === 0)),
  );
  if (sort === "price") {
    shown = [...shown].sort((a, b) => (b.priceEur ?? -1) - (a.priceEur ?? -1));
  } else if (sort === "name") {
    shown = [...shown].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  const href = (patch: Record<string, string | undefined>) => {
    const merged = {
      rarity,
      owned: owned === "all" ? undefined : owned,
      sort: sort === "number" ? undefined : sort,
      ...patch,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter((e): e is [string, string] => !!e[1]),
    ).toString();
    return qs ? `?${qs}` : "?";
  };

  const pct = set.cardCount ? Math.round((set.ownedDistinct / set.cardCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Catálogo", href: "/catalog" },
          { label: game.name, href: `/catalog/${game.slug}` },
          { label: set.name },
        ]}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <SetIcon src={set.iconUri} alt="" />
            {set.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            <span className="uppercase">{set.code}</span> · {setTypeLabel(game, set.setType)}
            {set.releasedAt && ` · ${new Date(set.releasedAt).toLocaleDateString("es-ES", { year: "numeric", month: "long" })}`}
          </p>
        </div>
        <div className="w-full space-y-1.5 sm:w-auto sm:text-right">
          <p className="text-sm">
            Tienes <strong>{formatInt(set.ownedDistinct)}</strong> de {formatInt(set.cardCount)}{" "}
            ({pct}%)
            {set.ownedCopies > 0 && (
              <span className="text-muted-foreground"> · {formatEur(set.ownedValue)}</span>
            )}
          </p>
          <ProgressMeter
            value={set.ownedDistinct}
            max={set.cardCount}
            showLabel={false}
            className="w-full sm:ml-auto sm:w-56"
          />
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <SaveSetAsCollection
              game={game.id}
              setCode={set.code}
              setTitle={set.name}
              total={cards.length}
              rarity={activeRarity ? { value: activeRarity.value, label: activeRarity.label, count: activeRarity.total } : null}
              collections={collections}
            />
            <Link
              href={`/scan?set=${game.id}:${encodeURIComponent(set.code)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Escanear esta expansión
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Rareza">
          <FilterLink href={href({ rarity: undefined })} active={!rarity}>
            Todas <Count>{cards.length}</Count>
          </FilterLink>
          {rarities.map((r) => (
            <FilterLink key={r.value} href={href({ rarity: r.value })} active={rarity === r.value}>
              <RarityMark rarity={r.value} />
              {r.label}{" "}
              <Count>
                {r.owned}/{r.total}
              </Count>
            </FilterLink>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4">
            <nav className="flex gap-1 text-sm" aria-label="Filtrar por las que tienes">
              {Object.entries(OWNED_FILTERS).map(([key, label]) => (
                <FilterLink
                  key={key}
                  href={href({ owned: key === "all" ? undefined : key })}
                  active={owned === key}
                >
                  {label}
                </FilterLink>
              ))}
            </nav>
            <nav className="flex gap-1 text-sm" aria-label="Ordenar">
              {Object.entries(SORTS).map(([key, label]) => (
                <FilterLink
                  key={key}
                  href={href({ sort: key === "number" ? undefined : key })}
                  active={sort === key}
                >
                  {label}
                </FilterLink>
              ))}
            </nav>
          </div>
          {/* What the + on each card adds with: before, nothing here said it'd be Spanish. */}
          <EntrySettings
            collections={collections}
            locations={locations}
            copyFields
            finishLabels={game.finishLabels}
          />
        </div>
      </div>

      {!shown.length ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {owned === "have" ? "Aún no tienes ninguna de estas." : "No hay cartas con estos filtros."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {shown.map((c) => (
            <li key={c.id} className="space-y-1.5">
              <OwnedCardTile
                printingId={c.id}
                name={c.name}
                number={c.collectorNumber}
                imageSmall={c.imageSmall}
                finishes={c.finishes}
                game={game.id}
                owned={c.owned}
              />
              <div className="text-xs leading-tight">
                <p className="truncate font-medium" title={c.name}>
                  {c.name}
                </p>
                <p className="text-muted-foreground flex justify-between gap-1">
                  <span title={rarityLabel(game, c.rarity)}>
                    <RarityMark rarity={c.rarity} />#{c.collectorNumber}
                  </span>
                  <span className="tabular-nums">{formatEur(c.priceEur)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2.5 py-1.5",
        active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-xs tabular-nums">{children}</span>;
}
