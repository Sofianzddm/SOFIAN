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
 * Body : { targetIds: string[], subject, bodyHtml, sourceLanguage?, force? }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const MAX_BULK = 25;

type Lang = "fr" | "en";

function normalizeLang(value: unknown): Lang {
  return value === "en" ? "en" : "fr";
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
    };
    const targetIds = Array.isArray(body.targetIds)
      ? body.targetIds.filter((id) => typeof id === "string" && id.trim())
      : [];
    const subject = String(body.subject || "").trim();
    const bodyHtml = String(body.bodyHtml || "").trim();
    const sourceLanguage = normalizeLang(body.sourceLanguage);
    const force = body.force === true;

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

    // Traduction automatique : on traduit le mail dans CHAQUE langue présente
    // parmi les contacts (autre que la langue source), une seule fois, puis on
    // réutilise la version pour tous les contacts de cette langue.
    const versions = new Map<Lang, { subject: string; bodyHtml: string }>();
    versions.set(sourceLanguage, { subject, bodyHtml });

    let translated = 0;
    let translationFailed: Lang | null = null;
    const neededLangs = new Set<Lang>(
      targets.map((t) => normalizeLang(t.language))
    );
    for (const lang of neededLangs) {
      if (versions.has(lang)) continue;
      try {
        const tr = await translateEmail({
          subject,
          bodyHtml,
          targetLanguage: lang,
        });
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
    }

    let sent = 0;
    let hubspotSynced = 0;
    const failed: { email: string; error: string }[] = [];
    const needsConfirmation: {
      targetId: string;
      email: string;
      message: string;
      alreadyContactedAt?: string;
      suggestedNextRecontactAt?: string;
    }[] = [];

    for (const target of targets) {
      const lang = normalizeLang(target.language);
      const version = versions.get(lang) ?? { subject, bodyHtml };
      const result = await executeOutreachSend(target.id, {
        subject: version.subject,
        bodyHtml: version.bodyHtml,
        sentById: session.user.id,
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
    }

    return NextResponse.json({
      sent,
      failed,
      needsConfirmation,
      hubspotSynced,
      translated,
      translationFailed,
    });
  } catch (error) {
    console.error("POST /api/outreach/send-bulk:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
