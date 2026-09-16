"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { locationSections, locations } from "@/db/schema";
import { appendSection, nextSection } from "@/lib/locations/sections";
import { requireUser } from "@/lib/session";

const locationName = z
  .string()
  .trim()
  .min(1, "Ponle un nombre")
  .max(60)
  .transform((v) => v.replace(/\s+/g, " "));

function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) =>
    typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : null;
  const cause = typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : null;
  return code(error) === "23505" || code(cause) === "23505";
}

async function findByName(ownerId: string, name: string) {
  const [row] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.ownerId, ownerId), sql`lower(${locations.name}) = lower(${name})`));
  return row ?? null;
}

function refresh() {
  revalidatePath("/locations");
  revalidatePath("/collections");
  revalidatePath("/");
}

/**
 * Creates a location, or returns the existing one with the same name (case-insensitive), so
 * typing "caja 1" again in a picker just selects "Caja 1".
 */
export async function createLocation(name: string): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const clean = locationName.parse(name);
  const existing = await findByName(user.id, clean);
  if (existing) return existing;
  try {
    const [created] = await db
      .insert(locations)
      .values({ ownerId: user.id, name: clean })
      .returning({ id: locations.id, name: locations.name });
    refresh();
    return created;
  } catch (error) {
    // Lost a race with another insert of the same name.
    const raced = isUniqueViolation(error) ? await findByName(user.id, clean) : null;
    if (raced) return raced;
    throw error;
  }
}

async function ownedLocation(userId: string, id: string) {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.ownerId, userId)));
  if (!row) throw new Error("Ubicación no encontrada");
  return row;
}

export async function updateLocation(id: string, formData: FormData) {
  const user = await requireUser();
  await ownedLocation(user.id, id);
  const name = locationName.parse(formData.get("name"));
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  try {
    await db.update(locations).set({ name, description }).where(eq(locations.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Ya tienes una ubicación con ese nombre");
    throw error;
  }
  refresh();
  revalidatePath(`/locations/${id}`);
}

/** The location's notes (the «Notas» on its page): free text; empty clears them. */
export async function updateLocationNotes(id: string, notes: string) {
  const user = await requireUser();
  const locationId = z.uuid().parse(id);
  await ownedLocation(user.id, locationId);
  const value = z.string().max(5000).parse(notes).trim() || null;
  await db.update(locations).set({ notes: value }).where(eq(locations.id, locationId));
  refresh();
  revalidatePath(`/locations/${locationId}`);
}

/** Deletes the location; its copies stay in the inventory, without location. */
export async function deleteLocation(id: string) {
  const user = await requireUser();
  await ownedLocation(user.id, id);
  await db.delete(locations).where(eq(locations.id, id));
  refresh();
  redirect("/locations");
}

// --- Dividers (D28) --------------------------------------------------------------------------
// They appear in every entry form's picker, so changes refresh the whole app.

const refreshAll = () => revalidatePath("/", "layout");
const capacity = z.number().int().min(1).max(100_000).nullable();

async function ownedSectionRow(userId: string, sectionId: string) {
  const [row] = await db
    .select({ id: locationSections.id, locationId: locationSections.locationId })
    .from(locationSections)
    .innerJoin(locations, eq(locations.id, locationSections.locationId))
    .where(and(eq(locationSections.id, z.uuid().parse(sectionId)), eq(locations.ownerId, userId)));
  if (!row) throw new Error("Separador no encontrado");
  return row;
}

const sectionSettingsInput = z.object({
  enabled: z.boolean(),
  capacity,
  autoAdvance: z.boolean(),
  /** Also give the dividers that already exist the new capacity. */
  applyToExisting: z.boolean(),
});

/**
 * Turns dividers on or off for a location and sets how they fill up. Turning them on creates
 * divider 1; turning them off deletes them all, and their copies stay in the box.
 */
export async function updateSectionSettings(
  locationId: string,
  input: z.input<typeof sectionSettingsInput>,
) {
  const user = await requireUser();
  await ownedLocation(user.id, locationId);
  const data = sectionSettingsInput.parse(input);
  await db
    .update(locations)
    .set({ sectionCapacity: data.capacity, autoAdvance: data.autoAdvance })
    .where(eq(locations.id, locationId));

  const [{ n }] = await db
    .select({ n: count() })
    .from(locationSections)
    .where(eq(locationSections.locationId, locationId));
  if (!data.enabled) {
    await db.delete(locationSections).where(eq(locationSections.locationId, locationId));
  } else if (!n) {
    await appendSection(locationId);
  } else if (data.applyToExisting) {
    await db
      .update(locationSections)
      .set({ capacity: data.capacity })
      .where(eq(locationSections.locationId, locationId));
  }
  refreshAll();
}

export async function addSection(locationId: string) {
  const user = await requireUser();
  await ownedLocation(user.id, locationId);
  const section = await appendSection(locationId);
  refreshAll();
  return section;
}

const sectionInput = z.object({ name: z.string().trim().min(1).max(40), capacity });

export async function updateSection(sectionId: string, input: z.input<typeof sectionInput>) {
  const user = await requireUser();
  const section = await ownedSectionRow(user.id, sectionId);
  const data = sectionInput.parse(input);
  await db.update(locationSections).set(data).where(eq(locationSections.id, section.id));
  refreshAll();
}

/** Deletes a divider; its copies stay in the box, outside any divider. */
export async function deleteSection(sectionId: string) {
  const user = await requireUser();
  const section = await ownedSectionRow(user.id, sectionId);
  await db.delete(locationSections).where(eq(locationSections.id, section.id));
  refreshAll();
}

/** «Siguiente separador»: the divider after the given one (the first, for null), created if needed. */
export async function advanceSection(locationId: string, sectionId: string | null) {
  const user = await requireUser();
  await ownedLocation(user.id, locationId);
  if (sectionId) await ownedSectionRow(user.id, sectionId);
  const next = await nextSection(locationId, sectionId);
  refreshAll();
  return { id: next.id, name: next.name };
}
