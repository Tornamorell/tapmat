import { cache } from "react";
import { pool } from "@/db/client";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  createdAt: string;
  lastSeen: string | null;
  copies: number;
  /** AI identifications in the last 24 hours, the window of the daily limit (D31). */
  aiToday: number;
  aiCost30d: number;
  /** What the assistant's answers cost (D37). */
  chatCost30d: number;
};

/** Every account, with its copies and what its AI identifications cost (D34). */
export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const { rows } = await pool.query<AdminUserRow>(`
    select u.id, u.name, u.email, u.role, u.banned, u.created_at::text as "createdAt",
           (select max(s.updated_at)::text from session s where s.user_id = u.id) as "lastSeen",
           (select coalesce(sum(i.quantity), 0)::int from items i where i.owner_id = u.id) as copies,
           (select count(*)::int from ai_identifications a
            where a.owner_id = u.id and a.created_at > now() - interval '1 day') as "aiToday",
           (select coalesce(sum(a.cost_usd), 0)::float8 from ai_identifications a
            where a.owner_id = u.id and a.created_at > now() - interval '30 days') as "aiCost30d",
           (select coalesce(sum(t.cost_usd), 0)::float8 from ai_chat_turns t
            where t.owner_id = u.id and t.created_at > now() - interval '30 days') as "chatCost30d"
    from "user" u
    order by u.created_at`);
  return rows;
}

export type AdminPhotoRow = {
  catalogCardId: string;
  name: string;
  setCode: string;
  number: string;
  /** "scan" or "upload". */
  source: string;
  /** Null if the account that shared it was deleted. */
  contributor: string | null;
  updatedAt: Date;
  reviewedAt: Date | null;
  reviewer: string | null;
};

export type AdminMissingPhotoRow = {
  catalogCardId: string;
  name: string;
  setCode: string;
  number: string;
  game: string;
  /** Collections that list it. */
  collections: number;
  /** Copies of it sitting in a location. */
  copies: number;
};

/**
 * Cards with no image at all that someone keeps in a location or lists in a collection (D30):
 * the ones worth photographing next. `image_small` is null both when the source never had an
 * image and when nobody has shared a photo, because sharing one writes the photo's URL there
 * and deleting it sets it back to null (`saveCardPhoto`/`deleteCardPhoto`).
 */
export async function listCardsWithoutPhoto(limit = 200): Promise<AdminMissingPhotoRow[]> {
  const { rows } = await pool.query<AdminMissingPhotoRow>(
    `select c.id as "catalogCardId", c.name, c.set_code as "setCode",
            c.collector_number as number, c.game,
            (select count(*)::int from collection_cards cc where cc.catalog_card_id = c.id) as collections,
            (select coalesce(sum(i.quantity), 0)::int from items i
              where i.catalog_card_id = c.id and i.location_id is not null) as copies
     from catalog_cards c
     where c.image_small is null
       and (exists (select 1 from collection_cards cc where cc.catalog_card_id = c.id)
            or exists (select 1 from items i
                        where i.catalog_card_id = c.id and i.location_id is not null))
     order by c.name
     limit $1`,
    [limit],
  );
  return rows;
}

/**
 * How many photos are in each view of /admin/fotos, without fetching any of them: the labels and
 * the panel carry the numbers, and every view loads only its own rows. Cached per request, since
 * the admin layout and the page under it both ask.
 */
export const adminPhotoCounts = cache(async (): Promise<{
  pending: number;
  reviewed: number;
  missing: number;
}> => {
  const { rows } = await pool.query<{ pending: number; reviewed: number; missing: number }>(
    `select
       (select count(*)::int from catalog_card_photos where reviewed_at is null) as pending,
       (select count(*)::int from catalog_card_photos where reviewed_at is not null) as reviewed,
       (select count(*)::int from catalog_cards c
         where c.image_small is null
           and (exists (select 1 from collection_cards cc where cc.catalog_card_id = c.id)
                or exists (select 1 from items i
                            where i.catalog_card_id = c.id and i.location_id is not null))
       ) as missing`,
  );
  return rows[0] ?? { pending: 0, reviewed: 0, missing: 0 };
});

/**
 * The shared photos (D30) for /admin, newest first: the ones waiting for review, or the ones
 * already checked. Split in two because they answer different questions — one is a queue, the
 * other a record — and the record is the one that grows without end.
 */
export async function listPhotosForReview(reviewed: boolean, limit = 60): Promise<AdminPhotoRow[]> {
  const { rows } = await pool.query<AdminPhotoRow>(
    `select p.catalog_card_id as "catalogCardId", c.name, c.set_code as "setCode",
            c.collector_number as number, p.source, u.name as contributor,
            p.updated_at as "updatedAt", p.reviewed_at as "reviewedAt", r.name as reviewer
     from catalog_card_photos p
     join catalog_cards c on c.id = p.catalog_card_id
     left join "user" u on u.id = p.contributed_by
     left join "user" r on r.id = p.reviewed_by
     where (p.reviewed_at is not null) = $2
     order by p.updated_at desc
     limit $1`,
    [limit, reviewed],
  );
  return rows;
}
