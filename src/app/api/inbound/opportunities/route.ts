import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyInboundAuth } from "@/lib/inbound-auth";
import { getAppSession } from "@/lib/getAppSession";
import { sendInboundNotificationEmail } from "@/lib/emails/inbound-notification";

const ALLOWED_ROLES = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const InboundPayloadSchema = z.object({
  talentEmail: z.string().email(),
  talentName: z.string().min(1),
  talentId: z.string().optional(),
  senderEmail: z.string().email(),
  senderName: z.string().nullable().optional(),
  senderDomain: z.string().min(1),
  subject: z.string().min(1),
  bodyExcerpt: z.string().max(5000),
  gmailMessageId: z.string().min(1),
  receivedAt: z.string().datetime(),
  category: z.enum(["COLLAB_PAID", "COLLAB_GIFTING", "PRESS_KIT", "EVENT_INVITE", "OTHER"]),
  confidence: z.number().min(0).max(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  extractedBrand: z.string().nullable().optional(),
  extractedTopic: z.string().nullable().optional(),
  extractedBudget: z.string().nullable().optional(),
  extractedDeadline: z.string().nullable().optional(),
  extractedDeliverables: z.string().nullable().optional(),
  briefSummary: z.string().nullable().optional(),
});

async function requireInboundRole(req: NextRequest) {
  const session = await getAppSession(req);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Non autorise" }, { status: 401 }) };
  }
  const role = (session.user.role || "") as string;
  if (!ALLOWED_ROLES.includes(role as AllowedRole)) {
    return { error: NextResponse.json({ error: "Acces refuse" }, { status: 403 }) };
  }
  return { session, role };
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyInboundAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = InboundPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.issues },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const existing = await prisma.inboundOpportunity.findUnique({
      where: { gmailMessageId: data.gmailMessageId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }

    const matchedTalent = data.talentId
      ? await prisma.talent.findUnique({ where: { id: data.talentId }, select: { id: true } })
      : await prisma.talent.findFirst({
          where: { email: data.talentEmail, isArchived: false },
          select: { id: true },
        });

    const opportunity = await prisma.inboundOpportunity.create({
      data: {
        talentEmail: data.talentEmail,
        talentName: data.talentName,
        talentId: matchedTalent?.id || null,
        senderEmail: data.senderEmail,
        senderName: data.senderName || null,
        senderDomain: data.senderDomain.toLowerCase().trim(),
        subject: data.subject.trim(),
        bodyExcerpt: data.bodyExcerpt.slice(0, 3000),
        gmailMessageId: data.gmailMessageId,
        receivedAt: new Date(data.receivedAt),
        category: data.category,
        confidence: data.confidence,
        priority: data.priority,
        extractedBrand: data.extractedBrand || null,
        extractedTopic: data.extractedTopic || null,
        extractedBudget: data.extractedBudget || null,
        extractedDeadline: data.extractedDeadline || null,
        extractedDeliverables: data.extractedDeliverables || null,
        briefSummary: data.briefSummary || null,
      },
    });

    const recipients = await prisma.user.findMany({
      where: { role: { in: [...ALLOWED_ROLES] }, actif: true },
      select: { id: true, email: true, prenom: true },
    });

    await Promise.all(
      recipients.map(async (user) => {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "INBOUND_OPPORTUNITY",
            titre: `📬 Nouvelle opportunite - ${data.extractedBrand || data.senderDomain}`,
            message: `${data.senderName || data.senderEmail} a contacte ${data.talentName}: "${data.subject}"`,
            lien: `/inbound/${opportunity.id}`,
            lu: false,
          },
        });

        if (user.email) {
          await sendInboundNotificationEmail({
            to: user.email,
            recipientName: user.prenom || "L'equipe",
            opportunity: {
              id: opportunity.id,
              talentName: opportunity.talentName,
              senderEmail: opportunity.senderEmail,
              senderName: opportunity.senderName,
              senderDomain: opportunity.senderDomain,
              subject: opportunity.subject,
              bodyExcerpt: opportunity.bodyExcerpt,
              category: opportunity.category,
              priority: opportunity.priority,
              confidence: opportunity.confidence,
              extractedBrand: opportunity.extractedBrand,
              extractedBudget: opportunity.extractedBudget,
              extractedDeadline: opportunity.extractedDeadline,
              briefSummary: opportunity.briefSummary,
            },
          }).catch((err) => {
            console.error("Inbound email notification error:", err);
          });
        }
      })
    );

    return NextResponse.json({ ok: true, id: opportunity.id });
  } catch (error) {
    console.error("POST /api/inbound/opportunities error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireInboundRole(req);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const talentId = searchParams.get("talentId");
    const countOnly = searchParams.get("countOnly") === "1";

    const where = {
      ...(status ? { status: status as "NEW" | "IN_REVIEW" | "CONVERTED" | "ARCHIVED" } : {}),
      ...(priority ? { priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT" } : {}),
      ...(talentId ? { talentId } : {}),
    };

    if (countOnly) {
      const count = await prisma.inboundOpportunity.count({ where });
      return NextResponse.json({ count });
    }

    const opportunities = await prisma.inboundOpportunity.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }],
      include: {
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
        convertedBy: { select: { id: true, prenom: true, nom: true } },
        archivedBy: { select: { id: true, prenom: true, nom: true } },
      },
      take: 200,
    });

    return NextResponse.json({ opportunities });
  } catch (error) {
    console.error("GET /api/inbound/opportunities error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
