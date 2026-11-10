-- Accélère la file /enrichissement (filtre QUEUED sur marque_contacts).
CREATE INDEX IF NOT EXISTS "marque_contacts_emailLookupStatus_idx"
  ON "marque_contacts"("emailLookupStatus");

CREATE INDEX IF NOT EXISTS "marque_contacts_marqueId_emailLookupStatus_idx"
  ON "marque_contacts"("marqueId", "emailLookupStatus");
