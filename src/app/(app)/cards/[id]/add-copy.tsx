"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { CollectionOption } from "@/components/collection-picker";
import { EntrySettings, targetFor, useEntryResult } from "@/components/entry-target";
import type { LocationOption } from "@/components/location-picker";
import {
  ConditionSelect,
  FinishSelect,
  LanguageSelect,
  QuantityStepper,
  finishFor,
} from "@/components/stack-fields";
import { Button } from "@/components/ui/button";
import { placeLabel } from "@/lib/format";
import type { Finish } from "@/lib/games";
import { useStickyDefaults } from "@/lib/use-sticky-defaults";
import { addItem } from "../../inventory/actions";

/** Adds copies of this printing to the inventory, with the remembered target and details. */
export function AddCopy({
  printingId,
  finishes,
  finishLabels,
  locations,
  collections,
}: {
  printingId: string;
  finishes: string[];
  finishLabels?: Record<Finish, string>;
  locations: LocationOption[];
  collections: CollectionOption[];
}) {
  const [defaults, setDefaults] = useStickyDefaults();
  const follow = useEntryResult();
  const [quantity, setQuantity] = useState(1);
  const [pending, startTransition] = useTransition();
  const finish = finishFor(defaults.finish, finishes);

  function add() {
    startTransition(async () => {
      try {
        const r = await addItem({
          catalogCardId: printingId,
          quantity,
          finish,
          condition: defaults.condition,
          language: defaults.language,
          ...targetFor(defaults, locations),
        });
        if (!follow(r)) return;
        const place = placeLabel(r.locationName, r.section?.name);
        toast.success(`${r.name} añadida a tus cartas`, {
          description: [
            r.merged && `Ahora tienes ${r.quantity} en ese montón.`,
            place && `En ${place}.`,
            r.collectionName && `También en «${r.collectionName}».`,
          ]
            .filter(Boolean)
            .join(" "),
        });
        setQuantity(1);
      } catch {
        toast.error("No se ha podido añadir la carta.");
      }
    });
  }

  return (
    <div className="bg-card space-y-3 rounded-xl border p-3">
      <EntrySettings locations={locations} collections={collections} />
      <div className="flex flex-wrap items-end gap-2">
        <FinishSelect
          value={finish}
          available={finishes}
          labels={finishLabels}
          onChange={(v) => setDefaults({ finish: v })}
        />
        <ConditionSelect value={defaults.condition} onChange={(v) => setDefaults({ condition: v })} />
        <LanguageSelect value={defaults.language} onChange={(v) => setDefaults({ language: v })} />
        <QuantityStepper value={quantity} onChange={setQuantity} />
        <Button onClick={add} disabled={pending}>
          {pending ? "Añadiendo…" : "Añadir a mis cartas"}
        </Button>
      </div>
    </div>
  );
}
