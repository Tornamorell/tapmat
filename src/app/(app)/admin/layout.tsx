import type { Metadata } from "next";
import { adminPhotoCounts } from "@/lib/queries/admin";
import { requireAdmin } from "@/lib/session";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Administración" };

/**
 * The frame of the admin pages: the panel, and an area for each thing an admin looks after —
 * the shared photos and the accounts. Every page still calls `requireAdmin()` itself; it's here
 * too so the pending count isn't worked out for someone who's about to get a 404.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const counts = await adminPhotoCounts();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <AdminNav pending={counts.pending} />
      </div>
      {children}
    </div>
  );
}
