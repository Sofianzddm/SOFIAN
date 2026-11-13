/**
 * Filtre anti-hallucinations carto influence.
 * Rejette retail, agences passées pour des personnes, etc.
 */

import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";

const RETAIL_TITLE =
  /\b(responsable de boutique|store manager|vendeur|vendeuse|retail|magasin|shop manager|conseiller(e)? de vente)\b/i;

const AGENCY_WORD =
  /\b(agence|agency|influences?|ykone|matriochka|woo|woô|bureau|collective|studio|média|media)\b/i;

const FAKE_PERSON_NAME =
  /\b(agence|agency|nexus|circle|media|studio|collective|group|groupe|consulting|influences?)\b/i;

const NON_PERSON_POSTE =
  /\b(agence de marketing|agence d['']influence|agence spécialisée|agence influence|activation influence)\b/i;

const GOOD_INFLUENCE_TITLE =
  /\b(influence|influencer|advocacy|creator|partnership|partenariat|community|social media|brand content|account manager|communication|digital|press|presse|earned media|pr\b|relations? artistes?|artist relations)\b/i;

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isJunkCartoContact(c: CartoAiContactCandidate): boolean {
  const prenom = (c.prenom || "").trim();
  const nom = (c.nom || "").trim();
  const poste = (c.poste || "").trim();
  const perimetre = (c.perimetre || "").trim();
  const note = (c.note || "").trim();
  const full = `${prenom} ${nom}`.trim();

  if (!nom && !prenom) return true;

  // « YKONE YKONE », « Matriochka Influences Matriochka Influences »
  const pNorm = normalizeName(prenom);
  const nNorm = normalizeName(nom);
  if (pNorm && nNorm && pNorm === nNorm && AGENCY_WORD.test(full)) return true;
  if (AGENCY_WORD.test(prenom) && AGENCY_WORD.test(nom)) return true;
  if (FAKE_PERSON_NAME.test(nom) || FAKE_PERSON_NAME.test(prenom)) return true;

  // Poste = l'agence elle-même, pas une personne
  if (NON_PERSON_POSTE.test(poste)) return true;
  if (/^agence\b/i.test(poste) && !/\b(manager|director|directrice|account|partner)\b/i.test(poste)) {
    return true;
  }

  // Note qui dit « Agence influence réelle » sans vrai prénom/nom de personne
  if (
    /\bagence influence\b/i.test(note) &&
    (!prenom || AGENCY_WORD.test(prenom)) &&
    AGENCY_WORD.test(nom)
  ) {
    return true;
  }

  // Retail boutique ≠ influence HQ
  if (RETAIL_TITLE.test(poste)) return true;

  if (nom.length < 2) return true;

  // Poste hors influence + pas LinkedIn + mono-source
  if (
    poste &&
    !GOOD_INFLUENCE_TITLE.test(poste) &&
    !GOOD_INFLUENCE_TITLE.test(perimetre) &&
    !c.linkedinUrl &&
    c.sources.length === 1
  ) {
    return true;
  }

  if (/^(nyx|l['']?oréal|loreal|woo|woô|mac|estee|esté+e)$/i.test(prenom)) {
    return true;
  }

  if (/^agence$/i.test(nom) || /^agence$/i.test(full)) return true;

  // Ecommerce sans lien influence
  if (/\be-?commerce\b/i.test(poste) && !GOOD_INFLUENCE_TITLE.test(poste)) {
    return true;
  }

  return false;
}

export function filterCartoContacts(
  contacts: CartoAiContactCandidate[]
): CartoAiContactCandidate[] {
  return contacts.filter((c) => !isJunkCartoContact(c));
}
