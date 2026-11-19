/**
 * Parse les tours intermédiaires Chat → payload UI (chatVps + shortlist).
 */

import { stripEndMarker } from "@/lib/carto-chat-vps/end-marker";

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameHitsInNorm(regionNorm: string, name: string): boolean {
  const nn = normName(name);
  if (nn.length < 3) return false;
  if (regionNorm.includes(nn)) return true;
  const parts = nn.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const lastStem = parts[parts.length - 1].slice(
      0,
      Math.min(5, parts[parts.length - 1].length)
    );
    if (
      first.length >= 3 &&
      lastStem.length >= 3 &&
      regionNorm.includes(first) &&
      regionNorm.includes(lastStem)
    ) {
      return true;
    }
  }
  return false;
}

/** Extrait les noms connus présents dans un texte (shortlist tour 2). */
export function matchTalentNamesInText(
  text: string,
  knownNames: string[]
): string[] {
  const raw = stripEndMarker(String(text || ""));
  if (!raw || knownNames.length === 0) return [];

  const lower = raw.toLowerCase();
  const shortIdx = lower.search(
    /shortlist|s[ée]lection(\s+finale)?|qui (pourrait )?collent?|je (te )?cite|talents?\s+retenus?|entre\s+[38]|recommand|meilleurs?\s+fits?|voici\s+(ceux|les)|noms?\s*:|retenir/i
  );
  const region =
    shortIdx >= 0
      ? raw.slice(shortIdx)
      : raw.slice(-Math.floor(raw.length * 0.55));
  const regionNorm = normName(region);
  const fullNorm = normName(raw);

  const hits: string[] = [];
  for (const name of knownNames) {
    const n = String(name || "").trim();
    if (!n) continue;
    if (nameHitsInNorm(regionNorm, n) || nameHitsInNorm(fullNorm, n)) {
      // Si on a une zone shortlist, prioriser celle-ci ; sinon full OK
      if (shortIdx >= 0) {
        if (nameHitsInNorm(regionNorm, n)) hits.push(n);
      } else if (nameHitsInNorm(regionNorm, n)) {
        hits.push(n);
      }
    }
  }

  // Fallback : prénom unique dans le roster (ex. « Mélissa » seul).
  if (hits.length === 0) {
    const firstCounts = new Map<string, string[]>();
    for (const name of knownNames) {
      const first = normName(name).split(" ")[0] || "";
      if (first.length < 4) continue;
      const arr = firstCounts.get(first) || [];
      arr.push(name);
      firstCounts.set(first, arr);
    }
    for (const [first, names] of firstCounts) {
      if (names.length !== 1) continue;
      if (regionNorm.includes(first) || fullNorm.includes(first)) {
        hits.push(names[0]);
      }
    }
  }

  // Cap 8 — prompt tour 2
  return Array.from(new Set(hits)).slice(0, 8);
}

export function buildChatVpsProgress(opts: {
  brandName: string;
  stepAnswers: string[];
  knownTalentNames: string[];
  knownTalents?: Array<{ talentId?: string; name: string }>;
  endMarker?: string;
}): {
  engine: string;
  brandAnalysis: string;
  talentWhySummary: string;
  selectedTalentNames: string[];
  selectedTalentIds: string[];
  pipelineStep: number;
  notes: string;
  endMarker?: string;
} {
  const steps = opts.stepAnswers.map((a) => stripEndMarker(a || "").trim());
  const filled = steps.filter(Boolean);
  // Mode actuel = 2 tours Chat : Leyna (0) + mail (1).
  // Ancien 3 tours : marque / fit / mail.
  const leynaMail = filled.length <= 2 && /STATUT\s*:|HISTORIQUE LEYNA|Serveur · HISTORIQUE/i.test(steps[0] || "");
  const brandAnalysis = leynaMail ? "" : (steps[0] || "").slice(0, 8000);
  const talentWhySummary = leynaMail ? "" : (steps[1] || "").slice(0, 8000);
  const shortlistSource = leynaMail ? "" : steps[1] || "";
  const selectedTalentNames =
    shortlistSource && opts.knownTalentNames.length
      ? matchTalentNamesInText(shortlistSource, opts.knownTalentNames)
      : [];

  const selectedTalentIds: string[] = [];
  if (opts.knownTalents?.length && selectedTalentNames.length) {
    for (const name of selectedTalentNames) {
      const nn = normName(name);
      const hit = opts.knownTalents.find(
        (t) => normName(t.name) === nn || normName(t.name).includes(nn)
      );
      if (hit?.talentId) selectedTalentIds.push(hit.talentId);
    }
  }

  const pipelineStep = filled.length;
  const notesParts = leynaMail
    ? [
        pipelineStep >= 1 ? "Serveur · Historique Leyna: noté" : null,
        pipelineStep >= 2 ? "Serveur · Mail: OK" : "Serveur · Mail…",
      ].filter(Boolean)
    : [
        pipelineStep >= 1 ? "Tour 1 marque: OK" : null,
        pipelineStep >= 2
          ? `Tour 2 fit: OK${
              selectedTalentNames.length
                ? ` · shortlist ${selectedTalentNames.join(", ")}`
                : ""
            }`
          : null,
        pipelineStep >= 3 ? "Tour 3 mail: en cours / OK" : null,
      ].filter(Boolean);

  return {
    engine: leynaMail ? "chatgpt-vps-leyna-mail" : "chatgpt-vps-high-3turn",
    brandAnalysis,
    talentWhySummary,
    selectedTalentNames,
    selectedTalentIds: Array.from(new Set(selectedTalentIds)),
    pipelineStep,
    notes: notesParts.join(" · "),
    endMarker: opts.endMarker,
  };
}
