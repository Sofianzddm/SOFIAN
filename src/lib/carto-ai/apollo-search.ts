/**
 * Apollo Organization + People Search pour contacts influence marketing.
 * La search ne renvoie pas d'emails — enrichissement séparé après commit.
 */

import type { CartoAiContactCandidate, CartoAiMarche } from "@/lib/carto-ai/types";
import { CARTO_AI_MAX_CONTACTS } from "@/lib/carto-ai/constants";

function marcheFromLocation(loc: string | null): CartoAiMarche {
  const s = (loc || "").toLowerCase();
  if (/\b(france|paris|lyon|marseille)\b/.test(s)) return "FR";
  if (
    /\b(belgium|netherlands|luxembourg|germany|spain|italy|united kingdom|uk|europe|emea)\b/.test(
      s
    )
  ) {
    return "EU";
  }
  if (/\b(united states|usa|canada|singapore|dubai|hong kong)\b/.test(s)) {
    return "INT";
  }
  return "FR";
}

const ORG_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_companies/search";
const PEOPLE_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search";

const INFLUENCE_TITLES = [
  "Influencer Marketing",
  "Influence Marketing",
  "Brand Partnerships",
  "Creator Partnerships",
  "Partnerships Manager",
  "Social Media Manager",
  "Community Manager",
  "Brand Content",
  "Communication Influence",
  "Head of Influence",
  "Responsable Influence",
  "Chargé d'influence",
  "Creator Marketing",
];

function apolloKey(): string | null {
  return process.env.APOLLO_API_KEY?.trim() || null;
}

type ApolloOrg = {
  id?: string;
  name?: string;
  primary_domain?: string;
};

type ApolloPerson = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  organization?: { name?: string | null } | null;
};

function splitName(full: string | null | undefined): {
  prenom: string | null;
  nom: string | null;
} {
  const cleaned = String(full || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return { prenom: null, nom: null };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { prenom: null, nom: parts[0] || null };
  return {
    prenom: parts[0] || null,
    nom: parts.slice(1).join(" ") || null,
  };
}

function guessPriority(title: string | null): string {
  const t = (title || "").toLowerCase();
  if (
    /\b(head|directeur|directrice|vp|vice|chief|responsable|lead)\b/.test(t) ||
    /\binfluence\b/.test(t)
  ) {
    return "P1";
  }
  if (/\b(manager|chargé|chargee|cheffe? de projet|coordinator)\b/.test(t)) {
    return "P2";
  }
  return "P2";
}

async function searchOrganization(opts: {
  apiKey: string;
  company: string;
  domain: string | null;
}): Promise<{ id: string | null; domain: string | null; error: string | null }> {
  const body: Record<string, unknown> = {
    q_organization_name: opts.company,
    page: 1,
    per_page: 5,
  };
  if (opts.domain) {
    body.q_organization_domains = [opts.domain.replace(/^www\./, "")];
  }

  const res = await fetch(ORG_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": opts.apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    organizations?: ApolloOrg[];
    accounts?: ApolloOrg[];
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    return {
      id: null,
      domain: opts.domain,
      error: data.error || data.message || `Apollo org HTTP ${res.status}`,
    };
  }
  const orgs = data.organizations?.length
    ? data.organizations
    : data.accounts || [];
  const match =
    (opts.domain &&
      orgs.find(
        (o) =>
          o.primary_domain?.toLowerCase() ===
          opts.domain!.replace(/^www\./, "").toLowerCase()
      )) ||
    orgs[0] ||
    null;
  return {
    id: match?.id || null,
    domain: match?.primary_domain || opts.domain,
    error: null,
  };
}

export async function searchInfluencePeopleOnApollo(opts: {
  company: string;
  domain: string | null;
}): Promise<{
  ok: boolean;
  error: string | null;
  configured: boolean;
  domain: string | null;
  contacts: CartoAiContactCandidate[];
}> {
  const apiKey = apolloKey();
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      error: "APOLLO_API_KEY manquante",
      domain: opts.domain,
      contacts: [],
    };
  }

  try {
    const org = await searchOrganization({
      apiKey,
      company: opts.company,
      domain: opts.domain,
    });

    const peopleBody: Record<string, unknown> = {
      person_titles: INFLUENCE_TITLES,
      include_similar_titles: true,
      page: 1,
      per_page: Math.min(25, CARTO_AI_MAX_CONTACTS + 10),
    };
    if (org.id) {
      peopleBody.organization_ids = [org.id];
    } else if (org.domain || opts.domain) {
      peopleBody.q_organization_domains = [
        (org.domain || opts.domain || "").replace(/^www\./, ""),
      ];
    } else {
      peopleBody.q_keywords = opts.company;
    }

    const res = await fetch(PEOPLE_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(peopleBody),
    });

    const data = (await res.json().catch(() => ({}))) as {
      people?: ApolloPerson[];
      contacts?: ApolloPerson[];
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        error:
          org.error ||
          data.error ||
          data.message ||
          `Apollo people HTTP ${res.status}`,
        domain: org.domain || opts.domain,
        contacts: [],
      };
    }

    const people = data.people?.length ? data.people : data.contacts || [];
    const contacts: CartoAiContactCandidate[] = [];
    for (const p of people) {
      const fromParts = {
        prenom: p.first_name?.trim() || null,
        nom: p.last_name?.trim() || null,
      };
      const fromFull = splitName(p.name);
      const prenom = fromParts.prenom || fromFull.prenom;
      const nom = fromParts.nom || fromFull.nom;
      if (!nom && !prenom) continue;
      const loc = [p.city, p.state, p.country].filter(Boolean).join(", ") || null;
      contacts.push({
        marche: marcheFromLocation(loc),
        priorite: guessPriority(p.title || null),
        prenom,
        nom: nom || prenom || "Contact",
        poste: p.title?.trim() || null,
        perimetre: p.organization?.name?.trim() || opts.company,
        localisation: loc,
        linkedinUrl: p.linkedin_url?.trim() || null,
        note: "Trouvé via Apollo People Search (titres influence / partnerships / social).",
        sources: ["apollo"],
      });
      if (contacts.length >= CARTO_AI_MAX_CONTACTS) break;
    }

    return {
      ok: true,
      configured: true,
      error: org.error,
      domain: org.domain || opts.domain,
      contacts,
    };
  } catch (e) {
    return {
      ok: false,
      configured: true,
      error: e instanceof Error ? e.message : "Erreur réseau Apollo",
      domain: opts.domain,
      contacts: [],
    };
  }
}
