import type { Metadata } from "next";
import Link from "next/link";
import { CardPhotoButton } from "@/components/card-photo-button";
import { CardThumb } from "@/components/card-thumb";
import { adminPhotoCounts, listCardsWithoutPhoto, listPhotosForReview } from "@/lib/queries/admin";
import { requireAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { toPhotoItem } from "../photo-item";
import { PhotoReview } from "../photo-review";

export const metadata: Metadata = { title: "Fotos · Administración" };

const VIEWS = ["revisar", "revisadas", "sin-foto"] as const;
type View = (typeof VIEWS)[number];

/**
 * The shared photos (D30), three ways: the queue waiting for review, the record of what's been
 * checked, and the cards still missing one. Each view loads only its own rows; the counts come
 * from a separate, cheap query so the labels stay honest.
 */
export default async function AdminPhotosPage({ searchParams }: PageProps<"/admin/fotos">) {
  await requireAdmin();
  const sp = await searchParams;
  const asked = typeof sp.ver === "string" ? sp.ver : undefined;
  const view: View = (VIEWS as readonly string[]).includes(asked ?? "") ? (asked as View) : "revisar";

  const [counts, photos, missing] = await Promise.all([
    adminPhotoCounts(),
    view === "sin-foto" ? [] : listPhotosForReview(view === "revisadas"),
    view === "sin-foto" ? listCardsWithoutPhoto() : [],
  ]);

  return (
    <div className="space-y-4">
      <PhotoViews view={view} counts={counts} />

      {view === "revisar" && (
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

      {view === "revisadas" && (
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

      {view === "sin-foto" && (
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
    </div>
  );
}

function PhotoViews({
  view,
  counts,
}: {
  view: View;
  counts: { pending: number; reviewed: number; missing: number };
}) {
  const items: Array<{ key: View; label: string; count: number }> = [
    { key: "revisar", label: "Por revisar", count: counts.pending },
    { key: "revisadas", label: "Revisadas", count: counts.reviewed },
    { key: "sin-foto", label: "Sin foto", count: counts.missing },
  ];
  return (
    <nav aria-label="Fotos" className="bg-muted inline-flex flex-wrap rounded-lg p-0.5 text-sm">
      {items.map((t) => (
        <Link
          key={t.key}
          // «Por revisar» is the default, so it's the bare URL: no ?ver= left behind.
          href={t.key === "revisar" ? "/admin/fotos" : `/admin/fotos?ver=${t.key}`}
          aria-current={view === t.key ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors",
            view === t.key
              ? "bg-background font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          <span
            className={cn(
              "text-xs tabular-nums",
              t.key === "revisar" && t.count > 0 ? "text-primary font-semibold" : "opacity-60",
            )}
          >
            {t.count}
          </span>
        </Link>
      ))}
    </nav>
  );
}
