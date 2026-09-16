"use client";

import { PencilIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateLocationNotes } from "../actions";

const MAX = 5000;

/**
 * The location's own notes («la caja de arriba del armario», «ordenada por color»…): shown as
 * written, line breaks and all, and edited in place. Longer than the description under the
 * title, which stays a one-line subtitle. The same as a collection's notes (D23).
 */
export function LocationNotes({ id, notes }: { id: string; notes: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  const edit = () => {
    setDraft(notes ?? "");
    setEditing(true);
  };

  function save() {
    startTransition(async () => {
      try {
        await updateLocationNotes(id, draft);
        setEditing(false);
        toast.success(draft.trim() ? "Notas guardadas" : "Notas borradas");
      } catch {
        toast.error("No se han podido guardar las notas.");
      }
    });
  }

  if (editing) {
    return (
      <section className="space-y-2" aria-label="Notas">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          maxLength={MAX}
          autoFocus
          aria-label="Notas de la ubicación"
          placeholder="Lo que quieras apuntar de esta ubicación: dónde está, cómo la tienes ordenada, qué guardas aquí…"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
            Cancelar
          </Button>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {draft.length}/{MAX}
          </span>
        </div>
      </section>
    );
  }

  if (!notes) {
    return (
      <Button variant="ghost" size="sm" onClick={edit}>
        <PencilIcon />
        Añadir notas
      </Button>
    );
  }

  return (
    <section className="bg-card space-y-1.5 rounded-lg border p-3" aria-label="Notas">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Notas</h2>
        <Button variant="ghost" size="sm" onClick={edit}>
          <PencilIcon />
          Editar
        </Button>
      </div>
      <p className="text-sm whitespace-pre-wrap">{notes}</p>
    </section>
  );
}
