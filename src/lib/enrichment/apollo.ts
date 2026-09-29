/**
 * Apollo People Enrichment — POST /api/v1/people/match
 * https://docs.apollo.io/reference/people-enrichment
 */

import type {
  EnrichPersonInput,
  EnrichmentEmail,
  ProviderEnrichmentResult,
} from "@/lib/enrichment/types";

const APOLLO_MATCH_URL = "https://api.apollo.io/api/v1/people/match";

function apolloKey(): string | null {
  return process.env.APOLLO_API_KEY?.trim() || null;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

type ApolloPerson = {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  email_status?: string | null;
  personal_emails?: string[] | null;
  linkedin_url?: string | null;
  match_confidence?: string | null;
  organization?: { name?: string | null; primary_domain?: string | null } | null;
};

export async function enrichWithApollo(
  input: EnrichPersonInput
): Promise<ProviderEnrichmentResult> {
  const apiKey = apolloKey();
  if (!apiKey) {
    return {
      provider: "apollo",
      configured: false,
      ok: false,
      error: "APOLLO_API_KEY manquante",
      found: false,
      fullName: null,
      title: null,
      company: null,
      linkedinUrl: null,
      emails: [],
      phones: [],
      confidence: null,
    };
  }

  const hasIdentity =
    Boolean(input.linkedinUrl?.trim()) ||
    (Boolean(input.nom?.trim()) &&
      (Boolean(input.domain?.trim()) || Boolean(input.company?.trim())));
  if (!hasIdentity) {
    return {
      provider: "apollo",
      configured: true,
      ok: false,
      error: "Identité insuffisante (LinkedIn ou nom + domaine/entreprise)",
      found: false,
      fullName: null,
      title: null,
      company: null,
      linkedinUrl: null,
      emails: [],
      phones: [],
      confidence: null,
    };
  }

  const url = new URL(APOLLO_MATCH_URL);
  if (input.prenom?.trim()) url.searchParams.set("first_name", input.prenom.trim());
  if (input.nom?.trim()) url.searchParams.set("last_name", input.nom.trim());
  if (input.domain?.trim()) url.searchParams.set("domain", input.domain.trim());
  if (input.company?.trim() && !input.domain?.trim()) {
    url.searchParams.set("organization_name", input.company.trim());
  }
  if (input.linkedinUrl?.trim()) {
    url.searchParams.set("linkedin_url", input.linkedinUrl.trim());
  }
  // Emails pro + perso ; pas de téléphone (webhook obligatoire côté Apollo).
  url.searchParams.set("reveal_personal_emails", "true");

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({}),
    });

    const data = (await res.json().catch(() => ({}))) as {
      person?: ApolloPerson | null;
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      return {
        provider: "apollo",
        configured: true,
        ok: false,
        error:
          data.error ||
          data.message ||
          `Apollo HTTP ${res.status}`,
        found: false,
        fullName: null,
        title: null,
        company: null,
        linkedinUrl: null,
        emails: [],
        phones: [],
        confidence: null,
        raw: data,
      };
    }

    const person = data.person;
    if (!person || person.match_confidence === "none") {
      return {
        provider: "apollo",
        configured: true,
        ok: true,
        error: null,
        found: false,
        fullName: null,
        title: null,
        company: null,
        linkedinUrl: null,
        emails: [],
        phones: [],
        confidence: person?.match_confidence || null,
        raw: data,
      };
    }

    const emails: EnrichmentEmail[] = [];
    const seen = new Set<string>();
    const push = (email: string | null | undefined, type: EnrichmentEmail["type"], status?: string | null) => {
      const e = (email || "").trim().toLowerCase();
      if (!e || !isValidEmail(e) || seen.has(e)) return;
      seen.add(e);
      emails.push({ email: e, type, status: status || null });
    };

    push(person.email, "work", person.email_status);
    for (const pe of person.personal_emails || []) {
      push(pe, "personal");
    }

    const fullName =
      person.name?.trim() ||
      [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
      null;

    return {
      provider: "apollo",
      configured: true,
      ok: true,
      error: null,
      found: true,
      fullName,
      title: person.title?.trim() || null,
      company: person.organization?.name?.trim() || null,
      linkedinUrl: person.linkedin_url?.trim() || null,
      emails,
      phones: [],
      confidence: person.match_confidence || null,
      raw: data,
    };
  } catch (e) {
    return {
      provider: "apollo",
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "Erreur réseau Apollo",
      found: false,
      fullName: null,
      title: null,
      company: null,
      linkedinUrl: null,
      emails: [],
      phones: [],
      confidence: null,
    };
  }
}
