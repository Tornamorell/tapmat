"use client";

import { ArrowDownToLineIcon, ClipboardCopyIcon, ClipboardPasteIcon, ListPlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addBoxToDeck, deleteDeck, importIntoDeck, pullIntoDeck, renameDeck } from "../actions";
import { reportImport } from "../import-report";

type Mode = null | "import" | "rename" | "delete";

/** Bring copies in, paste a list, copy it out, rename or delete the deck. */
export function DeckTools({
  deckId,
  name,
  pullable,
  listable,
  exportText,
  children,
}: {
  deckId: string;
  name: string;
  /** Copies the box lacks that are free elsewhere. */
  pullable: number;
  /** Copies in the box that the list doesn't ask for and that can go into it. */
  listable: number;
  exportText: string;
  /** More tools in the same row, after copying the list (the test hand). */
  children?: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<void>, error: string) {
    startTransition(async () => {
      try {
        await action();
      } catch {
        toast.error(error);
      }
    });
  }

  // Its own flag: `pending` is also the paste, rename and delete forms'.
  const [pulling, setPulling] = useState(false);
  const pull = () => {
    setPulling(true);
    run(async () => {
      try {
        const r = await pullIntoDeck(deckId);
        toast.success(`${r.moved} ${r.moved === 1 ? "copia movida" : "copias movidas"} a la caja del mazo.`);
      } finally {
        setPulling(false);
      }
    }, "No se han podido mover las copias.");
  };

  // Its own flag too, for the same reason as `pulling`.
  const [adding, setAdding] = useState(false);
  const addBox = () => {
    setAdding(true);
    run(async () => {
      try {
        const r = await addBoxToDeck(deckId);
        const left = r.skipped ? ` Quedan ${r.skipped} sin datos de reglas.` : "";
        toast.success(
          r.added
            ? `${r.added} ${r.added === 1 ? "copia añadida" : "copias añadidas"} a la lista.${left}`
            : `No había nada que añadir.${left}`,
        );
      } finally {
        setAdding(false);
      }
    }, "No se han podido añadir las cartas a la lista.");
  };

  const paste = () =>
    run(async () => {
      reportImport(await importIntoDeck(deckId, text));
      setText("");
      setMode(null);
    }, "No se ha podido importar la lista.");

  const rename = () =>
    run(async () => {
      await renameDeck(deckId, text);
      setMode(null);
    }, "No se ha podido cambiar el nombre.");

  const remove = () =>
    run(async () => {
      await deleteDeck(deckId);
      toast.success("Mazo borrado. Sus cartas siguen en Mis cartas, sin ubicación.");
      router.push("/decks");
    }, "No se ha podido borrar el mazo.");

  async function copy() {
    try {
      await navigator.clipboard.writeText(exportText);
      toast.success("Lista copiada: pégala en Moxfield o Arena.");
    } catch {
      toast.error("No se ha podido copiar la lista.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {pullable > 0 && (
          <Button size="sm" onClick={pull} disabled={pending} aria-busy={pending}>
            <ArrowDownToLineIcon />
            {pulling ? "Trayendo a la caja…" : `Traer a la caja lo que tienes (${pullable})`}
          </Button>
        )}
        {listable > 0 && (
          <Button size="sm" variant="outline" onClick={addBox} disabled={pending} aria-busy={pending}>
            <ListPlusIcon />
            {adding ? "Añadiendo a la lista…" : `Añadir a la lista lo de la caja (${listable})`}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setMode(mode === "import" ? null : "import")} disabled={pending}>
          <ClipboardPasteIcon />
          Pegar lista
        </Button>
        <Button size="sm" variant="outline" onClick={copy} disabled={!exportText}>
          <ClipboardCopyIcon />
          Copiar lista
        </Button>
        {children}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setText(name);
            setMode(mode === "rename" ? null : "rename");
          }}
          disabled={pending}
        >
          <PencilIcon />
          Renombrar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(mode === "delete" ? null : "delete")} disabled={pending}>
          <Trash2Icon />
          Borrar
        </Button>
      </div>

      {mode === "import" && (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder={"1 Sol Ring (C21) 263\n1 Arcane Signet"}
            aria-label="Lista para añadir al mazo"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={paste} disabled={pending || !text.trim()} aria-busy={pending}>
              {pending ? "Añadiendo…" : "Añadir al mazo"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
              Cancelar
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">Las cartas se suman a las que ya tiene el mazo.</p>
        </div>
      )}

      {mode === "rename" && (
        <div className="flex max-w-md gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={80} aria-label="Nombre del mazo" autoFocus />
          <Button size="sm" onClick={rename} disabled={pending || !text.trim()} aria-busy={pending || undefined}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      )}

      {mode === "delete" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Se borran el mazo y su caja. Las cartas siguen en Mis cartas, sin ubicación.</span>
          <Button size="sm" variant="destructive" onClick={remove} disabled={pending} aria-busy={pending}>
            {pending ? "Borrando…" : "Borrar mazo"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
