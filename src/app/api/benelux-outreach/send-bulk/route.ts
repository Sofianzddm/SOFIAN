import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { executeBeneluxOutreachSend } from "@/lib/benelux-outreach-send";
import { translateEmail, TranslateEmailError } from "@/lib/translate-email";

/**
 * POST → envoie le MÊME mail à plusieurs prospects BENELUX, chacun
 * individuellement (1 mail / thread / cycle indépendant), variables
 * {{contact.*}} personnalisées + traduction automatique FR ↔ EN.
 *
 * Body : { targetIds: string[], subject, bodyHtml, sourceLanguage?, force?, stream? }
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
  translated: number;
  translationFailed: Lang | null;
};

function langLabel(lang: Lang): string {
  return lang === "en" ? "anglais" : "français";
}

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

  const neededLangs = new Set<Lang>(targets.map((t) => normalizeLang(t.language)));
  const langsToTranslate = [...neededLangs].filter((l) => l !== sourceLanguage);

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
    const result = await executeBeneluxOutreachSend(target.id, {
      subject: version.subject,
      bodyHtml: version.bodyHtml,
      sentById,
      force,
    });
    if (result.ok && lang !== sourceLanguage) translated += 1;
    if (result.ok) {
      sent += 1;
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

  return { sent, failed, needsConfirmation, translated, translationFailed };
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

    const targets = await prisma.beneluxOutreachTarget.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, email: true, language: true },
    });
    if (targets.length === 0) {
      return NextResponse.json({ error: "Prospects introuvables." }, { status: 404 });
    }

    const sendParams = {
      targets,
      subject,
      bodyHtml,
      sourceLanguage,
      sentById: session.user.id,
      force,
    };

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
            console.error("POST /api/benelux-outreach/send-bulk (stream):", error);
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

    const result = await runBulkSend(sendParams, () => {});
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/benelux-outreach/send-bulk:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
