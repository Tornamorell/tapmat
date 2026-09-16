import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

export const game = pgEnum("game", ["mtg", "pokemon", "sports"]);
export const finish = pgEnum("finish", ["nonfoil", "foil", "etched"]);
// Cardmarket grading scale.
export const cardCondition = pgEnum("card_condition", ["MT", "NM", "EX", "GD", "LP", "PL", "PO"]);
export const itemSource = pgEnum("item_source", ["manual", "scan"]);
// Where a card goes in a deck (D35). The same as BOARDS in src/lib/decks/decklist.ts.
export const deckBoard = pgEnum("deck_board", ["commander", "main", "side", "maybe"]);

const money = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Catalog — synced from external sources (Scryfall for Magic, TCGdex for Pokémon).
// Never edited by hand. See docs/data-sources.md.
// ---------------------------------------------------------------------------

export const sets = pgTable(
  "sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game: game("game").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    setType: text("set_type"),
    parentSetCode: text("parent_set_code"),
    releasedAt: date("released_at"),
    iconUri: text("icon_uri"),
    cardCount: integer("card_count"),
    // What's printed on the cards, used by the scanner: the set code ("MKM", "PAL") and the
    // total after the slash in "001/193". Null when the cards don't print it.
    printCode: text("print_code"),
    printedTotal: integer("printed_total"),
  },
  (t) => [uniqueIndex("sets_game_code_uq").on(t.game, t.code)],
);

export const catalogCards = pgTable(
  "catalog_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game: game("game").notNull(),
    // Id in the source catalog (Scryfall card id, TCGdex card id).
    externalId: text("external_id").notNull(),
    // Groups every printing of the same card: Scryfall oracle_id, "pokemon:<name>" (D19).
    oracleId: text("oracle_id"),
    name: text("name").notNull(),
    // Lowercased, accent-free name used for trigram search. See normalizeForSearch().
    searchName: text("search_name").notNull(),
    setCode: text("set_code").notNull(),
    collectorNumber: text("collector_number").notNull(),
    rarity: text("rarity"),
    typeLine: text("type_line"),
    finishes: text("finishes").array().notNull().default(sql`'{}'::text[]`),
    imageSmall: text("image_small"),
    imageNormal: text("image_normal"),
    releasedAt: date("released_at"),
    cardmarketId: integer("cardmarket_id"),
    priceEur: money("price_eur"),
    priceEurFoil: money("price_eur_foil"),
    priceUsd: money("price_usd"),
    priceUsdFoil: money("price_usd_foil"),
    pricesUpdatedAt: timestamp("prices_updated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("catalog_cards_game_external_uq").on(t.game, t.externalId),
    index("catalog_cards_set_number_idx").on(t.game, t.setCode, t.collectorNumber),
    index("catalog_cards_oracle_idx").on(t.oracleId),
    index("catalog_cards_search_trgm_idx").using("gin", sql`${t.searchName} gin_trgm_ops`),
  ],
);

// The rules side of each Magic card, the same in all its printings (one row per Scryfall
// oracle_id): cost, colours, types, text, legality. What deck analysis reads (D35). Filled by
// the daily Scryfall sync.
export const oracleCards = pgTable(
  "oracle_cards",
  {
    oracleId: text("oracle_id").primaryKey(),
    name: text("name").notNull(),
    // Deck lists name cards by their full name or, for double-faced ones, their front face's.
    searchName: text("search_name").notNull(),
    frontSearchName: text("front_search_name").notNull(),
    // "normal", "modal_dfc", "transform", "split", "adventure"…
    layout: text("layout"),
    manaCost: text("mana_cost"),
    // Room for Gleemax ({1000000}) and half-mana Un-cards (0.5).
    cmc: numeric("cmc", { precision: 10, scale: 1, mode: "number" }).notNull().default(0),
    colors: text("colors").array().notNull().default(sql`'{}'::text[]`),
    colorIdentity: text("color_identity").array().notNull().default(sql`'{}'::text[]`),
    typeLine: text("type_line"),
    oracleText: text("oracle_text"),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    producedMana: text("produced_mana").array().notNull().default(sql`'{}'::text[]`),
    // The main formats only (FORMATS in scryfall/map.ts): "legal", "not_legal", "banned", "restricted".
    legalities: jsonb("legalities").$type<Record<string, string>>().notNull().default({}),
    // On Commander's Game Changers list, which sets a deck's bracket.
    gameChanger: boolean("game_changer").notNull().default(false),
  },
  (t) => [
    index("oracle_cards_search_idx").on(t.searchName),
    index("oracle_cards_front_search_idx").on(t.frontSearchName),
  ],
);

// Printed names in other languages (Spanish for now), pointing at the English printing
// that carries the price. Lets the user search "Rayo" and find Lightning Bolt.
export const cardNames = pgTable(
  "card_names",
  {
    catalogCardId: uuid("catalog_card_id")
      .notNull()
      .references(() => catalogCards.id, { onDelete: "cascade" }),
    lang: text("lang").notNull(),
    printedName: text("printed_name").notNull(),
    searchName: text("search_name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.catalogCardId, t.lang] }),
    index("card_names_search_trgm_idx").using("gin", sql`${t.searchName} gin_trgm_ops`),
  ],
);

// ---------------------------------------------------------------------------
// The user's collections.
// ---------------------------------------------------------------------------

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Free notes on the whole collection, longer than the description, edited on its page. */
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("collections_owner_idx").on(t.ownerId)],
);

// Where copies physically are ("Caja 1", "Carpeta roja"). Independent of collections: a
// collection can span several locations and a location can hold several collections (D20).
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Free notes on the location, longer than the description, edited on its page. */
    notes: text("notes"),
    // Dividers inside the box (D28): the capacity new ones get (null = no limit), and whether
    // entering a copy into a full divider moves on to the next one by itself.
    sectionCapacity: integer("section_capacity"),
    autoAdvance: boolean("auto_advance").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("locations_owner_name_uq").on(t.ownerId, sql`lower(${t.name})`)],
);

// A divider inside a location ("Caja 1 › 3"), e.g. every N cards in a box of thousands (D28).
export const locationSections = pgTable(
  "location_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    // Order inside the box; new dividers go last.
    position: integer("position").notNull(),
    name: text("name").notNull(),
    // Copies it holds; null = no limit.
    capacity: integer("capacity"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("location_sections_position_uq").on(t.locationId, t.position),
    check("location_sections_capacity_positive", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

// The inventory: stacks of identical physical copies the user owns. Adding a copy identical to
// an existing stack bumps its quantity instead of creating a new row. Copies don't belong to
// collections (those are lists, see collection_cards); they may have a location (D23).
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Null for items without a catalog entry (e.g. sports cards entered by hand).
    catalogCardId: uuid("catalog_card_id").references(() => catalogCards.id, {
      onDelete: "restrict",
    }),
    quantity: integer("quantity").notNull().default(1),
    finish: finish("finish").notNull().default("nonfoil"),
    condition: cardCondition("condition").notNull().default("NM"),
    language: text("language").notNull().default("en"),
    // A graded copy is one slab: its own row, quantity 1 (D27).
    gradingCompany: text("grading_company"),
    grade: numeric("grade", { precision: 3, scale: 1, mode: "number" }),
    certNumber: text("cert_number"),
    // The user's own value per copy (graded, signed…). When set, it counts instead of the
    // market price everywhere (itemValueEurSql).
    estimatedValueEur: money("estimated_value_eur"),
    purchasePriceEur: money("purchase_price_eur"),
    purchasedAt: date("purchased_at"),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    // A divider of that location, when it has them (D28).
    sectionId: uuid("section_id").references(() => locationSections.id, { onDelete: "set null" }),
    notes: text("notes"),
    // Free-form details for games without a catalog (player, team, parallel, /numbered…).
    attributes: jsonb("attributes").$type<Record<string, string>>(),
    source: itemSource("source").notNull().default("manual"),
    ...timestamps,
  },
  (t) => [
    index("items_catalog_card_idx").on(t.catalogCardId),
    index("items_location_idx").on(t.locationId),
    index("items_section_idx").on(t.sectionId),
    index("items_owner_idx").on(t.ownerId),
    check("items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

// The cards a collection is made of: a curated list ("Pokédex de Hoenn", a wishlist), owned
// or not. Ownership is computed against `items` (D23).
export const collectionCards = pgTable(
  "collection_cards",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    catalogCardId: uuid("catalog_card_id")
      .notNull()
      .references(() => catalogCards.id, { onDelete: "cascade" }),
    // Copies wanted (4 for a Magic playset, usually 1).
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.catalogCardId] }),
    index("collection_cards_card_idx").on(t.catalogCardId),
    check("collection_cards_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Price history. Only printings the user owns get daily snapshots.
// ---------------------------------------------------------------------------

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    catalogCardId: uuid("catalog_card_id")
      .notNull()
      .references(() => catalogCards.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    eur: money("eur"),
    eurFoil: money("eur_foil"),
    usd: money("usd"),
    usdFoil: money("usd_foil"),
  },
  (t) => [primaryKey({ columns: [t.catalogCardId, t.date] })],
);

// The whole inventory's value per day: what the dashboard's history chart will read.
export const inventoryValueSnapshots = pgTable(
  "inventory_value_snapshots",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    valueEur: numeric("value_eur", { precision: 12, scale: 2, mode: "number" }).notNull(),
    cardCount: integer("card_count").notNull(),
    unpricedCount: integer("unpriced_count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.date] })],
);

// ---------------------------------------------------------------------------
// Scanner review queue (/review): cards the scanner didn't recognise, saved with a photo to
// identify by hand later. A row is deleted once it's resolved or discarded (D25).
// ---------------------------------------------------------------------------

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const pendingScans = pgTable(
  "pending_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The card as the camera saw it: a small JPEG. */
    image: bytea("image").notNull(),
    /** What the OCR read (info strip and title), as a hint. */
    readText: text("read_text"),
    /** A name read from the title, to prefill the search. */
    guess: text("guess"),
    // The session's settings when it was saved; the copy is added with them.
    finish: finish("finish").notNull(),
    condition: cardCondition("condition").notNull(),
    language: text("language").notNull(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    sectionId: uuid("section_id").references(() => locationSections.id, { onDelete: "set null" }),
    collectionId: uuid("collection_id").references(() => collections.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("pending_scans_owner_idx").on(t.ownerId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Shared photos of cards the catalog has no image for (football, some Pokémon), taken by
// whoever scans or photographs them first (D30). Everyone sees them: they're catalog, not
// inventory. catalog_cards.image_* point at /api/card-photos/<id>.
// ---------------------------------------------------------------------------

export const catalogCardPhotos = pgTable("catalog_card_photos", {
  catalogCardId: uuid("catalog_card_id")
    .primaryKey()
    .references(() => catalogCards.id, { onDelete: "cascade" }),
  /** A card-shaped JPEG, 300×419 px. */
  image: bytea("image").notNull(),
  contributedBy: text("contributed_by").references(() => user.id, { onDelete: "set null" }),
  /** "scan" (taken by the scanner) or "upload" (from the card page). */
  source: text("source").notNull(),
  /** Perceptual hash of the photo (src/lib/scan/card-hash.ts): the scanner recognises the card by it (D33). */
  hash: text("hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  /**
   * When an admin checked it was right («Correcta» in /admin), and who. A new photo of the card
   * clears both: it's a different image, waiting to be reviewed again.
   */
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
});

// ---------------------------------------------------------------------------
// Each «Identificar con IA» from the scanner (D31): for the daily limit, and to see what the AI
// reads and what it costs. The photo isn't kept.
// ---------------------------------------------------------------------------

export const aiIdentifications = pgTable(
  "ai_identifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    /** What the model read (CardReading), or null if it gave no answer. */
    reading: jsonb("reading"),
    /** How many catalog cards the reading matched. */
    matches: integer("matches").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ai_identifications_owner_idx").on(t.ownerId, t.createdAt)],
);

// The assistant's conversations (D37), each user's own, kept to reopen on any device.
export const aiChatThreads = pgTable(
  "ai_chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Its first question, shortened. */
    title: text("title").notNull(),
    ...timestamps,
  },
  (t) => [index("ai_chat_threads_owner_idx").on(t.ownerId, t.updatedAt)],
);

/** The text of each question and answer; what the tools looked up isn't kept. */
export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    // In the order they were written: a question and its answer can share a timestamp.
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => aiChatThreads.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ai_chat_messages_thread_idx").on(t.threadId, t.createdAt)],
);

// The assistant's answers (D37): what each cost, for the monthly allowance and /admin.
export const aiChatTurns = pgTable(
  "ai_chat_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The conversation it answered in; null once that's deleted (the cost still counts). */
    threadId: uuid("thread_id").references(() => aiChatThreads.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    /** How many times it looked something up in the user's data. */
    toolCalls: integer("tool_calls").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ai_chat_turns_owner_idx").on(t.ownerId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Magic decks (D35): the cards by board, by card (oracle) rather than printing, and a box —
// a location — holding the copies that are in the deck.
// ---------------------------------------------------------------------------

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // "commander" for now: what the analysis checks.
    format: text("format").notNull().default("commander"),
    description: text("description"),
    // Its box: copies moved there are in the deck. Deleting the deck deletes it; the copies
    // stay in the inventory, with no location.
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("decks_owner_idx").on(t.ownerId), uniqueIndex("decks_location_uq").on(t.locationId)],
);

export const deckCards = pgTable(
  "deck_cards",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    board: deckBoard("board").notNull().default("main"),
    oracleId: text("oracle_id")
      .notNull()
      .references(() => oracleCards.oracleId, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    // The printing the owner prefers, for its picture and price; null: the cheapest.
    catalogCardId: uuid("catalog_card_id").references(() => catalogCards.id, { onDelete: "set null" }),
    // What the card does here (ROLES in src/lib/decks/roles.ts), set by the owner; null: guessed
    // from its text.
    roles: text("roles").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.board, t.oracleId] }),
    index("deck_cards_oracle_idx").on(t.oracleId),
    check("deck_cards_quantity_positive", sql`${t.quantity} > 0`),
  ],
);
