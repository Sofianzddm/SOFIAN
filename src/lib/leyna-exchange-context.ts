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
const MAX_CONTACTS = 20;
/** Messages envoyés inspectés par contact. */
const MAX_SENT_SCAN_PER_CONTACT = 50;
/** Fils gardés par contact (avec OU sans réponse). */
const MAX_THREADS_PER_CONTACT = 30;
/** Inbound domaine marque (from:@marque). */
const MAX_INBOUND_BRAND = 50;
/** Filet large sujet / to:domaine. */
const MAX_BRAND_SCAN = 50;
/** Tous les fils à noter (échanges + envois sans réponse). */
const MAX_HITS = 40;
/** Candidats max à ouvrir (activity + corps). */
const MAX_CANDIDATES_TO_SCORE = 160;
const ACTIVITY_CONCURRENCY = 8;
const NOTES_CONCURRENCY = 4;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!, i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

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
  /** exchange = vraie réponse client ; sent_no_reply = pitch Leyna sans retour. */
  status?: "exchange" | "sent_no_reply";
  /** Nombre de messages dans le fil. */
  messageCount?: number;
};

export type LeynaScanStatus = "ok" | "empty" | "failed";

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
  /** ok = scan terminé ; empty = rien trouvé ; failed = erreur technique. */
  scanStatus: LeynaScanStatus;
  fetchedAt: string;
  /** true s’il n’y a que des envois sans réponse (pas d’échange). */
  hasSentNoReplyOnly: boolean;
};

type GmailPayloadPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
  headers?: { name?: string; value?: string }[];
};

type ThreadTurn = {
  role: "leyna" | "client" | "agency";
  from: string;
  date: string | null;
  text: string;
};

type ThreadSides = {
  subject: string | null;
  lastDate: string | null;
  leynaTexts: string[];
  clientTexts: string[];
  clientFroms: string[];
  /** Fil chronologique complet (pour notes exhaustives). */
  turns: ThreadTurn[];
};

function isAutoReplySubject(subject: string | null | undefined): boolean {
  return /réponse\s+automatique|automatic\s+reply|out\s+of\s+office|absence\s+(du|de)\s+bureau|auto[- ]?reply|i\s+am\s+currently\s+out/i.test(
    String(subject || "")
  );
}

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

/** Coupe le texte cité / historique collé (sinon le ton tu/vous est faussé). */
function stripQuotedReply(text: string): string {
  let t = String(text || "");
  // Signatures / réactions Gmail
  t = t.split(/\n--\s*\n/)[0] || t;
  t = t.split(/\n🩵\s*/)[0] || t;
  t = t.split(/\na réagi depuis Gmail/i)[0] || t;
  t = t.split(/\nOn .+ wrote:\s*\n/i)[0] || t;
  t = t.split(/\nLe .+ a écrit\s*:\s*\n/i)[0] || t;
  t = t.split(/\n-----Original Message-----/i)[0] || t;
  t = t.split(/\n________________________________/i)[0] || t;
  // Outlook FR/EN collé dans le même paragraphe
  t = t.split(/\bDe\s*:\s*[^\n]+(?:\n|Envoyé\s*:|Sent\s*:)/i)[0] || t;
  t = t.split(/\bFrom\s*:\s*[^\n]+(?:\n|Sent\s*:)/i)[0] || t;
  t = t.split(/\bEnvoyé\s*:\s*/i)[0] || t;
  t = t.split(/\bSent\s*:\s*/i)[0] || t;
  t = t.split(/\bObjet\s*:\s*Re\s*:/i)[0] || t;
  // Images cid Outlook
  t = t.replace(/\[cid:[^\]]+\]/gi, " ");
  // Lignes de citation type « > … »
  t = t
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  return t.trim();
}

function detectToneFromText(text: string): LeynaExchangeTone | null {
  const t = stripQuotedReply(text)
    .toLowerCase()
    .replace(/[’‘‛‹›]/g, "'");
  const vousHits = (
    t.match(/\b(vous|votre|vos|seriez-vous|pourriez-vous)\b/g) || []
  ).length;
  const tuHits = (
    t.match(
      /\b(tu|t'|te|ton|ta|tes|peux-tu|serais-tu|as-tu|peux tu)\b/g
    ) || []
  ).length;
  if (tuHits >= 2 && tuHits > vousHits) return "tu";
  if (vousHits >= 2 && vousHits > tuHits) return "vous";
  if (tuHits > 0 && vousHits === 0) return "tu";
  if (vousHits > 0 && tuHits === 0) return "vous";
  return null;
}

/** Ton dominant : réponses client récentes, puis Leyna récente (après switch tu/vous). */
function detectToneFromThread(sides: ThreadSides): LeynaExchangeTone | null {
  const clientRecent = sides.turns
    .filter((t) => t.role === "client")
    .slice(-4)
    .map((t) => stripQuotedReply(t.text))
    .join("\n");
  const clientTone = detectToneFromText(clientRecent);
  if (clientTone) return clientTone;

  const leynaRecent = sides.turns
    .filter((t) => t.role === "leyna")
    .slice(-4)
    .map((t) => stripQuotedReply(t.text))
    .join("\n");
  const leynaTone = detectToneFromText(leynaRecent);
  if (leynaTone) return leynaTone;

  return detectToneFromText(
    sides.turns.map((t) => stripQuotedReply(t.text)).join("\n")
  );
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
  const turns: ThreadTurn[] = [];
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
    const dateIso = message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : null;
    if (dateIso) lastDate = dateIso;
    const body =
      collectBody(message.payload).slice(0, 4000) ||
      String(message.snippet || "").trim();
    if (!body) continue;
    if (
      /mailer-daemon|postmaster|mail delivery/i.test(from) ||
      /undeliver|delivery failed|échec de la remise/i.test(subj)
    ) {
      continue;
    }
    if (isAutoReplySubject(subj)) continue;

    if (from.includes(own)) {
      leynaTexts.push(body);
      turns.push({ role: "leyna", from: fromRaw || own, date: dateIso, text: body });
      continue;
    }
    if (isGlowUpEmail(from)) {
      // Collègues Glow Up = contexte agence (utile pour notes), pas une réponse marque.
      turns.push({ role: "agency", from: fromRaw, date: dateIso, text: body });
      continue;
    }
    clientTexts.push(body);
    const em = extractEmailFromFromHeader(fromRaw);
    if (em && !isGlowUpEmail(em)) clientFroms.push(em);
    turns.push({
      role: "client",
      from: fromRaw || em || "client",
      date: dateIso,
      text: body,
    });
  }

  if (isAutoReplySubject(subject) && clientTexts.length > 0 && leynaTexts.length === 0) {
    return null;
  }

  return { subject, lastDate, leynaTexts, clientTexts, clientFroms, turns };
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
  turns: ThreadTurn[];
}): Promise<{ notes: string; alerts: string[] }> {
  const heuristic = detectUrgentAlertsHeuristic(args.subject, args.clientTexts);
  const brandReplyFroms = args.clientFroms.filter((e) =>
    args.brandDomains.some((d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`))
  );

  const chrono = (args.turns.length > 0 ? args.turns : [
    ...args.leynaTexts.map((text) => ({
      role: "leyna" as const,
      from: "Leyna",
      date: null as string | null,
      text,
    })),
    ...args.clientTexts.map((text) => ({
      role: "client" as const,
      from: args.clientFroms[0] || "client",
      date: null as string | null,
      text,
    })),
  ])
    .map((t, i) => {
      const when = t.date
        ? new Date(t.date).toLocaleDateString("fr-FR")
        : `#${i + 1}`;
      const who =
        t.role === "leyna" ? "LEYNA" : t.role === "agency" ? "AGENCE" : "CLIENT";
      return `[${when}] ${who} (${t.from}):\n${t.text.slice(0, 2200)}`;
    })
    .join("\n\n")
    .slice(0, 14000);

  const excerpt = [
    args.subject ? `Objet: ${args.subject}` : "",
    `Fil : ${args.turns.length || args.leynaTexts.length + args.clientTexts.length} messages · Leyna ${args.leynaTexts.length} · client ${args.clientTexts.length}`,
    brandReplyFroms.length
      ? `Réponses côté marque (${args.brandName}) de : ${brandReplyFroms.join(", ")}`
      : `Expéditeurs externes : ${args.clientFroms.slice(0, 8).join(", ") || "—"}`,
    "——— FIL CHRONOLOGIQUE COMPLET ———",
    chrono,
  ]
    .filter(Boolean)
    .join("\n");

  const fallbackNotes = [
    args.subject
      ? `Échange existant (objet : ${args.subject}) — ${args.turns.length || args.leynaTexts.length + args.clientTexts.length} messages.`
      : "Échange existant avec ce contact.",
    args.clientFroms[0] ? `- Contacts marque : ${[...new Set(args.clientFroms)].join(", ")}` : "",
    ...args.turns
      .filter((t) => t.role === "client")
      .slice(-4)
      .map((t) => {
        const when = t.date
          ? new Date(t.date).toLocaleDateString("fr-FR")
          : "";
        const snip = t.text.replace(/\s+/g, " ").trim().slice(0, 320);
        return `- [${when}] Client : « ${snip}${snip.length >= 320 ? "…" : ""} »`;
      }),
    ...args.turns
      .filter((t) => t.role === "leyna")
      .slice(-3)
      .map((t) => {
        const when = t.date
          ? new Date(t.date).toLocaleDateString("fr-FR")
          : "";
        const snip = t.text.replace(/\s+/g, " ").trim().slice(0, 220);
        return `- [${when}] Leyna : « ${snip}${snip.length >= 220 ? "…" : ""} »`;
      }),
  ]
    .filter(Boolean)
    .join("\n");

  if (!process.env.XAI_API_KEY?.trim()) {
    return { notes: fallbackNotes, alerts: heuristic };
  }

  try {
    const text = await xaiResponse(
      `Tu analyses UN fil Gmail COMPLET entre Leyna (Glow Up Agence) et des contacts autour de la marque ${args.brandName}.
Talents du mail en cours : ${args.talentNames.join(", ") || "—"}
Domaines marque prioritaires : ${args.brandDomains.join(", ") || "—"}

Réponds UNIQUEMENT en JSON valide (pas de markdown) :
{
  "notes": "8-14 puces factuelles (- ) EXHAUSTIVES chronologiques : chaque étape du fil (dates, qui a dit quoi), talents pitchés, produits/équipements, call fixé, négociations, statut actuel, prochaines actions, ton (tu/vous), comment pitcher une suite SANS répéter le même deal",
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

Règles notes (OBLIGATOIRE — ne pas sous-résumer) :
- NOTE TOUT le fil, message par message utile. INTERDIT de sortir juste « échange existant ».
- Inclure : call / RDV, produits (ex. vélo, modèle), talents (Mia, Lola…), validations, relances en attente.
- Priorise réponses domaine MARQUE. Distingue agence vs marque.
- N'invente rien. Français.

FIL :
${excerpt}`,
      {
        model: "grok-4.20-0309-non-reasoning",
        timeoutMs: 60_000,
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
        notes = parsed.notes.trim().slice(0, 4500);
      }
      if (Array.isArray(parsed.alerts)) {
        alerts = parsed.alerts
          .map((a) => String(a || "").trim())
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch {
      notes =
        raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").slice(0, 4500) ||
        fallbackNotes;
    }
    // Si l’IA a trop condensé (« échange existant »), garder le fallback riche.
    if (
      notes.length < 120 ||
      /^échange existant/i.test(notes.trim())
    ) {
      notes = fallbackNotes.length > notes.length ? fallbackNotes : notes;
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

function emptyContext(
  scanStatus: LeynaScanStatus = "empty"
): LeynaExchangeContext {
  return {
    hasExchange: false,
    tone: null,
    contacts: [],
    alerts: [],
    bannerLabel:
      scanStatus === "failed"
        ? "Scan Leyna échoué — réessayer (ne pas inventer d’historique)"
        : null,
    promptBlockFr: "",
    promptBlockEn: "",
    scanStatus,
    fetchedAt: new Date().toISOString(),
    hasSentNoReplyOnly: false,
  };
}

/** Local-parts trop génériques → ne jamais chercher seuls (sinon Yepoda via « collaborations@ », Yazio via « partnerships@ », etc.). */
const GENERIC_LOCAL_PARTS = new Set([
  "collaborations",
  "collaboration",
  "partnerships",
  "partnership",
  "affiliates",
  "affiliate",
  "contact",
  "contacts",
  "hello",
  "hi",
  "info",
  "infos",
  "marketing",
  "press",
  "presse",
  "pr",
  "com",
  "comm",
  "communication",
  "team",
  "agence",
  "agency",
  "sales",
  "influence",
  "influencer",
  "creators",
  "creator",
  "booking",
  "bookings",
  "admin",
  "support",
  "bonjour",
  "mail",
  "email",
  "office",
  "france",
  "europe",
  "global",
  "intl",
  "international",
  "newsletter",
  "noreply",
  "no-reply",
  "media",
  "digital",
  "social",
  "brand",
  "brands",
  "boutique",
  "shop",
  "store",
  "service",
  "clients",
  "client",
  "commercial",
  "business",
  "pros",
  "pro",
]);

function isGenericLocalPart(local: string): boolean {
  const l = local.trim().toLowerCase();
  if (!l || l.length < 5) return true;
  if (GENERIC_LOCAL_PARTS.has(l)) return true;
  // « contact-fr », « partnerships-eu », etc.
  for (const g of GENERIC_LOCAL_PARTS) {
    if (l === g || l.startsWith(`${g}-`) || l.startsWith(`${g}.`) || l.startsWith(`${g}_`)) {
      return true;
    }
  }
  return false;
}

function brandTokens(brand: string): string[] {
  const raw = String(brand || "").trim().toLowerCase();
  if (!raw) return [];
  const compact = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const parts = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4);
  return Array.from(new Set([raw, compact, ...parts].filter((t) => t.length >= 3)));
}

function brandInSubjectHint(subject: string | null, brand: string): boolean {
  const s = (subject || "").toLowerCase();
  if (!s) return false;
  const tokens = brandTokens(brand);
  // Tokens longs d’abord (« drherma », « cultura ») — évite un « herma » trop large.
  const strong = tokens.filter((t) => t.replace(/\s+/g, "").length >= 5);
  const pool = strong.length > 0 ? strong : tokens;
  return pool.some((t) => s.includes(t));
}

function emailMatchesBrandDomain(email: string, brandDomains: string[]): boolean {
  const e = email.toLowerCase();
  return brandDomains.some((d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`));
}

/**
 * Le fil concerne bien CETTE marque pitchée.
 * Si le destinataire est une agence multi-marques, on exige la marque dans
 * l’objet / le corps Leyna (sinon un fil « autre marque via Nice Work » pollue Kiko).
 */
function threadIsRelevantToBrand(args: {
  sides: ThreadSides;
  candidate: { anchorEmail: string };
  emails: string[];
  brandDomains: string[];
  brandName: string;
  /** Domaines d’agence (optionnel) : mails @agence sans marque dans le fil → rejet. */
  agencyDomains?: string[];
}): boolean {
  const { sides, candidate, emails, brandDomains, brandName } = args;
  const agencyDomains = args.agencyDomains || [];
  const anchor = candidate.anchorEmail.toLowerCase();

  const brandInThread =
    brandInSubjectHint(sides.subject, brandName) ||
    sides.leynaTexts.some((t) => brandInSubjectHint(t.slice(0, 500), brandName)) ||
    sides.clientTexts.some((t) => brandInSubjectHint(t.slice(0, 500), brandName));

  const anchorIsAgencyDomain = agencyDomains.some(
    (d) =>
      anchor === `*@${d}` ||
      anchor === `to@${d}` ||
      anchor.endsWith(`@${d}`) ||
      (anchor.includes("@") && (anchor.endsWith(`@${d}`) || anchor.endsWith(`.${d}`)))
  );
  const clientFromAgency = sides.clientFroms.some((e) =>
    agencyDomains.some((d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`))
  );
  // Contact / fil agence : rattacher UNIQUEMENT si la marque pitchée apparaît.
  if ((anchorIsAgencyDomain || clientFromAgency) && agencyDomains.length > 0) {
    return brandInThread;
  }

  // Destinataire CRM exact
  if (emails.some((e) => e === anchor)) {
    // CRM exact : OK, mais si on a aussi des domaines agence et PAS de domaine marque,
    // exiger quand même un hint marque pour éviter le mélange portefeuille.
    if (agencyDomains.length > 0 && brandDomains.length === 0) {
      return brandInThread;
    }
    return true;
  }

  // Ancre domaine marque (from:@ / to:@)
  if (
    brandDomains.some(
      (d) =>
        anchor === `*@${d}` ||
        anchor === `to@${d}` ||
        anchor.endsWith(`@${d}`)
    )
  ) {
    return true;
  }

  // Réponse client depuis un domaine marque
  if (sides.clientFroms.some((e) => emailMatchesBrandDomain(e, brandDomains))) {
    return true;
  }

  // Marque dans l'objet
  if (brandInThread) return true;

  // Variante local-part : seulement si ce local correspond à un email CRM précis
  // (jamais pour collaborations@ / partnerships@ génériques — déjà exclus en amont).
  if (anchor.startsWith("local:")) {
    const local = anchor.slice("local:".length);
    if (!isGenericLocalPart(local)) {
      const crmMatch = emails.find((e) => {
        const lp = e.split("@")[0] || "";
        return (
          lp === local ||
          lp.startsWith(`${local}-`) ||
          lp.startsWith(`${local}.`) ||
          lp.startsWith(`${local}_`)
        );
      });
      if (crmMatch) {
        // Le fil doit aussi toucher le domaine de ce CRM (évite un homonyme ailleurs).
        const crmDomain = domainFromEmail(crmMatch);
        if (
          crmDomain &&
          (sides.clientFroms.some(
            (e) => e.endsWith(`@${crmDomain}`) || e === crmMatch
          ) ||
            brandDomains.includes(crmDomain))
        ) {
          if (agencyDomains.includes(crmDomain)) return brandInThread;
          return true;
        }
      }
    }
  }

  return false;
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
  if (brandInSubjectHint(args.sides.subject, args.brandName)) score += 20;
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
 * Remonte loin (~5 ans) + analyse / note TOUS les vrais échanges (pas un seul fil récent).
 */
export async function getLeynaExchangeContext(args: {
  recipientEmails: string[];
  brandName?: string | null;
  talentNames?: string[];
  /** Nom d’agence (ex. Nice Work) : les fils @agence doivent citer la marque pitchée. */
  agencyName?: string | null;
}): Promise<LeynaExchangeContext> {
  const emails = Array.from(
    new Set(
      (args.recipientEmails || [])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter((e) => e.includes("@") && !e.endsWith("@glowupagence.fr"))
    )
  ).slice(0, MAX_CONTACTS);

  const brandName = String(args.brandName || "").trim() || "la marque";
  const agencyName = String(args.agencyName || "").trim();
  const talentNames = (args.talentNames || []).map((n) => n.trim()).filter(Boolean);
  /**
   * Agence multi-marques (ex. Nice Work → Kiko) :
   * les domaines des emails destinataires appartiennent à l’AGENCE, pas à la marque.
   * Sinon brandDomains absorbe @nicework…, agencyDomains devient vide, et tous les
   * fils de l’agence polluent l’historique de la marque pitchée.
   *
   * Même sans agencyName explicite : si les emails CRM sont sur un domaine qui
   * n’est pas celui de la marque (jade@nicework.fr sur fiche KIKO), traiter ces
   * domaines comme agence → exiger la marque pitchée dans le fil.
   */
  const agencyDistinct =
    Boolean(agencyName) &&
    agencyName.toLowerCase() !== brandName.toLowerCase();
  const brandDomainsFromName = resolveBrandDomains(brandName, []);
  const emailDomains = Array.from(
    new Set(
      emails
        .map((e) => domainFromEmail(e))
        .filter((d): d is string => Boolean(d))
    )
  );
  const foreignEmailDomains = emailDomains.filter(
    (d) => !brandDomainsFromName.includes(d)
  );
  let brandDomains: string[];
  let agencyDomains: string[];
  if (agencyDistinct) {
    brandDomains = brandDomainsFromName;
    agencyDomains = resolveBrandDomains(agencyName, emails).filter(
      (d) => !brandDomains.includes(d)
    );
  } else if (foreignEmailDomains.length > 0 && brandDomainsFromName.length > 0) {
    brandDomains = brandDomainsFromName;
    agencyDomains = foreignEmailDomains;
  } else {
    brandDomains = resolveBrandDomains(brandName, emails);
    agencyDomains = [];
  }

  if (emails.length === 0 && brandName.length < 2) {
    return emptyContext("empty");
  }

  type Candidate = {
    threadId: string;
    anchorEmail: string;
    internalDate: number | null;
    /** true = déjà confirmé replied (inbound domaine ou filtre contact). */
    knownReplied?: boolean;
  };
  const candidates: Candidate[] = [];
  const seenThreadIds = new Set<string>();

  const pushMsgs = (
    msgs: { id: string; threadId: string; internalDate: number | null }[],
    anchorEmail: string,
    knownReplied = false
  ) => {
    for (const m of msgs) {
      if (!m.threadId || seenThreadIds.has(m.threadId)) continue;
      seenThreadIds.add(m.threadId);
      candidates.push({
        threadId: m.threadId,
        anchorEmail,
        internalDate: m.internalDate,
        knownReplied,
      });
    }
  };

  /** Tous les fils envoyés à un contact (réponse ou non). */
  const pushAllSentTo = async (email: string) => {
    const sent = await findRecentSentToRecipient(
      LEYNA_FROM_EMAIL,
      email,
      LOOKBACK_DAYS
    );
    const unique: { id: string; threadId: string; internalDate: number | null }[] =
      [];
    const seen = new Set<string>();
    for (const m of sent.slice(0, MAX_SENT_SCAN_PER_CONTACT)) {
      if (!m.threadId || seen.has(m.threadId)) continue;
      seen.add(m.threadId);
      unique.push(m);
    }
    const flags = await mapPool(unique, ACTIVITY_CONCURRENCY, async (m) => {
      try {
        const act = await checkThreadActivity(LEYNA_FROM_EMAIL, m.threadId);
        return act.replied;
      } catch {
        return false;
      }
    });
    // D’abord les replied, puis le reste — on garde TOUT
    const ordered = [
      ...unique.filter((_, i) => flags[i]),
      ...unique.filter((_, i) => !flags[i]),
    ].slice(0, MAX_THREADS_PER_CONTACT);
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i]!;
      const replied = flags[unique.indexOf(m)] === true;
      pushMsgs([m], email, replied);
    }
  };

  let gmailAttempts = 0;
  let gmailFailures = 0;
  const trackGmail = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    gmailAttempts += 1;
    try {
      return await fn();
    } catch (e) {
      gmailFailures += 1;
      console.warn(
        `[leyna-exchange-context] ${label}:`,
        e instanceof Error ? e.message : e
      );
      return null;
    }
  };

  try {
    // 1) Par destinataire — TOUS les fils (pas seulement ceux avec réponse)
    for (const email of emails) {
      await trackGmail(`search ${email}`, () => pushAllSentTo(email));
      // Variantes local-part (eclavery@ → eclavery-ext@) — JAMAIS pour les
      // locaux génériques (collaborations, partnerships, contact…) sinon on
      // ramène Yepoda / Yazio / Airalo sur une autre marque.
      const local = email.split("@")[0]?.replace(/[^a-z0-9._+-]/gi, "") || "";
      if (local.length >= 5 && !isGenericLocalPart(local)) {
        await trackGmail(`local ${local}`, async () => {
          const q = `newer_than:${LOOKBACK_DAYS}d (from:${local} OR to:${local} OR cc:${local})`;
          const msgs = await findRecentMessagesByQuery(LEYNA_FROM_EMAIL, q, 50);
          pushMsgs(msgs.slice(0, 50), `local:${local}`, false);
        });
      }
    }

    // 2a) Inbound domaine marque (from:@) — réponses client = vrais échanges
    for (const domain of brandDomains.slice(0, 4)) {
      await trackGmail(`inbound ${domain}`, async () => {
        const q = `newer_than:${LOOKBACK_DAYS}d from:${domain}`;
        const msgs = await findRecentMessagesByQuery(
          LEYNA_FROM_EMAIL,
          q,
          MAX_INBOUND_BRAND
        );
        pushMsgs(msgs.slice(0, MAX_INBOUND_BRAND), `*@${domain}`, true);
      });
    }

    // 2b) Filet large to/cc domaine (complète si peu d’inbound)
    for (const domain of brandDomains.slice(0, 4)) {
      await trackGmail(`domain ${domain}`, async () => {
        const q = `newer_than:${LOOKBACK_DAYS}d (to:${domain} OR cc:${domain})`;
        const msgs = await findRecentMessagesByQuery(
          LEYNA_FROM_EMAIL,
          q,
          MAX_BRAND_SCAN
        );
        pushMsgs(msgs.slice(0, MAX_BRAND_SCAN), `to@${domain}`, false);
      });
    }

    // 3) Par nom de marque dans l'objet / corps (nom complet + slug compact uniquement —
    // pas les particules courtes type « herma » seules, trop bruyantes).
    const brandToken = brandName.replace(/"/g, "").trim();
    const brandCompact = brandToken
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "");
    const brandQueries: string[] = [];
    if (brandToken.length >= 3) {
      brandQueries.push(`"${brandToken}"`);
      brandQueries.push(`subject:"${brandToken}"`);
    }
    if (brandCompact.length >= 5 && brandCompact.toLowerCase() !== brandToken.toLowerCase()) {
      brandQueries.push(`"${brandCompact}"`);
      brandQueries.push(`subject:${brandCompact}`);
    }
    if (brandQueries.length > 0) {
      await trackGmail("brand subject", async () => {
        const q = `newer_than:${LOOKBACK_DAYS}d (${brandQueries.join(" OR ")})`;
        const msgs = await findRecentMessagesByQuery(
          LEYNA_FROM_EMAIL,
          q,
          MAX_BRAND_SCAN
        );
        pushMsgs(msgs.slice(0, MAX_BRAND_SCAN), `brand:${brandToken}`, false);
      });
    }

    // Priorité : knownReplied d'abord, puis plus récents
    candidates.sort((a, b) => {
      const ra = a.knownReplied ? 1 : 0;
      const rb = b.knownReplied ? 1 : 0;
      if (rb !== ra) return rb - ra;
      return (b.internalDate || 0) - (a.internalDate || 0);
    });

    const toInspect = candidates.slice(0, MAX_CANDIDATES_TO_SCORE);

    // Activity en parallèle (knownReplied → true)
    const activityFlags = await mapPool(toInspect, ACTIVITY_CONCURRENCY, async (c) => {
      if (c.knownReplied) return true;
      try {
        const act = await checkThreadActivity(LEYNA_FROM_EMAIL, c.threadId);
        return act.replied;
      } catch {
        return false;
      }
    });

    type ScoredDraft = {
      candidate: Candidate;
      sides: ThreadSides;
      score: number;
      tone: LeynaExchangeTone | null;
      replyEmail: string;
      status: "exchange" | "sent_no_reply";
    };
    const drafts: ScoredDraft[] = [];

    for (let i = 0; i < toInspect.length; i++) {
      const c = toInspect[i]!;
      const replied = Boolean(activityFlags[i]);
      const sides = await loadThreadSides(c.threadId);
      if (!sides) continue;
      if (isAutoReplySubject(sides.subject)) continue;
      // Il faut au moins du contenu Leyna (sinon bruit)
      if (sides.leynaTexts.length === 0 && sides.clientTexts.length === 0) continue;

      const hasClientReply =
        replied && sides.clientTexts.length > 0 && sides.clientFroms.length > 0;

      if (!hasClientReply && sides.leynaTexts.length === 0) continue;

      // Filtre dur : le fil doit concerner CETTE marque (CRM / domaine / objet).
      // Sans ça, collaborations@ / partnerships@ ramènent Yepoda, Yazio, Airalo…
      if (
        !threadIsRelevantToBrand({
          sides,
          candidate: c,
          emails,
          brandDomains,
          brandName,
          agencyDomains,
        })
      ) {
        continue;
      }

      const hasBrandDomainReply = sides.clientFroms.some((e) =>
        emailMatchesBrandDomain(e, brandDomains)
      );

      let score = scoreThread({ sides, brandDomains, brandName });
      if (hasClientReply) {
        if (hasBrandDomainReply) score += 40;
        else score += 10; // déjà filtré marque (sujet / CRM)
        if (sides.turns.length >= 6) score += 20;
        else if (sides.turns.length >= 4) score += 10;
      } else {
        score = Math.max(score - 10, 16);
        if (brandInSubjectHint(sides.subject, brandName)) score += 8;
      }
      if (score < 12) continue;

      const replyEmail = hasClientReply
        ? sides.clientFroms.find((e) => emailMatchesBrandDomain(e, brandDomains)) ||
          sides.clientFroms.find((e) => emails.includes(e.toLowerCase())) ||
          sides.clientFroms[0] ||
          c.anchorEmail
        : emails.includes(c.anchorEmail.toLowerCase())
          ? c.anchorEmail
          : emails.find((e) => emailMatchesBrandDomain(e, brandDomains)) ||
            emails[0] ||
            c.anchorEmail;

      drafts.push({
        candidate: c,
        sides,
        score,
        tone: hasClientReply ? detectToneFromThread(sides) : null,
        replyEmail,
        status: hasClientReply ? "exchange" : "sent_no_reply",
      });
    }

    // Échanges d’abord, puis envois ; on note TOUT jusqu’à MAX_HITS
    drafts.sort((a, b) => {
      const ea = a.status === "exchange" ? 1 : 0;
      const eb = b.status === "exchange" ? 1 : 0;
      if (eb !== ea) return eb - ea;
      if (b.score !== a.score) return b.score - a.score;
      return (
        (b.sides.lastDate ? new Date(b.sides.lastDate).getTime() : 0) -
        (a.sides.lastDate ? new Date(a.sides.lastDate).getTime() : 0)
      );
    });
    const draftsToNote = drafts.slice(0, MAX_HITS);

    const scored = await mapPool(draftsToNote, NOTES_CONCURRENCY, async (d) => {
      const { notes, alerts } =
        d.status === "exchange"
          ? await extractNotesAndAlerts({
              brandName,
              talentNames,
              subject: d.sides.subject,
              leynaTexts: d.sides.leynaTexts,
              clientTexts: d.sides.clientTexts,
              clientFroms: d.sides.clientFroms,
              brandDomains,
              turns: d.sides.turns,
            })
          : {
              notes: [
                `ENVOI SANS RÉPONSE (objet : ${d.sides.subject || "—"}) — ${d.sides.turns.length} message(s) Leyna.`,
                ...d.sides.leynaTexts.slice(0, 3).map((t) => {
                  const snip = t
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/&nbsp;/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 280);
                  return `- Pitch Leyna : « ${snip}${snip.length >= 280 ? "…" : ""} »`;
                }),
              ].join("\n"),
              alerts: [] as string[],
            };
      return {
        score: d.score + (alerts.length > 0 ? 30 : 0),
        hit: {
          email: d.replyEmail,
          subject: d.sides.subject,
          lastExchangeAt: d.sides.lastDate,
          tone: d.tone,
          notes,
          alerts,
          clientSnippet:
            d.sides.clientTexts[d.sides.clientTexts.length - 1]?.slice(0, 320) ||
            null,
          status: d.status,
          messageCount: d.sides.turns.length,
        } satisfies LeynaExchangeContactHit,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const hits = scored
      .map((s) => s.hit)
      .sort((a, b) => {
        const ea = a.status === "exchange" ? 1 : 0;
        const eb = b.status === "exchange" ? 1 : 0;
        if (eb !== ea) return eb - ea;
        const ta = a.lastExchangeAt ? new Date(a.lastExchangeAt).getTime() : 0;
        const tb = b.lastExchangeAt ? new Date(b.lastExchangeAt).getTime() : 0;
        return tb - ta;
      });

    if (hits.length === 0) {
      // Toutes les requêtes Gmail ont échoué (OAuth, réseau…) ≠ « aucun historique ».
      if (gmailAttempts > 0 && gmailFailures >= gmailAttempts) {
        return emptyContext("failed");
      }
      return emptyContext("empty");
    }

    const exchangeHits = hits.filter((h) => h.status !== "sent_no_reply");
    const hasExchange = exchangeHits.length > 0;
    const hasSentNoReplyOnly = !hasExchange && hits.length > 0;

    // Dès qu’un vrai échange tutoie, on garde le tutoiement (jamais rebasculer
    // en vouvoiement à cause d’un vieux mail d’ouverture en « vous »).
    const anyTu = exchangeHits.some((h) => h.tone === "tu");
    const anyVous = exchangeHits.some((h) => h.tone === "vous");
    const tone: LeynaExchangeTone | null = anyTu
      ? "tu"
      : anyVous
        ? "vous"
        : null;

    // Aligne l’affichage des fils : si la relation tutoie, plus de badge « vouvoiement ».
    if (tone === "tu") {
      for (const h of hits) {
        if (h.status !== "sent_no_reply") h.tone = "tu";
      }
    }

    const allAlerts = Array.from(
      new Set(hits.flatMap((h) => h.alerts || []).map((a) => a.trim()).filter(Boolean))
    );

    const nEx = exchangeHits.length;
    const nSent = hits.length - nEx;
    const bannerLabel = hasExchange
      ? nEx === 1 && nSent === 0
        ? `Échange Leyna trouvé avec ${hits[0].email}${tone ? ` · ${tone === "tu" ? "tutoiement" : "vouvoiement"}` : ""}${allAlerts.length ? " · ⚠ alerte" : ""}`
        : `Historique Leyna : ${nEx} échange(s) + ${nSent} envoi(s) notés (${hits.length} fils)${tone ? ` · ${tone === "tu" ? "tutoiement" : "vouvoiement"}` : ""}${allAlerts.length ? " · ⚠ alerte" : ""}`
      : `Historique Leyna : ${nSent} envoi(s) sans réponse notés`;

    const detailsFr = hits
      .map((h, idx) => {
        const kind =
          h.status === "sent_no_reply" ? "ENVOI SANS RÉPONSE" : "ÉCHANGE";
        return `${idx + 1}. [${kind}] ${h.email}${h.subject ? ` « ${h.subject} »` : ""}${
          h.lastExchangeAt
            ? ` (${new Date(h.lastExchangeAt).toLocaleDateString("fr-FR")})`
            : ""
        }${h.messageCount ? ` · ${h.messageCount} msg` : ""}${
          h.tone ? ` [${h.tone}]` : ""
        }${h.alerts?.length ? `\n  ALERTES : ${h.alerts.join(" | ")}` : ""}
  Notes : ${h.notes}`;
      })
      .join("\n\n");

    const alertsBlockFr =
      allAlerts.length > 0
        ? `
⚠ ALERTES URGENTES (prioritaires sur le pitch) :
${allAlerts.map((a) => `- ${a}`).join("\n")}
- Si redirection vers une autre personne : le mail DOIT respecter cette consigne (ne pas ignorer).
- Si stop / blacklist / contact parti : ne pas pitcher comme si de rien n’était — signaler le blocage dans l’angle.
`
        : "";

    const promptBlockFr = hasExchange
      ? `
═══ CONTEXTE BOÎTE LEYNA (PRIORITAIRE — ${nEx} échanges + ${nSent} envois analysés & notés ; historique ~5 ans) ═══
${detailsFr}
${alertsBlockFr}
ANCRAGE SANS NOMMER PERSONNE (obligatoire) :
- Formule en 2e personne : « suite à notre échange », « comme tu me l'indiquais » / « comme vous me l'indiquiez ».
- INTERDIT ABSOLU de citer un prénom, nom ou email de contact dans le mail — même si les notes les mentionnent.
- Les notes ci-dessous sont POUR TOI (contexte) ; le destinataire ne doit voir aucun nom de personne.
- Tiens compte de TOUT l'historique (pas seulement le dernier fil) : collabs déjà en cours, pitches sans réponse, RDV, produits.

Règles d'utilisation OBLIGATOIRES :
- Ce n'est PAS un premier contact. Dès le 1er paragraphe après le salut, ancre l'échange passé SANS nommer personne.
- INTERDIT : démarrer comme une découverte froide SANS ancrer l'historique.
- ${
          tone === "tu"
            ? "TUTOIEMENT obligatoire (tu / te / ton)."
            : tone === "vous"
              ? "Vouvoiement obligatoire."
              : "Garde le vouvoiement sauf si les notes indiquent du tutoiement."
        }
- Si refus / planning bouclé : le dire, puis pitcher la NOUVELLE offre comme une suite.
- Si collab talent×marque déjà en place : s'appuyer dessus ; nouveau format = suite naturelle.
- N'invente aucun fait hors des notes ci-dessus.
`.trim()
      : `
═══ HISTORIQUE BOÎTE LEYNA (${nSent} envois sans réponse analysés) ═══
${detailsFr}
- Pas encore de vraie réponse client : reste factuel, n’invente pas de relation.
- Tu peux mentionner qu’on a déjà proposé des talents / formats (sans spammer le même pitch).
`.trim();

    const promptBlockEn = hasExchange
      ? `
═══ LEYNA MAILBOX CONTEXT (PRIORITY — ${nEx} exchanges + ${nSent} sends analyzed; ~5y) ═══
${detailsFr}
${
  allAlerts.length > 0
    ? `\n⚠ URGENT ALERTS:\n${allAlerts.map((a) => `- ${a}`).join("\n")}\n`
    : ""
}
ANCHOR WITHOUT NAMING ANYONE. Use the FULL history (not only the latest thread).
- ${tone === "tu" ? "Use tu." : tone === "vous" ? "Use vous." : "Default to vous unless notes say tu."}
`.trim()
      : `
═══ LEYNA HISTORY (${nSent} unreplied sends) ═══
${detailsFr}
- No real client reply yet — do not invent a relationship.
`.trim();

    return {
      hasExchange,
      tone,
      contacts: hits,
      alerts: allAlerts,
      bannerLabel,
      promptBlockFr,
      promptBlockEn,
      scanStatus: "ok",
      fetchedAt: new Date().toISOString(),
      hasSentNoReplyOnly,
    };
  } catch (e) {
    console.warn(
      "[leyna-exchange-context] échec global soft-fail:",
      e instanceof Error ? e.message : e
    );
    return emptyContext("failed");
  }
}
