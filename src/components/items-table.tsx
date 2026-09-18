import Link from "next/link";
import type { CollectionOption } from "@/components/collection-picker";
import { ItemsTableView } from "@/components/items-table-view";
import type { LocationOption } from "@/components/location-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pageNumbers } from "@/lib/pagination";
import { ITEM_SORTS, type InventoryItem, type ItemSort } from "@/lib/queries/items";
import { cn } from "@/lib/utils";

/**
 * Stacks of the inventory (the selectable table lives in ItemsTableView, a client component).
 * This module also holds the server-side helpers pages use: toolbar, pagination, params.
 */
export function ItemsTable(props: {
  rows: InventoryItem[];
  context: "inventory" | "location";
  locations: LocationOption[];
  collections: CollectionOption[];
}) {
  return <ItemsTableView {...props} />;
}

export type HrefFor = (patch: Record<string, string | number | undefined>) => string;

/** Name filter + sort links. `hidden` keeps other query params when the form submits. */
export function ItemsToolbar({
  q,
  sort,
  href,
  hidden,
}: {
  q: string;
  sort: ItemSort;
  href: HrefFor;
  hidden: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <form className="flex gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Filtrar por nombre…"
          className="w-56"
          aria-label="Filtrar por nombre"
        />
        {Object.entries(hidden).map(
          ([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />,
        )}
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      <nav className="flex gap-1 text-sm" aria-label="Ordenar">
        {(Object.entries(ITEM_SORTS) as Array<[ItemSort, string]>).map(([key, label]) => (
          <Link
            key={key}
            href={href({ sort: key === "value" ? undefined : key, page: undefined })}
            className={cn(
              "rounded-md px-2.5 py-1.5",
              key === sort ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Pagination({
  page,
  hasMore,
  href,
  pageCount,
}: {
  page: number;
  hasMore: boolean;
  href: HrefFor;
  /** How many pages there are, when the query counted them: then the numbers are shown too. */
  pageCount?: number;
}) {
  if (page <= 1 && !hasMore) return null;
  // Page 1 is the bare URL, so going back to it doesn't leave ?page=1 behind.
  const to = (p: number) => href({ page: p === 1 ? undefined : p });
  const numbers = pageCount && pageCount > 1 ? pageNumbers(page, pageCount) : [];

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Paginación">
      {page > 1 ? (
        <Link href={to(page - 1)} className={buttonVariants({ variant: "outline" })}>
          ← Anterior
        </Link>
      ) : (
        <span />
      )}

      {numbers.length > 0 && (
        <ol className="flex flex-wrap items-center gap-1">
          {numbers.map((n, i) =>
            n === null ? (
              <li key={`gap-${i}`} className="text-muted-foreground px-1" aria-hidden>
                …
              </li>
            ) : (
              <li key={n}>
                <Link
                  href={to(n)}
                  aria-current={n === page ? "page" : undefined}
                  aria-label={`Página ${n}`}
                  className={buttonVariants({ variant: n === page ? "default" : "ghost", size: "sm" })}
                >
                  {n}
                </Link>
              </li>
            ),
          )}
        </ol>
      )}

      {hasMore ? (
        <Link href={to(page + 1)} className={buttonVariants({ variant: "outline" })}>
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Builds a `?query` link from the current params plus a patch; undefined/empty drop out. */
export function hrefBuilder(current: Record<string, string | number | undefined>): HrefFor {
  return (patch) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "?";
  };
}

export function parseItemParams(sp: Record<string, string | string[] | undefined>) {
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const q = str(sp.q)?.trim() ?? "";
  const rawSort = str(sp.sort);
  const sort: ItemSort = rawSort && rawSort in ITEM_SORTS ? (rawSort as ItemSort) : "value";
  const page = Math.max(1, Number(str(sp.page)) || 1);
  return { q, sort, page };
}
