import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ListsSwitcher } from "@/components/lists-switcher";
import { getWants } from "@/lib/queries/collections";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Wants" };

/**
 * The wants list: cards you want, each in the edition you picked, without filing them under a
 * collection (D23). It's the same kind of list underneath, so once it exists this page hands
 * over to it instead of keeping a second copy of the filters, the sorting and the adders.
 */
export default async function WantsPage() {
  const user = await requireUser();
  const wants = await getWants(user.id);
  if (wants) redirect(`/collections/${wants.id}`);

  return (
    <div className="space-y-6">
      <ListsSwitcher current="wants" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Wants</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Las cartas que quieres, cada una en la edición que elijas y sin tener que meterlas en una
          colección. Te dirá cuántas llevas y cuánto costaría conseguir el resto.
        </p>
      </div>
      <p className="text-muted-foreground text-sm">
        La lista se crea sola la primera vez que pulses <strong>«Lo quiero»</strong> en la ficha de
        una carta.
      </p>
    </div>
  );
}
