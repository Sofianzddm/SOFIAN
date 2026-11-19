/**
 * Parse réponse ChatGPT VPS roster → ranking priorité + notes.
 */

import { stripEndMarker } from "@/lib/carto-chat-vps/end-marker";

export type OutreachRosterPriorityLevel = "high" | "medium" | "skip";

export type OutreachRosterPriorityItem = {
  rank: number;
  talentId: string;
  name: string;
  priority: OutreachRosterPriorityLevel;
  why: string;
};

export type OutreachRosterVpsRecap = {
  notes: string;
  brandAnalysis: string;
  selectionLogic: string;
  alerts: string[];
};

export type ParsedOutreachRosterVps = {
  items: OutreachRosterPriorityItem[];
  notes: string;
  recap: OutreachRosterVpsRecap;
  raw: string;
};

function parsePriorityLevel(raw: string): OutreachRosterPriorityLevel {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (t.startsWith("high") || t === "haute" || t === "h") return "high";
  if (t.startsWith("skip") || t === "non" || t === "no") return "skip";
  if (t.startsWith("med") || t === "moyenne" || t === "m") return "medium";
  return "medium";
}

/** Ids réels (cuid/uuid-ish) — refuse placeholders du template. */
function isRealTalentId(id: string): boolean {
  const t = String(id || "").trim();
  if (t.length < 8) return false;
  if (/[<>{}[\]()]/.test(t)) return false;
  if (/^(id|exact|nom|name|xxx|clx+)/i.test(t)) return false;
  if (!/^[a-z0-9_-]+$/i.test(t)) return false;
  return true;
}

function isNoiseAlert(line: string): boolean {
  const t = String(line || "").trim();
  if (!t) return true;
  if (/^aucune\b/i.test(t)) return true;
  if (/une ligne par alerte/i.test(t)) return true;
  if (/Si alerte réelle|sinon exactement le mot aucune/i.test(t)) return true;
  if (/CODE DE FIN|GLOWUP_CART_DONE|caractère pour caractère/i.test(t))
    return true;
  if (/ne pas ignorer|UNIQUE à cette recherche|cartographie/i.test(t))
    return true;
  if (/^Règles?\s*:/i.test(t)) return true;
  if (/^Puis le CODE/i.test(t)) return true;
  if (/FORMAT DE RÉPONSE|PRIORITY\s*:/i.test(t)) return true;
  if (/N'invente PAS|N'utilise PAS|Rien après cette ligne/i.test(t))
    return true;
  if (/^\\?#{1,3}\s*CODE/i.test(t)) return true;
  return false;
}

/** Chat a parfois recopié le prompt entier — on refuse. */
export function looksLikePromptEcho(text: string): boolean {
  const t = String(text || "");
  const hits = [
    /Tu es head of casting/i.test(t),
    /FORMAT DE RÉPONSE \(STRICT\)/i.test(t),
    /ROSTER GLOW UP/i.test(t),
    /INTERDIT de recopier/i.test(t) === false &&
      /Lis \*\*tout le roster\*\*/i.test(t),
  ].filter(Boolean).length;
  // Echo typique : recommence comme le system/user brief
  if (/^Tu es head of casting/i.test(t.trim())) return true;
  if (
    /^MARQUE À ANALYSER\s*:/i.test(t.trim()) &&
    /Tu es head of casting/i.test(t) &&
    !/\bpriority\s*=\s*(high|medium|skip)\b/i.test(t)
  ) {
    return true;
  }
  if (hits >= 2 && !/\bpriority\s*=\s*(high|medium|skip)\b/i.test(t)) {
    return true;
  }
  return false;
}

function parsePriorityBlock(block: string): OutreachRosterPriorityItem[] {
  const items: OutreachRosterPriorityItem[] = [];
  const lines = String(block || "").split(/\n/);
  for (const line of lines) {
    const t = line.replace(/^\\/, "").trim();
    if (!t || /^NOTES\s*:/i.test(t) || /^ALERTES?\s*:/i.test(t)) continue;
    if (!/talentId\s*=/i.test(t)) continue;
    // Exige priority= — sinon on parse le roster CRM du prompt (echo)
    // « 1. talentId=xxx | Prénom Nom » sans priority/why.
    if (!/\bpriority\s*=/i.test(t)) continue;

    const idMatch = t.match(/talentId\s*=\s*([^\s|]+)/i);
    const nameMatch = t.match(
      /\bname\s*=\s*([^|]+?)(?=\s*\|\s*priority\s*=|\s*$)/i
    );
    const prioMatch = t.match(/\bpriority\s*=\s*([^\s|]+)/i);
    const whyMatch = t.match(/\bwhy\s*=\s*(.+)$/i);
    const talentId = (idMatch?.[1] || "")
      .trim()
      .replace(/^\\|\\$/g, "");
    if (!isRealTalentId(talentId)) continue;

    const why = (whyMatch?.[1] || "").trim();
    // Refuse lignes d'exemple encore template
    if (/^…|\.\.\.$|^<$/.test(why) && why.length < 8) continue;

    const rankMatch = t.match(/^(\d+)\s*[.)]/);
    items.push({
      rank: rankMatch ? Number(rankMatch[1]) : items.length + 1,
      talentId,
      name: (nameMatch?.[1] || "")
        .trim()
        .replace(/^Prénom Nom$/i, ""),
      priority: parsePriorityLevel(prioMatch?.[1] || "medium"),
      why,
    });
  }
  return items.sort((a, b) => a.rank - b.rank);
}

function parseNotesBlock(notesRaw: string): OutreachRosterVpsRecap {
  const full = String(notesRaw || "").trim();
  // Couper avant le bloc CODE DE FIN s'il a fuité dans NOTES
  const cut = full.split(
    /\n\s*(?:Puis le CODE|#{1,3}\s*CODE DE FIN|À la TOUTE FIN)/i
  )[0];
  const alertsSplit = cut.split(/\bALERTES?\s*:/i);
  const notesPart = (alertsSplit[0] || "").trim();
  const alertsPart = (alertsSplit[1] || "").trim();

  const alerts: string[] = [];
  for (const line of alertsPart.split(/\n/)) {
    const t = line
      .replace(/^[-*•]\s*/, "")
      .replace(/^⚠\s*/, "")
      .replace(/^\\/, "")
      .trim();
    if (isNoiseAlert(t)) continue;
    alerts.push(t);
  }

  const pickSection = (...labels: string[]) => {
    for (const label of labels) {
      const re = new RegExp(
        `(?:^|\\n)\\s*[-*•]?\\s*${label}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*[-*•]?\\s*(?:Analyse|Logique|ALERT)|$)`,
        "i"
      );
      const m = notesPart.match(re);
      if (m?.[1]?.trim()) {
        const v = m[1].trim();
        if (/^2–5 lignes|^2-5 lignes|^\.\.\./i.test(v)) return "";
        return v;
      }
    }
    return "";
  };

  return {
    notes: notesPart,
    brandAnalysis:
      pickSection("Analyse marque[^\\n:]*", "Analyse de la marque") || "",
    selectionLogic:
      pickSection("Logique de sélection[^\\n:]*", "Logique") || "",
    alerts,
  };
}

/**
 * Top priorités à auto-sélectionner : high puis medium, défaut 5, plafond 8.
 */
export function pickAutoSelectTalentIds(
  items: OutreachRosterPriorityItem[],
  opts?: { target?: number; max?: number }
): string[] {
  const target = opts?.target ?? 5;
  const max = opts?.max ?? 8;
  const high = items.filter((i) => i.priority === "high").map((i) => i.talentId);
  const medium = items
    .filter((i) => i.priority === "medium")
    .map((i) => i.talentId);
  const ordered = [...high, ...medium];
  const uniq: string[] = [];
  for (const id of ordered) {
    if (!id || uniq.includes(id)) continue;
    uniq.push(id);
    if (uniq.length >= max) break;
  }
  if (uniq.length <= target) return uniq;
  const highCount = high.filter((id) => uniq.includes(id)).length;
  if (highCount >= target) return uniq.slice(0, Math.min(max, uniq.length));
  return uniq.slice(0, Math.min(target, uniq.length));
}

export function parseOutreachRosterVpsAnswer(
  rawAnswer: string,
  endMarker?: string | null
): ParsedOutreachRosterVps {
  const raw = stripEndMarker(String(rawAnswer || ""), endMarker).trim();
  if (!raw) throw new Error("Réponse Chat vide");

  if (looksLikePromptEcho(raw)) {
    throw new Error(
      "Chat a recopié le brief au lieu d’analyser — relance l’analyse roster"
    );
  }

  const priorityMatch = raw.match(
    /\bPRIORITY\s*:\s*([\s\S]*?)(?=\n\s*NOTES\s*:|$)/i
  );
  const notesMatch = raw.match(/\bNOTES\s*:\s*([\s\S]*)$/i);

  const priorityBlock = (priorityMatch?.[1] || "").trim();
  const notes = (notesMatch?.[1] || "").trim();
  let items = parsePriorityBlock(priorityBlock);

  if (items.length === 0) {
    items = parsePriorityBlock(raw);
  }
  if (items.length === 0) {
    throw new Error("Aucun talent priorisé dans la réponse Chat");
  }

  const withWhy = items.filter((i) => (i.why || "").trim().length >= 12);
  const highCount = items.filter((i) => i.priority === "high").length;
  // Echo roster CRM : 30 ids medium sans why — on refuse
  if (withWhy.length === 0 && highCount === 0) {
    throw new Error(
      "Réponse roster invalide (pas de why / high) — relance l’analyse"
    );
  }

  const recap = parseNotesBlock(notes);
  return { items, notes, recap, raw };
}
