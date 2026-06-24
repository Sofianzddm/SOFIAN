import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { executeOutreachSend } from "@/lib/outreach-send";
import { translateEmail, TranslateEmailError } from "@/lib/translate-email";

/**
 * POST → envoie le MÊME mail à plusieurs clients d'une marque, chacun
 * individuellement : 1 mail par contact (thread Gmail, tracking et cycle
 * 45 jours indépendants), variables {{contact.*}} personnalisées par contact.
 *
 * Traduction automatique : le mail est rédigé une seule fois dans
 * `sourceLanguage`. Les contacts dont la langue (`target.language`) diffère
 * reçoivent automatiquement une version traduite (FR ↔ EN), générée une
 * seule fois et réutilisée pour tous les contacts de cette langue.
 *
 * Body : { targetIds: string[], subject, bodyHtml, sourceLanguage?, force?, stream? }
 *
 * Si `stream: true`, la réponse est un flux NDJSON (application/x-ndjson) :
 * une ligne JSON par événement de progression (`{type:"progress",...}`), puis
 * une ligne finale `{type:"result",...}` (ou `{type:"error",...}`). Cela permet
 * au front d'afficher une barre de progression pendant la traduction et l'envoi.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

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
  failed: { email: string; error: string }[];
  needsConfirmation: {
    targetId: string;
    email: string;
    message: string;
    alreadyContactedAt?: string;
    suggestedNextRecontactAt?: string;
  }[];
  hubspotSynced: number;
  translated: number;
  translationFailed: Lang | null;
};

function langLabel(lang: Lang): string {
  return lang === "en" ? "anglais" : "français";
}

/**
 * Exécute la traduction puis l'envoi individuel, en signalant la progression
 * via `onProgress`. Le calcul est identique en mode JSON et en mode flux ;
 * seul le transport de la progression change.
 */
async function runBulkSend(
  params: {
    targets: { id: string; email: string; language: string | null }[];
    subject: string;
    bodyHtml: string;
    sourceLanguage: Lang;
    sentById: string;
    force: boolean;
  },
  onProgress: (event: ProgressEvent) => void
): Promise<BulkResult> {
  const { targets, subject, bodyHtml, sourceLanguage, sentById, force } = params;

  // Langues à traduire (toutes celles présentes sauf la langue source).
  const neededLangs = new Set<Lang>(targets.map((t) => normalizeLang(t.language)));
  const langsToTranslate = [...neededLangs].filter((l) => l !== sourceLanguage);

  // Une unité de progression par langue à traduire + une par mail à envoyer.
  const total = langsToTranslate.length + targets.length;
  let done = 0;

  const versions = new Map<Lang, { subject: string; bodyHtml: string }>();
  versions.set(sourceLanguage, { subject, bodyHtml });

  let translationFailed: Lang | null = null;

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
      // Si la traduction échoue, on retombe sur la version d'origine plutôt
      // que de bloquer tout l'envoi (l'erreur est signalée au front).
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

  let sent = 0;
  let translated = 0;
  let hubspotSynced = 0;
  const failed: BulkResult["failed"] = [];
  const needsConfirmation: BulkResult["needsConfirmation"] = [];

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
    const result = await executeOutreachSend(target.id, {
      subject: version.subject,
      bodyHtml: version.bodyHtml,
      sentById,
      force,
    });
    if (result.ok && lang !== sourceLanguage) translated += 1;
    if (result.ok) {
      sent += 1;
      if (result.hubspotSynced) hubspotSynced += 1;
    } else if (result.needsConfirmation) {
      needsConfirmation.push({
        targetId: target.id,
        email: target.email,
        message: result.error,
        alreadyContactedAt: result.alreadyContactedAt,
        suggestedNextRecontactAt: result.suggestedNextRecontactAt,
      });
    } else {
      failed.push({ email: target.email, error: result.error });
    }
    done += 1;
    onProgress({
      type: "progress",
      done,
      total,
      phase: "sending",
      label: `${sent} mail${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}`,
    });
  }

  return { sent, failed, needsConfirmation, hubspotSynced, translated, translationFailed };
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
    };
    const targetIds = Array.isArray(body.targetIds)
      ? body.targetIds.filter((id) => typeof id === "string" && id.trim())
      : [];
    const subject = String(body.subject || "").trim();
    const bodyHtml = String(body.bodyHtml || "").trim();
    const sourceLanguage = normalizeLang(body.sourceLanguage);
    const force = body.force === true;
    const stream = body.stream === true;

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

    const targets = await prisma.outreachTarget.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, email: true, language: true },
    });
    if (targets.length === 0) {
      return NextResponse.json({ error: "Clients introuvables." }, { status: 404 });
    }

    const sendParams = {
      targets,
      subject,
      bodyHtml,
      sourceLanguage,
      sentById: session.user.id,
      force,
    };

    // Mode flux : NDJSON, une ligne par événement de progression puis le résultat.
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          const write = (obj: unknown) => {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          };
          try {
            const result = await runBulkSend(sendParams, (event) => write(event));
            write({ type: "result", ...result });
          } catch (error) {
            console.error("POST /api/outreach/send-bulk (stream):", error);
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

    // Mode JSON classique (rétro-compatible).
    const result = await runBulkSend(sendParams, () => {});
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/outreach/send-bulk:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
