/**
 * Contexte « vrai échange » dans la boîte Leyna (pas un simple envoi sans réponse).
 * Utilisé à la rédaction casting / projets-outreach pour adapter ton (tu/vous)
 * et angle (suite de relation, collab déjà en place, etc.).
 */

import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";
import {
  checkThreadActivity,
  findRecentMessagesByQuery,
  findRecentSentToRecipient,
  getValidAccessToken,
} from "@/lib/gmail";
import { xaiResponse } from "@/lib/xai";

const GMAIL_THREADS_BASE_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/threads";

/** Historique long : ~5 ans (Gmail newer_than). */
const LOOKBACK_DAYS = 1825;
const MAX_CONTACTS = 12;
const MAX_THREADS_PER_CONTACT = 5;
const MAX_BRAND_THREADS = 12;
const MAX_HITS = 5;

export type LeynaExchangeTone = "tu" | "vous";

export type LeynaExchangeContactHit = {
  email: string;
  subject: string | null;
  lastExchangeAt: string | null;
  tone: LeynaExchangeTone | null;
  notes: string;
  /** Alertes urgentes (redirection contact, stop, etc.) — affichage rouge UI. */
  alerts: string[];
  clientSnippet: string | null;
};

export type LeynaExchangeContext = {
  hasExchange: boolean;
  /** Ton dominant pour la rédaction (null = défaut vouvoiement). */
  tone: LeynaExchangeTone | null;
  contacts: LeynaExchangeContactHit[];
  /** Alertes urgentes agrégées (tous contacts). */
  alerts: string[];
  /** Bandeau UI court. */
  bannerLabel: string | null;
  promptBlockFr: string;
  promptBlockEn: string;
};

type GmailPayloadPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
  headers?: { name?: string; value?: string }[];
};

type ThreadSides = {
  subject: string | null;
  lastDate: string | null;
  leynaTexts: string[];
  clientTexts: string[];
  clientFroms: string[];
};

function decodeGmailBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
  } catch {
    return "";
  }
}

function collectBody(payload: GmailPayloadPart | undefined): string {
  if (!payload) return "";
  const mime = (payload.mimeType || "").toLowerCase();
  if (mime === "text/plain" && payload.body?.data) {
    return decodeGmailBase64(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    let plain = "";
    let html = "";
    for (const part of payload.parts) {
      const nested = collectBody(part);
      const partMime = (part.mimeType || "").toLowerCase();
      if (partMime === "text/plain" && nested) plain = nested;
      else if (partMime === "text/html" && nested) html = nested;
      else if (!plain && nested) plain = nested;
    }
    if (plain) return plain;
    if (html) {
      return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  if (payload.body?.data) return decodeGmailBase64(payload.body.data);
  return "";
}

function detectToneFromText(text: string): LeynaExchangeTone | null {
  const t = text.toLowerCase();
  const vousHits = (
    t.match(/\b(vous|votre|vos|seriez-vous|pourriez-vous|allez bien)\b/g) || []
  ).length;
  const tuHits = (
    t.match(
      /\b(tu |t'|te |ton |ta |tes |peux-tu|serais-tu|j'espère que tu|vas bien)\b/g
    ) || []
  ).length;
  if (tuHits >= 2 && tuHits > vousHits) return "tu";
  if (vousHits >= 2 && vousHits > tuHits) return "vous";
  if (tuHits > 0 && vousHits === 0) return "tu";
  if (vousHits > 0 && tuHits === 0) return "vous";
  return null;
}

function extractEmailFromFromHeader(from: string): string {
  const m = from.match(/<([^>]+)>/);
  if (m?.[1]) return m[1].trim().toLowerCase();
  const bare = from.replace(/"/g, "").trim().toLowerCase();
  return bare.includes("@") ? bare.split(/\s+/).find((p) => p.includes("@")) || bare : bare;
}

function isGlowUpEmail(emailOrFrom: string): boolean {
  return /@glowupagence\.fr\b/i.test(emailOrFrom);
}

function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email.slice(at + 1).toLowerCase().trim();
  if (!d || d.endsWith("glowupagence.fr")) return null;
  // Ignore free mail as "brand domain"
  if (
    /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|msn|orange|free|sfr|laposte)\./i.test(
      d
    )
  ) {
    return null;
  }
  return d;
}

/** Domaines marque depuis emails CRM + heuristique nom (cultura → cultura.fr / .com). */
function resolveBrandDomains(brandName: string, emails: string[]): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    const d = domainFromEmail(e);
    if (d) out.add(d);
  }
  const slug = brandName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (slug.length >= 4 && slug.length <= 28) {
    out.add(`${slug}.fr`);
    out.add(`${slug}.com`);
    // « la redoute » → redoute.fr aussi
    if (slug.startsWith("la") && slug.length > 6) {
      const rest = slug.slice(2);
      out.add(`${rest}.fr`);
      out.add(`${rest}.com`);
    }
  }
  return Array.from(out);
}

async function loadThreadSides(threadId: string): Promise<ThreadSides | null> {
  const accessToken = await getValidAccessToken(LEYNA_FROM_EMAIL);
  const url = `${GMAIL_THREADS_BASE_URL}/${encodeURIComponent(threadId)}?format=full`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json().catch(() => null)) as {
    messages?: {
      id?: string;
      snippet?: string;
      internalDate?: string;
      payload?: GmailPayloadPart;
    }[];
  } | null;
  if (!response.ok || !Array.isArray(json?.messages)) return null;

  const own = LEYNA_FROM_EMAIL.toLowerCase();
  const leynaTexts: string[] = [];
  const clientTexts: string[] = [];
  const clientFroms: string[] = [];
  let subject: string | null = null;
  let lastDate: string | null = null;

  for (const message of json.messages) {
    const headers = message?.payload?.headers || [];
    const header = (name: string) =>
      headers.find((h) => (h.name || "").toLowerCase() === name)?.value || "";
    const fromRaw = header("from");
    const from = fromRaw.toLowerCase();
    const subj = header("subject") || "";
    if (!subject && subj) subject = subj;
    if (message.internalDate) {
      lastDate = new Date(Number(message.internalDate)).toISOString();
    }
    const body =
      collectBody(message.payload).slice(0, 1600) ||
      String(message.snippet || "").trim();
    if (!body) continue;
    if (from.includes(own) || isGlowUpEmail(from)) {
      // Leyna + collègues Glow Up = côté agence, PAS une réponse marque.
      if (from.includes(own)) leynaTexts.push(body);
      continue;
    }
    if (
      /mailer-daemon|postmaster|mail delivery/i.test(from) ||
      /undeliver|delivery failed|échec de la remise/i.test(subj)
    ) {
      continue;
    }
    clientTexts.push(body);
    const em = extractEmailFromFromHeader(fromRaw);
    if (em && !isGlowUpEmail(em)) clientFroms.push(em);
  }

  return { subject, lastDate, leynaTexts, clientTexts, clientFroms };
}

/** Heuristique rapide si l’IA rate une alerte urgente. */
function detectUrgentAlertsHeuristic(
  subject: string | null,
  clientTexts: string[]
): string[] {
  const blob = [subject || "", ...clientTexts].join("\n");
  const alerts: string[] = [];
  const push = (msg: string) => {
    if (!alerts.some((a) => a.toLowerCase() === msg.toLowerCase())) alerts.push(msg);
  };

  const redirect =
    blob.match(
      /(?:merci\s+de\s+)?(?:bien\s+vouloir\s+)?(?:rediriger?|adresser?|transmettre|envoyer)\s+(?:vos|tes|les)?\s*(?:demandes?|propositions?|mails?|messages?)?\s*(?:vers|à|aupr[eè]s\s+de)\s+([^.!\n]{3,80})/i
    ) ||
    blob.match(
      /(?:passez|passer)\s+(?:plutôt\s+)?par\s+([^.!\n]{3,60})/i
    ) ||
    blob.match(
      /(?:contacter?|écrire\s+à|ecrire\s+a)\s+(?:plutôt\s+|directement\s+)?([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){0,2}(?:\s*<[^>]+>)?)/
    );
  if (
    /redirig|adresser?\s+(vos|tes)\s+demandes|passer\s+par|contacter?\s+(plutôt|directement)|désormais\s+.*@|nouvelle\s+interlocuteur|n['']est\s+plus\s+(en\s+charge|le\s+bon\s+contact)/i.test(
      blob
    )
  ) {
    const detail = redirect?.[1]?.trim().replace(/\s+/g, " ").slice(0, 120);
    push(
      detail
        ? `Redirection : adresser les demandes vers ${detail}`
        : "Redirection : ce contact demande d’adresser les demandes à une autre personne"
    );
  }
  if (
    /ne\s+(plus\s+)?(m['']|nous\s+)?(écrire|ecrire|contacter|solliciter)|stop\s+(mail|email|contact)|désinscription|unsubscribe|retirez[- ]moi|ne\s+pas\s+(re)?contacter/i.test(
      blob
    )
  ) {
    push("Stop contact : ne plus écrire / désinscription demandée");
  }
  if (
    /a\s+quitté|n['']est\s+plus\s+(dans|chez|à)|left\s+the\s+company|no\s+longer\s+with|hors\s+poste|ne\s+travaille\s+plus/i.test(
      blob
    )
  ) {
    push("Contact parti / plus en poste — ne pas réécrire à cette personne");
  }
  if (
    /mise\s+en\s+demeure|avocat|legal\s+action|plainte|RGPD\s+violation|harc[eè]lement/i.test(
      blob
    )
  ) {
    push("Signal juridique / mise en demeure — traiter en urgence");
  }
  if (
    /blacklist|liste\s+noire|ne\s+plus\s+jamais|refus\s+d[eé]finitif|ne\s+souhaitons\s+plus/i.test(
      blob
    )
  ) {
    push("Refus définitif / blacklist — ne pas relancer");
  }
  return alerts.slice(0, 5);
}

async function extractNotesAndAlerts(args: {
  brandName: string;
  talentNames: string[];
  subject: string | null;
  leynaTexts: string[];
  clientTexts: string[];
  clientFroms: string[];
  brandDomains: string[];
}): Promise<{ notes: string; alerts: string[] }> {
  const heuristic = detectUrgentAlertsHeuristic(args.subject, args.clientTexts);
  const brandReplyFroms = args.clientFroms.filter((e) =>
    args.brandDomains.some((d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`))
  );
  const excerpt = [
    args.subject ? `Objet: ${args.subject}` : "",
    brandReplyFroms.length
      ? `Réponses côté marque (${args.brandName}) de : ${brandReplyFroms.join(", ")}`
      : `Expéditeurs externes : ${args.clientFroms.slice(0, 6).join(", ") || "—"}`,
    "— Leyna —",
    ...args.leynaTexts.slice(-3).map((t) => t.slice(0, 600)),
    "— Contact(s) —",
    ...args.clientTexts.slice(-3).map((t) => t.slice(0, 600)),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4500);

  const fallbackNotes = args.subject
    ? `Échange existant (objet : ${args.subject}).`
    : "Échange existant avec ce contact.";

  if (!process.env.XAI_API_KEY?.trim()) {
    return { notes: fallbackNotes, alerts: heuristic };
  }

  try {
    const text = await xaiResponse(
      `Tu analyses un fil Gmail entre Leyna (Glow Up Agence) et des contacts autour de la marque ${args.brandName}.
Talents du mail en cours : ${args.talentNames.join(", ") || "—"}
Domaines marque prioritaires : ${args.brandDomains.join(", ") || "—"}

Réponds UNIQUEMENT en JSON valide (pas de markdown) :
{
  "notes": "3-5 puces factuelles (- ) pour le prochain mail : statut deal, qui a répondu, collab en place ou non, comment pitcher une suite",
  "alerts": ["alertes URGENTES uniquement, sinon []"]
}

ALERTES (tableau "alerts") — UNIQUEMENT si c’est vraiment urgent / bloquant :
- Redirection : « merci de rediriger vers X », « passez par Y », nouveau contact obligatoire
- Stop / ne plus écrire / désinscription
- Contact parti / plus en poste
- Refus définitif / blacklist
- Menace juridique / mise en demeure
Chaque alerte = 1 phrase courte, concrète (cite le prénom/email de redirection si dit).
Si rien d’urgent : "alerts": []

Règles notes :
- Priorise réponses domaine MARQUE. Distingue agence vs marque.
- Si la marque a répondu (étude / shortlist), le dire clairement.
- N'invente rien. Français.

FIL :
${excerpt}`,
      {
        model: "grok-4.20-0309-non-reasoning",
        timeoutMs: 35_000,
      }
    );
    const raw = String(text || "").trim();
    const jsonSlice =
      raw.includes("{") && raw.includes("}")
        ? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)
        : raw;
    let notes = fallbackNotes;
    let alerts: string[] = [];
    try {
      const parsed = JSON.parse(jsonSlice) as {
        notes?: unknown;
        alerts?: unknown;
      };
      if (typeof parsed.notes === "string" && parsed.notes.trim()) {
        notes = parsed.notes.trim().slice(0, 1200);
      }
      if (Array.isArray(parsed.alerts)) {
        alerts = parsed.alerts
          .map((a) => String(a || "").trim())
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch {
      notes = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").slice(0, 1200) ||
        fallbackNotes;
    }
    // Fusion heuristique + IA (dédup)
    const merged = [...alerts];
    for (const h of heuristic) {
      if (!merged.some((a) => a.toLowerCase().includes(h.slice(0, 24).toLowerCase()))) {
        merged.push(h);
      }
    }
    return { notes, alerts: merged.slice(0, 6) };
  } catch (e) {
    console.warn(
      "[leyna-exchange-context] résumé IA soft-fail:",
      e instanceof Error ? e.message : e
    );
    return { notes: fallbackNotes, alerts: heuristic };
  }
}

function emptyContext(): LeynaExchangeContext {
  return {
    hasExchange: false,
    tone: null,
    contacts: [],
    alerts: [],
    bannerLabel: null,
    promptBlockFr: "",
    promptBlockEn: "",
  };
}

function scoreThread(args: {
  sides: ThreadSides;
  brandDomains: string[];
  brandName: string;
}): number {
  let score = 10;
  const froms = args.sides.clientFroms.join(" ");
  for (const d of args.brandDomains) {
    if (froms.includes(`@${d}`)) score += 50;
  }
  const subj = (args.sides.subject || "").toLowerCase();
  const brand = args.brandName.toLowerCase();
  if (brand.length >= 3 && subj.includes(brand)) score += 20;
  if (args.sides.lastDate) {
    const ageDays =
      (Date.now() - new Date(args.sides.lastDate).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 60) score += 15;
    else if (ageDays < 180) score += 8;
  }
  return score;
}

/**
 * Soft-fail : jamais d'erreur fatale. `hasExchange` seulement si réponse client.
 * Remonte loin (~5 ans) + recherche par email ET domaine / nom de marque.
 */
export async function getLeynaExchangeContext(args: {
  recipientEmails: string[];
  brandName?: string | null;
  talentNames?: string[];
}): Promise<LeynaExchangeContext> {
  const emails = Array.from(
    new Set(
      (args.recipientEmails || [])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter((e) => e.includes("@") && !e.endsWith("@glowupagence.fr"))
    )
  ).slice(0, MAX_CONTACTS);

  const brandName = String(args.brandName || "").trim() || "la marque";
  const talentNames = (args.talentNames || []).map((n) => n.trim()).filter(Boolean);
  const brandDomains = resolveBrandDomains(brandName, emails);

  if (emails.length === 0 && brandName.length < 2) {
    return emptyContext();
  }

  type Candidate = {
    threadId: string;
    anchorEmail: string;
    internalDate: number | null;
  };
  const candidates: Candidate[] = [];
  const seenThreadIds = new Set<string>();

  const pushMsgs = (
    msgs: { id: string; threadId: string; internalDate: number | null }[],
    anchorEmail: string
  ) => {
    for (const m of msgs) {
      if (!m.threadId || seenThreadIds.has(m.threadId)) continue;
      seenThreadIds.add(m.threadId);
      candidates.push({
        threadId: m.threadId,
        anchorEmail,
        internalDate: m.internalDate,
      });
    }
  };

  try {
    // 1) Par destinataire (historique long)
    for (const email of emails) {
      try {
        const sent = await findRecentSentToRecipient(
          LEYNA_FROM_EMAIL,
          email,
          LOOKBACK_DAYS
        );
        pushMsgs(sent.slice(0, MAX_THREADS_PER_CONTACT * 3), email);
      } catch (e) {
        console.warn(
          `[leyna-exchange-context] search ${email}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    // 2) Par domaine marque (ex. rituals.com) — rattrape Mathilde même hors liste cochée
    for (const domain of brandDomains.slice(0, 4)) {
      try {
        const q = `newer_than:${LOOKBACK_DAYS}d (from:${domain} OR to:${domain} OR cc:${domain})`;
        const msgs = await findRecentMessagesByQuery(LEYNA_FROM_EMAIL, q, 40);
        pushMsgs(msgs.slice(0, MAX_BRAND_THREADS), `*@${domain}`);
      } catch (e) {
        console.warn(
          `[leyna-exchange-context] domain ${domain}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    // 3) Par nom de marque dans l'objet / corps (filet large, historique long)
    const brandToken = brandName.replace(/"/g, "").trim();
    if (brandToken.length >= 3) {
      try {
        const q = `newer_than:${LOOKBACK_DAYS}d ("${brandToken}" OR subject:${brandToken})`;
        const msgs = await findRecentMessagesByQuery(LEYNA_FROM_EMAIL, q, 40);
        pushMsgs(msgs.slice(0, MAX_BRAND_THREADS), `brand:${brandToken}`);
      } catch (e) {
        console.warn(
          `[leyna-exchange-context] brand subject:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    // Plus récents d'abord
    candidates.sort(
      (a, b) => (b.internalDate || 0) - (a.internalDate || 0)
    );

    const scored: Array<{
      hit: LeynaExchangeContactHit;
      score: number;
    }> = [];

    for (const c of candidates.slice(0, 30)) {
      let activity: { replied: boolean };
      try {
        activity = await checkThreadActivity(LEYNA_FROM_EMAIL, c.threadId);
      } catch {
        continue;
      }
      if (!activity.replied) continue;

      const sides = await loadThreadSides(c.threadId);
      // Uniquement une vraie réponse EXTERNE (pas Glow Up interne).
      if (!sides || sides.clientTexts.length === 0 || sides.clientFroms.length === 0) {
        continue;
      }

      const hasBrandDomainReply =
        brandDomains.length === 0 ||
        sides.clientFroms.some((e) =>
          brandDomains.some((d) => e.endsWith(`@${d}`) || e.includes(`.${d}`))
        );
      // Si on connaît le domaine marque, ignore les fils sans réponse de ce domaine
      // (évite agences / faux positifs sans contact Cultura etc.).
      if (brandDomains.length > 0 && !hasBrandDomainReply) {
        // Garde quand même un score bas si sujet marque + reply externe (agence)
        // — mais on priorise fortement le domaine marque via scoreThread.
      }

      let score = scoreThread({ sides, brandDomains, brandName });
      if (hasBrandDomainReply) score += 40;
      else score -= 25;
      // Trop faible = bruit (fils internes mal filtrés, hors sujet)
      if (score < 15) continue;

      const leynaJoined = sides.leynaTexts.join("\n");
      const tone = detectToneFromText(leynaJoined);
      const { notes, alerts } = await extractNotesAndAlerts({
        brandName,
        talentNames,
        subject: sides.subject,
        leynaTexts: sides.leynaTexts,
        clientTexts: sides.clientTexts,
        clientFroms: sides.clientFroms,
        brandDomains,
      });

      const replyEmail =
        sides.clientFroms.find((e) =>
          brandDomains.some((d) => e.endsWith(`@${d}`))
        ) ||
        sides.clientFroms[0] ||
        c.anchorEmail;

      scored.push({
        score: score + (alerts.length > 0 ? 30 : 0),
        hit: {
          email: replyEmail,
          subject: sides.subject,
          lastExchangeAt: sides.lastDate,
          tone,
          notes,
          alerts,
          clientSnippet:
            sides.clientTexts[sides.clientTexts.length - 1]?.slice(0, 220) || null,
        },
      });

      if (scored.length >= MAX_HITS * 2) break;
    }

    scored.sort((a, b) => b.score - a.score);
    const hits = scored.slice(0, MAX_HITS).map((s) => s.hit);

    if (hits.length === 0) return emptyContext();

    const toneVotes = hits.map((h) => h.tone).filter(Boolean) as LeynaExchangeTone[];
    const tuCount = toneVotes.filter((t) => t === "tu").length;
    const vousCount = toneVotes.filter((t) => t === "vous").length;
    const tone: LeynaExchangeTone | null =
      tuCount > vousCount ? "tu" : vousCount > 0 ? "vous" : tuCount > 0 ? "tu" : null;

    const allAlerts = Array.from(
      new Set(hits.flatMap((h) => h.alerts || []).map((a) => a.trim()).filter(Boolean))
    );

    const bannerLabel =
      hits.length === 1
        ? `Échange Leyna trouvé avec ${hits[0].email}${tone ? ` · ${tone === "tu" ? "tutoiement" : "vouvoiement"}` : ""}${allAlerts.length ? " · ⚠ alerte" : ""}`
        : `Échanges Leyna trouvés (${hits.length})${tone ? ` · ${tone === "tu" ? "tutoiement" : "vouvoiement"}` : ""}${allAlerts.length ? " · ⚠ alerte" : ""}`;

    const detailsFr = hits
      .map(
        (h) =>
          `- ${h.email}${h.subject ? ` « ${h.subject} »` : ""}${
            h.lastExchangeAt
              ? ` (${new Date(h.lastExchangeAt).toLocaleDateString("fr-FR")})`
              : ""
          }${h.tone ? ` [${h.tone}]` : ""}${
            h.alerts?.length ? `\n  ALERTES : ${h.alerts.join(" | ")}` : ""
          }\n  Notes : ${h.notes}`
      )
      .join("\n");

    const alertsBlockFr =
      allAlerts.length > 0
        ? `
⚠ ALERTES URGENTES (prioritaires sur le pitch) :
${allAlerts.map((a) => `- ${a}`).join("\n")}
- Si redirection vers une autre personne : le mail DOIT respecter cette consigne (ne pas ignorer).
- Si stop / blacklist / contact parti : ne pas pitcher comme si de rien n’était — signaler le blocage dans l’angle.
`
        : "";

    const promptBlockFr = `
═══ CONTEXTE BOÎTE LEYNA (PRIORITAIRE — vrais échanges = réponses client ; historique ~5 ans) ═══
${detailsFr}
${alertsBlockFr}
ANCRAGE SANS NOMMER PERSONNE (obligatoire) :
- Formule en 2e personne : « suite à notre échange », « comme vous me l'indiquiez », « vous étudiez en interne… ».
- INTERDIT ABSOLU de citer un prénom, nom ou email de contact dans le mail (pas de « Mathilde », « Charlotte », « Pascale Venot », etc.) — même si les notes les mentionnent.
- Les notes ci-dessous sont POUR TOI (contexte) ; le destinataire ne doit voir aucun nom de personne.
- EXCEPTION alertes : si redirection, tu peux évoquer qu’on suit la consigne de circuit sans empiler des noms inutiles.

Règles d'utilisation OBLIGATOIRES (prioritaires sur l'accroche « J'ai vu que… » / cold discovery) :
- Ce n'est PAS un premier contact. Dès le 1er paragraphe après le salut, ancre l'échange passé SANS nommer personne.
- INTERDIT : démarrer comme une découverte froide de la marque (« J'ai vu que vous accentuiez… ») SANS ancrer l'échange passé.
- ${
      tone === "tu"
        ? "TUTOIEMENT obligatoire (tu / te / ton) — cohérent avec les échanges Leyna."
        : tone === "vous"
          ? "Vouvoiement obligatoire — cohérent avec les échanges Leyna."
          : "Garde le vouvoiement sauf si les notes indiquent clairement du tutoiement."
    }
- Si refus / planning bouclé / « pas en recherche » : le dire en une phrase factuelle, puis pitcher la NOUVELLE offre comme une suite (autre moment, format plus ciblé) — pas comme si rien ne s'était passé.
- Si en étude / shortlist / négociation : en parler explicitement.
- Si collab talent×marque déjà en place : s'appuyer dessus ; nouveau format (ex. jeux concours) = suite naturelle, pas doublon du même deal.
- Un élément marque (produit / saison) peut renforcer le pitch APRÈS l'ancrage relationnel, pas à la place.
- N'invente aucun fait hors des notes ci-dessus.
`.trim();

    const promptBlockEn = `
═══ LEYNA MAILBOX CONTEXT (PRIORITY — real back-and-forth only; ~5y lookback) ═══
${detailsFr}
${
  allAlerts.length > 0
    ? `\n⚠ URGENT ALERTS:\n${allAlerts.map((a) => `- ${a}`).join("\n")}\n`
    : ""
}
ANCHOR WITHOUT NAMING ANYONE (mandatory):
- 2nd person only: "following up on our exchange", "as you mentioned", "you were reviewing internally…".
- ABSOLUTELY FORBIDDEN to cite any contact first name, last name or email in the email (no "Mathilde", "Charlotte", etc.) — even if the notes mention them.
- Notes below are FOR YOU (context); the recipient must not see any personal names.

MANDATORY rules (override cold “I noticed you…” discovery hooks):
- Not a first contact. Right after the greeting, anchor the prior exchange WITHOUT naming anyone.
- FORBIDDEN: open as cold brand discovery without anchoring the past thread.
- If refusal / planning full / “not looking”: state it factually, then pitch the NEW offer as a follow-up (different timing, more specific format).
- If reviewing / shortlist / existing talent×brand collab: say so; new format = natural next step.
- Respect urgent alerts (redirect / stop / left company).
- A brand product/season detail may support the pitch AFTER the relationship anchor, not instead of it.
- Do not invent facts beyond the notes above.
`.trim();

    return {
      hasExchange: true,
      tone,
      contacts: hits,
      alerts: allAlerts,
      bannerLabel,
      promptBlockFr,
      promptBlockEn,
    };
  } catch (e) {
    console.warn(
      "[leyna-exchange-context] échec global soft-fail:",
      e instanceof Error ? e.message : e
    );
    return emptyContext();
  }
}
