"use client";

import { CameraIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cardInPictureBlob } from "@/lib/card-photo";
import { deleteCardPhoto, saveCardPhoto } from "../photo-actions";

/**
 * «Añadir foto» / «Cambiar foto» for a card without a catalog image: camera or gallery, the
 * card found and straightened (or the middle of the picture, cut to a card's shape), and
 * shared with everyone (D30, D32). «Borrar foto» for admins, confirmed in place.
 */
export function CardPhotoButton({
  catalogCardId,
  hasPhoto,
  canDelete = false,
}: {
  catalogCardId: string;
  hasPhoto: boolean;
  /** The user is an admin (ADMIN_EMAILS), who may delete anyone's photo. */
  canDelete?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function upload(file: File) {
    startTransition(async () => {
      try {
        const bitmap = await createImageBitmap(file);
        const blob = await cardInPictureBlob(bitmap);
        if (!blob) throw new Error("No photo");
        const form = new FormData();
        form.set("image", blob, "carta.jpg");
        form.set("catalogCardId", catalogCardId);
        form.set("source", "upload");
        const r = await saveCardPhoto(form);
        if (r.saved) {
          toast.success("Foto guardada: la verán todos los que tengan esta carta.");
          router.refresh();
        } else {
          toast.error("Esta carta ya tiene la imagen del catálogo.");
        }
      } catch {
        toast.error("No se ha podido guardar la foto.");
      }
    });
  }

  function remove() {
    startDelete(async () => {
      try {
        const r = await deleteCardPhoto(catalogCardId);
        setConfirming(false);
        if (r.deleted) {
          toast.success("Foto borrada.");
          router.refresh();
        } else {
          toast.error("Solo un administrador puede borrar fotos.");
        }
      } catch {
        toast.error("No se ha podido borrar la foto.");
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span>¿Borrar la foto? La dejarán de ver todos.</span>
        <Button type="button" variant="destructive" size="sm" disabled={deleting} aria-busy={deleting} onClick={remove}>
          {deleting ? "Borrando…" : "Borrar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() => inputRef.current?.click()}
      >
        <CameraIcon />
        {pending ? "Guardando…" : hasPhoto ? "Cambiar foto" : "Añadir foto"}
      </Button>
      {hasPhoto && canDelete && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          <Trash2Icon />
          Borrar foto
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
