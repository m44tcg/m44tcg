-- Vitrine da página inicial: anúncios de troca destacados pelo administrador.
-- featured_at preenchido = carta aparece na vitrine (ordem pela data do destaque).
ALTER TABLE "trade_offers" ADD COLUMN IF NOT EXISTS "featured_at" timestamp;
CREATE INDEX IF NOT EXISTS "trade_offers_featured_idx" ON "trade_offers" ("featured_at");
