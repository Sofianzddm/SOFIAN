import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  executeAgencyOutreachSend,
  executeAgencyOutreachSchedule,
  computeAgencyStaggeredTimes,
} from "@/lib/agency-outreach-send";
import { translateEmail, TranslateEmailError } from "@/lib/translate-email";

/**
 * POST → envoie le MÊME mail à plusieurs contacts d'agences, chacun
 * individuellement : 1 mail par contact (thread Gmail, tracking et cycle
 * 45 jours indépendants), variables {{contact.*}} / {{agence.*}} personnalisées.
 *
 * Traduction automatique : le mail est rédigé une seule fois dans
 * `sourceLanguage`. Les contacts dont la langue diffère reçoivent une version
 * traduite (FR ↔ EN), générée une seule fois et réutilisée par langue.
 *
 * Body : { targetIds: string[], subject, bodyHtml, sourceLanguage?, force?, stream? }
 * Si `stream: true`, réponse NDJSON (progression puis résultat).
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

const MAX_BULK = 25;

type Lang = "fr" | "en";

function normalizeLang(value: unknown): Lang {
  return value === "en" ? "en" : "fr";
}

type ProgressEvent = {
  type: "progress";
  done: number;
  total: number;
  phase: "translation" | "sending";
  label: string;
};

type BulkResult = {
  sent: number;
  /** Nombre de mails programmés (mode « envoi décalé »). */
  scheduled: number;
  /** Étalement : première et dernière échéance (ISO), pour l'affichage. */
  firstScheduledAt: string | null;
  lastScheduledAt: string | null;
  failed: { email: string; error: string }[];
  needsConfirmation: {
    targetId: string;
    email: string;
    message: string;
    alreadyContactedAt?: string;
    suggestedNextRecontactAt?: string;
  }[];
  translated: number;
  translationFailed: Lang | null;
};

type BulkTarget = { id: string; email: string; language: string | null };

function langLabel(lang: Lang): string {
  return lang === "en" ? "anglais" : "français";
}

/**
 * Traduit le mail dans chaque langue nécessaire (une fois par langue, réutilisée
 * ensuite). Renvoie une version par langue + la langue dont la traduction a
 * échoué (fallback source). Reporte la progression de la phase « traduction ».
 */
async function buildVersions(
  params: {
    targets: BulkTarget[];
    subject: string;
    bodyHtml: string;
    sourceLanguage: Lang;
  },
  total: number,
  onProgress: (event: ProgressEvent) => void
): Promise<{
  versions: Map<Lang, { subject: string; bodyHtml: string }>;
  translationFailed: Lang | null;
  done: number;
}> {
  const { targets, subject, bodyHtml, sourceLanguage } = params;
  const neededLangs = new Set<Lang>(targets.map((t) => normalizeLang(t.language)));
  const langsToTranslate = [...neededLangs].filter((l) => l !== sourceLanguage);

  const versions = new Map<Lang, { subject: string; bodyHtml: string }>();
  versions.set(sourceLanguage, { subject, bodyHtml });

  let translationFailed: Lang | null = null;
  let done = 0;

  for (const lang of langsToTranslate) {
    onProgress({
      type: "progress",
      done,
      total,
      phase: "translation",
      label: `Traduction en ${langLabel(lang)}…`,
    });
    try {
      const tr = await translateEmail({ subject, bodyHtml, targetLanguage: lang });
      versions.set(lang, { subject: tr.subject, bodyHtml: tr.body });
    } catch (e) {
      if (e instanceof TranslateEmailError) {
        translationFailed = lang;
        versions.set(lang, { subject, bodyHtml });
      } else {
        throw e;
      }
    }
    done += 1;
    onProgress({
      type: "progress",
      done,
      total,
      phase: "translation",
      label: `Traduction en ${langLabel(lang)} terminée`,
    });
  }

  return { versions, translationFailed, done };
}

function emptyResult(): BulkResult {
  return {
    sent: 0,
    scheduled: 0,
    firstScheduledAt: null,
    lastScheduledAt: null,
    failed: [],
    needsConfirmation: [],
    translated: 0,
    translationFailed: null,
  };
}

async function runBulkSend(
  params: {
    targets: BulkTarget[];
    subject: string;
    bodyHtml: string;
    sourceLanguage: Lang;
    sentById: string;
    force: boolean;
  },
  onProgress: (event: ProgressEvent) => void
): Promise<BulkResult> {
  const { targets, subject, bodyHtml, sourceLanguage, sentById, force } = params;

  const neededLangs = new Set<Lang>(targets.map((t) => normalizeLang(t.language)));
  const total = [...neededLangs].filter((l) => l !== sourceLanguage).length + targets.length;

  const { versions, translationFailed, done: doneAfterTr } = await buildVersions(
    { targets, subject, bodyHtml, sourceLanguage },
    total,
    onProgress
  );

  const result = emptyResult();
  result.translationFailed = translationFailed;
  let done = doneAfterTr;

  for (const target of targets) {
    const lang = normalizeLang(target.language);
    const version = versions.get(lang) ?? { subject, bodyHtml };
    onProgress({
      type: "progress",
      done,
      total,
      phase: "sending",
      label: `Envoi à ${target.email}…`,
    });
    const res = await executeAgencyOutreachSend(target.id, {
      subject: version.subject,
      bodyHtml: version.bodyHtml,
      sentById,
      force,
    });
    if (res.ok && lang !== sourceLanguage) result.translated += 1;
    if (res.ok) {
      result.sent += 1;
    } else if (res.needsConfirmation) {
      result.needsConfirmation.push({
        targetId: target.id,
        email: target.email,
        message: res.error,
        alreadyContactedAt: res.alreadyContactedAt,
        suggestedNextRecontactAt: res.suggestedNextRecontactAt,
      });
    } else {
      result.failed.push({ email: target.email, error: res.error });
    }
    done += 1;
    onProgress({
      type: "progress",
      done,
      total,
      phase: "sending",
      label: `${result.sent} mail${result.sent > 1 ? "s" : ""} envoyé${result.sent > 1 ? "s" : ""}`,
    });
  }

  return result;
}

/**
 * Mode « envoi décalé » : programme (sans envoyer) chaque mail à une échéance
 * étalée dans la journée (jusqu'à 18h30 Paris). Le cron enverra effectivement.
 * Même garde-fou anti double-contact que l'envoi immédiat (needsConfirmation).
 */
async function runBulkSchedule(
  params: {
    targets: BulkTarget[];
    subject: string;
    bodyHtml: string;
    sourceLanguage: Lang;
    sentById: string;
    force: boolean;
  },
  onProgress: (event: ProgressEvent) => void
): Promise<BulkResult> {
  const { targets, subject, bodyHtml, sourceLanguage, sentById, force } = params;

  const neededLangs = new Set<Lang>(targets.map((t) => normalizeLang(t.language)));
  const total = [...neededLangs].filter((l) => l !== sourceLanguage).length + targets.length;

  const { versions, translationFailed, done: doneAfterTr } = await buildVersions(
    { targets, subject, bodyHtml, sourceLanguage },
    total,
    onProgress
  );

  const result = emptyResult();
  result.translationFailed = translationFailed;
  let done = doneAfterTr;

  const times = computeAgencyStaggeredTimes(targets.length);
  const scheduledDates: Date[] = [];

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const lang = normalizeLang(target.language);
    const version = versions.get(lang) ?? { subject, bodyHtml };
    const when = times[i] ?? times[times.length - 1] ?? new Date();

    onProgress({
      type: "progress",
      done,
      total,
      phase: "sending",
      label: `Programmation de ${target.email}…`,
    });

    const res = await executeAgencyOutreachSchedule(target.id, {
      subject: version.subject,
      bodyHtml: version.bodyHtml,
      scheduledSendAt: when,
      sentById,
      force,
    });

    if (res.ok) {
      result.scheduled += 1;
      if (lang !== sourceLanguage) result.translated += 1;
      scheduledDates.push(when);
    } else if (res.needsConfirmation) {
      result.needsConfirmation.push({
        targetId: target.id,
        email: target.email,
        message: res.error,
        alreadyContactedAt: res.alreadyContactedAt,
        suggestedNextRecontactAt: res.suggestedNextRecontactAt,
      });
    } else {
      result.failed.push({ email: target.email, error: res.error });
    }

    done += 1;
    onProgress({
      type: "progress",
      done,
      total,
      phase: "sending",
      label: `${result.scheduled} mail${result.scheduled > 1 ? "s" : ""} programmé${result.scheduled > 1 ? "s" : ""}`,
    });
  }

  if (scheduledDates.length > 0) {
    scheduledDates.sort((a, b) => a.getTime() - b.getTime());
    result.firstScheduledAt = scheduledDates[0].toISOString();
    result.lastScheduledAt = scheduledDates[scheduledDates.length - 1].toISOString();
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      targetIds?: string[];
      subject?: string;
      bodyHtml?: string;
      sourceLanguage?: string;
      force?: boolean;
      stream?: boolean;
      mode?: string;
    };
    const targetIds = Array.isArray(body.targetIds)
      ? body.targetIds.filter((id) => typeof id === "string" && id.trim())
      : [];
    const subject = String(body.subject || "").trim();
    const bodyHtml = String(body.bodyHtml || "").trim();
    const sourceLanguage = normalizeLang(body.sourceLanguage);
    const force = body.force === true;
    const stream = body.stream === true;
    // "now" (défaut) : tout part immédiatement ; "staggered" : étalé jusqu'à 18h30.
    const mode = body.mode === "staggered" ? "staggered" : "now";

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "Aucun destinataire." }, { status: 400 });
    }
    if (targetIds.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BULK} destinataires par envoi.` },
        { status: 400 }
      );
    }
    if (!subject || !bodyHtml) {
      return NextResponse.json(
        { error: "Sujet et corps du mail requis." },
        { status: 400 }
      );
    }

    const targets = await prisma.agencyOutreachTarget.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, email: true, language: true },
    });
    if (targets.length === 0) {
      return NextResponse.json({ error: "Contacts introuvables." }, { status: 404 });
    }

    const sendParams = {
      targets,
      subject,
      bodyHtml,
      sourceLanguage,
      sentById: session.user.id,
      force,
    };
    const runBulk = mode === "staggered" ? runBulkSchedule : runBulkSend;

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          const write = (obj: unknown) => {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          };
          try {
            const result = await runBulk(sendParams, (event) => write(event));
            write({ type: "result", ...result });
          } catch (error) {
            console.error("POST /api/agency-outreach/send-bulk (stream):", error);
            write({
              type: "error",
              error: error instanceof Error ? error.message : "Erreur serveur",
            });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await runBulk(sendParams, () => {});
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agency-outreach/send-bulk:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
