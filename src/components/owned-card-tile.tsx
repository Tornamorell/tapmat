"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { AddCopyButton } from "@/components/add-copy-button";
import { CardThumb } from "@/components/card-thumb";
import { gameById } from "@/lib/games";
import { cn } from "@/lib/utils";

/**
 * A card in a set or collection grid: grey while you don't have it, with how many you have and
 * a + to add one. The + counts at once (optimistic): the card lights up and the number goes up
 * before the server answers, and goes back if it fails. A Pokémon card that also comes in
 * reverse holo gets a + for each finish, the second with the foil film (quickAddFinish).
 */
export function OwnedCardTile({
  printingId,
  name,
  number,
  imageSmall,
  finishes,
  game,
  owned,
  wanted,
  withCollection = true,
  quickAdd = true,
  onOpen,
}: {
  printingId: string;
  name: string;
  /** Collector number, shown on the placeholder of cards without an image. */
  number?: string;
  imageSmall: string | null;
  finishes: string[];
  /** The card's game: whether it gets a second + (games.ts). */
  game?: string | null;
  owned: number;
  /** On a collection's page: copies wanted, shown as "owned/wanted" until complete. */
  wanted?: number;
  withCollection?: boolean;
  /**
   * The + that adds a copy (one per finish). Off in the album, where two of them fought with the
   * card and read as its state rather than as actions: there you add from the overlay.
   */
  quickAdd?: boolean;
  /** The album opens the card in an overlay instead of leaving the page for its own. */
  onOpen?: () => void;
}) {
  const [shown, addShown] = useOptimistic(owned, (current, added: number) => current + added);
  const complete = wanted == null ? shown > 0 : shown >= wanted;
  const config = gameById(game);
  const quick = config?.quickAddFinish;
  // Both finishes: each + says which it adds, so the remembered finish doesn't make them the same.
  const both = !!quick && finishes.includes(quick) && finishes.includes("nonfoil");

  const thumb = (
    <CardThumb
      src={imageSmall}
      alt={name}
      label={number && `#${number}`}
      size="md"
      className={cn(
        "w-full! transition-[filter,opacity] duration-300",
        shown === 0 && "opacity-55 grayscale-[0.75]",
      )}
    />
  );

  return (
    <div className="relative">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full cursor-zoom-in"
          aria-label={`Ver ${name} en grande`}
        >
          {thumb}
        </button>
      ) : (
        <Link href={`/cards/${printingId}`} className="block">
          {thumb}
        </Link>
      )}
      {shown > 0 && (
        <span
          className={cn(
            "absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums shadow-sm",
            complete
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {wanted == null ? `×${shown}` : wanted > 1 || !complete ? `${shown}/${wanted}` : "✓"}
        </span>
      )}
      {quickAdd && (
        <>
          <AddCopyButton
            printingId={printingId}
            finishes={finishes}
            name={name}
            withCollection={withCollection}
            onStart={() => addShown(1)}
            finish={both ? "nonfoil" : undefined}
            finishName={both ? config?.finishLabels.nonfoil : undefined}
          />
          {both && quick && (
            <AddCopyButton
              printingId={printingId}
              finishes={finishes}
              name={name}
              withCollection={withCollection}
              onStart={() => addShown(1)}
              finish={quick}
              finishName={config?.finishLabels[quick]}
              look="foil"
              className="top-11"
            />
          )}
        </>
      )}
    </div>
  );
}
