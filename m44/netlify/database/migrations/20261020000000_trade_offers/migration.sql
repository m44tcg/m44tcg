CREATE TABLE "trade_offers" (
	"id" serial PRIMARY KEY,
	"owner_id" text NOT NULL,
	"owner_email" text NOT NULL,
	"owner_name" text NOT NULL,
	"give_id" text NOT NULL,
	"give_card" jsonb NOT NULL,
	"want_id" text,
	"want_card" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "trade_offers_owner_idx" ON "trade_offers" ("owner_id");