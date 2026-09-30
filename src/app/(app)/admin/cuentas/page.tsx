import type { Metadata } from "next";
import { listUsersForAdmin } from "@/lib/queries/admin";
import { requireAdmin } from "@/lib/session";
import { NewUserForm } from "../new-user-form";
import { UsersTable } from "../users-table";

export const metadata: Metadata = { title: "Cuentas · Administración" };

/** The accounts (D34): create one for a colleague, and look after the ones there are. */
export default async function AdminAccountsPage() {
  const me = await requireAdmin();
  const users = await listUsersForAdmin();

  return (
    <section className="space-y-4">
      <p className="text-muted-foreground max-w-prose text-sm">
        No hay registro abierto: las cuentas de tus colegas las creas tú. Cada uno ve solo sus
        cartas, colecciones y ubicaciones; el catálogo y las fotos son de todos. Cada cuenta puede
        identificar hasta 150 cartas al día con la IA, que se paga con tu clave.
      </p>
      <NewUserForm />
      <UsersTable users={users} meId={me.id} />
    </section>
  );
}
