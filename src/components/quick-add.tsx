"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addItem } from "@/app/(app)/inventory/actions";
import { CardSearchBox, useCardPicker } from "@/components/card-picker";
import { CardPickerRow } from "@/components/card-picker-row";
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
import { gameById } from "@/lib/games";
import { useStickyDefaults } from "@/lib/use-sticky-defaults";

/**
 * Keyboard-first entry into the inventory: type a name → Enter picks the card → Enter adds it
 * with the remembered location (and divider), optional collection, finish, condition and
 * language.
 */
export function QuickAdd({
  locations,
  collections,
}: {
  locations: LocationOption[];
  collections: CollectionOption[];
}) {
  const [defaults, setDefaults] = useStickyDefaults();
  const follow = useEntryResult();
  const picker = useCardPicker(defaults.lastSetCode);
  const [quantity, setQuantity] = useState(1);
  const [pending, startTransition] = useTransition();
  const { printing } = picker;
  const finish = finishFor(defaults.finish, printing?.finishes ?? []);

  function add() {
    if (!printing) return;
    startTransition(async () => {
      try {
        const r = await addItem({
          catalogCardId: printing.id,
          quantity,
          finish,
          condition: defaults.condition,
          language: defaults.language,
          ...targetFor(defaults, locations),
        });
        if (!follow(r)) return;
        const place = placeLabel(r.locationName, r.section?.name);
        toast.success(`${r.name} · ${r.setCode.toUpperCase()} #${r.number}`, {
          description: [
            r.merged ? `Ahora tienes ${r.quantity}` : `Añadida ×${quantity}`,
            place && `en ${place}`,
            r.collectionName && `y en «${r.collectionName}»`,
          ]
            .filter(Boolean)
            .join(" "),
        });
        setDefaults({ lastSetCode: printing.setCode });
        setQuantity(1);
        picker.reset();
      } catch {
        toast.error("No se ha podido añadir la carta.");
      }
    });
  }

  return (
    <div className="bg-card space-y-3 rounded-xl border p-3">
      <CardSearchBox
        picker={picker}
        onSubmit={add}
        placeholder="Añadir carta: nombre, o expansión y número (OBF 125)"
        label="Buscar carta para añadir"
      />
      <EntrySettings locations={locations} collections={collections} />

      {picker.selected && printing && (
        <CardPickerRow picker={picker}>
          <FinishSelect
            value={finish}
            available={printing.finishes}
            labels={gameById(printing.game)?.finishLabels}
            onChange={(v) => setDefaults({ finish: v })}
          />
          <ConditionSelect value={defaults.condition} onChange={(v) => setDefaults({ condition: v })} />
          <LanguageSelect value={defaults.language} onChange={(v) => setDefaults({ language: v })} />
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <Button id={picker.submitId} onClick={add} disabled={pending}>
            {pending ? "Añadiendo…" : quantity > 1 ? `Añadir ${quantity}` : "Añadir"}
          </Button>
          <Button variant="ghost" onClick={picker.reset} disabled={pending}>
            Cancelar
          </Button>
        </CardPickerRow>
      )}
    </div>
  );
}
