import { CARTO_AI_MAX_CONTACTS } from "@/lib/carto-ai/constants";
import { searchInfluencePeopleOnApollo } from "@/lib/carto-ai/apollo-search";
import { gatherInfluenceGrounding } from "@/lib/carto-ai/exa-grounding";
import {
  buildCartoPrompt,
  fetchCartoFromChatgpt,
  fetchCartoFromClaude,
  fetchCartoFromXai,
} from "@/lib/carto-ai/llm";
import { mergeCartoCandidates } from "@/lib/carto-ai/merge-candidates";
import { filterCartoContacts } from "@/lib/carto-ai/quality-filter";
import type {
  CartoAiPreviewResult,
  CartoAiProviderResult,
} from "@/lib/carto-ai/types";

function normalizeDomain(raw: string | null | undefined): string | null {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return s || null;
}

/** Ignore un domaine qui pointe clairement vers une autre marque (ex. MAC + nyxcosmetics.fr). */
function domainMatchesCompany(company: string, domain: string | null): string | null {
  if (!domain) return null;
  const c = company
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const d = domain.toLowerCase().replace(/\.(com|fr|co\.uk|net|io|eu)$/g, "");
  const tokens = c.split(" ").filter((t) => t.length >= 3);
  // Si un token marque est dans le domaine → OK. Sinon si domaine contient une autre marque connue ≠ company → drop.
  if (tokens.some((t) => d.includes(t))) return domain;
  const foreign = ["nyx", "loreal", "sephora", "nars", "dior", "chanel", "ysl"];
  const companyHas = (t: string) => c.includes(t);
  if (foreign.some((t) => d.includes(t) && !companyHas(t))) {
    console.warn(
      `[carto-ai] domaine ignoré (mismatch marque): company=${company} domain=${domain}`
    );
    return null;
  }
  return domain;
}

export async function generateCartoPreview(opts: {
  company: string;
  domain?: string | null;
  language: "fr" | "en";
}): Promise<CartoAiPreviewResult> {
  const company = opts.company.trim();
  const domain = domainMatchesCompany(company, normalizeDomain(opts.domain));
  const supportPrompt = buildCartoPrompt({
    company,
    domain,
    language: opts.language,
    max: CARTO_AI_MAX_CONTACTS,
  });

  console.log(
    `[carto-ai] preview start company=${company} domain=${domain || "—"} primary=chatgpt+exa`
  );

  // 1) Preuves web Exa d'abord → ancrage ChatGPT (évite Miruna inventée / boutiques).
  const grounding = await gatherInfluenceGrounding({ company, domain });

  const [chatgpt, claude, xai, apollo] = await Promise.all([
    fetchCartoFromChatgpt({
      company,
      domain,
      language: opts.language,
      max: CARTO_AI_MAX_CONTACTS,
      groundingBlock: grounding.contextBlock,
    }),
    fetchCartoFromClaude(supportPrompt),
    fetchCartoFromXai(supportPrompt),
    searchInfluencePeopleOnApollo({ company, domain }),
  ]);

  const chatgptClean = filterCartoContacts(chatgpt.contacts);
  const claudeClean = filterCartoContacts(claude.contacts);
  const xaiClean = filterCartoContacts(xai.contacts);
  const apolloClean = filterCartoContacts(apollo.contacts);

  const providers: CartoAiProviderResult[] = [
    {
      provider: "chatgpt",
      ok: chatgpt.ok,
      error: chatgpt.error,
      contacts: chatgptClean,
    },
    {
      provider: "claude",
      ok: claude.ok,
      error: claude.error,
      contacts: claudeClean,
    },
    {
      provider: "xai",
      ok: xai.ok,
      error: xai.error,
      contacts: xaiClean,
    },
    {
      provider: "apollo",
      ok: apollo.ok,
      error: apollo.error,
      contacts: apolloClean,
    },
  ];

  for (const p of providers) {
    console.log(
      `[carto-ai] ${p.provider}: ok=${p.ok} n=${p.contacts.length}` +
        (p.error ? ` err=${p.error}` : "")
    );
  }
  if (grounding.error) {
    console.warn(`[carto-ai] exa: ${grounding.error}`);
  }

  const contacts = mergeCartoCandidates([
    chatgptClean,
    xaiClean,
    claudeClean,
    apolloClean,
  ]);

  return {
    company,
    domain: apollo.domain || domain,
    language: opts.language,
    contacts: filterCartoContacts(contacts),
    providers,
  };
}
