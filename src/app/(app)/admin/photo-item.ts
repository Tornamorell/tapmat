import { cardPhotoUrl } from "@/lib/card-photo";
import type { AdminPhotoRow } from "@/lib/queries/admin";
import type { PhotoItem } from "./photo-review";

/** A photo row as the review grid wants it. */
export function toPhotoItem(p: AdminPhotoRow): PhotoItem {
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
