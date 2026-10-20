import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// Anúncios de troca públicos: qualquer visitante vê, apenas o dono remove.
export const tradeOffers = pgTable("trade_offers", {
  id: serial().primaryKey(),
  ownerId: text("owner_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerName: text("owner_name").notNull(),
  giveId: text("give_id").notNull(),
  giveCard: jsonb("give_card").notNull(),
  wantId: text("want_id"),
  wantCard: jsonb("want_card"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("trade_offers_owner_idx").on(t.ownerId)]);
