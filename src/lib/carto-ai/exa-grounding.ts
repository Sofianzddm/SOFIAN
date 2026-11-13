/**
 * Ancrage web via Exa — dont people search (LinkedIn-weighted).
 * C’est le meilleur équivalent API au browsing LinkedIn de ChatGPT web
 * (l’API OpenAI web_search ne couvre pas LinkedIn comme ChatGPT).
 */

export type ExaGroundingSnippet = {
  title: string;
  url: string;
  text: string;
  kind: "web" | "people";
};

function exaKey(): string | null {
  return process.env.EXA_API_KEY?.trim() || null;
}

async function exaSearch(opts: {
  query: string;
  num?: number;
  category?: "people" | "company" | "news";
}): Promise<ExaGroundingSnippet[]> {
  const apiKey = exaKey();
  if (!apiKey) return [];

  const body: Record<string, unknown> = {
    query: opts.query,
    type: "auto",
    numResults: opts.num ?? 6,
    contents: {
      text: { maxCharacters: 900 },
    },
  };
  if (opts.category) {
    body.category = opts.category;
    // people : ne pas mettre excludeDomains (400 côté Exa)
  }

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.warn(`[carto-ai] exa ${res.status}:`, err.slice(0, 160));
    return [];
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      text?: string;
      author?: string;
    }>;
  };

  const kind: "web" | "people" = opts.category === "people" ? "people" : "web";

  return (data.results || [])
    .map((r) => ({
      title: String(r.title || r.author || "").trim(),
      url: String(r.url || "").trim(),
      text: String(r.text || "").trim(),
      kind,
    }))
    .filter((r) => r.title || r.text);
}

export async function gatherInfluenceGrounding(opts: {
  company: string;
  domain: string | null;
}): Promise<{
  ok: boolean;
  error: string | null;
  snippets: ExaGroundingSnippet[];
  contextBlock: string;
}> {
  if (!exaKey()) {
    return {
      ok: false,
      error: "EXA_API_KEY manquante",
      snippets: [],
      contextBlock: "",
    };
  }

  const brand = opts.company.trim();

  // 1) People search = profils LinkedIn-weighted (Managers ET Associates / Coordinators)
  const peopleQueries = [
    `${brand} Influence Manager OR "Press & Influencer" OR Advocacy France`,
    `${brand} "Earned & Owned Media" OR "Earned Media" OR "Owned Media" Associate OR Coordinator Paris`,
    `${brand} Bobbi Brown "Earned" OR Influence OR Press France OR Benelux`,
    `${brand} "Influencer Marketing" OR "Brand Partnerships" OR "Artist Relations" Paris`,
    `${brand} Account Manager Influence OR "Managing Partner" agence beauté France`,
    `${brand} Estée Lauder OR "Estee Lauder" Press Influence France Benelux`,
  ];

  // 2) Web = nominations / posts / campagnes
  const webQueries = [
    `${brand} "prise de fonction" OR "rejoins" OR "Press & Influencer Manager" France LinkedIn`,
    `${brand} "Earned & Owned Media Associate" OR "Earned Media Associate" France`,
    `${brand} influence campagne France agence (YKONE OR WOÔ OR Matriochka)`,
  ];

  try {
    const [peopleBatches, webBatches] = await Promise.all([
      Promise.all(
        peopleQueries.map((q) =>
          exaSearch({ query: q, num: 8, category: "people" })
        )
      ),
      Promise.all(webQueries.map((q) => exaSearch({ query: q, num: 5 }))),
    ]);

    const seen = new Set<string>();
    const snippets: ExaGroundingSnippet[] = [];
    for (const batch of [...peopleBatches, ...webBatches]) {
      for (const s of batch) {
        const key = s.url || `${s.kind}:${s.title}:${s.text.slice(0, 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        snippets.push(s);
        if (snippets.length >= 28) break;
      }
      if (snippets.length >= 28) break;
    }

    const people = snippets.filter((s) => s.kind === "people");
    const web = snippets.filter((s) => s.kind === "web");

    const contextBlock = snippets.length
      ? [
          "PREUVES EXA — ancre-toi DESSUS. Priorité aux profils PEOPLE (LinkedIn-weighted).",
          "Si un nom n'apparaît pas ici ni via ta recherche web réelle, ne l'invente pas.",
          "Pour une agence : sors les PERSONNES (titre + LinkedIn), jamais le nom de l'agence en prénom/nom.",
          "",
          people.length
            ? [
                "=== PROFILS PEOPLE / LINKEDIN ===",
                ...people.map(
                  (s, i) =>
                    `[P${i + 1}] ${s.title}\nURL: ${s.url}\n${s.text.slice(0, 750)}`
                ),
              ].join("\n\n")
            : "=== PROFILS PEOPLE : aucun ===",
          "",
          web.length
            ? [
                "=== WEB / NOMINATIONS / CAMPAGNES ===",
                ...web.map(
                  (s, i) =>
                    `[W${i + 1}] ${s.title}\nURL: ${s.url}\n${s.text.slice(0, 650)}`
                ),
              ].join("\n\n")
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : "";

    console.log(
      `[carto-ai] exa grounding people=${people.length} web=${web.length}`
    );
    return { ok: true, error: null, snippets, contextBlock };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur Exa",
      snippets: [],
      contextBlock: "",
    };
  }
}
