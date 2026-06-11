-- Détail des clics Outreach : 1 ligne par clic (touch + url + date) pour
-- savoir qui a cliqué sur quel profil. Les compteurs agrégés restent sur
-- outreach_touches (clickCount, lastClickUrl…).

CREATE TABLE IF NOT EXISTS "outreach_clicks" (
  "id" TEXT NOT NULL,
  "touchId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "outreach_clicks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "outreach_clicks_touchId_clickedAt_idx"
  ON "outreach_clicks" ("touchId", "clickedAt");

ALTER TABLE "outreach_clicks"
  ADD CONSTRAINT "outreach_clicks_touchId_fkey"
  FOREIGN KEY ("touchId") REFERENCES "outreach_touches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
