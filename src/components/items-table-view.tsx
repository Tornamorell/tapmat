"use client";

import { MoveIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddFilteredToCollection } from "@/components/add-filtered-to-collection";
import { BulkDeleteDialog, BulkEditDialog } from "@/components/bulk-actions";
import { ConditionBadge, LanguageFlag } from "@/components/card-attributes";
import { CardThumb } from "@/components/card-thumb";
import type { CollectionOption } from "@/components/collection-picker";
import { ItemActions, QuantityControl, type ActionItem } from "@/components/item-actions";
import type { LocationOption } from "@/components/location-picker";
import { MoveDialog } from "@/components/move-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { priceSource } from "@/lib/collection/pricing";
import { formatEur, formatInt, placeLabel } from "@/lib/format";
import { finishLabel } from "@/lib/games";
import { gradeLabel } from "@/lib/grading";
import type { InventoryItem } from "@/lib/queries/items";
import { cn } from "@/lib/utils";

type Context = "inventory" | "location";

/**
 * Stacks of the inventory, selectable: ticking rows brings up a bar to move them elsewhere, list
 * them in a collection (D28), change their condition, language or finish, or delete them. Phones get a list with everything in view — a wide table
 * there hid the details and the menu behind a sideways scroll nobody noticed; from `md` up,
 * the table. In the full inventory each row shows where it is; on a location's page, only its
 * divider.
 */
export function ItemsTableView({
  rows,
  context,
  locations,
  collections,
}: {
  rows: InventoryItem[];
  context: Context;
  locations: LocationOption[];
  collections: CollectionOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [moving, setMoving] = useState(false);
  const [bulk, setBulk] = useState<"edit" | "delete" | null>(null);
  // Rows change after an action (moved copies leave a location's page): count what's shown.
  const chosen = rows.filter((r) => selected.has(r.id));
  const allChosen = rows.length > 0 && chosen.length === rows.length;
  const copies = chosen.reduce((n, r) => n + r.quantity, 0);
  const clear = () => setSelected(new Set());
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const checkbox = (item: InventoryItem, className?: string) => (
    <input
      type="checkbox"
      className={cn("accent-primary size-4 align-middle", className)}
      checked={selected.has(item.id)}
      onChange={() => toggle(item.id)}
      aria-label={`Seleccionar ${item.card?.name ?? "carta"}`}
    />
  );
  const actions = (item: InventoryItem) => (
    <ItemActions locations={locations} collections={collections} item={actionItem(item)} />
  );

  return (
    <>
      {/* Phones */}
      <ul className="bg-card divide-y rounded-xl border md:hidden">
        <li className="text-muted-foreground flex items-center gap-3 px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={allChosen}
            onChange={toggleAll}
            aria-label="Seleccionar todas"
          />
          Seleccionar todas
        </li>
        {rows.map((item) => (
          <li
            key={item.id}
            className={cn("flex gap-3 px-3 py-3", selected.has(item.id) && "bg-muted/60")}
          >
            {checkbox(item, "mt-1 shrink-0")}
            {item.card?.id && (
              <Link href={`/cards/${item.card.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
                <CardThumb
                  src={item.card.imageSmall}
                  alt=""
                  size="sm"
                  foil={item.finish !== "nonfoil"}
                />
              </Link>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  {item.card?.id ? (
                    <Link href={`/cards/${item.card.id}`} className="line-clamp-2 font-medium">
                      {item.card.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Sin catálogo</span>
                  )}
                  <p className="text-muted-foreground truncate text-xs">
                    {item.card?.setCode?.toUpperCase()} #{item.card?.collectorNumber}
                    {item.card?.setName && ` · ${item.card.setName}`}
                  </p>
                </div>
                <div className="-mt-1 -mr-1">{actions(item)}</div>
              </div>
              <Details item={item} context={context} />
              <div className="flex items-center justify-between gap-2">
                <QuantityControl itemId={item.id} quantity={item.quantity} />
                <p className="text-right text-sm tabular-nums">
                  {item.quantity > 1 && (
                    <span className="text-muted-foreground">{formatEur(item.unitPriceEur)} · </span>
                  )}
                  <span className="text-primary font-semibold">{total(item)}</span>
                  <PriceNote item={item} />
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Tablets and up */}
      <div className="bg-card hidden overflow-x-auto rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  className="accent-primary size-4 align-middle"
                  checked={allChosen}
                  onChange={toggleAll}
                  aria-label="Seleccionar todas"
                />
              </TableHead>
              <TableHead>Carta</TableHead>
              <TableHead>Detalles</TableHead>
              <TableHead className="text-center">Cantidad</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item) => (
              <TableRow key={item.id} data-state={selected.has(item.id) ? "selected" : undefined}>
                <TableCell>{checkbox(item)}</TableCell>
                <TableCell>
                  {item.card?.id ? (
                    <Link href={`/cards/${item.card.id}`} className="flex items-center gap-3">
                      <CardThumb
                        src={item.card.imageSmall}
                        alt=""
                        size="xs"
                        foil={item.finish !== "nonfoil"}
                      />
                      <div className="min-w-0">
                        <p className="font-medium hover:underline">{item.card.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {item.card.setCode?.toUpperCase()} #{item.card.collectorNumber}
                          {item.card.setName && ` · ${item.card.setName}`}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Sin catálogo</span>
                  )}
                </TableCell>
                <TableCell>
                  <Details item={item} context={context} />
                </TableCell>
                <TableCell>
                  <QuantityControl itemId={item.id} quantity={item.quantity} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatEur(item.unitPriceEur)}
                  <PriceNote item={item} />
                </TableCell>
                <TableCell className="text-primary text-right font-semibold tabular-nums">
                  {total(item)}
                </TableCell>
                <TableCell>{actions(item)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {chosen.length > 0 && (
        <div
          role="region"
          aria-label="Cartas seleccionadas"
          className="bg-popover fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-lg md:bottom-6"
        >
          <span className="text-sm">
            <strong className="tabular-nums">{formatInt(chosen.length)}</strong>{" "}
            {chosen.length === 1 ? "seleccionada" : "seleccionadas"}
            <span className="text-muted-foreground">
              , {formatInt(copies)} {copies === 1 ? "carta" : "cartas"}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setMoving(true)}>
              <MoveIcon />
              Mover a…
            </Button>
            <AddFilteredToCollection
              collections={collections}
              filter={{ itemIds: chosen.map((r) => r.id) }}
              label="A una colección"
            />
            <Button size="sm" variant="outline" onClick={() => setBulk("edit")}>
              <PencilIcon />
              Editar…
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBulk("delete")}>
              <Trash2Icon />
              Eliminar
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={clear} aria-label="Quitar la selección">
              <XIcon />
            </Button>
          </div>
        </div>
      )}
      {moving && (
        <MoveDialog
          stacks={chosen.map((r) => ({ itemId: r.id }))}
          title={`Mover ${formatInt(copies)} ${copies === 1 ? "carta" : "cartas"}`}
          locations={locations}
          onClose={() => setMoving(false)}
          onMoved={clear}
        />
      )}
      {bulk === "edit" && (
        <BulkEditDialog
          itemIds={chosen.map((r) => r.id)}
          copies={copies}
          onClose={() => setBulk(null)}
          onDone={clear}
        />
      )}
      {bulk === "delete" && (
        <BulkDeleteDialog
          itemIds={chosen.map((r) => r.id)}
          copies={copies}
          onClose={() => setBulk(null)}
          onDone={clear}
        />
      )}
    </>
  );
}

const total = (item: InventoryItem) =>
  item.unitPriceEur == null ? "—" : formatEur(item.unitPriceEur * item.quantity);

/**
 * Under the price: "estimado" when it's the user's own value, and for graded copies the raw
 * price (Cardmarket's, ungraded) to compare against (D27).
 */
/** Where the price comes from (D39). Nothing is shown for plain market data — that's the norm. */
function PriceNote({ item }: { item: InventoryItem }) {
  const source = priceSource(item);
  const raw =
    item.gradingCompany && item.marketPriceEur != null ? (
      <span title="Precio de Cardmarket de la carta sin gradear">
        raw {formatEur(item.marketPriceEur)}
      </span>
    ) : null;
  if (source === "estimate") {
    return (
      <span className="text-muted-foreground block text-[11px]">
        estimado{raw && <> · {raw}</>}
      </span>
    );
  }
  if (source === "graded-raw") {
    return (
      <span
        className="text-muted-foreground block text-[11px]"
        title="Es el precio sin gradear: pon un valor estimado en Editar"
      >
        raw
      </span>
    );
  }
  return null;
}

/** Grading, finish, condition, language and where it is, as small labels. */
function Details({ item, context }: { item: InventoryItem; context: Context }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {item.gradingCompany && (
        // A slab label: light on dark, unlike every other badge.
        <Badge
          className="bg-foreground text-background font-semibold"
          title={item.certNumber ? `Certificado ${item.certNumber}` : undefined}
        >
          {gradeLabel(item.gradingCompany, item.grade)}
        </Badge>
      )}
      {item.finish !== "nonfoil" && (
        <Badge className="foil-badge">{finishLabel(item.card?.game, item.finish)}</Badge>
      )}
      <ConditionBadge condition={item.condition} />
      <LanguageFlag code={item.language} />
      {context === "inventory" && item.location?.id && (
        <Link
          href={`/locations/${item.location.id}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {placeLabel(item.location.name, item.section?.name)}
        </Link>
      )}
      {context === "location" && item.section?.id && (
        <span className="text-muted-foreground">Separador {item.section.name}</span>
      )}
    </div>
  );
}

function actionItem(item: InventoryItem): ActionItem {
  return {
    id: item.id,
    catalogCardId: item.card?.id ?? null,
    game: item.card?.game ?? null,
    name: item.card?.name ?? "Carta",
    quantity: item.quantity,
    finish: item.finish,
    condition: item.condition,
    language: item.language,
    locationId: item.locationId,
    sectionId: item.sectionId,
    notes: item.notes,
    purchasePriceEur: item.purchasePriceEur,
    estimatedValueEur: item.estimatedValueEur,
    gradingCompany: item.gradingCompany,
    grade: item.grade,
    certNumber: item.certNumber,
    finishes: item.card?.finishes ?? [],
  };
}
