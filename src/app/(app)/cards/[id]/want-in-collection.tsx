"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CollectionPicker, type CollectionOption } from "@/components/collection-picker";
import { Button } from "@/components/ui/button";
import { addCardToCollection, addCardToWants } from "../../collections/actions";

/** Puts this printing on a list without owning it ("I want it for the Hoenn Pokédex"). */
export function WantInCollection({
  printingId,
  collections,
  listedIn,
}: {
  printingId: string;
  collections: CollectionOption[];
  listedIn: string[];
}) {
  const router = useRouter();
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const already = !!collectionId && listedIn.includes(collectionId);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {/* One tap, no picking: the wants list is the usual answer to "I want this" (D23). */}
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const r = await addCardToWants(printingId);
              toast.success(`${r.name} en «${r.collectionName}»`);
              router.refresh();
            } catch {
              toast.error("No se ha podido añadir a Wants.");
            }
          })
        }
      >
        Lo quiero
      </Button>
      <span className="text-muted-foreground">¿O en una colección, la tengas o no?</span>
      <CollectionPicker
        value={collectionId}
        onChange={setCollectionId}
        collections={collections}
        emptyLabel="Elige una colección"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={!collectionId || already || pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const r = await addCardToCollection(collectionId!, printingId, 1);
              toast.success(`${r.name} en «${r.collectionName}»`);
              router.refresh();
            } catch {
              toast.error("No se ha podido añadir a la colección.");
            }
          })
        }
      >
        {already ? "Ya está en la lista" : "Añadir a la lista"}
      </Button>
    </div>
  );
}
