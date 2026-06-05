/**
 * Marque resolver — cœur du CRM unifié.
 *
 * Idée : peu importe d'où arrive le nom d'une marque (mail inbound, pipeline
 * stratégie, négo, collab, gift, opportunité Cannes, création manuelle…),
 * tous les flux passent par `findOrCreateMarque()` qui garantit qu'il n'y a
 * qu'UNE seule fiche par marque dans la base.
 *
 * Stratégie de matching (par ordre) :
 *   1) `marques.slug` (clé canonique, ex: "Nike", "NIKE", "Nike France" → "nike")
 *   2) `marque_aliases.slug` (variantes déjà mémorisées)
 *   3) fallback : création d'une nouvelle fiche + alias initial
 *
 * À chaque résolution, le libellé d'origine est ajouté comme alias si différent
 * du nom canonique → le système apprend les variantes au fil du temps.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";

export type MarqueAliasSource =
  | "INBOUND"
  | "CONTACT_MISSION"
  | "NEGOCIATION"
  | "COLLABORATION"
  | "OPPORTUNITE_MARQUE"
  | "DEMANDE_GIFT"
  | "DEMANDE_ENTRANTE"
  | "QUOTE"
  | "PROSPECTION"
  | "MANUAL"
  | "IMPORT";

export type FindOrCreateMarqueInput = {
  /** Nom brut tel que saisi par l'utilisateur ou extrait par l'IA. Obligatoire. */
  name: string;
  /** Origine du flux qui déclenche la résolution (pour tracer l'alias et le `sourceInitiale`). */
  source: MarqueAliasSource;
  /** Champs additionnels à pré-remplir lors d'une CRÉATION (ignorés si la marque existe déjà). */
  createDefaults?: Omit<
    Prisma.MarqueUncheckedCreateInput,
    "id" | "nom" | "slug" | "createdAt" | "updatedAt"
  >;
  /** Si vrai, ne crée jamais — retourne null quand rien ne matche. */
  dryRun?: boolean;
};

export type FindOrCreateMarqueResult = {
  marqueId: string;
  created: boolean;
  matchedBy: "slug" | "alias" | "created" | "none";
  slug: string;
};

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Normalise un nom de marque en clé canonique pour la déduplication.
 *
 * Règles : minuscules, suppression des accents, suppression de tout caractère
 * non alphanumérique. Exemples :
 *   "Nike"            → "nike"
 *   "NIKE"            → "nike"
 *   "Nike France"     → "nikefrance"
 *   "L'Oréal Paris"   → "lorealparis"
 *   "  Hermès SA  "   → "hermessa"
 *
 * NOTE : cette fonction est une généralisation de `normalizeMissionBrandKey`
 * (src/lib/contact-missions.ts) — les deux doivent rester strictement
 * équivalentes pour que les `ContactMission.targetBrandKey` historiques
 * matchent les nouveaux `Marque.slug`.
 */
export function marqueSlug(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Recherche par clé canonique. Retourne le `marqueId` ou `null`.
 */
async function findBySlug(client: TxClient, slug: string): Promise<string | null> {
  if (!slug) return null;
  const m = await client.marque.findFirst({
    where: { slug },
    select: { id: true },
  });
  return m?.id ?? null;
}

/**
 * Recherche par alias mémorisé. Retourne le `marqueId` ou `null`.
 */
async function findByAlias(client: TxClient, slug: string): Promise<string | null> {
  if (!slug) return null;
  const a = await client.marqueAlias.findFirst({
    where: { slug },
    select: { marqueId: true },
  });
  return a?.marqueId ?? null;
}

/**
 * Mémorise un alias si :
 *   - le `label` brut diffère du `nom` canonique de la marque, OU
 *   - le `slug` de l'alias diffère du `slug` de la marque (cas de variante
 *     orthographique pré-existante).
 *
 * Idempotent grâce à la contrainte UNIQUE (slug, marqueId).
 */
async function rememberAliasIfNew(
  client: TxClient,
  params: {
    marqueId: string;
    marqueNom: string;
    marqueSlugValue: string | null;
    rawLabel: string;
    rawSlug: string;
    source: MarqueAliasSource;
  }
): Promise<void> {
  const { marqueId, marqueNom, marqueSlugValue, rawLabel, rawSlug, source } = params;
  const trimmedLabel = rawLabel.trim();
  if (!trimmedLabel || !rawSlug) return;

  const isSameAsCanonical =
    trimmedLabel.toLowerCase() === marqueNom.trim().toLowerCase() &&
    rawSlug === marqueSlugValue;
  if (isSameAsCanonical) return;

  await client.marqueAlias
    .create({
      data: {
        marqueId,
        slug: rawSlug,
        label: trimmedLabel,
        source,
      },
    })
    .catch((err: any) => {
      if (err?.code === "P2002") return;
      throw err;
    });
}

/**
 * Trouve ou crée une marque à partir d'un nom brut.
 *
 * Garanties :
 *   - Aucune création de doublon : "Nike", "NIKE", "Nike " et "nike" pointent
 *     vers la même fiche.
 *   - Les variantes d'écriture sont mémorisées dans `marque_aliases` pour que
 *     le résolveur retrouve la fiche au prochain passage (système apprenant).
 *   - Si appelé depuis une transaction Prisma, passer `tx` via `withClient`.
 *
 * @returns `{ marqueId, created, matchedBy, slug }` — `marqueId` est `""` et
 *   `matchedBy === "none"` UNIQUEMENT si `dryRun: true` et qu'aucun match.
 */
export async function findOrCreateMarque(
  input: FindOrCreateMarqueInput,
  client: TxClient = prisma
): Promise<FindOrCreateMarqueResult> {
  const rawName = (input.name ?? "").trim();
  if (!rawName) {
    throw new Error("findOrCreateMarque: `name` est requis et ne peut pas être vide.");
  }
  const slug = marqueSlug(rawName);
  if (!slug) {
    throw new Error(
      `findOrCreateMarque: impossible de générer un slug à partir de "${rawName}".`
    );
  }

  const bySlug = await findBySlug(client, slug);
  if (bySlug) {
    await rememberAliasIfNew(client, {
      marqueId: bySlug,
      marqueNom: rawName,
      marqueSlugValue: slug,
      rawLabel: rawName,
      rawSlug: slug,
      source: input.source,
    });
    return { marqueId: bySlug, created: false, matchedBy: "slug", slug };
  }

  const byAlias = await findByAlias(client, slug);
  if (byAlias) {
    return { marqueId: byAlias, created: false, matchedBy: "alias", slug };
  }

  if (input.dryRun) {
    return { marqueId: "", created: false, matchedBy: "none", slug };
  }

  const created = await client.marque.create({
    data: {
      nom: rawName,
      slug,
      ...input.createDefaults,
    },
    select: { id: true, nom: true, slug: true },
  });

  await rememberAliasIfNew(client, {
    marqueId: created.id,
    marqueNom: created.nom,
    marqueSlugValue: created.slug,
    rawLabel: rawName,
    rawSlug: slug,
    source: input.source,
  });

  return { marqueId: created.id, created: true, matchedBy: "created", slug };
}

/**
 * Recherche pure (sans création). Pratique pour les écrans qui veulent
 * proposer une autocomplétion ou afficher la fiche existante avant que
 * l'utilisateur ne valide.
 */
export async function findMarqueByName(
  name: string,
  client: TxClient = prisma
): Promise<{ marqueId: string; matchedBy: "slug" | "alias" } | null> {
  const slug = marqueSlug(name);
  if (!slug) return null;
  const bySlug = await findBySlug(client, slug);
  if (bySlug) return { marqueId: bySlug, matchedBy: "slug" };
  const byAlias = await findByAlias(client, slug);
  if (byAlias) return { marqueId: byAlias, matchedBy: "alias" };
  return null;
}

export type EnsureMarqueContactInput = {
  marqueId: string;
  email?: string | null;
  nom?: string | null;
  prenom?: string | null;
  poste?: string | null;
  principal?: boolean;
};

/**
 * Ajoute un contact marque s'il n'existe pas déjà (dédup par email).
 */
export async function ensureMarqueContact(
  input: EnsureMarqueContactInput,
  client: TxClient = prisma
): Promise<void> {
  const email = input.email?.trim().toLowerCase();
  const nom = (input.nom || input.email?.split("@")[0] || "Contact").trim();
  if (!nom && !email) return;

  if (email) {
    const existing = await client.marqueContact.findFirst({
      where: { marqueId: input.marqueId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return;
  }

  await client.marqueContact.create({
    data: {
      marqueId: input.marqueId,
      nom,
      prenom: input.prenom?.trim() || null,
      email: email || null,
      poste: input.poste?.trim() || null,
      principal: input.principal ?? false,
    },
  });
}

export type LinkMarqueFromBrandInput = {
  brandName: string;
  source: MarqueAliasSource;
  createDefaults?: FindOrCreateMarqueInput["createDefaults"];
  contact?: {
    email?: string | null;
    nom?: string | null;
    prenom?: string | null;
    poste?: string | null;
  };
};

/**
 * Résout/crée la marque + contact optionnel — point d'entrée unique pour tous les flux.
 */
export async function linkMarqueFromBrandName(
  input: LinkMarqueFromBrandInput,
  client: TxClient = prisma
): Promise<FindOrCreateMarqueResult | null> {
  const name = input.brandName?.trim();
  if (!name) return null;

  const resolved = await findOrCreateMarque(
    {
      name,
      source: input.source,
      createDefaults: input.createDefaults,
    },
    client
  );

  if (input.contact && (input.contact.email || input.contact.nom)) {
    await ensureMarqueContact(
      {
        marqueId: resolved.marqueId,
        email: input.contact.email,
        nom: input.contact.nom,
        prenom: input.contact.prenom,
        poste: input.contact.poste,
      },
      client
    );
  }

  return resolved;
}

/**
 * Domaines d'emails grand public / fournisseurs : on ne crée JAMAIS de marque
 * à partir de ceux-ci (sinon on aurait une fiche "Gmail", "Orange"…).
 */
const GENERIC_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "ymail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.fr",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "bbox.fr",
  "numericable.fr",
  "yopmail.com",
  "mailinator.com",
]);

/** Suffixes composés courants (TLD à deux niveaux). */
const COMPOUND_TLDS = new Set<string>([
  "co.uk",
  "com.au",
  "co.jp",
  "com.br",
  "co.nz",
  "co.za",
  "com.mx",
  "com.tr",
  "com.sg",
  "co.in",
  "com.es",
]);

/**
 * Déduit un nom de marque à partir d'un email ou d'un domaine expéditeur.
 *
 * Sert de FILET DE SÉCURITÉ inbound : quand aucun `extractedBrand` n'est fourni,
 * on dérive la marque du domaine (ex: `marketing@nike.com` → "Nike").
 * Retourne `null` pour les fournisseurs grand public (gmail, orange…) afin de
 * ne pas polluer le CRM.
 *
 * Exemples :
 *   "contact@nike.com"        → "Nike"
 *   "newsletter@email.nike.com" → "Nike"
 *   "x@thefork.co.uk"         → "Thefork"
 *   "x@gmail.com"             → null
 */
export function brandNameFromEmailDomain(
  emailOrDomain: string | null | undefined
): string | null {
  const raw = (emailOrDomain || "").trim().toLowerCase();
  if (!raw) return null;

  let domain = raw.includes("@") ? raw.split("@").pop() || "" : raw;
  domain = domain.replace(/^www\./, "").replace(/\.$/, "").trim();
  if (!domain || !domain.includes(".")) return null;
  if (GENERIC_EMAIL_DOMAINS.has(domain)) return null;

  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  const lastTwo = parts.slice(-2).join(".");
  const labelIndex = COMPOUND_TLDS.has(lastTwo)
    ? parts.length - 3
    : parts.length - 2;
  const label = parts[labelIndex];
  if (!label || label.length < 2) return null;

  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Parse "Marie Dupont" → { prenom, nom } */
export function parseSenderName(senderName: string | null | undefined): {
  prenom: string | null;
  nom: string;
} {
  const raw = (senderName || "").trim();
  if (!raw) return { prenom: null, nom: "Contact" };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { prenom: null, nom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
}

export type PipelineClientContact = {
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

/**
 * Copie les contacts saisis dans le pipeline vers la fiche marque (table marque_contacts).
 */
export async function syncPipelineContactsToMarque(
  marqueId: string,
  contacts: PipelineClientContact[],
  client: TxClient = prisma
): Promise<void> {
  for (const c of contacts) {
    const email = String(c.email || "").trim().toLowerCase();
    const firstname = String(c.firstname || "").trim();
    if (!firstname || !email) continue;
    const lastname = String(c.lastname || "").trim();
    await ensureMarqueContact(
      {
        marqueId,
        email,
        prenom: firstname,
        nom: lastname || firstname,
        poste: String(c.role || "").trim() || null,
      },
      client
    );
  }
}

/**
 * Résout la marque si besoin, puis synchronise les contacts pipeline → fiche client.
 * Retourne le marqueId effectif (pour mettre à jour la mission).
 */
export async function syncMissionClientContactsToMarque(
  targetBrand: string,
  marqueId: string | null | undefined,
  contacts: unknown,
  source: MarqueAliasSource = "CONTACT_MISSION"
): Promise<string | null> {
  const list = Array.isArray(contacts) ? (contacts as PipelineClientContact[]) : [];
  if (list.length === 0) return marqueId ?? null;

  let resolvedId = marqueId?.trim() || null;
  if (!resolvedId) {
    const linked = await linkMarqueFromBrandName({
      brandName: targetBrand,
      source,
    });
    resolvedId = linked?.marqueId ?? null;
  }
  if (!resolvedId) return null;

  await syncPipelineContactsToMarque(resolvedId, list);
  return resolvedId;
}
