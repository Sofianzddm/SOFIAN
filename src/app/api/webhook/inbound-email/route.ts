import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingBody = {
  from?: unknown;
  subject?: unknown;
  body?: unknown;
  date?: unknown;
  messageId?: unknown;
  threadId?: unknown;
  isReply?: unknown;
  talentEmail?: unknown;
  talentName?: unknown;
  category?: unknown;
  confidence?: unknown;
  priority?: unknown;
  extractedBrand?: unknown;
  extractedBudget?: unknown;
  extractedDeadline?: unknown;
  extractedDeliverables?: unknown;
  briefSummary?: unknown;
};

type ExistingRow = { id: string };
type InsertedRow = { id: string };

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-webhook-secret") || "";
    if (!process.env.INBOUND_EMAIL_SECRET || secret !== process.env.INBOUND_EMAIL_SECRET) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as IncomingBody | null;
    const from = typeof payload?.from === "string" ? payload.from.trim() : "";
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const body = typeof payload?.body === "string" ? payload.body : "";
    const dateRaw = typeof payload?.date === "string" ? payload.date : "";
    const messageId = typeof payload?.messageId === "string" ? payload.messageId.trim() : "";
    const threadId = typeof payload?.threadId === "string" ? payload.threadId.trim() : "";
    const isReply = payload?.isReply === true;
    const talentEmail = typeof payload?.talentEmail === "string" ? payload.talentEmail.trim() : "";
    const talentName = typeof payload?.talentName === "string" ? payload.talentName.trim() : "";
    const category = typeof payload?.category === "string" ? payload.category.trim() : "";
    const confidence =
      typeof payload?.confidence === "number" && Number.isFinite(payload.confidence)
        ? payload.confidence
        : null;
    const priority = typeof payload?.priority === "string" ? payload.priority.trim() : "";
    const extractedBrand =
      typeof payload?.extractedBrand === "string" ? payload.extractedBrand.trim() : "";
    const extractedBudget =
      typeof payload?.extractedBudget === "string" ? payload.extractedBudget.trim() : "";
    const extractedDeadline =
      typeof payload?.extractedDeadline === "string" ? payload.extractedDeadline.trim() : "";
    const extractedDeliverables =
      typeof payload?.extractedDeliverables === "string"
        ? payload.extractedDeliverables.trim()
        : "";
    const briefSummary = typeof payload?.briefSummary === "string" ? payload.briefSummary.trim() : "";
    const parsedDate = dateRaw ? new Date(dateRaw) : new Date();

    if (!from || !subject || !body || !messageId || Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Requête invalide : from, subject, body, date, messageId requis." },
        { status: 400 }
      );
    }

    if (isReply) {
      if (!threadId) {
        return NextResponse.json(
          { error: "Requête invalide : threadId requis quand isReply=true." },
          { status: 400 }
        );
      }

      const existingThread = (await prisma.$queryRaw`
        SELECT "id"
        FROM "DemandeEntrante"
        WHERE "gmailThreadId" = ${threadId}
        LIMIT 1
      `) as ExistingRow[];

      if (Array.isArray(existingThread) && existingThread.length > 0) {
        const hasRepliedColumnRows = (await prisma.$queryRaw`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'DemandeEntrante'
              AND column_name = 'replied'
          ) AS "hasReplied"
        `) as Array<{ hasReplied: boolean }>;
        const hasRepliedColumn = Boolean(hasRepliedColumnRows[0]?.hasReplied);

        if (hasRepliedColumn) {
          await prisma.$executeRaw`
            UPDATE "DemandeEntrante"
            SET "replied" = true, "status" = 'repondu', "updatedAt" = NOW()
            WHERE "id" = ${existingThread[0].id}
          `;
        } else {
          await prisma.$executeRaw`
            UPDATE "DemandeEntrante"
            SET "status" = 'repondu', "updatedAt" = NOW()
            WHERE "id" = ${existingThread[0].id}
          `;
        }
      }

      return NextResponse.json({ success: true, action: "marked_replied" });
    }

    const existing = (await prisma.$queryRaw`
      SELECT "id"
      FROM "DemandeEntrante"
      WHERE "gmailMessageId" = ${messageId}
      LIMIT 1
    `) as ExistingRow[];

    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ success: true, id: existing[0].id, action: "already_exists" });
    }

    // Un seul enregistrement par fil Gmail (évite 4× "Re: Lazartigue" pour le même thread)
    if (threadId) {
      const existingThread = (await prisma.$queryRaw`
        SELECT "id"
        FROM "DemandeEntrante"
        WHERE "gmailThreadId" = ${threadId}
        LIMIT 1
      `) as ExistingRow[];

      if (Array.isArray(existingThread) && existingThread.length > 0) {
        return NextResponse.json({
          success: true,
          id: existingThread[0].id,
          action: "duplicate_thread",
        });
      }
    }

    const inserted = (await prisma.$queryRaw`
      INSERT INTO "DemandeEntrante"
      (
        "gmailMessageId",
        "gmailThreadId",
        "from",
        "subject",
        "body",
        "date",
        "talentEmail",
        "talentName",
        "category",
        "confidence",
        "priority",
        "extractedBrand",
        "extractedBudget",
        "extractedDeadline",
        "extractedDeliverables",
        "briefSummary",
        "status",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${messageId},
        ${threadId || null},
        ${from},
        ${subject},
        ${body},
        ${parsedDate},
        ${talentEmail || null},
        ${talentName || null},
        ${category || null},
        ${confidence},
        ${priority || "MEDIUM"},
        ${extractedBrand || null},
        ${extractedBudget || null},
        ${extractedDeadline || null},
        ${extractedDeliverables || null},
        ${briefSummary || null},
        'a_traiter',
        NOW(),
        NOW()
      )
      RETURNING "id"
    `) as InsertedRow[];

    return NextResponse.json({ success: true, id: inserted[0]?.id || null, action: "created" });
  } catch (e) {
    console.error("POST /api/webhook/inbound-email:", e);
    return NextResponse.json(
      { error: "Erreur lors du traitement du webhook." },
      { status: 500 }
    );
  }
}

