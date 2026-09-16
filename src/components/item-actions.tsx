"use client";

import { MinusIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addInventoryToCollection,
  changePrinting,
  changeQuantity,
  deleteItem,
  splitItem,
  updateItem,
} from "@/app/(app)/inventory/actions";
import { CollectionPicker, type CollectionOption } from "@/components/collection-picker";
import { LocationPicker, type LocationOption } from "@/components/location-picker";
import { MoveDialog } from "@/components/move-dialog";
import { SectionPicker, currentSectionId } from "@/components/section-picker";
import {
  ConditionSelect,
  FinishSelect,
  LanguageSelect,
  selectClass,
} from "@/components/stack-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CONDITIONS } from "@/lib/format";
import { gameById } from "@/lib/games";
import { GRADING_COMPANIES, GRADING_LABELS } from "@/lib/grading";
import { useSteppedValue } from "@/lib/use-stepped-value";
import { cn } from "@/lib/utils";

export function QuantityControl({ itemId, quantity }: { itemId: string; quantity: number }) {
  // Each click counts at once and the server catches up (useSteppedValue).
  const { shown, pending, step } = useSteppedValue(
    quantity,
    (_next, delta) => changeQuantity(itemId, delta > 0 ? 1 : -1),
    "No se ha podido cambiar la cantidad.",
  );

  return (
    <div className="flex items-center justify-center gap-1" aria-busy={pending || undefined}>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => step(shown - 1)}
        // Removing the last copy is a deletion: done from the menu, on purpose.
        disabled={shown <= 1}
        aria-label="Una copia menos"
      >
        <MinusIcon />
      </Button>
      <span className={cn("w-8 text-center tabular-nums transition-opacity", pending && "opacity-50")}>{shown}</span>
      <Button variant="ghost" size="icon-xs" onClick={() => step(shown + 1)} aria-label="Una copia más">
        <PlusIcon />
      </Button>
    </div>
  );
}

export interface ActionItem {
  id: string;
  catalogCardId: string | null;
  game: string | null;
  name: string;
  quantity: number;
  finish: "nonfoil" | "foil" | "etched";
  condition: (typeof CONDITIONS)[number];
  language: string;
  locationId: string | null;
  sectionId: string | null;
  notes: string | null;
  purchasePriceEur: number | null;
  estimatedValueEur: number | null;
  gradingCompany: string | null;
  grade: number | null;
  certNumber: string | null;
  finishes: string[];
}

export function ItemActions({
  item,
  locations,
  collections,
}: {
  item: ActionItem;
  locations: LocationOption[];
  collections: CollectionOption[];
}) {
  const [dialog, setDialog] = useState<
    "edit" | "printing" | "move" | "collection" | "split" | "delete" | null
  >(null);
  const close = () => setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${item.name}`} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setDialog("edit")}>
            {item.gradingCompany ? "Editar" : "Editar o marcar gradeada"}
          </DropdownMenuItem>
          {item.catalogCardId && (
            <DropdownMenuItem onClick={() => setDialog("printing")}>Cambiar expansión…</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialog("move")}>Mover…</DropdownMenuItem>
          {item.catalogCardId && (
            <DropdownMenuItem onClick={() => setDialog("collection")}>
              Añadir a una colección
            </DropdownMenuItem>
          )}
          {item.quantity > 1 && (
            <DropdownMenuItem onClick={() => setDialog("split")}>Dividir montón</DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open, so each opening starts from the current values. */}
      {dialog === "edit" && <EditDialog item={item} locations={locations} onClose={close} />}
      {dialog === "move" && (
        <MoveDialog
          stacks={[{ itemId: item.id }]}
          title={`Mover ${item.name}`}
          maxCount={item.quantity}
          locations={locations}
          onClose={close}
        />
      )}
      {dialog === "printing" && <PrintingDialog item={item} onClose={close} />}
      {dialog === "collection" && (
        <CollectionDialog item={item} collections={collections} onClose={close} />
      )}
      {dialog === "split" && <SplitDialog item={item} onClose={close} />}
      {dialog === "delete" && <DeleteDialog item={item} onClose={close} />}
    </>
  );
}

const OTHER_COMPANY = "__other__";
const asText = (v: number | null) => (v == null ? "" : String(v));
/** "12,50" → 12.5; empty → null. */
const parseNumber = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t === "" ? null : Number(t);
};

function EditDialog({
  item,
  locations,
  onClose,
}: {
  item: ActionItem;
  locations: LocationOption[];
  onClose: () => void;
}) {
  const knownCompany = (GRADING_COMPANIES as readonly string[]).includes(item.gradingCompany ?? "");
  const [form, setForm] = useState({
    quantity: String(item.quantity),
    finish: item.finish,
    condition: item.condition,
    language: item.language,
    locationId: item.locationId,
    sectionId: item.sectionId,
    purchasePriceEur: asText(item.purchasePriceEur),
    estimatedValueEur: asText(item.estimatedValueEur),
    notes: item.notes ?? "",
    graded: !!item.gradingCompany,
    company: knownCompany ? item.gradingCompany! : item.gradingCompany ? OTHER_COMPANY : "PSA",
    otherCompany: knownCompany ? "" : (item.gradingCompany ?? ""),
    grade: asText(item.grade),
    certNumber: item.certNumber ?? "",
  });
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const sectionsOf = (id: string | null) => locations.find((l) => l.id === id)?.sections ?? [];
  const sections = sectionsOf(form.locationId);
  // Grading one copy of several splits it off into its own row (see updateItem).
  const splitting = form.graded && !item.gradingCompany && item.quantity > 1;

  function save(event: React.FormEvent) {
    event.preventDefault();
    const company = form.company === OTHER_COMPANY ? form.otherCompany.trim() : form.company;
    startTransition(async () => {
      try {
        await updateItem(item.id, {
          quantity: form.graded ? 1 : Number(form.quantity),
          finish: form.finish,
          condition: form.condition,
          language: form.language,
          locationId: form.locationId,
          sectionId: sections.length ? form.sectionId : null,
          purchasePriceEur: parseNumber(form.purchasePriceEur),
          estimatedValueEur: parseNumber(form.estimatedValueEur),
          notes: form.notes,
          grading: form.graded
            ? { company, grade: parseNumber(form.grade), certNumber: form.certNumber }
            : null,
        });
        toast.success(splitting ? "Una copia separada y marcada como gradeada" : "Cambios guardados");
        onClose();
      } catch {
        toast.error("Revisa los datos: no se han podido guardar.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Editar {item.name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {!form.graded && (
              <Field label="Cantidad" htmlFor="edit-qty">
                <Input
                  id="edit-qty"
                  type="number"
                  min={1}
                  max={999}
                  value={form.quantity}
                  onChange={(e) => set({ quantity: e.target.value })}
                  required
                />
              </Field>
            )}
            <Field label="Acabado" htmlFor="edit-finish">
              <FinishSelect
                id="edit-finish"
                value={form.finish}
                available={item.finishes}
                labels={gameById(item.game)?.finishLabels}
                onChange={(finish) => set({ finish })}
              />
            </Field>
            <Field label="Estado" htmlFor="edit-condition">
              <ConditionSelect
                id="edit-condition"
                value={form.condition}
                onChange={(condition) => set({ condition })}
              />
            </Field>
            <Field label="Idioma" htmlFor="edit-language">
              <LanguageSelect
                id="edit-language"
                value={form.language}
                onChange={(language) => set({ language })}
              />
            </Field>
            <Field label="Ubicación" htmlFor="edit-location">
              <LocationPicker
                id="edit-location"
                value={form.locationId}
                locations={locations}
                onChange={(locationId) =>
                  set({ locationId, sectionId: currentSectionId(sectionsOf(locationId)) })
                }
              />
            </Field>
            {sections.length > 0 && (
              <Field label="Separador" htmlFor="edit-section">
                <SectionPicker
                  id="edit-section"
                  value={form.sectionId}
                  sections={sections}
                  allowNone
                  onChange={(sectionId) => set({ sectionId })}
                />
              </Field>
            )}
            <Field label="Precio de compra (€/u)" htmlFor="edit-price">
              <Input
                id="edit-price"
                inputMode="decimal"
                value={form.purchasePriceEur}
                onChange={(e) => set({ purchasePriceEur: e.target.value })}
                placeholder="0,00"
              />
            </Field>
            <Field label="Valor estimado (€/u)" htmlFor="edit-value">
              <Input
                id="edit-value"
                inputMode="decimal"
                value={form.estimatedValueEur}
                onChange={(e) => set({ estimatedValueEur: e.target.value })}
                placeholder="Cardmarket"
              />
            </Field>
          </div>
          <p className="text-muted-foreground -mt-2 text-xs">
            Si pones un valor estimado, cuenta en lugar del precio de Cardmarket: para gradeadas,
            firmadas o cartas especiales.
          </p>

          <fieldset className="grid gap-3 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={form.graded}
                onChange={(e) => set({ graded: e.target.checked })}
              />
              Está gradeada
            </label>
            {form.graded && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Empresa" htmlFor="edit-company">
                    <select
                      id="edit-company"
                      className={selectClass}
                      value={form.company}
                      onChange={(e) => set({ company: e.target.value })}
                    >
                      {GRADING_COMPANIES.map((c) => (
                        <option key={c} value={c}>
                          {GRADING_LABELS[c] ?? c}
                        </option>
                      ))}
                      <option value={OTHER_COMPANY}>Otra…</option>
                    </select>
                  </Field>
                  <Field label="Nota" htmlFor="edit-grade">
                    <Input
                      id="edit-grade"
                      inputMode="decimal"
                      value={form.grade}
                      onChange={(e) => set({ grade: e.target.value })}
                      placeholder="10"
                    />
                  </Field>
                  {form.company === OTHER_COMPANY && (
                    <Field label="¿Qué empresa?" htmlFor="edit-other-company">
                      <Input
                        id="edit-other-company"
                        value={form.otherCompany}
                        onChange={(e) => set({ otherCompany: e.target.value })}
                        required
                      />
                    </Field>
                  )}
                  <Field label="Nº de certificado" htmlFor="edit-cert">
                    <Input
                      id="edit-cert"
                      value={form.certNumber}
                      onChange={(e) => set({ certNumber: e.target.value })}
                    />
                  </Field>
                </div>
                {splitting && (
                  <p className="text-muted-foreground text-xs">
                    Tienes {item.quantity}: se separará una copia como gradeada y las otras{" "}
                    {item.quantity - 1} quedarán como están.
                  </p>
                )}
              </>
            )}
          </fieldset>

          <Field label="Notas" htmlFor="edit-notes">
            <Textarea
              id="edit-notes"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PrintingOption = {
  id: string;
  setCode: string;
  setName: string | null;
  collectorNumber: string;
};

/**
 * Re-files a stack under another edition of the same card. The scanner reads what's printed on
 * the card, and a The List reprint shows its original set's symbol and number, so it can end up
 * filed as that original edition: this is how to put it right afterwards.
 */
function PrintingDialog({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const [printings, setPrintings] = useState<PrintingOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState("");
  const [pending, startTransition] = useTransition();

  // Loaded when the dialog opens: a popular card has dozens of editions.
  useEffect(() => {
    let alive = true;
    fetch(`/api/printings?cardId=${item.catalogCardId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((data: PrintingOption[]) => alive && setPrintings(data))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [item.catalogCardId]);

  function save() {
    startTransition(async () => {
      try {
        const r = await changePrinting(item.id, chosen);
        const extra = [
          r.merged && "se ha juntado con un montón igual",
          r.finishChanged && "esa edición no sale en el acabado que tenía",
        ]
          .filter(Boolean)
          .join(" y ");
        toast.success(
          `${r.name} ahora es ${r.setCode.toUpperCase()} #${r.number}${extra ? ` · ${extra}` : ""}`,
        );
        onClose();
      } catch {
        toast.error("No se ha podido cambiar la expansión.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar la expansión de {item.name}</DialogTitle>
          <DialogDescription>
            Las mismas copias, bajo otra edición de la misma carta. Útil con The List, que lleva
            impreso el símbolo y el número de su expansión original.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-muted-foreground text-sm">No se han podido cargar las ediciones.</p>
        ) : !printings ? (
          <p className="text-muted-foreground text-sm">Cargando ediciones…</p>
        ) : printings.length < 2 ? (
          <p className="text-muted-foreground text-sm">Esta carta solo tiene una edición.</p>
        ) : (
          <select
            className={selectClass}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            aria-label="Edición"
          >
            <option value="">Elige una edición</option>
            {printings.map((p) => (
              <option key={p.id} value={p.id}>
                {p.setCode.toUpperCase()} #{p.collectorNumber}
                {p.setName ? ` · ${p.setName}` : ""}
                {p.id === item.catalogCardId ? " (la de ahora)" : ""}
              </option>
            ))}
          </select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!chosen || chosen === item.catalogCardId || pending}
            aria-busy={pending || undefined}
            onClick={save}
          >
            {pending ? "Guardando…" : "Cambiar expansión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollectionDialog({
  item,
  collections,
  onClose,
}: {
  item: ActionItem;
  collections: CollectionOption[];
  onClose: () => void;
}) {
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir {item.name} a una colección</DialogTitle>
          <DialogDescription>
            La carta se añade a la lista. Tus copias siguen donde están.
          </DialogDescription>
        </DialogHeader>
        <CollectionPicker
          value={collectionId}
          onChange={setCollectionId}
          collections={collections}
          emptyLabel="Elige una colección"
          className="w-full"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!collectionId || pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const r = await addInventoryToCollection({ collectionId: collectionId!, itemIds: [item.id] });
                  toast.success(`${item.name} está en «${r.collectionName}»`);
                  onClose();
                } catch {
                  toast.error("No se ha podido añadir a la colección.");
                }
              })
            }
          >
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitDialog({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const [count, setCount] = useState("1");
  const [pending, startTransition] = useTransition();

  function split(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await splitItem(item.id, Number(count));
        toast.success("Montón dividido. Edita el nuevo para cambiar su estado o ubicación.");
        onClose();
      } catch {
        toast.error("No se ha podido dividir el montón.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={split} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Dividir montón</DialogTitle>
            <DialogDescription>
              Separa copias de {item.name} (tienes {item.quantity}) en un montón nuevo, por
              ejemplo para marcar una con otro estado o moverla a otra ubicación.
            </DialogDescription>
          </DialogHeader>
          <Field label="Copias a separar" htmlFor="split-count">
            <Input
              id="split-count"
              type="number"
              min={1}
              max={item.quantity - 1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Dividiendo…" : "Dividir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ item, onClose }: { item: ActionItem; onClose: () => void }) {
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar {item.name}?</DialogTitle>
          <DialogDescription>
            Se quitará{item.quantity > 1 ? `n las ${item.quantity} copias` : " la copia"} de tus
            cartas. Las colecciones que la incluyen la seguirán listando, como carta que te falta.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteItem(item.id);
                  onClose();
                } catch {
                  toast.error("No se ha podido eliminar.");
                }
              })
            }
          >
            {pending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 [&_select]:w-full">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
