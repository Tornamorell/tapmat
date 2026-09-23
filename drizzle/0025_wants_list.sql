CREATE TYPE "public"."list_kind" AS ENUM('collection', 'wants');--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "kind" "list_kind" DEFAULT 'collection' NOT NULL;