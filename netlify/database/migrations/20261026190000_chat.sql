-- Chat privado entre anunciante e interessado (tabelas conversations e messages).
-- Usa IF NOT EXISTS para não falhar caso alguma parte já tenha sido criada antes.
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "offer_id" integer,
  "owner_id" text NOT NULL,
  "owner_name" text NOT NULL,
  "interested_id" text NOT NULL,
  "interested_name" text NOT NULL,
  "card_name" text NOT NULL,
  "card_image" text NOT NULL,
  "last_preview" text DEFAULT '' NOT NULL,
  "last_sender_id" text,
  "last_message_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "conversations_offer_id_trade_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "trade_offers"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "sender_id" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "image_key" text,
  "image_type" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "read_at" timestamp,
  CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_offer_interested_uq" ON "conversations" ("offer_id", "interested_id");
CREATE INDEX IF NOT EXISTS "conversations_owner_idx" ON "conversations" ("owner_id");
CREATE INDEX IF NOT EXISTS "conversations_interested_idx" ON "conversations" ("interested_id");
CREATE INDEX IF NOT EXISTS "messages_conv_idx" ON "messages" ("conversation_id", "id");
