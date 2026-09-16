import type { Metadata } from "next";
import Link from "next/link";
import { CardPhotoButton } from "@/components/card-photo-button";
import { CardThumb } from "@/components/card-thumb";
import { cardPhotoUrl } from "@/lib/card-photo";
import { listCardsWithoutPhoto, listPhotosForReview, listUsersForAdmin } from "@/lib/queries/admin";
import { requireAdmin } from "@/lib/session";
import { NewUserForm } from "./new-user-form";
import { PhotoReview } from "./photo-review";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Administración" };

export default async function AdminPage() {
  const me = await requireAdmin();
  const [users, photos, missing] = await Promise.all([
    listUsersForAdmin(),
    listPhotosForReview(),
    listCardsWithoutPhoto(),
  ]);
  const toReview = photos.filter((p) => !p.reviewedAt).length;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Quién puede entrar en Tapmat. No hay registro abierto: las cuentas de tus colegas las
          creas aquí. Cada uno ve solo sus cartas, colecciones y ubicaciones; el catálogo y las fotos
          compartidas son de todos. Cada cuenta puede identificar hasta 150 cartas al día con la IA,
          que se paga con tu clave.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Cuentas</h2>
        <NewUserForm />
        <UsersTable users={users} meId={me.id} />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            Fotos compartidas
            {toReview > 0 && <span className="text-primary font-normal"> · {toReview} por revisar</span>}
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm">
            Las que sube la gente para las cartas sin imagen, al escanear o desde la ficha: las ven
            todos. Marca como correctas las que estén bien. Si una no es la carta o se ve mal,
            elimínala y la carta vuelve a quedarse sin imagen. Si alguien la cambia, vuelve a estar
            por revisar.
          </p>
        </div>
        <PhotoReview
          photos={photos.map((p) => ({
            catalogCardId: p.catalogCardId,
            name: p.name,
            setLabel: `${p.setCode.toUpperCase()} #${p.number}`,
            src: cardPhotoUrl(p.catalogCardId, p.updatedAt),
            contributor: p.contributor,
            source: p.source,
            dateLabel: p.updatedAt.toLocaleDateString("es-ES"),
            reviewed: !!p.reviewedAt,
            reviewer: p.reviewer,
          }))}
        />

        <div className="space-y-2 border-t pt-4">
          <h3 className="font-medium">
            Sin foto <span className="text-muted-foreground font-normal tabular-nums">({missing.length})</span>
          </h3>
          <p className="text-muted-foreground max-w-prose text-sm">
            Cartas que alguien guarda en una ubicación o ha puesto en una colección y no tienen
            imagen, ni la de su fuente ni una compartida. Hazles la foto aquí mismo, sin entrar en
            cada una: se recorta con la forma de la carta y la ven todos. En el móvil, «Añadir
            foto» abre la cámara.
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
        </div>
      </section>
    </div>
  );
}
