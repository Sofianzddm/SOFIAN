import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingBody = {
  from?: unknown;
  subject?: unknown;
  body?: unknown;
  date?: unknown;
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
    const parsedDate = dateRaw ? new Date(dateRaw) : new Date();

    if (!from || !subject || !body || Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Requête invalide : from, subject, body, date requis." },
        { status: 400 }
      );
    }

    const existing = (await prisma.$queryRaw`
      SELECT "id"
      FROM "DemandeEntrante"
      WHERE "from" = ${from}
        AND "subject" = ${subject}
        AND "createdAt" >= NOW() - INTERVAL '24 hours'
      LIMIT 1
    `) as ExistingRow[];

    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ success: true, id: existing[0].id });
    }

    const inserted = (await prisma.$queryRaw`
      INSERT INTO "DemandeEntrante" ("from", "subject", "body", "date", "status", "createdAt", "updatedAt")
      VALUES (${from}, ${subject}, ${body}, ${parsedDate}, 'a_traiter', NOW(), NOW())
      RETURNING "id"
    `) as InsertedRow[];

    return NextResponse.json({ success: true, id: inserted[0]?.id || null });
  } catch (e) {
    console.error("POST /api/webhook/inbound-email:", e);
    return NextResponse.json(
      { error: "Erreur lors du traitement du webhook." },
      { status: 500 }
    );
  }
}

