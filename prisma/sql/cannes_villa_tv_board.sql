-- Table pour les annonces manuelles sur l'écran /r/cannes-villa-tv (hors agenda).
CREATE TABLE IF NOT EXISTS "cannes_villa_tv_board_items" (
  "id" TEXT NOT NULL,
  "dateYmd" TEXT NOT NULL,
  "timeLabel" TEXT NOT NULL DEFAULT '12:00',
  "endTimeLabel" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cannes_villa_tv_board_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cannes_villa_tv_board_items_dateYmd_sortOrder_idx"
  ON "cannes_villa_tv_board_items" ("dateYmd", "sortOrder");

-- Si la table existait déjà sans colonne fin de créneau :
ALTER TABLE "cannes_villa_tv_board_items" ADD COLUMN IF NOT EXISTS "endTimeLabel" TEXT;
