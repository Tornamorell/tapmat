"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createLocation } from "@/app/(app)/locations/actions";
import { selectClass } from "@/components/stack-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SectionOption } from "@/lib/queries/locations";
import { cn } from "@/lib/utils";

const NEW = "__new__";

export type LocationOption = {
  id: string;
  name: string;
  /** Dividers inside it, in order (D28); none for a location without them. */
  sections?: SectionOption[];
  autoAdvance?: boolean;
  /** Set when this location is a deck's box (D35): the scanner then prefers that deck's list. */
  deckId?: string | null;
};

/**
 * Location select with "+ Nueva ubicación…" inline, so "I'm starting on box 1" doesn't
 * require leaving the page to create it first.
 */
export function LocationPicker({
  value,
  onChange,
  locations,
  id,
  className,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  locations: LocationOption[];
  id?: string;
  className?: string;
}) {
  const router = useRouter();
  const [created, setCreated] = useState<LocationOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  // Locations created here show up before the server props catch up.
  const options = [...locations, ...created.filter((c) => !locations.some((l) => l.id === c.id))];
  const current = value && options.some((o) => o.id === value) ? value : "";

  function create() {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      try {
        const location = await createLocation(name);
        setCreated((list) => [...list, location]);
        onChange(location.id);
        setCreating(false);
        router.refresh();
      } catch {
        toast.error("No se ha podido crear la ubicación.");
      }
    });
  }

  if (creating) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              create();
            } else if (e.key === "Escape") {
              setCreating(false);
            }
          }}
          placeholder="p. ej. Caja 1"
          className="w-36"
          aria-label="Nombre de la nueva ubicación"
          maxLength={60}
        />
        <Button size="sm" onClick={create} disabled={pending || !name.trim()} aria-busy={pending}>
          {pending ? "Creando…" : "Crear"}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setCreating(false)}
          aria-label="Cancelar"
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className={cn(selectClass, className)}
      value={current}
      onChange={(e) => {
        if (e.target.value === NEW) {
          setName("");
          setCreating(true);
        } else {
          onChange(e.target.value || null);
        }
      }}
      aria-label="Ubicación"
    >
      <option value="">Sin ubicación</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
      <option value={NEW}>+ Nueva ubicación…</option>
    </select>
  );
}
