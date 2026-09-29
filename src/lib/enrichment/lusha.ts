/**
 * Lusha V3 Search & Enrich — POST /v3/contacts/search-and-enrich
 * https://docs.lusha.com/guides
 */

import type {
  EnrichPersonInput,
  EnrichmentEmail,
  EnrichmentPhone,
  ProviderEnrichmentResult,
} from "@/lib/enrichment/types";

const LUSHA_SEARCH_ENRICH_URL =
  "https://api.lusha.com/v3/contacts/search-and-enrich";

function lushaKey(): string | null {
  return process.env.LUSHA_API_KEY?.trim() || null;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

type LushaEmail = {
  email?: string;
  type?: "work" | "private" | string;
  confidence?: string;
};

type LushaPhone = {
  number?: string;
  phoneNumber?: string;
  type?: "mobile" | "direct" | string;
};

type LushaContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: { title?: string } | string;
  emails?: LushaEmail[];
  phones?: LushaPhone[];
  company?: { name?: string; domain?: string } | null;
  socialLinks?: { linkedin?: string } | null;
  error?: { code?: string; message?: string } | null;
};

type LushaResponse = {
  results?: LushaContact[];
  contacts?: LushaContact[] | Record<string, LushaContact>;
  data?: { contacts?: LushaContact[]; results?: LushaContact[] };
  statusCode?: number;
  message?: string;
};

function normalizeContacts(data: LushaResponse): LushaContact[] {
  // V3 search-and-enrich / search → champ `results`
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.data?.results)) return data.data.results;
  if (Array.isArray(data.contacts)) return data.contacts;
  if (data.contacts && typeof data.contacts === "object") {
    return Object.values(data.contacts);
  }
  if (Array.isArray(data.data?.contacts)) return data.data.contacts;
  return [];
}

function jobTitleOf(c: LushaContact): string | null {
  if (!c.jobTitle) return null;
  if (typeof c.jobTitle === "string") return c.jobTitle.trim() || null;
  return c.jobTitle.title?.trim() || null;
}

export async function enrichWithLusha(
  input: EnrichPersonInput
): Promise<ProviderEnrichmentResult> {
  const apiKey = lushaKey();
  if (!apiKey) {
    return {
      provider: "lusha",
      configured: false,
      ok: false,
      error: "LUSHA_API_KEY manquante",
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
      provider: "lusha",
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

  const contactPayload: Record<string, string> = {
    clientReferenceId: "glowup-1",
  };
  if (input.prenom?.trim()) contactPayload.firstName = input.prenom.trim();
  if (input.nom?.trim()) contactPayload.lastName = input.nom.trim();
  if (input.domain?.trim()) contactPayload.companyDomain = input.domain.trim();
  if (input.company?.trim()) contactPayload.companyName = input.company.trim();
  if (input.linkedinUrl?.trim()) {
    contactPayload.linkedinUrl = input.linkedinUrl.trim();
  }

  try {
    const res = await fetch(LUSHA_SEARCH_ENRICH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_key: apiKey,
      },
      body: JSON.stringify({
        contacts: [contactPayload],
        // Emails seulement — les crédits téléphone coûtent plus cher.
        reveal: ["emails"],
        options: { includePartialProfiles: true },
      }),
    });

    const data = (await res.json().catch(() => ({}))) as LushaResponse;

    if (!res.ok) {
      return {
        provider: "lusha",
        configured: true,
        ok: false,
        error: data.message || `Lusha HTTP ${res.status}`,
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

    const contacts = normalizeContacts(data);
    const contact =
      contacts.find((c) => !c.error) || contacts[0] || null;

    if (!contact || contact.error) {
      return {
        provider: "lusha",
        configured: true,
        ok: true,
        error: contact?.error?.message || null,
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

    const emails: EnrichmentEmail[] = [];
    const seen = new Set<string>();
    for (const row of contact.emails || []) {
      const e = (row.email || "").trim().toLowerCase();
      if (!e || !isValidEmail(e) || seen.has(e)) continue;
      seen.add(e);
      const type: EnrichmentEmail["type"] =
        row.type === "private" ? "personal" : row.type === "work" ? "work" : "unknown";
      emails.push({
        email: e,
        type,
        status: row.confidence || null,
      });
    }

    const phones: EnrichmentPhone[] = [];
    for (const row of contact.phones || []) {
      const number = (row.number || row.phoneNumber || "").trim();
      if (!number) continue;
      const type: EnrichmentPhone["type"] =
        row.type === "mobile"
          ? "mobile"
          : row.type === "direct"
            ? "direct"
            : "unknown";
      phones.push({ number, type });
    }

    const fullName =
      contact.fullName?.trim() ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      null;

    return {
      provider: "lusha",
      configured: true,
      ok: true,
      error: null,
      found: true,
      fullName,
      title: jobTitleOf(contact),
      company: contact.company?.name?.trim() || null,
      linkedinUrl: contact.socialLinks?.linkedin?.trim() || null,
      emails,
      phones,
      confidence: null,
      raw: data,
    };
  } catch (e) {
    return {
      provider: "lusha",
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "Erreur réseau Lusha",
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
