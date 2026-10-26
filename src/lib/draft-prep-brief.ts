/**
 * Brief pré-rédaction partagé (composer individuel + lots batch).
 * Une seule logique pour : destinataire, marque ciblée, historique Leyna,
 * angle, sources datées, manques, et signal « négociation → revue ».
 */

export type ResearchStatus = "ok" | "empty" | "failed" | "skipped";

export type LeynaThreadStatus = "exchange" | "sent_no_reply" | "none" | "failed";

export type DraftPrepSource = {
  kind: "leyna" | "brand_research" | "talent_research" | "crm" | "manual";
  label: string;
  status: ResearchStatus;
  /** ISO date or human date when known. */
  asOf?: string | null;
  /** Verifiable pointer (thread subject, URL, email). */
  ref?: string | null;
};

export type DraftPrepRecipient = {
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

export type DraftPrepLeynaHit = {
  email: string;
  subject?: string | null;
  lastExchangeAt?: string | null;
  status: "exchange" | "sent_no_reply";
  notes?: string;
  alerts?: string[];
  messageCount?: number;
  /** Marque à laquelle le fil a été rattaché (pitchBrand). */
  matchedBrand?: string | null;
};

export type DraftPrepBrief = {
  version: 1;
  builtAt: string;
  /** Destinataire(s) retenus pour ce brouillon. */
  recipients: DraftPrepRecipient[];
  recipientsLabel: string;
  /** Marque argumentaire (ex. Kiko). */
  pitchBrand: string;
  /** Agence / company si distincte (ex. Nice Work). */
  agencyName: string | null;
  /** Dernier fil pertinent (1 ligne). */
  lastExchangeSummary: string;
  lastExchangeAt: string | null;
  leynaStatus: LeynaThreadStatus;
  hasExchange: boolean;
  /** true = ne pas auto-prospecter : revue humaine requise. */
  needsNegotiationReview: boolean;
  negotiationReviewReason: string | null;
  proposedAngle: string;
  sources: DraftPrepSource[];
  missing: string[];
  /** Texte compact pour UI + injection prompt. */
  summaryText: string;
  promptBlockFr: string;
  /** Contexte Leyna à réinjecter (évite re-scan froid). */
  leynaPromptBlockFr?: string;
  leynaPromptBlockEn?: string;
  leynaTone?: "tu" | "vous" | null;
  leynaFetchedAt?: string | null;
  cardError?: string | null;
};

const NEGOTIATION_RE =
  /\b(n[ée]gociation|en n[ée]go|deal en cours|contrat en cours|devis (en )?cours|proposition (en )?cours|budget (en )?discussion|on finalise|en discussion|call (de )?n[ée]go|offre (en )?cours|shortlist|en [ée]tude active)\b/i;

const REFUSAL_CLOSED_RE =
  /\b(refus d[ée]finitif|ne plus (jamais )?contacter|blacklist|stop contact)\b/i;

export function formatRecipientsLabel(recipients: DraftPrepRecipient[]): string {
  const named = recipients
    .map((r) => {
      const name = [r.firstname, r.lastname].filter(Boolean).join(" ").trim();
      if (name && r.email) return `${name} <${r.email}>`;
      if (r.email) return r.email;
      if (name) return name;
      return "";
    })
    .filter(Boolean);
  if (named.length === 0) return "À compléter (aucun contact email)";
  if (named.length === 1) return named[0]!;
  return `${named[0]} (+${named.length - 1})`;
}

export function detectNegotiationReview(args: {
  hits: DraftPrepLeynaHit[];
  alerts?: string[];
  missionStage?: string | null;
  missionReplied?: boolean;
}): { needsReview: boolean; reason: string | null } {
  if (args.missionStage === "IN_NEGOTIATION") {
    return {
      needsReview: true,
      reason: "Carte déjà en négociation dans le pipeline — ne pas relancer en prospection auto.",
    };
  }
  if (args.missionReplied) {
    return {
      needsReview: true,
      reason: "Réponse client déjà signalée sur la carte — revue avant nouvelle prospection.",
    };
  }
  const blob = [
    ...(args.alerts || []),
    ...args.hits.flatMap((h) => [h.notes || "", ...(h.alerts || [])]),
  ].join("\n");
  if (REFUSAL_CLOSED_RE.test(blob)) {
    return {
      needsReview: true,
      reason: "Signal stop / refus définitif dans l’historique Leyna — revue obligatoire.",
    };
  }
  const exchangeHits = args.hits.filter((h) => h.status === "exchange");
  for (const h of exchangeHits) {
    if (NEGOTIATION_RE.test(h.notes || "")) {
      return {
        needsReview: true,
        reason: `Négociation / discussion en cours détectée (fil « ${h.subject || h.email} ») — revue avant nouvelle prospection.`,
      };
    }
  }
  return { needsReview: false, reason: null };
}

function lastExchangeLine(hits: DraftPrepLeynaHit[]): {
  summary: string;
  at: string | null;
  status: LeynaThreadStatus;
} {
  if (hits.length === 0) {
    return { summary: "Aucun historique Leyna trouvé pour cette marque.", at: null, status: "none" };
  }
  const sorted = [...hits].sort((a, b) => {
    const ea = a.status === "exchange" ? 1 : 0;
    const eb = b.status === "exchange" ? 1 : 0;
    if (eb !== ea) return eb - ea;
    const ta = a.lastExchangeAt ? new Date(a.lastExchangeAt).getTime() : 0;
    const tb = b.lastExchangeAt ? new Date(b.lastExchangeAt).getTime() : 0;
    return tb - ta;
  });
  const top = sorted[0]!;
  const when = top.lastExchangeAt
    ? new Date(top.lastExchangeAt).toLocaleDateString("fr-FR")
    : "date inconnue";
  const kind = top.status === "exchange" ? "Échange" : "Envoi sans réponse";
  const subj = top.subject ? ` « ${top.subject} »` : "";
  const note = (top.notes || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    summary: `${kind} du ${when}${subj}${note ? ` — ${note}` : ""}`,
    at: top.lastExchangeAt ?? null,
    status: top.status,
  };
}

function proposeAngle(args: {
  pitchBrand: string;
  talentName?: string | null;
  strategyAngle?: string | null;
  leynaStatus: LeynaThreadStatus;
  needsNegotiationReview: boolean;
  talentWhyRelevant?: string | null;
}): string {
  if (args.needsNegotiationReview) {
    return "Revue humaine requise — ne pas pitcher une nouvelle prospection tant que la négociation / réponse en cours n’est pas tranchée.";
  }
  const talent = (args.talentName || "ce talent").trim();
  const brand = args.pitchBrand || "la marque";
  if (args.strategyAngle?.trim()) {
    return args.strategyAngle.trim().slice(0, 400);
  }
  if (args.leynaStatus === "exchange") {
    return `Suite à l’échange passé avec ${brand} : proposer ${talent} comme suite ciblée (sans rediscovery).${
      args.talentWhyRelevant ? ` Fit : ${args.talentWhyRelevant.slice(0, 180)}` : ""
    }`;
  }
  if (args.leynaStatus === "sent_no_reply") {
    return `Relance factuelle après envoi(s) sans réponse à ${brand} : nouvel angle avec ${talent}, sans inventer de relation.${
      args.talentWhyRelevant ? ` Fit : ${args.talentWhyRelevant.slice(0, 180)}` : ""
    }`;
  }
  return `Premier contact sourcé vers ${brand} pour ${talent}.${
    args.talentWhyRelevant ? ` Fit : ${args.talentWhyRelevant.slice(0, 200)}` : " Fit à confirmer via analyse talent."
  }`;
}

export type BuildDraftPrepBriefInput = {
  recipients: DraftPrepRecipient[];
  pitchBrand: string;
  agencyName?: string | null;
  talentName?: string | null;
  strategyAngle?: string | null;
  talentWhyRelevant?: string | null;
  leyna: {
    scanStatus: ResearchStatus;
    hasExchange: boolean;
    tone?: "tu" | "vous" | null;
    hits: DraftPrepLeynaHit[];
    alerts?: string[];
    promptBlockFr?: string;
    promptBlockEn?: string;
    fetchedAt?: string | null;
    bannerLabel?: string | null;
  };
  brandResearchStatus: ResearchStatus;
  brandResearchAsOf?: string | null;
  talentResearchStatus: ResearchStatus;
  talentResearchAsOf?: string | null;
  missionStage?: string | null;
  missionReplied?: boolean;
  cardError?: string | null;
  extraMissing?: string[];
};

/**
 * Construit le brief unique consommé par composer, batch et generate-email.
 */
export function buildDraftPrepBrief(input: BuildDraftPrepBriefInput): DraftPrepBrief {
  const pitchBrand = String(input.pitchBrand || "").trim() || "la marque";
  const agencyRaw = String(input.agencyName || "").trim();
  const agencyName =
    agencyRaw && agencyRaw.toLowerCase() !== pitchBrand.toLowerCase() ? agencyRaw : null;

  const recipients = Array.isArray(input.recipients) ? input.recipients : [];
  const recipientsLabel = formatRecipientsLabel(recipients);

  let leynaStatus: LeynaThreadStatus = "none";
  if (input.leyna.scanStatus === "failed") {
    leynaStatus = "failed";
  } else if (input.leyna.hits.some((h) => h.status === "exchange")) {
    leynaStatus = "exchange";
  } else if (input.leyna.hits.some((h) => h.status === "sent_no_reply")) {
    leynaStatus = "sent_no_reply";
  }

  const { summary: lastExchangeSummary, at: lastExchangeAt } =
    leynaStatus === "failed"
      ? {
          summary: "Scan Leyna échoué — historique non fiable, ne pas inventer.",
          at: null as string | null,
        }
      : lastExchangeLine(input.leyna.hits);

  const nego = detectNegotiationReview({
    hits: input.leyna.hits,
    alerts: input.leyna.alerts,
    missionStage: input.missionStage,
    missionReplied: input.missionReplied,
  });

  const proposedAngle = proposeAngle({
    pitchBrand,
    talentName: input.talentName,
    strategyAngle: input.strategyAngle,
    leynaStatus,
    needsNegotiationReview: nego.needsReview,
    talentWhyRelevant: input.talentWhyRelevant,
  });

  const sources: DraftPrepSource[] = [
    {
      kind: "leyna",
      label:
        leynaStatus === "failed"
          ? "Boîte Leyna (échec scan)"
          : leynaStatus === "none"
            ? "Boîte Leyna (aucun fil)"
            : input.leyna.bannerLabel || "Boîte Leyna",
      status:
        input.leyna.scanStatus === "failed"
          ? "failed"
          : input.leyna.hits.length > 0
            ? "ok"
            : input.leyna.scanStatus === "empty"
              ? "empty"
              : "ok",
      asOf: input.leyna.fetchedAt || lastExchangeAt,
      ref: input.leyna.hits[0]?.subject || input.leyna.hits[0]?.email || null,
    },
    {
      kind: "brand_research",
      label: `Analyse marque « ${pitchBrand} »`,
      status: input.brandResearchStatus,
      asOf: input.brandResearchAsOf || null,
      ref: pitchBrand,
    },
    {
      kind: "talent_research",
      label: input.talentName
        ? `Analyse talent « ${input.talentName} » × ${pitchBrand}`
        : `Analyse talent × ${pitchBrand}`,
      status: input.talentResearchStatus,
      asOf: input.talentResearchAsOf || null,
      ref: input.talentName || null,
    },
  ];

  const missing: string[] = [...(input.extraMissing || [])];
  if (recipients.every((r) => !String(r.email || "").includes("@"))) {
    missing.push("Aucun email destinataire — envoi impossible tant que le contact n’est pas ajouté.");
  }
  if (leynaStatus === "failed") {
    missing.push("Historique Leyna non récupéré (échec) — relancer le scan avant rédaction.");
  }
  if (input.brandResearchStatus === "failed") {
    missing.push("Analyse marque échouée — ne pas inventer d’actualités.");
  } else if (input.brandResearchStatus === "empty") {
    missing.push("Analyse marque vide — aucune actualité sourcée.");
  }
  if (input.talentResearchStatus === "failed") {
    missing.push("Analyse talent échouée — ne pas inventer de fit.");
  } else if (input.talentResearchStatus === "empty") {
    missing.push("Analyse talent manquante.");
  }
  if (agencyName && !pitchBrand) {
    missing.push("Marque pitchée non choisie pour cette agence.");
  }
  if (nego.needsReview) {
    missing.push("Revue négociation requise avant toute nouvelle prospection.");
  }

  const builtAt = new Date().toISOString();
  const summaryText = [
    `Destinataire: ${recipientsLabel}`,
    `Marque ciblée: ${pitchBrand}${agencyName ? ` · Agence: ${agencyName}` : ""}`,
    `Dernier échange: ${lastExchangeSummary}`,
    `Angle: ${proposedAngle}`,
    `Sources: ${sources.map((s) => `${s.label} [${s.status}${s.asOf ? ` @ ${s.asOf.slice(0, 10)}` : ""}]`).join(" · ")}`,
    missing.length ? `Manques: ${missing.join(" | ")}` : "Manques: —",
    nego.needsReview ? `⚠ REVUE NÉGO: ${nego.reason}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const promptBlockFr = `
═══ BRIEF PRÉ-RÉDACTION (OBLIGATOIRE — ne pas inventer hors de ce brief) ═══
${summaryText}

Règles :
- Destinataire / marque pitchée = « ${pitchBrand} »${agencyName ? ` (agence destinataire : ${agencyName} — ne pas confondre agence et marque)` : ""}.
- N'invente AUCUNE relation, collab, perf, actualité ou RDV absent des sources au statut « ok ».
- Si source « failed » : dis clairement le manque, n'invente pas.
- Si source « empty » : absence de résultat (différent d'un échec).
${
  nego.needsReview
    ? "- STOP PROSPECTION AUTO : négociation / réponse en cours — le mail ne doit PAS partir comme une nouvelle prospection ; signaler la revue."
    : leynaStatus === "exchange"
      ? "- Ancre l'échange passé en 2e personne, sans nommer de contact."
      : leynaStatus === "sent_no_reply"
        ? "- Tu peux mentionner qu'on a déjà écrit, SANS inventer de réponse client."
        : "- Pas d'historique fiable : ton cold discovery factuel uniquement."
}
`.trim();

  return {
    version: 1,
    builtAt,
    recipients,
    recipientsLabel,
    pitchBrand,
    agencyName,
    lastExchangeSummary,
    lastExchangeAt,
    leynaStatus,
    hasExchange: leynaStatus === "exchange",
    needsNegotiationReview: nego.needsReview,
    negotiationReviewReason: nego.reason,
    proposedAngle,
    sources,
    missing,
    summaryText,
    promptBlockFr,
    leynaPromptBlockFr: input.leyna.promptBlockFr || "",
    leynaPromptBlockEn: input.leyna.promptBlockEn || "",
    leynaTone: input.leyna.tone ?? null,
    leynaFetchedAt: input.leyna.fetchedAt ?? null,
    cardError: input.cardError ?? null,
  };
}

/** Cache Leyna réutilisable seulement s’il est frais et couvre encore la boîte. */
export const LEYNA_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isLeynaCacheFresh(fetchedAt: string | null | undefined, now = Date.now()): boolean {
  if (!fetchedAt) return false;
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= LEYNA_CACHE_MAX_AGE_MS;
}

/**
 * Avant de réutiliser un cache : si un fil plus récent est signalé côté hits
 * (fetchedAt ancien vs lastExchangeAt max), forcer un re-scan.
 */
export function leynaCacheNeedsRefresh(args: {
  fetchedAt?: string | null;
  hits?: Array<{ lastExchangeAt?: string | null }>;
  force?: boolean;
}): boolean {
  if (args.force) return true;
  if (!isLeynaCacheFresh(args.fetchedAt)) return true;
  const fetched = args.fetchedAt ? new Date(args.fetchedAt).getTime() : 0;
  for (const h of args.hits || []) {
    if (!h.lastExchangeAt) continue;
    const at = new Date(h.lastExchangeAt).getTime();
    if (!Number.isNaN(at) && at > fetched + 60_000) return true;
  }
  return false;
}
