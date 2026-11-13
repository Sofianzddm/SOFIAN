import { contactPersonKey } from "@/lib/contact-person-key";
import { CARTO_AI_MAX_CONTACTS } from "@/lib/carto-ai/constants";
import type {
  CartoAiContactCandidate,
  CartoAiMarche,
  CartoAiSource,
} from "@/lib/carto-ai/types";

function marcheRank(m: CartoAiMarche | undefined): number {
  if (m === "FR") return 0;
  if (m === "EU") return 1;
  return 2;
}

function normLinkedin(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname.replace(/\/$/, "").toLowerCase();
    return path || null;
  } catch {
    return url.trim().toLowerCase();
  }
}

function priorityRank(p: string | null): number {
  const s = (p || "").toUpperCase();
  if (s.includes("P1")) return 0;
  if (s.includes("P2")) return 1;
  if (s.includes("P3")) return 2;
  return 3;
}

/** Ranking : ChatGPT fort Surtout s'il a un LinkedIn ; multi-sources > hallucination mono-source. */
function sourceScore(
  c: Pick<CartoAiContactCandidate, "sources" | "linkedinUrl" | "priorite" | "poste">
): number {
  const sources = c.sources;
  let score = 0;
  if (sources.includes("chatgpt")) {
    score += c.linkedinUrl ? 80 : 35; // sans LinkedIn, ChatGPT ne domine plus
  }
  if (sources.includes("claude")) score += 28;
  if (sources.includes("xai")) score += 30; // web search souvent plus fiable
  if (sources.includes("apollo")) score += 12;
  score += Math.max(0, sources.length - 1) * 18; // accord multi-IA
  if (/\b(advocacy|influence manager|influencer marketing)\b/i.test(c.poste || "")) {
    score += 25;
  }
  if (/\b(responsable de boutique|store manager)\b/i.test(c.poste || "")) {
    score -= 100;
  }
  return score;
}

function preferChatgptField(
  chatgptVal: string | null,
  otherVal: string | null,
  preferLonger = false
): string | null {
  if (chatgptVal) return chatgptVal;
  if (!otherVal) return null;
  if (preferLonger) return otherVal;
  return otherVal;
}

function mergeField(
  a: string | null,
  b: string | null,
  preferLonger = false
): string | null {
  if (!a) return b;
  if (!b) return a;
  if (preferLonger && b.length > a.length) return b;
  return a;
}

function candidateKey(c: CartoAiContactCandidate): string {
  const li = normLinkedin(c.linkedinUrl);
  if (li) return `li:${li}`;
  const name = contactPersonKey(c.prenom, c.nom);
  if (name) return `n:${name}`;
  return `x:${(c.nom || "").toLowerCase()}:${(c.poste || "").toLowerCase()}`;
}

export function mergeCartoCandidates(
  batches: CartoAiContactCandidate[][]
): CartoAiContactCandidate[] {
  const map = new Map<string, CartoAiContactCandidate>();

  for (const batch of batches) {
    for (const c of batch) {
      const key = candidateKey(c);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          ...c,
          sources: [...new Set(c.sources)] as CartoAiSource[],
        });
        continue;
      }

      const incomingIsChatgpt = c.sources.includes("chatgpt");
      const prevIsChatgpt = prev.sources.includes("chatgpt");
      const sources = [
        ...new Set([...prev.sources, ...c.sources]),
      ] as CartoAiSource[];

      // Priorité / champs : ChatGPT gagne en cas de conflit.
      let priorite = prev.priorite;
      if (incomingIsChatgpt && c.priorite) priorite = c.priorite;
      else if (
        !prevIsChatgpt &&
        priorityRank(c.priorite) < priorityRank(prev.priorite)
      ) {
        priorite = c.priorite;
      }

      // France > Europe > International
      const marche =
        marcheRank(c.marche) < marcheRank(prev.marche) ? c.marche : prev.marche;

      const merged: CartoAiContactCandidate = incomingIsChatgpt
        ? {
            marche,
            priorite,
            prenom: preferChatgptField(c.prenom, prev.prenom) || prev.prenom,
            nom: preferChatgptField(c.nom, prev.nom) || prev.nom,
            poste: preferChatgptField(c.poste, prev.poste, true),
            perimetre: preferChatgptField(c.perimetre, prev.perimetre, true),
            localisation: preferChatgptField(
              c.localisation,
              prev.localisation
            ),
            linkedinUrl: preferChatgptField(c.linkedinUrl, prev.linkedinUrl),
            note: preferChatgptField(c.note, prev.note, true),
            sources,
          }
        : {
            marche,
            priorite,
            prenom: mergeField(prev.prenom, c.prenom),
            nom: mergeField(prev.nom, c.nom) || prev.nom,
            poste: mergeField(prev.poste, c.poste, true),
            perimetre: mergeField(prev.perimetre, c.perimetre, true),
            localisation: mergeField(prev.localisation, c.localisation),
            linkedinUrl: mergeField(prev.linkedinUrl, c.linkedinUrl),
            note: mergeField(prev.note, c.note, true),
            sources,
          };

      map.set(key, merged);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => {
      const byMarche = marcheRank(a.marche) - marcheRank(b.marche);
      if (byMarche !== 0) return byMarche;
      const bySource = sourceScore(b) - sourceScore(a);
      if (bySource !== 0) return bySource;
      return priorityRank(a.priorite) - priorityRank(b.priorite);
    })
    .slice(0, CARTO_AI_MAX_CONTACTS);
}
