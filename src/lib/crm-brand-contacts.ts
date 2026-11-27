/**
 * Contacts CRM d’une marque : fiche France + entreprises Benelux liées / homonymes.
 * Utilisé par projets-outreach et /api/marques/contacts?includeBenelux=1.
 */

import { prisma } from "@/lib/prisma";
import { findAllMarqueIdsByName, findMarqueByName } from "@/lib/marque-resolver";
import { slugifyBenelux } from "@/lib/benelux-company";
import {
  isForbiddenCastingRecipient,
  loadCastingRecipientBlocklist,
} from "@/lib/casting-recipient-guard";

/** FR / BE seuls, ou BOTH = même email présent sur les 2 fiches (FR+BE). */
export type CrmContactMarket = "FR" | "BENELUX" | "BOTH";

export type CrmBrandContact = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  linkedinUrl: string;
  language: "fr" | "en";
  market: CrmContactMarket;
  companyName: string;
};

/** Talent FR → FR + BOTH ; talent BE → BENELUX + BOTH. */
export function contactMatchesMarket(
  market: CrmContactMarket | "FR" | "BENELUX" | null | undefined,
  want: "FR" | "BENELUX"
): boolean {
  if (market === "BOTH") return true;
  return market === want;
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/** Clé souple sans tirets : « Avène » / « Avene » / slug avene-1 → avene. */
function softBrandKey(s: string): string {
  return slugifyBenelux(s)
    .replace(/-\d+$/g, "")
    .replace(/-/g, "");
}

function pickEmail(
  email: string | null | undefined,
  suggested: string | null | undefined
): string {
  const primary = String(email || "").trim();
  if (primary.includes("@")) return primary;
  const alt = String(suggested || "").trim();
  return alt.includes("@") ? alt : "";
}

export async function resolveMarqueIdsForBrand(brand: string): Promise<string[]> {
  const trimmed = String(brand || "").trim();
  if (trimmed.length < 2) return [];
  let ids = await findAllMarqueIdsByName(trimmed);
  if (ids.length === 0) {
    const one = await findMarqueByName(trimmed);
    if (one?.marqueId) ids = [one.marqueId];
  }
  return ids;
}

/**
 * Charge les contacts emailés FR + Benelux pour des marques / noms donnés.
 * Même email sur les 2 fiches → market BOTH (disponible FR et BE).
 */
export async function loadBrandContactsFrAndBe(opts: {
  marqueIds?: string[];
  brandNames?: string[];
  /** Si true (défaut), ignore les contacts sans email. */
  requireEmail?: boolean;
}): Promise<CrmBrandContact[]> {
  const requireEmail = opts.requireEmail !== false;
  const marqueIds = Array.from(
    new Set((opts.marqueIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  );
  const brandNames = Array.from(
    new Set(
      (opts.brandNames || [])
        .map((n) => String(n || "").trim())
        .filter((n) => n.length >= 2)
    )
  );

  if (marqueIds.length === 0 && brandNames.length === 0) return [];

  const brandHint = brandNames[0] || "";
  const blocklist = await loadCastingRecipientBlocklist();
  const out: CrmBrandContact[] = [];
  const seenEmails = new Set<string>();

  const push = (c: CrmBrandContact) => {
    if (requireEmail && !c.email.includes("@")) return;
    if (
      isForbiddenCastingRecipient(
        { email: c.email, firstname: c.firstname, lastname: c.lastname },
        blocklist,
        {
          brand: c.companyName || brandHint,
          // L’Oréal / Nyx bloqués en FR, autorisés en Benelux.
          // BOTH : on évalue avec le marché du push courant (FR puis BE).
          market: c.market === "BENELUX" ? "BENELUX" : "FR",
        }
      )
    ) {
      return;
    }
    const key = normalizeEmail(c.email);
    if (key) {
      if (seenEmails.has(key)) {
        // Même email sur fiche FR + fiche BE = FR+BE → BOTH.
        const idx = out.findIndex((x) => normalizeEmail(x.email) === key);
        if (idx >= 0) {
          const prev = out[idx];
          const marketsDiffer =
            prev.market !== c.market &&
            prev.market !== "BOTH" &&
            c.market !== "BOTH";
          out[idx] = {
            ...prev,
            market: marketsDiffer || prev.market === "BOTH" || c.market === "BOTH"
              ? "BOTH"
              : prev.market,
            language:
              c.language === "en" || prev.language === "en" ? "en" : prev.language,
            role: prev.role || c.role,
            linkedinUrl: prev.linkedinUrl || c.linkedinUrl,
            firstname: prev.firstname || c.firstname,
            lastname: prev.lastname || c.lastname,
          };
        }
        return;
      }
      seenEmails.add(key);
    }
    out.push(c);
  };

  if (marqueIds.length > 0) {
    const frRows = await prisma.marqueContact.findMany({
      where: {
        marqueId: { in: marqueIds },
        outreachExcluded: false,
        diffusionOptOut: false,
      },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        emailSuggested: true,
        poste: true,
        principal: true,
        linkedinUrl: true,
        source: true,
        language: true,
        marque: { select: { nom: true } },
      },
      orderBy: [{ principal: "desc" }, { nom: "asc" }],
    });

    for (const r of frRows) {
      if (String(r.source || "").trim().toUpperCase() === "AO") continue;
      push({
        id: r.id,
        firstname: String(r.prenom || "").trim(),
        lastname: String(r.nom || "").trim(),
        email: pickEmail(r.email, r.emailSuggested),
        role: String(r.poste || "").trim(),
        linkedinUrl: String(r.linkedinUrl || "").trim(),
        language:
          String(r.language || "").toLowerCase() === "en" ? "en" : "fr",
        market: "FR",
        companyName: String(r.marque?.nom || brandHint).trim(),
      });
    }
  }

  const slugs = brandNames.map((n) => slugifyBenelux(n)).filter(Boolean);
  const softKeys = new Set(
    brandNames.map((n) => softBrandKey(n)).filter((k) => k.length >= 2)
  );
  const beWhere: Array<Record<string, unknown>> = [];
  if (marqueIds.length > 0) {
    beWhere.push({ linkedMarqueId: { in: marqueIds } });
  }
  if (slugs.length > 0) {
    beWhere.push({ slug: { in: slugs } });
    for (const slug of slugs) {
      // Homonymes créés après collision slug : avene-1, avene-2…
      beWhere.push({ slug: { startsWith: `${slug}-` } });
    }
  }
  for (const name of brandNames) {
    beWhere.push({ nom: { equals: name, mode: "insensitive" } });
    // Accents : « Avène » → contains « avene » ne marche pas toujours ; on
    // élargit puis on filtre softBrandKey côté JS.
    const soft = softBrandKey(name);
    if (soft.length >= 3) {
      beWhere.push({ nom: { contains: soft.slice(0, 4), mode: "insensitive" } });
    }
  }

  if (beWhere.length > 0) {
    const companies = await prisma.beneluxCompany.findMany({
      where: { OR: beWhere },
      select: {
        id: true,
        nom: true,
        slug: true,
        linkedMarqueId: true,
        contacts: {
          where: { outreachExcluded: false, excluded: false },
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            emailSuggested: true,
            poste: true,
            principal: true,
            linkedinUrl: true,
            language: true,
          },
          orderBy: [{ principal: "desc" }, { nom: "asc" }],
        },
      },
    });

    for (const company of companies) {
      const linkedOk =
        Boolean(company.linkedMarqueId) &&
        marqueIds.includes(String(company.linkedMarqueId));
      const softOk =
        softKeys.size === 0 ||
        softKeys.has(softBrandKey(company.nom)) ||
        softKeys.has(softBrandKey(company.slug));
      if (!linkedOk && !softOk) continue;

      for (const r of company.contacts) {
        push({
          id: r.id,
          firstname: String(r.prenom || "").trim(),
          lastname: String(r.nom || "").trim(),
          email: pickEmail(r.email, r.emailSuggested),
          role: String(r.poste || "").trim(),
          linkedinUrl: String(r.linkedinUrl || "").trim(),
          language:
            String(r.language || "").toLowerCase() === "en" ? "en" : "fr",
          market: "BENELUX",
          companyName: String(company.nom || brandHint).trim(),
        });
      }
    }
  }

  return out;
}
