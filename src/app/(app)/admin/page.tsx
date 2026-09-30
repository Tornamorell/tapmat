import type { Metadata } from "next";
import Link from "next/link";
import { CardPhotoButton } from "@/components/card-photo-button";
import { CardThumb } from "@/components/card-thumb";
import { cardPhotoUrl } from "@/lib/card-photo";
import {
  adminPhotoCounts,
  listCardsWithoutPhoto,
  listPhotosForReview,
  listUsersForAdmin,
} from "@/lib/queries/admin";
import { requireAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { NewUserForm } from "./new-user-form";
import { PhotoReview } from "./photo-review";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Administración" };

const TABS = ["revisar", "revisadas", "sin-foto", "cuentas"] as const;
type Tab = (typeof TABS)[number];

/**
 * The admin panel, one tab at a time. Reviewing photos and managing accounts were stacked on one
 * page, so the queue that needs attention sat under everything else — and the page fetched all
 * of it every time: 121 photos to surface the 5 that were pending. Each tab now loads only its
 * own rows, and the counts come from a separate, cheap query so the labels stay honest.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const asked = typeof sp.tab === "string" ? sp.tab : undefined;
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : "revisar";

  const counts = await adminPhotoCounts();
  const [users, photos, missing] = await Promise.all([
    tab === "cuentas" ? listUsersForAdmin() : [],
    tab === "revisar" || tab === "revisadas" ? listPhotosForReview(tab === "revisadas") : [],
    tab === "sin-foto" ? listCardsWithoutPhoto() : [],
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Las cuentas de Tapmat y las fotos que comparte la gente. No hay registro abierto: las
          cuentas de tus colegas las creas tú. Cada uno ve solo sus cartas, colecciones y
          ubicaciones; el catálogo y las fotos son de todos.
        </p>
      </div>

      <AdminTabs tab={tab} counts={counts} />

      {tab === "revisar" && (
        <section className="space-y-3">
          <p className="text-muted-foreground max-w-prose text-sm">
            Las que ha compartido alguien y nadie ha comprobado todavía, al escanear o desde la
            ficha: las ven todos. Marca como correctas las que estén bien. Si una no es la carta o
            se ve mal, elimínala y la carta vuelve a quedarse sin imagen.
          </p>
          {photos.length ? (
            <PhotoReview photos={photos.map(toPhotoItem)} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Nada por revisar: todas las fotos compartidas están comprobadas.
            </p>
          )}
        </section>
      )}

      {tab === "revisadas" && (
        <section className="space-y-3">
          <p className="text-muted-foreground max-w-prose text-sm">
            Las que ya has dado por buenas, de la más reciente a la más antigua. Están aquí por si
            quieres revisar una decisión: si alguien cambia una foto, vuelve sola a «Por revisar».
            {counts.reviewed > photos.length && (
              <>
                {" "}
                Se muestran las {photos.length} últimas de {counts.reviewed}.
              </>
            )}
          </p>
          {photos.length ? (
            <PhotoReview photos={photos.map(toPhotoItem)} />
          ) : (
            <p className="text-muted-foreground text-sm">Todavía no has dado ninguna por buena.</p>
          )}
        </section>
      )}

      {tab === "sin-foto" && (
        <section className="space-y-3">
          <p className="text-muted-foreground max-w-prose text-sm">
            Cartas que alguien guarda en una ubicación o ha puesto en una colección y no tienen
            imagen, ni la de su fuente ni una compartida. Hazles la foto aquí mismo, sin entrar en
            cada una: se recorta con la forma de la carta y la ven todos. En el móvil, «Añadir foto»
            abre la cámara.
          </p>
          {missing.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {missing.map((m) => (
                <li key={m.catalogCardId} className="space-y-1.5">
                  <Link href={`/cards/${m.catalogCardId}`} className="block">
                    <CardThumb src={null} alt={m.name} size="md" className="w-full!" />
                  </Link>
                  <div className="space-y-0.5 text-xs leading-tight">
                    <p className="truncate font-medium" title={m.name}>
                      {m.name}
                    </p>
                    <p className="text-muted-foreground truncate">
                      {m.setCode.toUpperCase()} #{m.number}
                    </p>
                    <p className="text-muted-foreground truncate">
                      {[
                        m.copies > 0 && `${m.copies} ${m.copies === 1 ? "copia" : "copias"}`,
                        m.collections > 0 &&
                          `${m.collections} ${m.collections === 1 ? "colección" : "colecciones"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {/* The same button as the card's page: the photo goes in without leaving here. */}
                  <CardPhotoButton catalogCardId={m.catalogCardId} hasPhoto={false} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              Todas las cartas que hay en ubicaciones y colecciones tienen imagen.
            </p>
          )}
        </section>
      )}

      {tab === "cuentas" && (
        <section className="space-y-4">
          <p className="text-muted-foreground max-w-prose text-sm">
            Cada cuenta puede identificar hasta 150 cartas al día con la IA, que se paga con tu
            clave.
          </p>
          <NewUserForm />
          <UsersTable users={users} meId={me.id} />
        </section>
      )}
    </div>
  );
}

/** A photo row as the review grid wants it. */
function toPhotoItem(p: Awaited<ReturnType<typeof listPhotosForReview>>[number]) {
  return {
    catalogCardId: p.catalogCardId,
    name: p.name,
    setLabel: `${p.setCode.toUpperCase()} #${p.number}`,
    src: cardPhotoUrl(p.catalogCardId, p.updatedAt),
    contributor: p.contributor,
    source: p.source,
    dateLabel: p.updatedAt.toLocaleDateString("es-ES"),
    reviewed: !!p.reviewedAt,
    reviewer: p.reviewer,
  };
}

function AdminTabs({
  tab,
  counts,
}: {
  tab: Tab;
  counts: { pending: number; reviewed: number; missing: number };
}) {
  const items: Array<{ key: Tab; label: string; count: number | null }> = [
    { key: "revisar", label: "Por revisar", count: counts.pending },
    { key: "revisadas", label: "Revisadas", count: counts.reviewed },
    { key: "sin-foto", label: "Sin foto", count: counts.missing },
    { key: "cuentas", label: "Cuentas", count: null },
  ];
  return (
    <nav aria-label="Secciones" className="bg-muted inline-flex flex-wrap rounded-lg p-0.5 text-sm">
      {items.map((t) => (
        <Link
          key={t.key}
          // «Por revisar» is the default, so it's the bare URL: no ?tab= left behind.
          href={t.key === "revisar" ? "/admin" : `/admin?tab=${t.key}`}
          aria-current={tab === t.key ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors",
            tab === t.key
              ? "bg-background font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== null && (
            <span
              className={cn(
                "text-xs tabular-nums",
                t.key === "revisar" && t.count > 0 ? "text-primary font-semibold" : "opacity-60",
              )}
            >
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
