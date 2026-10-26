import { pgTable, serial, text, timestamp, jsonb, index, integer, uniqueIndex } from "drizzle-orm/pg-core";

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

// Chat privado: uma conversa por (anúncio, interessado) entre o anunciante e o interessado.
// Guarda um "retrato" da carta e dos nomes para a conversa continuar legível se o anúncio for removido.
export const conversations = pgTable("conversations", {
  id: serial().primaryKey(),
  offerId: integer("offer_id").references(() => tradeOffers.id, { onDelete: "set null" }),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name").notNull(),
  interestedId: text("interested_id").notNull(),
  interestedName: text("interested_name").notNull(),
  cardName: text("card_name").notNull(),
  cardImage: text("card_image").notNull(),
  lastPreview: text("last_preview").notNull().default(""),
  lastSenderId: text("last_sender_id"),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [
  uniqueIndex("conversations_offer_interested_uq").on(t.offerId, t.interestedId),
  index("conversations_owner_idx").on(t.ownerId),
  index("conversations_interested_idx").on(t.interestedId),
]);

export const messages = pgTable("messages", {
  id: serial().primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull(),
  body: text("body").notNull().default(""),
  imageKey: text("image_key"),   // chave no Netlify Blobs (nunca exposta ao navegador)
  imageType: text("image_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
}, t => [index("messages_conv_idx").on(t.conversationId, t.id)]);
