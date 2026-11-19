-- Cache brand-research (TTL 7j côté app) — anti double facturation Grok.
CREATE TABLE IF NOT EXISTS "brand_research_cache" (
    "id" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "focus" TEXT NOT NULL DEFAULT 'FR',
    "contextHash" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'xai',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_research_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "brand_research_cache_brandKey_focus_contextHash_key"
  ON "brand_research_cache"("brandKey", "focus", "contextHash");

CREATE INDEX IF NOT EXISTS "brand_research_cache_fetchedAt_idx"
  ON "brand_research_cache"("fetchedAt");

CREATE INDEX IF NOT EXISTS "brand_research_cache_brandKey_idx"
  ON "brand_research_cache"("brandKey");
