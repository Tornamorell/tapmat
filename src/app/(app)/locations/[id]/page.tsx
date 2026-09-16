import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AddFilteredToCollection } from "@/components/add-filtered-to-collection";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  ItemsTable,
  ItemsToolbar,
  Pagination,
  hrefBuilder,
  parseItemParams,
} from "@/components/items-table";
import { formatEur, formatInt } from "@/lib/format";
import { collectionOptions } from "@/lib/queries/collections";
import { listItems } from "@/lib/queries/items";
import {
  getLocation,
  listSections,
  locationOptions,
  unlocatedSummary,
  unsectionedCount,
} from "@/lib/queries/locations";
import { requireUser } from "@/lib/session";
import { LocationNotes } from "./location-notes";
import { LocationSettings } from "./location-settings";
import { SectionsPanel } from "./sections-panel";

export const metadata: Metadata = { title: "Ubicación" };

// `/locations/none` lists copies without location.
async function load(ownerId: string, id: string) {
  if (id === "none") {
    return {
      id: null,
      name: "Sin ubicación",
      description: "Copias que aún no tienen un sitio asignado.",
      // Not a real location, so there's nothing to write notes on.
      notes: null,
      sectionCapacity: null,
      autoAdvance: false,
      ...(await unlocatedSummary(ownerId)),
    };
  }
  if (!z.uuid().safeParse(id).success) notFound();
  const location = await getLocation(ownerId, id);
  if (!location) notFound();
  return location;
}

export default async function LocationPage({ params, searchParams }: PageProps<"/locations/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const location = await load(user.id, id);
  const sp = await searchParams;
  const { q, sort, page } = parseItemParams(sp);

  const [sections, unsectioned] = location.id
    ? await Promise.all([listSections(location.id), unsectionedCount(location.id)])
    : [[], 0];
  // ?section=<divider id> or ?section=none (copies outside any divider).
  const rawSection = typeof sp.section === "string" ? sp.section : undefined;
  const sectionId =
    rawSection === "none" ? null : sections.some((s) => s.id === rawSection) ? rawSection : undefined;
  const sectionParam = sectionId === null ? "none" : sectionId;

  const [{ rows, hasMore }, locations, collections] = await Promise.all([
    listItems(
      { ownerId: user.id, locationId: location.id, ...(sectionId !== undefined && { sectionId }) },
      { q, sort, page },
    ),
    locationOptions(user.id),
    collectionOptions(user.id),
  ]);

  const href = hrefBuilder({ q, sort: sort === "value" ? undefined : sort, section: sectionParam });
  const filtered = !!q || sectionId !== undefined;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Mis cartas", href: "/inventory" },
          { label: "Ubicaciones", href: "/locations" },
          { label: location.name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{location.name}</h1>
          {location.description && (
            <p className="text-muted-foreground text-sm">{location.description}</p>
          )}
        </div>
        {location.id && (
          <LocationSettings
            id={location.id}
            name={location.name}
            description={location.description}
            sectionCount={sections.length}
            sectionCapacity={location.sectionCapacity}
            autoAdvance={location.autoAdvance}
          />
        )}
      </div>

      {location.id && <LocationNotes id={location.id} notes={location.notes} />}

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="display text-primary text-3xl font-bold">{formatEur(location.valueEur)}</p>
        <p className="text-muted-foreground text-sm">
          {formatInt(location.cardCount)} cartas
          {location.unpricedCount > 0 && `, ${formatInt(location.unpricedCount)} sin precio`}
        </p>
      </div>

      {location.id &&
        (sections.length > 0 ? (
          <SectionsPanel
            locationId={location.id}
            sections={sections}
            unsectioned={unsectioned}
            activeSectionId={sectionId}
            capacity={location.sectionCapacity}
            autoAdvance={location.autoAdvance}
          />
        ) : (
          location.cardCount > 0 && (
            <p className="text-muted-foreground text-sm">
              ¿Es una caja grande? En Opciones › Separadores puedes dividirla en tramos de N cartas.
            </p>
          )
        ))}

      <ItemsToolbar
        q={q}
        sort={sort}
        href={href}
        hidden={{ sort: sort === "value" ? undefined : sort, section: sectionParam }}
      />

      {!rows.length ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {filtered
            ? "Nada coincide con este filtro."
            : "Aquí no hay cartas todavía. Elige esta ubicación al añadir o escanear."}
        </p>
      ) : (
        <>
          <div className="flex justify-end">
            <AddFilteredToCollection
              collections={collections}
              filter={{
                locationId: location.id,
                ...(sectionId !== undefined && { sectionId }),
                ...(q && { q }),
              }}
              label="Añadir estas cartas a una colección"
            />
          </div>
          <ItemsTable rows={rows} context="location" locations={locations} collections={collections} />
        </>
      )}

      <Pagination page={page} hasMore={hasMore} href={href} />
    </div>
  );
}
