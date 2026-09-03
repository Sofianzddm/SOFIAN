export type MarqueClientSource = {
  nom?: string | null;
  raisonSociale?: string | null;
  adresseRue?: string | null;
  adresseComplement?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  pays?: string | null;
  siret?: string | null;
  numeroTVA?: string | null;
};

export type DocumentClientFields = {
  clientNom?: string | null;
  clientAdresse?: string | null;
  clientCodePostal?: string | null;
  clientVille?: string | null;
  clientPays?: string | null;
  clientSiret?: string | null;
  clientTva?: string | null;
  clientAttention?: string | null;
};

export type ResolvedPdfClient = {
  nom: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
  tva?: string;
  siret?: string;
  attention?: string;
};

function nonEmpty(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function formatMarqueAdresse(marque?: MarqueClientSource | null): string | undefined {
  if (!marque) return undefined;
  return nonEmpty(
    [marque.adresseRue, marque.adresseComplement].filter(Boolean).join("\n")
  );
}

/** Snapshot à persister sur un document (facture générée avec billing dédié). */
export function snapshotClientFromMarque(
  marque?: MarqueClientSource | null
): Required<Omit<DocumentClientFields, "clientAttention">> {
  return {
    clientNom: nonEmpty(marque?.raisonSociale) || nonEmpty(marque?.nom) || null,
    clientAdresse: formatMarqueAdresse(marque) || null,
    clientCodePostal: nonEmpty(marque?.codePostal) || null,
    clientVille: nonEmpty(marque?.ville) || null,
    clientPays: nonEmpty(marque?.pays) || null,
    clientSiret: nonEmpty(marque?.siret) || null,
    clientTva: nonEmpty(marque?.numeroTVA) || null,
  };
}

/**
 * Bloc client PDF : override document-level s'il existe, sinon fiche marque.
 * Une fois les coordonnées enregistrées sur le devis, elles ne suivent plus
 * les modifications de la marque (autres collabs intactes).
 */
export function resolveDocumentClient(
  document: DocumentClientFields,
  marque?: MarqueClientSource | null
): ResolvedPdfClient {
  const snap = snapshotClientFromMarque(marque);
  return {
    nom:
      nonEmpty(document.clientNom) ||
      nonEmpty(snap.clientNom) ||
      "",
    adresse: nonEmpty(document.clientAdresse) || nonEmpty(snap.clientAdresse),
    codePostal: nonEmpty(document.clientCodePostal) || nonEmpty(snap.clientCodePostal),
    ville: nonEmpty(document.clientVille) || nonEmpty(snap.clientVille),
    pays: nonEmpty(document.clientPays) || nonEmpty(snap.clientPays),
    tva: nonEmpty(document.clientTva) || nonEmpty(snap.clientTva),
    siret: nonEmpty(document.clientSiret) || nonEmpty(snap.clientSiret),
    attention: nonEmpty(document.clientAttention),
  };
}
