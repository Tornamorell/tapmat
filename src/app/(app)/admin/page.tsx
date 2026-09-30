import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatInt } from "@/lib/format";
import { adminPhotoCounts, listPhotosForReview, listUsersForAdmin } from "@/lib/queries/admin";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { toPhotoItem } from "./photo-item";
import { PhotoReview } from "./photo-review";

/** How many pending photos the panel shows before sending you to the queue: one row on desktop. */
const PREVIEW = 6;

const usd = (n: number) => `${n.toFixed(2)} $`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES") : "—");

/**
 * The control panel: what's waiting for you and how the app is being used, at a glance. The
 * work itself lives in «Fotos» and «Cuentas»; the few photos pending review can be dealt with
 * from here, since that's the one thing that usually needs doing.
 */
export default async function AdminPanelPage() {
  const me = await requireAdmin();
  const [counts, users, pending] = await Promise.all([
    adminPhotoCounts(),
    listUsersForAdmin(),
    listPhotosForReview(false, PREVIEW),
  ]);

  const deactivated = users.filter((u) => u.banned).length;
  const scanCost = users.reduce((sum, u) => sum + u.aiCost30d, 0);
  const chatCost = users.reduce((sum, u) => sum + u.chatCost30d, 0);

  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Fotos por revisar"
          value={formatInt(counts.pending)}
          hint={`${formatInt(counts.reviewed)} revisadas`}
          href="/admin/fotos"
          highlight={counts.pending > 0}
        />
        <StatTile
          label="Cartas sin foto"
          value={formatInt(counts.missing)}
          hint="En ubicaciones o colecciones"
          href="/admin/fotos?ver=sin-foto"
        />
        <StatTile
          label="Cuentas"
          value={formatInt(users.length)}
          hint={
            deactivated
              ? `${deactivated} ${deactivated === 1 ? "desactivada" : "desactivadas"}`
              : "Todas activas"
          }
          href="/admin/cuentas"
        />
        <StatTile
          label="IA, 30 días"
          value={usd(scanCost + chatCost)}
          hint={`Escáner ${usd(scanCost)} · Asistente ${usd(chatCost)}`}
          href="/admin/cuentas"
        />
      </dl>

      <section className="space-y-3">
        <SectionHeading
          title="Por revisar"
          href="/admin/fotos"
          link={counts.pending > pending.length ? `Ver las ${counts.pending}` : "Todas las fotos"}
        />
        {pending.length ? (
          <PhotoReview photos={pending.map(toPhotoItem)} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Nada por revisar: todas las fotos compartidas están comprobadas.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading title="Cuentas" href="/admin/cuentas" link="Gestionar cuentas" />
        <ul className="bg-card divide-y rounded-xl border">
          {users.map((u) => {
            const role = (ROLES as readonly string[]).includes(u.role ?? "") ? (u.role as Role) : "user";
            return (
              <li
                key={u.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm",
                  u.banned && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">
                      {u.name}
                      {u.id === me.id && <span className="text-muted-foreground font-normal"> (tú)</span>}
                    </span>
                    {role === "admin" && <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>}
                    {u.banned && <Badge variant="destructive">Desactivada</Badge>}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                </div>
                <Figure label="Cartas" value={formatInt(u.copies)} />
                <Figure label="IA hoy" value={formatInt(u.aiToday)} />
                <Figure label="IA, 30 días" value={usd(u.aiCost30d + u.chatCost30d)} />
                <Figure label="Última vez" value={date(u.lastSeen)} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  href,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  /** Something here is waiting for the admin. */
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "bg-card hover:border-primary/60 block rounded-xl border p-3 transition-colors sm:p-4",
        highlight && "border-primary/50",
      )}
    >
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className={cn("text-2xl font-bold tabular-nums", highlight && "text-primary")}>{value}</dd>
      <dd className="text-muted-foreground text-xs">{hint}</dd>
    </Link>
  );
}

function SectionHeading({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <Link
        href={href}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
      >
        {link}
        <ArrowRightIcon className="size-3.5" />
      </Link>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-20 sm:text-right">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="tabular-nums">{value}</p>
    </div>
  );
}
