/**
 * Parse la réponse ChatGPT « historique Leyna » (tour 1) → ops UI + alertes rouges.
 */

import { stripEndMarker } from "@/lib/carto-chat-vps/end-marker";

export type ChatLeynaOpsBrief = {
  relationStatus: string;
  recommendedAction: string;
  angle: string;
  writeInstructions: string;
  excludeTalents: string[];
  alreadyPitchedTalents: string[];
  doNot: string[];
  /** Alertes urgentes Gmail only — bandeau rouge UI. */
  alerts: string[];
  /** tu | vous | null */
  tone: "tu" | "vous" | null;
  /** A cold / B déjà échangé / C marque connue contact neuf */
  branch: "A" | "B" | "C" | null;
  hasExchange: boolean | null;
  resume: string;
  bannerLabel: string;
  promptBlockFr: string;
};

function grab(label: string, text: string): string {
  const re = new RegExp(
    `^${label}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÀÈÙÇ_][A-ZÁÉÍÓÚÂÊÎÔÛÄËÏÖÜÀÈÙÇ_0-9]*\\s*:|$)`,
    "im"
  );
  const m = text.match(re);
  return String(m?.[1] || "")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

function linesToList(block: string): string[] {
  return String(block || "")
    .split(/\n|;/)
    .map((l) =>
      l
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim()
    )
    .filter(
      (l) =>
        l &&
        !/^aucune\b/i.test(l) &&
        !/^aucun\b/i.test(l) &&
        !/^si alerte/i.test(l) &&
        !/^interdit d.inventer/i.test(l) &&
        !/GLOWUP_CART_DONE/i.test(l) &&
        !/CODE DE FIN/i.test(l)
    );
}

function parseTone(raw: string): "tu" | "vous" | null {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (/\btu\b|tutoi/.test(t) && !/\bvous\b|vouvoi/.test(t)) return "tu";
  if (/\bvous\b|vouvoi/.test(t)) return "vous";
  if (/^tu$/.test(t)) return "tu";
  if (/^vous$/.test(t)) return "vous";
  return null;
}

function parseBranch(raw: string): "A" | "B" | "C" | null {
  const t = String(raw || "")
    .trim()
    .toUpperCase();
  if (!t) return null;
  const m = t.match(/\b([ABC])\b/);
  if (m) return m[1] as "A" | "B" | "C";
  if (/COLD|AUCUN/.test(t)) return "A";
  if (/D[EÉ]J[AÀ]\s*ÉCHANG|FIL|WARM|SUITE/.test(t)) return "B";
  if (/MARQUE\s*CONNUE|CONTACT\s*NEUF|AGENCE/.test(t)) return "C";
  return null;
}

export function parseLeynaBriefFromChat(raw: string): ChatLeynaOpsBrief | null {
  const text = stripEndMarker(String(raw || "")).trim();
  if (text.length < 40) return null;
  if (
    !/STATUT\s*:/i.test(text) &&
    !/A_FAIRE\s*:/i.test(text) &&
    !/ALERTES?\s*:/i.test(text)
  ) {
    return null;
  }

  const relationStatus = grab("STATUT", text).slice(0, 400);
  const recommendedAction = grab("A_FAIRE", text).slice(0, 500);
  const angle = grab("ANGLE", text).slice(0, 600);
  const resume = grab("RESUME", text).slice(0, 4000);
  const exclusions = grab("EXCLUSIONS", text);
  const interdits = grab("INTERDITS", text);
  const consignes = grab("CONSIGNES", text).slice(0, 2500);
  const alertsBlock = grab("ALERTES", text) || grab("ALERTE", text);
  const tone = parseTone(grab("TONE", text) || grab("TON", text));
  const branch =
    parseBranch(grab("BRANCHE", text)) ||
    parseBranch(grab("BRANCH", text));
  const echangeRaw = grab("ECHANGE", text).toLowerCase();
  const hasExchange = /oui|yes|true|échange|echange/.test(echangeRaw)
    ? true
    : /non|no|false|aucun/.test(echangeRaw)
      ? false
      : null;

  const excludeTalents = linesToList(exclusions).slice(0, 30);
  const doNot = linesToList(interdits).slice(0, 12);
  const alerts = linesToList(alertsBlock).slice(0, 8);

  if (
    !relationStatus &&
    !recommendedAction &&
    !resume &&
    alerts.length === 0
  ) {
    return null;
  }

  const bannerLabel = [
    "Serveur · Historique Leyna",
    branch ? `branche ${branch}` : null,
    tone === "tu" ? "tutoiement" : tone === "vous" ? "vouvoiement" : null,
    relationStatus || null,
    recommendedAction ? recommendedAction.slice(0, 90) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const promptBlockFr = [
    "═══ BRIEF OPS LEYNA (serveur · Gmail) ═══",
    relationStatus ? `Statut relation : ${relationStatus}` : null,
    branch
      ? `Branche mail : ${branch}${
          branch === "A"
            ? " (cold)"
            : branch === "B"
              ? " (déjà échangé)"
              : " (marque connue, contact neuf)"
        }`
      : null,
    recommendedAction ? `Action recommandée : ${recommendedAction}` : null,
    tone ? `Ton : ${tone === "tu" ? "tutoiement" : "vouvoiement"}` : null,
    angle ? `Angle de suite : ${angle}` : null,
    resume ? `Résumé :\n${resume}` : null,
    excludeTalents.length
      ? `Talents à EXCLURE : ${excludeTalents.join(", ")}`
      : null,
    doNot.length
      ? `INTERDITS :\n${doNot.map((d) => `- ${d}`).join("\n")}`
      : null,
    alerts.length
      ? `ALERTES Gmail :\n${alerts.map((a) => `- ${a}`).join("\n")}`
      : null,
    consignes ? `Mode d’emploi rédaction :\n${consignes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    relationStatus,
    recommendedAction,
    angle,
    writeInstructions: consignes,
    excludeTalents,
    alreadyPitchedTalents: [],
    doNot,
    alerts,
    tone,
    branch,
    hasExchange,
    resume,
    bannerLabel,
    promptBlockFr,
  };
}
