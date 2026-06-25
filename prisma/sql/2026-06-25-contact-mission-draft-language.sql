-- Neon : langue de rédaction du brouillon sur contact_missions.
-- Permet la traduction auto FR<->EN à l'envoi (même système que /outreach) :
-- si la langue du brouillon diffère de la langue du client (clientLanguage),
-- le mail est traduit automatiquement avant envoi.
ALTER TABLE "contact_missions"
  ADD COLUMN IF NOT EXISTS "draftLanguage" TEXT;
