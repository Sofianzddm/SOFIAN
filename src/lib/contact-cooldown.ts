/**
 * Garde-fou anti-harcèlement — 3 lignes d'envoi client, strictement séparées.
 *
 * Règle métier (validée) :
 *  - 1 mail initial / ligne / email
 *    · indiv : 20 j (pipeline talent — sans event CREATED)
 *    · projet : 30 j (module Projets outreach — event CREATED, SOLO ou MULTI)
 *    · outreach : 30 j (cycle clients 45 j)
 *  - Pas de cooldown cross-ligne : un envoi pipeline ne bloque PAS un projet
 *    outreach (et inversement) ; ni l'outreach clients. Chaque ligne a son plafond.
 *  - Relances du même fil = hors compteur
 *  - Au-delà → bloqué, bypass « projet urgent » (force + motif) possible
 *  - Opt-out → toujours bloqué (pas de bypass)
 *  - Agences / Benelux : non gérés ici (inchangés)
 *
 * Classification casting : alignée sur PIPELINE_CASTING_SCOPE — la présence
 * d'un event CREATED sur la campagne = ligne « projet », pas le seul mode MULTI.
 */

import { prisma } from "@/lib/prisma";
import { emailHasDiffusionOptOut } from "@/lib/diffusion-opt-out";
import { anyBrandLabelsMatch } from "@/lib/brand-match";

/** Fenêtre du plafond par ligne (projet / outreach). */
export const EMAIL_LINE_CAP_DAYS = 30;
/** Max mails initiaux par ligne et par email sur la fenêtre. */
export const EMAIL_LINE_CAP_MAX = 1;

/**
 * Pipeline indiv : fenêtre commune marque + email (20 j).
 * 1 vague / marque / tous talents, et 1 mail initial / email sur la ligne indiv.
 */
export const INDIV_BRAND_WAVE_DAYS = 20;
export const INDIV_EMAIL_LINE_CAP_DAYS = INDIV_BRAND_WAVE_DAYS;

/**
 * Scope Prisma : missions du Pipeline Casting uniquement.
 * Les « Projets outreach talent » (Ibiza, etc.) ont toujours un event CREATED —
 * leurs envois ne doivent PAS bloquer la vague marque du pipeline.
 */
export const PIPELINE_CASTING_SCOPE = {
  OR: [
    { campaignId: null },
    { campaign: { events: { none: { type: "CREATED" as const } } } },
  ],
};

/**
 * Scope Prisma : missions du module Projets outreach (event CREATED).
 * Utilisé pour le plafond marque à l'ajout (SOLO) — les MULTI restent libres.
 */
export const PROJET_OUTREACH_SCOPE = {
  campaign: { events: { some: { type: "CREATED" as const } } },
};

/** Fenêtre anti-recontact marque sur la ligne projet (ajout SOLO). */
export const PROJET_BRAND_WAVE_DAYS = EMAIL_LINE_CAP_DAYS;

function lineCapDays(line: SendLine): number {
  return line === "indiv" ? INDIV_EMAIL_LINE_CAP_DAYS : EMAIL_LINE_CAP_DAYS;
}

/**
 * @deprecated Conservé pour les imports existants (admin-mailer, UI).
 * La règle active est le plafond 1/ligne/mois — plus de cooldown cross-ligne.
 */
export const EMAIL_COOLDOWN_DAYS = EMAIL_LINE_CAP_DAYS;

export type SendLine = "projet" | "indiv" | "outreach";

export type ContactChannel =
  | SendLine
  | "agency"
  | "benelux"
  | "inbound"
  | "fw"
  | "admin";

export type ContactTouch = {
  at: Date;
  channel: ContactChannel;
  kind: "initial" | "relance";
};

const LINE_LABEL: Record<SendLine, string> = {
  projet: "prospection projet",
  indiv: "pipeline individuel",
  outreach: "outreach clients",
};

const CHANNEL_LABEL: Record<ContactChannel, string> = {
  ...LINE_LABEL,
  agency: "prospection agences",
  benelux: "outreach Benelux",
  inbound: "inbound",
  fw: "Fashion Week",
  admin: "mailer admin",
};

function normalizeEmail(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatFrDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function pushTouch(
  out: ContactTouch[],
  at: Date | null | undefined,
  channel: ContactChannel,
  kind: "initial" | "relance"
) {
  if (!at) return;
  out.push({ at: new Date(at), channel, kind });
}

/**
 * Classifie une campagne casting sur la bonne ligne anti-spam.
 * Event CREATED = module Projets outreach → « projet » (SOLO ou MULTI).
 * Sinon MULTI legacy → « projet » ; SOLO / sans campagne → « indiv ».
 */
export function sendLineFromCampaign(
  campaign?: {
    mode?: string | null;
    /** true si la campagne a un event CREATED (projets outreach). */
    isProjetOutreach?: boolean;
  } | null
): SendLine {
  if (!campaign) return "indiv";
  if (campaign.isProjetOutreach) return "projet";
  if (campaign.mode === "MULTI") return "projet";
  return "indiv";
}

/**
 * @deprecated Prefer `sendLineFromCampaign` — le mode seul confond SOLO projet
 * outreach et pipeline indiv. Conservé pour compat ; traite SOLO comme indiv.
 */
export function sendLineFromCampaignMode(
  mode: string | null | undefined
): SendLine {
  return sendLineFromCampaign({ mode, isProjetOutreach: false });
}

export async function resolveMissionSendLine(
  missionId: string
): Promise<SendLine> {
  const mission = await prisma.contactMission.findUnique({
    where: { id: missionId },
    select: {
      campaign: {
        select: {
          mode: true,
          events: {
            where: { type: "CREATED" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  return sendLineFromCampaign({
    mode: mission?.campaign?.mode,
    isProjetOutreach: (mission?.campaign?.events?.length || 0) > 0,
  });
}

/**
 * Historique des envois app vers cet email (fenêtre `since`).
 * Les missions casting sont classées projet vs indiv via event CREATED
 * (module Projets outreach) — pas seulement campaign.mode.
 */
export async function listEmailTouches(
  email: string,
  since: Date,
  opts?: { excludeMissionId?: string }
): Promise<ContactTouch[]> {
  const normalized = normalizeEmail(email);
  if (!normalized || !isValidEmail(normalized)) return [];

  const touches: ContactTouch[] = [];

  const missions = await prisma.contactMission.findMany({
    where: {
      sentAt: { gte: since },
      ...(opts?.excludeMissionId ? { id: { not: opts.excludeMissionId } } : {}),
    },
    select: {
      sentAt: true,
      sentMessageIds: true,
      relanceSentAt: true,
      relanceMessageIds: true,
      relance2SentAt: true,
      relance2MessageIds: true,
      campaign: {
        select: {
          mode: true,
          events: {
            where: { type: "CREATED" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  for (const m of missions) {
    const sm =
      m.sentMessageIds && typeof m.sentMessageIds === "object"
        ? (m.sentMessageIds as Record<string, unknown>)
        : null;
    if (!sm) continue;
    const hit = Object.keys(sm).some((k) => k.toLowerCase() === normalized);
    if (!hit) continue;
    const line = sendLineFromCampaign({
      mode: m.campaign?.mode,
      isProjetOutreach: (m.campaign?.events?.length || 0) > 0,
    });
    pushTouch(touches, m.sentAt, line, "initial");

    const r1 =
      m.relanceMessageIds && typeof m.relanceMessageIds === "object"
        ? (m.relanceMessageIds as Record<string, unknown>)
        : sm;
    if (
      m.relanceSentAt &&
      m.relanceSentAt >= since &&
      Object.keys(r1).some((k) => k.toLowerCase() === normalized)
    ) {
      pushTouch(touches, m.relanceSentAt, line, "relance");
    }

    const r2 =
      m.relance2MessageIds && typeof m.relance2MessageIds === "object"
        ? (m.relance2MessageIds as Record<string, unknown>)
        : sm;
    if (
      m.relance2SentAt &&
      m.relance2SentAt >= since &&
      Object.keys(r2).some((k) => k.toLowerCase() === normalized)
    ) {
      pushTouch(touches, m.relance2SentAt, line, "relance");
    }
  }

  const outreach = await prisma.outreachTouch.findMany({
    where: {
      OR: [
        { sentAt: { gte: since } },
        { relanceSentAt: { gte: since } },
      ],
      target: { email: { equals: normalized, mode: "insensitive" } },
    },
    select: { sentAt: true, relanceSentAt: true },
  });
  for (const t of outreach) {
    if (t.sentAt && t.sentAt >= since) {
      pushTouch(touches, t.sentAt, "outreach", "initial");
    }
    if (t.relanceSentAt && t.relanceSentAt >= since) {
      pushTouch(touches, t.relanceSentAt, "outreach", "relance");
    }
  }

  // Agences / Benelux / inbound / FW / admin : tracés pour info, pas de plafond ligne.
  const agency = await prisma.agencyOutreachTouch.findMany({
    where: {
      OR: [
        { sentAt: { gte: since } },
        { relanceSentAt: { gte: since } },
      ],
      target: { email: { equals: normalized, mode: "insensitive" } },
    },
    select: { sentAt: true, relanceSentAt: true },
  });
  for (const t of agency) {
    if (t.sentAt && t.sentAt >= since) {
      pushTouch(touches, t.sentAt, "agency", "initial");
    }
    if (t.relanceSentAt && t.relanceSentAt >= since) {
      pushTouch(touches, t.relanceSentAt, "agency", "relance");
    }
  }

  const benelux = await prisma.beneluxOutreachTouch.findMany({
    where: {
      OR: [
        { sentAt: { gte: since } },
        { relanceSentAt: { gte: since } },
      ],
      target: { email: { equals: normalized, mode: "insensitive" } },
    },
    select: { sentAt: true, relanceSentAt: true },
  });
  for (const t of benelux) {
    if (t.sentAt && t.sentAt >= since) {
      pushTouch(touches, t.sentAt, "benelux", "initial");
    }
    if (t.relanceSentAt && t.relanceSentAt >= since) {
      pushTouch(touches, t.relanceSentAt, "benelux", "relance");
    }
  }

  const inbound = await prisma.inboundOpportunity.findMany({
    where: {
      senderEmail: { equals: normalized, mode: "insensitive" },
      OR: [
        { sentAt: { gte: since } },
        { relance1SentAt: { gte: since } },
        { relance2SentAt: { gte: since } },
      ],
    },
    select: { sentAt: true, relance1SentAt: true, relance2SentAt: true },
  });
  for (const i of inbound) {
    if (i.sentAt && i.sentAt >= since) {
      pushTouch(touches, i.sentAt, "inbound", "initial");
    }
    if (i.relance1SentAt && i.relance1SentAt >= since) {
      pushTouch(touches, i.relance1SentAt, "inbound", "relance");
    }
    if (i.relance2SentAt && i.relance2SentAt >= since) {
      pushTouch(touches, i.relance2SentAt, "inbound", "relance");
    }
  }

  const fwClients = await prisma.fwClient.findMany({
    where: {
      OR: [
        { lastEmailSentAt: { gte: since } },
        { relanceSentAt: { gte: since } },
      ],
    },
    select: {
      lastEmailSentAt: true,
      relanceSentAt: true,
      emailThreads: true,
    },
  });
  for (const f of fwClients) {
    const threads = Array.isArray(f.emailThreads) ? f.emailThreads : [];
    const hit = threads.some(
      (th) =>
        typeof th === "object" &&
        th &&
        normalizeEmail(String((th as { email?: string }).email || "")) ===
          normalized
    );
    if (!hit) continue;
    if (f.lastEmailSentAt && f.lastEmailSentAt >= since) {
      pushTouch(touches, f.lastEmailSentAt, "fw", "initial");
    }
    if (f.relanceSentAt && f.relanceSentAt >= since) {
      pushTouch(touches, f.relanceSentAt, "fw", "relance");
    }
  }

  const adminMails = await prisma.adminMail.findMany({
    where: {
      status: "SENT",
      sentAt: { gte: since },
      toEmail: { contains: normalized, mode: "insensitive" },
    },
    select: { sentAt: true, toEmail: true },
  });
  for (const a of adminMails) {
    const recipients = String(a.toEmail || "")
      .split(",")
      .map((s) => normalizeEmail(s))
      .filter(Boolean);
    if (!recipients.includes(normalized)) continue;
    pushTouch(touches, a.sentAt, "admin", "initial");
  }

  touches.sort((a, b) => b.at.getTime() - a.at.getTime());
  return touches;
}

export type EmailSendGuardOk = {
  allowed: true;
  initialCount30d: number;
  lineCount30d: number;
  lastTouch: ContactTouch | null;
};

export type EmailSendGuardBlocked = {
  allowed: false;
  reason: "opt-out" | "line-cap";
  /** true pour line-cap (projet urgent) ; false pour opt-out. */
  canForce: boolean;
  message: string;
  initialCount30d: number;
  lineCount30d: number;
  lastTouch: ContactTouch | null;
  nextAllowedAt: Date | null;
};

export type EmailSendGuardResult = EmailSendGuardOk | EmailSendGuardBlocked;

/**
 * Évalue un nouvel envoi sur une ligne donnée.
 * Bypass « projet urgent » : force=true + motif (CASTING_MANAGER+) — ignore
 * le plafond ligne, jamais l'opt-out.
 */
export async function evaluateEmailSendGuard(
  email: string,
  opts?: {
    excludeMissionId?: string;
    /** Ligne d'envoi concernée — obligatoire pour appliquer le plafond. */
    line?: SendLine;
    /** Projet urgent : ignore le plafond 1/mois/ligne, pas l'opt-out. */
    force?: boolean;
  }
): Promise<EmailSendGuardResult> {
  const normalized = normalizeEmail(email);
  if (!normalized || !isValidEmail(normalized)) {
    return {
      allowed: false,
      reason: "opt-out",
      canForce: false,
      message: `Email invalide : ${email}`,
      initialCount30d: 0,
      lineCount30d: 0,
      lastTouch: null,
      nextAllowedAt: null,
    };
  }

  if (await emailHasDiffusionOptOut(normalized)) {
    return {
      allowed: false,
      reason: "opt-out",
      canForce: false,
      message: `${normalized} est en opt-out liste de diffusion — envoi interdit.`,
      initialCount30d: 0,
      lineCount30d: 0,
      lastTouch: null,
      nextAllowedAt: null,
    };
  }

  const capDays = lineCapDays(opts?.line ?? "projet");
  // Si pas de ligne, on charge quand même sur la fenêtre max pour les compteurs.
  const lookbackDays = opts?.line
    ? lineCapDays(opts.line)
    : Math.max(EMAIL_LINE_CAP_DAYS, INDIV_EMAIL_LINE_CAP_DAYS);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const touches = await listEmailTouches(normalized, since, {
    excludeMissionId: opts?.excludeMissionId,
  });
  const initials = touches.filter((t) => t.kind === "initial");
  const initialCount30d = initials.length;
  const lastTouch = touches[0] || null;

  const line = opts?.line;
  if (!line) {
    return { allowed: true, initialCount30d, lineCount30d: 0, lastTouch };
  }

  const lineInitials = initials.filter((t) => t.channel === line);
  const lineCount30d = lineInitials.length;
  const lastOnLine = lineInitials[0] || null;

  if (opts?.force) {
    return {
      allowed: true,
      initialCount30d,
      lineCount30d,
      lastTouch: lastOnLine || lastTouch,
    };
  }

  if (lineCount30d >= EMAIL_LINE_CAP_MAX) {
    const nextAllowedAt = lastOnLine
      ? new Date(lastOnLine.at.getTime() + capDays * 24 * 60 * 60 * 1000)
      : null;
    const when = nextAllowedAt
      ? ` Réessai possible le ${formatFrDate(nextAllowedAt)}.`
      : "";
    return {
      allowed: false,
      reason: "line-cap",
      canForce: true,
      message:
        `${normalized} a déjà reçu un mail « ${LINE_LABEL[line]} » ` +
        `dans les ${capDays} derniers jours (max ${EMAIL_LINE_CAP_MAX} / ${capDays} j sur cette ligne).` +
        ` Bypass urgent possible avec motif.${when}`,
      initialCount30d,
      lineCount30d,
      lastTouch: lastOnLine,
      nextAllowedAt,
    };
  }

  return {
    allowed: true,
    initialCount30d,
    lineCount30d,
    lastTouch,
  };
}

/**
 * Filtre une liste d'emails pour une ligne d'envoi.
 */
export async function filterEmailsBySendGuard(
  emails: string[],
  opts: {
    excludeMissionId?: string;
    line: SendLine;
    force?: boolean;
  }
): Promise<{
  allowed: string[];
  blocked: Array<{ email: string; guard: EmailSendGuardBlocked }>;
}> {
  const unique = [
    ...new Set(emails.map(normalizeEmail).filter((e) => isValidEmail(e))),
  ];
  const allowed: string[] = [];
  const blocked: Array<{ email: string; guard: EmailSendGuardBlocked }> = [];

  for (const email of unique) {
    const guard = await evaluateEmailSendGuard(email, opts);
    if (guard.allowed) {
      allowed.push(email);
    } else {
      blocked.push({ email, guard });
    }
  }

  return { allowed, blocked };
}

/** Motif urgent : au moins 5 caractères utiles. */
export function isValidForceReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 5;
}

/**
 * IDs Gmail (message + thread) déjà émis par l'app pour cet email
 * (pipeline indiv + projets outreach). Sert à exclure ces envois du garde-fou
 * « hors app » de l'outreach clients : les 3 lignes sont indépendantes.
 */
export async function collectCastingGmailIdsForEmail(
  email: string,
  days: number
): Promise<Set<string>> {
  const normalized = normalizeEmail(email);
  const ids = new Set<string>();
  if (!normalized || !isValidEmail(normalized) || days <= 0) return ids;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const missions = await prisma.contactMission.findMany({
    where: {
      OR: [
        { sentAt: { gte: since } },
        { relanceSentAt: { gte: since } },
        { relance2SentAt: { gte: since } },
      ],
    },
    select: {
      sentMessageIds: true,
      relanceMessageIds: true,
      relance2MessageIds: true,
    },
  });

  const absorb = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    for (const [key, record] of Object.entries(
      raw as Record<string, { messageId?: string; threadId?: string } | null>
    )) {
      if (normalizeEmail(key) !== normalized || !record) continue;
      if (record.messageId) ids.add(record.messageId);
      if (record.threadId) ids.add(record.threadId);
    }
  };

  for (const m of missions) {
    absorb(m.sentMessageIds);
    absorb(m.relanceMessageIds);
    absorb(m.relance2MessageIds);
  }

  return ids;
}

export { CHANNEL_LABEL, LINE_LABEL };

/**
 * Pipeline indiv uniquement : une marque déjà pitchée (n'importe quel talent)
 * dans les INDIV_BRAND_WAVE_DAYS derniers jours → pas de 2ᵉ vague (autre talent / autre carte).
 * Matching : marqueId / targetBrandKey exact, puis fuzzy (fautes, casse).
 * Contourne avec force (projet urgent). Les projets MULTI sont exclus.
 */
export async function evaluateIndivBrandSendGuard(
  mission: {
    id: string;
    talentId?: string | null;
    creatorName?: string | null;
    marqueId?: string | null;
    targetBrandKey?: string | null;
    targetBrand?: string | null;
  },
  opts?: { force?: boolean }
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      canForce: true;
      message: string;
      nextAllowedAt: Date | null;
      prior: { id: string; creatorName: string; sentAt: Date; targetBrand: string };
    }
> {
  if (opts?.force) return { allowed: true };

  const marqueId = String(mission.marqueId || "").trim() || null;
  const brandKey = String(mission.targetBrandKey || "").trim() || null;
  const targetBrand = String(mission.targetBrand || "").trim() || null;
  if (!marqueId && !brandKey && !targetBrand) return { allowed: true };

  const since = new Date(
    Date.now() - INDIV_BRAND_WAVE_DAYS * 24 * 60 * 60 * 1000
  );

  // 1) Match exact (rapide) : même fiche ou même clé — tous talents, pipeline only
  let prior = await prisma.contactMission.findFirst({
    where: {
      id: { not: mission.id },
      sentAt: { gte: since, not: null },
      AND: [
        {
          OR: [
            ...(marqueId ? [{ marqueId }] : []),
            ...(brandKey ? [{ targetBrandKey: brandKey }] : []),
          ],
        },
        PIPELINE_CASTING_SCOPE,
      ],
    },
    select: {
      id: true,
      creatorName: true,
      sentAt: true,
      targetBrand: true,
    },
    orderBy: { sentAt: "desc" },
  });

  // 2) Match flou : Keratase/Kerastase… — tous talents, pipeline only
  if (!prior?.sentAt) {
    const recent = await prisma.contactMission.findMany({
      where: {
        id: { not: mission.id },
        sentAt: { gte: since, not: null },
        ...PIPELINE_CASTING_SCOPE,
      },
      select: {
        id: true,
        creatorName: true,
        sentAt: true,
        targetBrand: true,
        marque: { select: { nom: true } },
      },
      orderBy: { sentAt: "desc" },
      take: 800,
    });
    const myLabels = [targetBrand];
    for (const row of recent) {
      if (!row.sentAt) continue;
      if (
        anyBrandLabelsMatch(myLabels, [row.targetBrand, row.marque?.nom])
      ) {
        prior = {
          id: row.id,
          creatorName: row.creatorName,
          sentAt: row.sentAt,
          targetBrand: row.targetBrand,
        };
        break;
      }
    }
  }

  if (!prior?.sentAt) return { allowed: true };

  const nextAllowedAt = new Date(
    prior.sentAt.getTime() + INDIV_BRAND_WAVE_DAYS * 24 * 60 * 60 * 1000
  );
  const brandLabel = prior.targetBrand || targetBrand || "cette marque";
  const viaTalent = prior.creatorName || "un autre talent";
  return {
    allowed: false,
    canForce: true,
    message:
      `« ${brandLabel} » a déjà été contactée en pipeline indiv ` +
      `pour ${viaTalent} le ${formatFrDate(prior.sentAt)}. ` +
      `Max 1 vague / marque / ${INDIV_BRAND_WAVE_DAYS} j (tous talents) — réessai le ${formatFrDate(nextAllowedAt)} ` +
      `(ou bypass urgent avec motif).`,
    nextAllowedAt,
    prior: {
      id: prior.id,
      creatorName: prior.creatorName,
      sentAt: prior.sentAt,
      targetBrand: prior.targetBrand,
    },
  };
}

export type IndivBrandWaveSend = {
  missionId: string;
  marqueId: string | null;
  targetBrand: string;
  targetBrandKey: string | null;
  creatorName: string;
  talentId: string | null;
  sentAt: Date;
  daysAgo: number;
  daysLeft: number;
};

/** True tant que la date de déblocage marque n’est pas atteinte. */
export function isBrandCooldownActive(
  until: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!until) return false;
  const t = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(t.getTime())) return false;
  return t.getTime() > now.getTime();
}

/**
 * Projets outreach SOLO : une marque déjà contactée (n'importe quel projet /
 * talent) dans les PROJET_BRAND_WAVE_DAYS derniers jours → ajout possible
 * mais mission « en attente » jusqu’à nextAllowedAt.
 * Les campagnes MULTI (« projet commun ») ne passent pas par ce garde-fou.
 */
export async function evaluateProjetBrandAddGuard(opts: {
  marqueId?: string | null;
  targetBrandKey?: string | null;
  targetBrand?: string | null;
  /** Exclure le projet courant (ré-ajout / même campagne). */
  excludeCampaignId?: string | null;
}): Promise<
  | { allowed: true }
  | {
      allowed: false;
      message: string;
      nextAllowedAt: Date;
      prior: {
        id: string;
        creatorName: string;
        sentAt: Date;
        targetBrand: string;
        campaignTitle: string | null;
      };
    }
> {
  const marqueId = String(opts.marqueId || "").trim() || null;
  const brandKey = String(opts.targetBrandKey || "").trim() || null;
  const targetBrand = String(opts.targetBrand || "").trim() || null;
  if (!marqueId && !brandKey && !targetBrand) return { allowed: true };

  const since = new Date(
    Date.now() - PROJET_BRAND_WAVE_DAYS * 24 * 60 * 60 * 1000
  );
  const excludeCampaignId = String(opts.excludeCampaignId || "").trim() || null;

  let prior = await prisma.contactMission.findFirst({
    where: {
      sentAt: { gte: since, not: null },
      ...(excludeCampaignId ? { campaignId: { not: excludeCampaignId } } : {}),
      AND: [
        {
          OR: [
            ...(marqueId ? [{ marqueId }] : []),
            ...(brandKey ? [{ targetBrandKey: brandKey }] : []),
          ],
        },
        PROJET_OUTREACH_SCOPE,
      ],
    },
    select: {
      id: true,
      creatorName: true,
      sentAt: true,
      targetBrand: true,
      campaign: { select: { title: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  if (!prior?.sentAt) {
    const recent = await prisma.contactMission.findMany({
      where: {
        sentAt: { gte: since, not: null },
        ...(excludeCampaignId ? { campaignId: { not: excludeCampaignId } } : {}),
        ...PROJET_OUTREACH_SCOPE,
      },
      select: {
        id: true,
        creatorName: true,
        sentAt: true,
        targetBrand: true,
        marque: { select: { nom: true } },
        campaign: { select: { title: true } },
      },
      orderBy: { sentAt: "desc" },
      take: 800,
    });
    const myLabels = [targetBrand];
    for (const row of recent) {
      if (!row.sentAt) continue;
      if (anyBrandLabelsMatch(myLabels, [row.targetBrand, row.marque?.nom])) {
        prior = {
          id: row.id,
          creatorName: row.creatorName,
          sentAt: row.sentAt,
          targetBrand: row.targetBrand,
          campaign: row.campaign,
        };
        break;
      }
    }
  }

  if (!prior?.sentAt) return { allowed: true };

  const nextAllowedAt = new Date(
    prior.sentAt.getTime() + PROJET_BRAND_WAVE_DAYS * 24 * 60 * 60 * 1000
  );
  const brandLabel = prior.targetBrand || targetBrand || "cette marque";
  const via = prior.creatorName || "un autre talent";
  const viaCamp = prior.campaign?.title
    ? ` (« ${prior.campaign.title} »)`
    : "";
  return {
    allowed: false,
    message:
      `« ${brandLabel} » a déjà été contactée en projet outreach ` +
      `pour ${via}${viaCamp} le ${formatFrDate(prior.sentAt)}. ` +
      `Mise en attente jusqu’au ${formatFrDate(nextAllowedAt)} ` +
      `(${PROJET_BRAND_WAVE_DAYS} j). Les projets communs MULTI restent libres.`,
    nextAllowedAt,
    prior: {
      id: prior.id,
      creatorName: prior.creatorName,
      sentAt: prior.sentAt,
      targetBrand: prior.targetBrand,
      campaignTitle: prior.campaign?.title ?? null,
    },
  };
}

/**
 * Envois Pipeline Casting des INDIV_BRAND_WAVE_DAYS derniers jours —
 * tous talents. Exclut les Projets outreach (event CREATED).
 */
export async function listIndivBrandWaveSends(): Promise<IndivBrandWaveSend[]> {
  const since = new Date(
    Date.now() - INDIV_BRAND_WAVE_DAYS * 24 * 60 * 60 * 1000
  );
  const rows = await prisma.contactMission.findMany({
    where: {
      sentAt: { gte: since, not: null },
      ...PIPELINE_CASTING_SCOPE,
    },
    select: {
      id: true,
      marqueId: true,
      targetBrand: true,
      targetBrandKey: true,
      creatorName: true,
      talentId: true,
      sentAt: true,
    },
    orderBy: { sentAt: "desc" },
    take: 800,
  });

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Une entrée par marque (plus récent gagne)
  const best = new Map<string, IndivBrandWaveSend>();
  for (const row of rows) {
    if (!row.sentAt) continue;
    const key =
      row.marqueId ||
      row.targetBrandKey ||
      String(row.targetBrand || "")
        .toLowerCase()
        .trim() ||
      row.id;
    if (best.has(key)) continue;
    const daysAgo = Math.floor((now - row.sentAt.getTime()) / dayMs);
    best.set(key, {
      missionId: row.id,
      marqueId: row.marqueId,
      targetBrand: row.targetBrand,
      targetBrandKey: row.targetBrandKey,
      creatorName: row.creatorName,
      talentId: row.talentId,
      sentAt: row.sentAt,
      daysAgo,
      daysLeft: Math.max(0, INDIV_BRAND_WAVE_DAYS - daysAgo),
    });
  }
  return [...best.values()];
}

