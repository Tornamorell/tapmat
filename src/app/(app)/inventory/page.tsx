import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AddFilteredToCollection } from "@/components/add-filtered-to-collection";
import {
  ItemsTable,
  ItemsToolbar,
  Pagination,
  hrefBuilder,
  parseItemParams,
} from "@/components/items-table";
import { QuickAdd } from "@/components/quick-add";
import { formatEur, formatInt } from "@/lib/format";
import { collectionOptions } from "@/lib/queries/collections";
import { ITEMS_PAGE_SIZE, inventorySummary, listItems } from "@/lib/queries/items";
import { listLocations, locationOptions, unlocatedSummary } from "@/lib/queries/locations";
import { pendingScanCount } from "@/lib/queries/pending-scans";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mis cartas" };

/** The inventory: every copy the user owns, wherever it is and whatever lists it's on. */
export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const user = await requireUser();
  const sp = await searchParams;
  const { q, sort, page } = parseItemParams(sp);
  // ?loc=<location id> or ?loc=none (copies without location).
  const loc = typeof sp.loc === "string" ? sp.loc : undefined;
  const locationId =
    loc === "none" ? null : loc && z.uuid().safeParse(loc).success ? loc : undefined;

  const [summary, { rows, hasMore, total }, locations, byLocation, unlocated, collections, pending] =
    await Promise.all([
      inventorySummary(user.id),
      listItems({ ownerId: user.id, locationId }, { q, sort, page }),
      locationOptions(user.id),
      listLocations(user.id),
      unlocatedSummary(user.id),
      collectionOptions(user.id),
      pendingScanCount(user.id),
    ]);

  const locParam = locationId === null ? "none" : (locationId ?? undefined);
  const href = hrefBuilder({ q, sort: sort === "value" ? undefined : sort, loc: locParam });
  const filtered = !!q || locationId !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Mis cartas</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {pending > 0 && (
            <Link href="/review" className="text-primary hover:underline">
              {formatInt(pending)} por revisar
            </Link>
          )}
          <Link href="/locations" className="text-muted-foreground hover:text-foreground">
            Gestionar ubicaciones
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="display text-primary text-3xl font-bold">{formatEur(summary.valueEur)}</p>
        <p className="text-muted-foreground text-sm">
          {formatInt(summary.cardCount)} cartas
          {summary.unpricedCount > 0 && `, ${formatInt(summary.unpricedCount)} sin precio`}
        </p>
      </div>

      <QuickAdd locations={locations} collections={collections} />

      {byLocation.length > 0 && (
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Ubicación">
          <FilterLink href={href({ loc: undefined, page: undefined })} active={locationId === undefined}>
            Todas
          </FilterLink>
          {byLocation.map((l) => (
            <FilterLink
              key={l.id}
              href={href({ loc: l.id, page: undefined })}
              active={locationId === l.id}
            >
              {l.name} <Count>{formatInt(l.cardCount)}</Count>
            </FilterLink>
          ))}
          {unlocated.cardCount > 0 && (
            <FilterLink href={href({ loc: "none", page: undefined })} active={locationId === null}>
              Sin ubicación <Count>{formatInt(unlocated.cardCount)}</Count>
            </FilterLink>
          )}
        </nav>
      )}

      <ItemsToolbar
        q={q}
        sort={sort}
        href={href}
        hidden={{ sort: sort === "value" ? undefined : sort, loc: locParam }}
      />

      {!rows.length ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {filtered
            ? "Nada coincide con estos filtros."
            : "Aún no tienes cartas. Escanéalas o búscalas arriba para añadirlas."}
        </p>
      ) : (
        <>
          <div className="flex justify-end">
            <AddFilteredToCollection
              collections={collections}
              filter={{ ...(locationId !== undefined && { locationId }), ...(q && { q }) }}
              label={filtered ? "Añadir estas cartas a una colección" : "Añadir todo a una colección"}
            />
          </div>
          <ItemsTable rows={rows} context="inventory" locations={locations} collections={collections} />
        </>
      )}

      <Pagination
        page={page}
        hasMore={hasMore}
        href={href}
        pageCount={Math.ceil(total / ITEMS_PAGE_SIZE)}
      />
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
