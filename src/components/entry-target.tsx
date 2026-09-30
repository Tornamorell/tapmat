"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AddItemResult } from "@/app/(app)/inventory/actions";
import { CollectionPicker, type CollectionOption } from "@/components/collection-picker";
import { LocationPicker, type LocationOption } from "@/components/location-picker";
import { NextSectionButton, SectionPicker, currentSectionId } from "@/components/section-picker";
import { ConditionSelect, FinishSelect, LanguageSelect } from "@/components/stack-fields";
import { FINISH_LABELS, LANGUAGE_FLAGS, LANGUAGES, placeLabel } from "@/lib/format";
import { type StickyDefaults, useStickyDefaults, validId } from "@/lib/use-sticky-defaults";
import { cn } from "@/lib/utils";

/** The divider entries go behind: the remembered one if it's in that location, else its current one. */
function sectionFor(defaults: StickyDefaults, locations: LocationOption[]): string | null {
  const sections = locations.find((l) => l.id === defaults.lastLocationId)?.sections ?? [];
  if (!sections.length) return null;
  return validId(defaults.lastSectionId, sections) ?? currentSectionId(sections);
}

/** addItem's target fields (location, divider, collection) from the remembered settings. */
export function targetFor(defaults: StickyDefaults, locations: LocationOption[]) {
  return {
    locationId: defaults.lastLocationId,
    sectionId: sectionFor(defaults, locations),
    collectionId: defaults.entryCollectionId,
  };
}

/**
 * Keeps the remembered divider in step with what's shown, for entry points that don't get the
 * list of locations (the + buttons on set pages send the remembered id as is). Returns it.
 */
function useSyncedSection(locations: LocationOption[]) {
  const [defaults, setDefaults] = useStickyDefaults();
  const sectionId = sectionFor(defaults, locations);
  useEffect(() => {
    if (sectionId !== defaults.lastSectionId) setDefaults({ lastSectionId: sectionId });
  }, [sectionId, defaults.lastSectionId, setDefaults]);
  return sectionId;
}

/**
 * The entry settings folded into one line — «Se añaden a: Caja 1 › A · 🇬🇧 Inglés · NM ·
 * Normal» — that opens EntryTarget (and EntryCopyFields, with `copyFields`) when tapped. They're
 * set once and then left alone, yet they used to take the top of every page that adds cards: on
 * a phone, a set's page was a full screen of selects before its first card.
 */
export function EntrySettings({
  locations,
  collections,
  withCollection = true,
  copyFields = false,
  finishLabels = FINISH_LABELS,
  label = "Se añaden a",
  className,
}: {
  locations: LocationOption[];
  collections: CollectionOption[];
  withCollection?: boolean;
  /** Also language, condition and finish: for the + buttons, which add with them unseen. */
  copyFields?: boolean;
  finishLabels?: Record<"nonfoil" | "foil" | "etched", string>;
  label?: string;
  className?: string;
}) {
  const [defaults] = useStickyDefaults();
  const [open, setOpen] = useState(false);
  // Mounted even while folded: the + buttons rely on the remembered divider being valid.
  const sectionId = useSyncedSection(locations);

  const location = locations.find((l) => l.id === defaults.lastLocationId);
  const section = location?.sections?.find((s) => s.id === sectionId);
  const collection = withCollection
    ? collections.find((c) => c.id === defaults.entryCollectionId)
    : undefined;
  const flag = LANGUAGE_FLAGS[defaults.language];
  const summary = [
    (placeLabel(location?.name, section?.name) ?? "Sin ubicación") +
      (collection ? ` y «${collection.name}»` : ""),
    copyFields &&
      `${flag ? `${flag} ` : ""}${LANGUAGES[defaults.language] ?? defaults.language}`,
    copyFields && defaults.condition,
    copyFields && finishLabels[defaults.finish],
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // A whole line even inside a flex row (the set page's filters): sized to its content, the
    // summary wouldn't truncate and ran off the side of a phone.
    <div className={cn("bg-muted/40 w-full min-w-0 rounded-lg border text-sm", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <SlidersHorizontalIcon className="text-muted-foreground size-4 shrink-0" />
        {/* On a phone the summary needs the room more than the label does; the icon says what it is. */}
        <span className="text-muted-foreground hidden shrink-0 sm:inline">{label}</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={summary}>
          {summary}
        </span>
        <span className="text-primary shrink-0 text-xs font-medium">
          {open ? "Listo" : "Cambiar"}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-3">
          <EntryTarget locations={locations} collections={collections} withCollection={withCollection} />
          {copyFields && <EntryCopyFields finishLabels={finishLabels} />}
        </div>
      )}
    </div>
  );
}

/**
 * Where entered copies go: an optional location — and its divider, when it has them (D28) —
 * and, optionally, a collection to list them in too (D23). Remembered per device and shared by
 * every entry point: quick add, set pages, card pages, the scanner.
 */
export function EntryTarget({
  locations,
  collections,
  withCollection = true,
}: {
  locations: LocationOption[];
  collections: CollectionOption[];
  /** Off on a collection's own page: what's added there is already listed in it. */
  withCollection?: boolean;
}) {
  const [defaults, setDefaults] = useStickyDefaults();
  const location = locations.find((l) => l.id === defaults.lastLocationId);
  const sections = location?.sections ?? [];
  const sectionId = useSyncedSection(locations);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Guardar en</span>
      <LocationPicker
        value={defaults.lastLocationId}
        locations={locations}
        onChange={(id) => setDefaults({ lastLocationId: id })}
      />
      {location && sections.length > 0 && (
        <>
          <SectionPicker
            value={sectionId}
            sections={sections}
            onChange={(id) => setDefaults({ lastSectionId: id })}
          />
          <NextSectionButton locationId={location.id} sectionId={sectionId} />
        </>
      )}
      {withCollection && (
        <>
          <span className="text-muted-foreground">y añadir a</span>
          <CollectionPicker
            value={defaults.entryCollectionId}
            collections={collections}
            emptyLabel="Ninguna colección"
            onChange={(id) => setDefaults({ entryCollectionId: id })}
          />
        </>
      )}
    </div>
  );
}

/**
 * How entered copies are: language, condition and finish, remembered per device and shared
 * with quick add, the card page and the scanner. Shown by the + buttons of a set or a
 * collection, which add with them: nothing there used to say they'd go in as Spanish, the
 * first default.
 */
export function EntryCopyFields({ finishLabels }: { finishLabels?: Record<"nonfoil" | "foil" | "etched", string> }) {
  const [defaults, setDefaults] = useStickyDefaults();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Por defecto</span>
      <LanguageSelect value={defaults.language} onChange={(v) => setDefaults({ language: v })} />
      <ConditionSelect value={defaults.condition} onChange={(v) => setDefaults({ condition: v })} />
      <FinishSelect value={defaults.finish} onChange={(v) => setDefaults({ finish: v })} labels={finishLabels} />
    </div>
  );
}

type Added = Extract<AddItemResult, { ok: true }>;

const GONE = {
  location_not_found: "La ubicación elegida ya no existe. Elige otra.",
  section_not_found: "El separador elegido ya no existe. Elige otro.",
  collection_not_found: "La colección elegida ya no existe. Elige otra.",
} as const;

/**
 * Applies what addItem says about the target: forgets a deleted location, divider or
 * collection, and follows an automatic move to the next divider — telling the user to put the
 * physical divider in. Returns whether the copies were added.
 */
export function useEntryResult() {
  const [, setDefaults] = useStickyDefaults();
  return useCallback(
    (r: AddItemResult): r is Added => {
      if (!r.ok) {
        setDefaults(
          r.error === "location_not_found"
            ? { lastLocationId: null, lastSectionId: null }
            : r.error === "section_not_found"
              ? { lastSectionId: null }
              : { entryCollectionId: null },
        );
        toast.error(GONE[r.error]);
        return false;
      }
      if (r.section) setDefaults({ lastSectionId: r.section.id });
      if (r.advancedFrom && r.section) {
        navigator.vibrate?.([80, 60, 80]);
        toast.warning(`Separador «${r.advancedFrom}» lleno: pon el separador «${r.section.name}»`, {
          duration: 8000,
        });
      }
      return true;
    },
    [setDefaults],
  );
}
