"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoveIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CardThumb } from "@/components/card-thumb";
import { CollectionPicker, type CollectionOption } from "@/components/collection-picker";
import { HoloCard } from "@/components/holo-card";
import { OwnedCardTile } from "@/components/owned-card-tile";
import { RarityMark } from "@/components/rarity-mark";
import { AddCopyButton } from "@/components/add-copy-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatEur, formatInt } from "@/lib/format";
import { finishLabel, gameById, rarityLabel } from "@/lib/games";
import type { CollectionCard } from "@/lib/queries/collections";
import { cn } from "@/lib/utils";
import { moveCollectionCards, removeCardsFromCollection, reorderCollectionCards } from "../actions";
import { EntryControls } from "./entry-controls";

const count = (n: number) => `${formatInt(n)} ${n === 1 ? "carta" : "cartas"}`;

export type CollectionView = "grid" | "list" | "binder";

/** Pockets to a page: the two layouts real binders come in (3×3 and 3×4). */
const POCKETS = [9, 12] as const;
type Pockets = (typeof POCKETS)[number];

/**
 * The collection laid out as the physical album: pockets in rows of three, two facing pages at a
 * time on a wide screen and one on a phone. Cards keep the same tile as the grid, so one you
 * don't have is greyed and the + still adds a copy.
 */
function BinderPages({ cards, collectionId }: { cards: CollectionCard[]; collectionId: string }) {
  // Which card sits in which pocket belongs to the album, not to the sort nav: the order you
  // arranged by hand, and the printed order for everything you haven't touched. Not Infinity as
  // the fallback: Infinity - Infinity is NaN, which would silently unsort the rest.
  const serverOrder = useMemo(() => {
    const pos = (c: CollectionCard) => c.position ?? Number.MAX_SAFE_INTEGER;
    return [...cards].sort(
      (a, b) =>
        pos(a) - pos(b) ||
        a.setCode.localeCompare(b.setCode) ||
        a.collectorNumber.localeCompare(b.collectorNumber, undefined, { numeric: true }),
    );
  }, [cards]);
  // The order shown right after a drag, before the server answers.
  const [manual, setManual] = useState<string[] | null>(null);
  const ordered = useMemo(() => {
    if (!manual) return serverOrder;
    const byId = new Map(serverOrder.map((c) => [c.id, c] as const));
    const kept = manual.map((id) => byId.get(id)).filter((c) => c !== undefined);
    const seen = new Set(kept.map((c) => c.id));
    // Cards added or taken off since the drag: the list stays honest either way.
    return [...kept, ...serverOrder.filter((c) => !seen.has(c.id))];
  }, [manual, serverOrder]);
  const [, startReorder] = useTransition();
  const sensors = useSensors(
    // A tap has to keep opening the card: the drag only starts once the pointer has travelled.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = ordered.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setManual(next);
    startReorder(async () => {
      try {
        await reorderCollectionCards(collectionId, next);
      } catch {
        toast.error("No se ha podido guardar el orden.");
        setManual(null);
      }
    });
  }

  const [perPage, setPerPage] = useState<Pockets>(9);
  const [spread, setSpread] = useState(0);
  // The pocket you tapped, shown big. One at a time, so the tilt costs nothing here.
  const [open, setOpen] = useState<CollectionCard | null>(null);
  const pageCount = Math.max(1, Math.ceil(ordered.length / perPage));
  const spreadCount = Math.ceil(pageCount / 2);
  // Changing the page size can leave the spread past the end.
  const at = Math.min(spread, spreadCount - 1);
  const pages = [at * 2, at * 2 + 1].filter((p) => p < pageCount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={at === 0} onClick={() => setSpread(at - 1)}>
            ← Anterior
          </Button>
          <span className="tabular-nums">
            {pages.length > 1
              ? `Páginas ${pages[0] + 1}–${pages[1] + 1}`
              : `Página ${pages[0] + 1}`}{" "}
            de {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={at >= spreadCount - 1}
            onClick={() => setSpread(at + 1)}
          >
            Siguiente →
          </Button>
        </div>
        <label className="text-muted-foreground flex items-center gap-2">
          Bolsillos por página
          <select
            className="bg-background rounded-md border px-2 py-1"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value) as Pockets);
              setSpread(0);
            }}
          >
            {POCKETS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The whole album is one sortable list, but only the open spread is on screen, so a card
          can be dragged within the two facing pages and not across to another one. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordered.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-4 lg:grid-cols-2">
            {pages.map((p) => (
              <BinderPage
                key={p}
                number={p + 1}
                perPage={perPage}
                cards={ordered.slice(p * perPage, (p + 1) * perPage)}
                onOpen={setOpen}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {open && <CardOverlay card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Whether this card comes in the standard finish and in the game's second one (reverse holo). */
function bothFinishes(card: CollectionCard) {
  const quick = gameById(card.game)?.quickAddFinish;
  return quick && card.finishes.includes(quick) && card.finishes.includes("nonfoil") ? quick : null;
}

function BinderPage({
  number,
  cards,
  perPage,
  onOpen,
}: {
  number: number;
  cards: CollectionCard[];
  perPage: number;
  onOpen: (card: CollectionCard) => void;
}) {
  // The last page is rarely full: draw the empty pockets so it still reads as a page.
  const empty = Math.max(0, perPage - cards.length);
  return (
    <section className="bg-card space-y-2 rounded-xl border p-3" aria-label={`Página ${number}`}>
      <p className="text-muted-foreground text-xs">Página {number}</p>
      <ul className="grid grid-cols-3 gap-2">
        {cards.map((c) => (
          <SortablePocket key={c.id} card={c} onOpen={onOpen} />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li
            key={`empty-${i}`}
            className="border-muted-foreground/20 aspect-[63/88] rounded-lg border border-dashed"
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * One pocket, draggable to another. The listeners sit on the whole pocket rather than on a
 * handle: the sensor only starts a drag after the pointer has moved, so tapping still opens the
 * card, and `attributes` brings the keyboard reordering with it.
 */
function SortablePocket({
  card,
  onOpen,
}: {
  card: CollectionCard;
  onOpen: (card: CollectionCard) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const second = bothFinishes(card);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("space-y-1", isDragging && "z-10 opacity-60")}
      {...attributes}
      {...listeners}
    >
      {/* No + here: a pocket is for looking, and two of them fought with the card. Adding a
          copy lives in the overlay you get by tapping it. */}
      <OwnedCardTile
        printingId={card.id}
        name={card.name}
        number={card.collectorNumber}
        imageSmall={card.imageSmall}
        finishes={card.finishes}
        game={card.game}
        owned={card.owned}
        wanted={card.wanted}
        withCollection={false}
        quickAdd={false}
        onOpen={() => onOpen(card)}
      />
      <p className="text-muted-foreground truncate text-[11px]" title={card.name}>
        #{card.collectorNumber} {card.name}
      </p>
      {second && (
        <p className="flex flex-wrap gap-1">
          <FinishChip label={finishLabel(card.game, "nonfoil")} n={card.ownedNonfoil} />
          <FinishChip label={finishLabel(card.game, second)} n={card.ownedFoil} foil />
        </p>
      )}
    </li>
  );
}

/**
 * One finish of a card you may own: the reverse holo wears the foil film itself, which is how
 * this app says "foil" everywhere else (docs/design.md), so the two slots read as two cards in
 * the pocket rather than as two words. Faded to almost nothing when you have none of it.
 */
function FinishChip({ label, n, foil }: { label: string; n: number; foil?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-none",
        foil ? "foil-button text-[#1b1630]" : "bg-muted text-foreground",
        n === 0 && "opacity-40",
      )}
      title={label}
    >
      {label.split(" ")[0]} {n > 0 ? `×${n}` : "—"}
    </span>
  );
}

/**
 * A pocket opened: the card big, tilting towards the pointer and catching the light (HoloCard).
 * Only one is ever mounted, so the effect that would be too much on eighteen pockets is fine.
 */
function CardOverlay({ card, onClose }: { card: CollectionCard; onClose: () => void }) {
  const second = bothFinishes(card);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card.name}</DialogTitle>
          <DialogDescription>
            {card.setCode.toUpperCase()} #{card.collectorNumber}
            {card.setName && ` · ${card.setName}`}
          </DialogDescription>
        </DialogHeader>
        {/* The card is the whole point of this dialog: centred, alone, with the + for each
            finish on it — this is where adding a copy went when the pockets lost theirs. */}
        <div className="relative mx-auto w-fit">
          <HoloCard
            src={card.imageNormal ?? card.imageSmall}
            alt={card.name}
            foil={!card.finishes.includes("nonfoil")}
            label={`#${card.collectorNumber}`}
          />
          <AddCopyButton
            printingId={card.id}
            finishes={card.finishes}
            name={card.name}
            withCollection={false}
            finish={second ? "nonfoil" : undefined}
            finishName={second ? finishLabel(card.game, "nonfoil") : undefined}
          />
          {second && (
            <AddCopyButton
              printingId={card.id}
              finishes={card.finishes}
              name={card.name}
              withCollection={false}
              finish={second}
              finishName={finishLabel(card.game, second)}
              look="foil"
              className="top-11"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {second ? (
            <span className="flex flex-wrap gap-1">
              <FinishChip label={finishLabel(card.game, "nonfoil")} n={card.ownedNonfoil} />
              <FinishChip label={finishLabel(card.game, second)} n={card.ownedFoil} foil />
            </span>
          ) : (
            <span className="text-sm">
              Tienes <strong>{formatInt(card.owned)}</strong> de {formatInt(card.wanted)}
            </span>
          )}
          {/* Gold is money in this app, and this is the only number here that is. */}
          <span className="display text-primary text-lg font-bold tabular-nums">
            {formatEur(card.priceEur)}
          </span>
        </div>

        <DialogFooter>
          <Link href={`/cards/${card.id}`} className={buttonVariants({ variant: "outline" })}>
            Ver la ficha
          </Link>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A collection's cards, in one of three views: the grid, to look at them and add copies with the
 * +; the list, to manage them — tick rows and a bar moves them to another collection (or copies
 * them, keeping them here too) or takes them off this one; and the binder, to see the collection
 * page by page as the real album.
 */
export function CollectionCards({
  view,
  collectionId,
  collectionName,
  cards,
  collections,
}: {
  view: CollectionView;
  collectionId: string;
  collectionName: string;
  cards: CollectionCard[];
  /** The user's other collections: where the cards can go. */
  collections: CollectionOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<"move" | "remove" | null>(null);
  // Moved cards leave the page, and a filter may hide some: count only the ones still shown.
  const chosen = view === "list" ? cards.filter((c) => selected.has(c.id)) : [];
  const ids = chosen.map((c) => c.id);
  const allChosen = cards.length > 0 && chosen.length === cards.length;
  const clear = () => setSelected(new Set());
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The filters still apply; the order doesn't, so the binder sets its own (BinderPages).
  if (view === "binder") return <BinderPages cards={cards} collectionId={collectionId} />;

  if (view === "grid") {
    return (
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {cards.map((c) => {
          const game = gameById(c.game);
          return (
            <li key={c.id} className="space-y-1.5">
              <OwnedCardTile
                printingId={c.id}
                name={c.name}
                number={c.collectorNumber}
                imageSmall={c.imageSmall}
                finishes={c.finishes}
                game={c.game}
                owned={c.owned}
                wanted={c.wanted}
                withCollection={false}
              />
              <div className="text-xs leading-tight">
                <p className="truncate font-medium" title={c.name}>
                  {c.name}
                </p>
                <p className="text-muted-foreground flex justify-between gap-1">
                  <span title={game ? rarityLabel(game, c.rarity) : undefined}>
                    <RarityMark rarity={c.rarity} />
                    {c.setCode.toUpperCase()} #{c.collectorNumber}
                  </span>
                  <span className="tabular-nums">{formatEur(c.priceEur)}</span>
                </p>
                <EntryControls
                  collectionId={collectionId}
                  catalogCardId={c.id}
                  wanted={c.wanted}
                  name={c.name}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <ul className="bg-card divide-y rounded-xl border">
        <li className="text-muted-foreground flex items-center gap-3 px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={allChosen}
            onChange={() => setSelected(allChosen ? new Set() : new Set(cards.map((c) => c.id)))}
            aria-label="Seleccionar todas"
          />
          Seleccionar todas ({formatInt(cards.length)})
        </li>
        {cards.map((c) => (
          <ListRow
            key={c.id}
            card={c}
            collectionId={collectionId}
            selected={selected.has(c.id)}
            onToggle={() => toggle(c.id)}
          />
        ))}
      </ul>

      {chosen.length > 0 && (
        <div
          role="region"
          aria-label="Cartas seleccionadas"
          className="bg-popover fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-lg md:bottom-6"
        >
          <span className="text-sm">
            <strong className="tabular-nums">{formatInt(chosen.length)}</strong>{" "}
            {chosen.length === 1 ? "seleccionada" : "seleccionadas"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setDialog("move")}>
              <MoveIcon />
              Mover a…
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog("remove")}>
              <Trash2Icon />
              Quitar
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={clear} aria-label="Quitar la selección">
              <XIcon />
            </Button>
          </div>
        </div>
      )}

      {dialog === "move" && (
        <MoveCardsDialog
          from={collectionId}
          fromName={collectionName}
          ids={ids}
          collections={collections}
          onClose={() => setDialog(null)}
          onDone={clear}
        />
      )}
      {dialog === "remove" && (
        <RemoveCardsDialog
          collectionId={collectionId}
          collectionName={collectionName}
          ids={ids}
          onClose={() => setDialog(null)}
          onDone={clear}
        />
      )}
    </>
  );
}

/** One card in the list view: checkbox, thumbnail, name and set, owned of wanted, price, −/+/×. */
function ListRow({
  card: c,
  collectionId,
  selected,
  onToggle,
}: {
  card: CollectionCard;
  collectionId: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const game = gameById(c.game);
  const complete = c.owned >= c.wanted;
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
        selected && "bg-muted/60",
      )}
    >
      <input
        type="checkbox"
        className="accent-primary size-4 shrink-0"
        checked={selected}
        onChange={onToggle}
        aria-label={`Seleccionar ${c.name}`}
      />
      <Link href={`/cards/${c.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
        <CardThumb src={c.imageSmall} alt="" size="xs" label={`#${c.collectorNumber}`} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/cards/${c.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {c.name}
        </Link>
        <p
          className="text-muted-foreground truncate text-xs"
          title={game ? rarityLabel(game, c.rarity) : undefined}
        >
          <RarityMark rarity={c.rarity} />
          {c.setCode.toUpperCase()} #{c.collectorNumber}
          {c.setName && ` · ${c.setName}`}
        </p>
      </div>
      <span
        className={cn(
          "text-xs tabular-nums",
          complete ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
        )}
        title="Las que tienes de las que quieres"
      >
        {complete && "✓ "}
        {formatInt(c.owned)}/{formatInt(c.wanted)}
      </span>
      <span className="w-16 text-right text-sm tabular-nums">{formatEur(c.priceEur)}</span>
      <div className="w-full text-xs sm:w-40">
        <EntryControls
          collectionId={collectionId}
          catalogCardId={c.id}
          wanted={c.wanted}
          name={c.name}
        />
      </div>
    </li>
  );
}

/** «Mover a…»: another collection (or a new one), or a copy there with «Dejarlas también aquí». */
function MoveCardsDialog({
  from,
  fromName,
  ids,
  collections,
  onClose,
  onDone,
}: {
  from: string;
  fromName: string;
  ids: string[];
  collections: CollectionOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [to, setTo] = useState<string | null>(null);
  const [keep, setKeep] = useState(false);
  const [pending, startTransition] = useTransition();
  const verb = keep ? "Copiar" : "Mover";

  function run() {
    if (!to) return;
    startTransition(async () => {
      try {
        const r = await moveCollectionCards({ from, to, catalogCardIds: ids, keep });
        toast.success(`${count(r.moved)} ${keep ? "copiadas" : "movidas"} a «${r.collectionName}»`);
        onDone();
        onClose();
      } catch {
        toast.error(keep ? "No se han podido copiar." : "No se han podido mover.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {verb} {count(ids.length)} a otra colección
          </DialogTitle>
          <DialogDescription>
            Van con las copias que quieres de cada una. Si alguna ya está en la otra colección, se
            queda con el número mayor: cada colección cuenta tus copias por su cuenta.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm [&_select]:w-full">
          <CollectionPicker
            value={to}
            onChange={setTo}
            collections={collections}
            emptyLabel="Elige una colección"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
            />
            Dejarlas también en «{fromName}»
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={run} disabled={pending || !to} aria-busy={pending || undefined}>
            {pending ? (keep ? "Copiando…" : "Moviendo…") : `${verb} ${count(ids.length)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Quitar»: off this list only; the copies owned stay in «Mis cartas». */
function RemoveCardsDialog({
  collectionId,
  collectionName,
  ids,
  onClose,
  onDone,
}: {
  collectionId: string;
  collectionName: string;
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const r = await removeCardsFromCollection(collectionId, ids);
        toast.success(
          `${count(r.removed)} ${r.removed === 1 ? "quitada" : "quitadas"} de «${collectionName}»`,
        );
        onDone();
        onClose();
      } catch {
        toast.error("No se han podido quitar.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ¿Quitar {count(ids.length)} de «{collectionName}»?
          </DialogTitle>
          <DialogDescription>
            Solo salen de esta lista: tus copias siguen en «Mis cartas».
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={run}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? "Quitando…" : "Quitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
