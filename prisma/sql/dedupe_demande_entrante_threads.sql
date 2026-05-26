-- Garde la demande la plus ancienne par fil Gmail (+ talent), supprime les doublons.
-- À exécuter une fois après un rattrapage qui a créé plusieurs lignes par thread.
DELETE FROM "DemandeEntrante" d
WHERE d."gmailThreadId" IS NOT NULL
  AND d."id" NOT IN (
    SELECT k.id
    FROM (
      SELECT DISTINCT ON ("gmailThreadId", COALESCE("talentEmail", ''))
        "id"
      FROM "DemandeEntrante"
      WHERE "gmailThreadId" IS NOT NULL
      ORDER BY "gmailThreadId", COALESCE("talentEmail", ''), "date" ASC
    ) k
  );
