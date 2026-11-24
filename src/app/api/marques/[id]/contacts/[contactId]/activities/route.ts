import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canWriteMarqueContactActivities } from "@/lib/marque-crm-access";
import { MarqueContactActivityType } from "@prisma/client";
import { deleteFromS3, isS3Url } from "@/lib/s3";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

const CALL_OUTCOMES = new Set(["CONNECTED", "NO_ANSWER", "VOICEMAIL", "BUSY"]);
const MAX_ATTACHMENT_NAME = 200;

async function assertContactOnMarque(marqueId: string, contactId: string) {
  return prisma.marqueContact.findFirst({
    where: { id: contactId, marqueId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      marqueId: true,
      marque: { select: { assignedToId: true } },
    },
  });
}

function canMutateActivities(
  session: { user: { id?: string | null; role?: string | null } },
  assignedToId: string | null | undefined
) {
  return canWriteMarqueContactActivities({
    role: session.user.role,
    userId: session.user.id,
    assignedToId,
  });
}

function isCloudinaryUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "res.cloudinary.com" ||
        u.hostname.endsWith(".cloudinary.com"))
    );
  } catch {
    return false;
  }
}

function isAllowedAttachmentUrl(url: string): boolean {
  return isS3Url(url) || isCloudinaryUrl(url);
}

function sanitizeAttachmentName(raw: string): string {
  const cleaned = raw
    .replace(/[/\\]/g, "-")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .trim()
    .slice(0, MAX_ATTACHMENT_NAME);
  if (!cleaned) return "piece-jointe.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

async function deleteAttachmentQuietly(url: string | null | undefined) {
  if (!url) return;
  try {
    if (isS3Url(url)) {
      await deleteFromS3(url);
    }
    // Cloudinary : on laisse l’objet (pas de helper commun ici) ; l’URL reste orphan.
  } catch (e) {
    console.error("delete contact activity attachment:", e);
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id: marqueId, contactId } = await params;
    const contact = await assertContactOnMarque(marqueId, contactId);
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }

    const activities = await prisma.marqueContactActivity.findMany({
      where: { contactId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("GET contact activities:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const { id: marqueId, contactId } = await params;
    const contact = await assertContactOnMarque(marqueId, contactId);
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }
    if (!canMutateActivities(session, contact.marque.assignedToId)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      type?: string;
      body?: string;
      callOutcome?: string | null;
      occurredAt?: string | null;
      attachmentUrl?: string | null;
      attachmentName?: string | null;
    };

    const typeRaw = String(body.type || "").toUpperCase();
    if (typeRaw !== "NOTE" && typeRaw !== "CALL") {
      return NextResponse.json(
        { error: "Type requis : NOTE ou CALL" },
        { status: 400 }
      );
    }
    const type = typeRaw as MarqueContactActivityType;

    const text = String(body.body || "").trim();
    const attachmentUrlRaw = String(body.attachmentUrl || "").trim();
    const hasAttachment = Boolean(attachmentUrlRaw);

    if (hasAttachment && type !== "NOTE") {
      return NextResponse.json(
        { error: "Les pièces jointes PDF sont réservées aux notes." },
        { status: 400 }
      );
    }

    if (!text && !hasAttachment) {
      return NextResponse.json(
        {
          error:
            type === "CALL"
              ? "Indique ce qui s’est dit (ou le motif de non-jointure)."
              : "Ajoute un texte ou une pièce jointe PDF.",
        },
        { status: 400 }
      );
    }
    if (text.length > 8000) {
      return NextResponse.json({ error: "Texte trop long (max 8000)." }, { status: 400 });
    }

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    if (hasAttachment) {
      if (!isAllowedAttachmentUrl(attachmentUrlRaw)) {
        return NextResponse.json(
          { error: "URL de pièce jointe invalide." },
          { status: 400 }
        );
      }
      attachmentUrl = attachmentUrlRaw;
      attachmentName = sanitizeAttachmentName(
        String(body.attachmentName || "piece-jointe.pdf")
      );
    }

    let callOutcome: string | null = null;
    if (type === "CALL") {
      const outcome = String(body.callOutcome || "CONNECTED").toUpperCase();
      if (!CALL_OUTCOMES.has(outcome)) {
        return NextResponse.json(
          { error: "Issue d’appel invalide." },
          { status: 400 }
        );
      }
      callOutcome = outcome;
    }

    let occurredAt = new Date();
    if (body.occurredAt) {
      const parsed = new Date(body.occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      }
      occurredAt = parsed;
    }

    const createdByName =
      session.user.name?.trim() || session.user.email || null;

    const activity = await prisma.marqueContactActivity.create({
      data: {
        contactId,
        type,
        body: text || (attachmentName ? `PJ : ${attachmentName}` : "Pièce jointe"),
        callOutcome,
        occurredAt,
        attachmentUrl,
        attachmentName,
        createdById: session.user.id || null,
        createdByName,
      },
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error("POST contact activities:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const { id: marqueId, contactId } = await params;
    const contact = await assertContactOnMarque(marqueId, contactId);
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }
    if (!canMutateActivities(session, contact.marque.assignedToId)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const activityId =
      request.nextUrl.searchParams.get("activityId") ||
      ((await request.json().catch(() => ({}))) as { activityId?: string }).activityId;

    if (!activityId) {
      return NextResponse.json({ error: "activityId requis" }, { status: 400 });
    }

    const existing = await prisma.marqueContactActivity.findFirst({
      where: { id: activityId, contactId },
      select: { id: true, attachmentUrl: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Activité introuvable" }, { status: 404 });
    }

    await prisma.marqueContactActivity.delete({ where: { id: activityId } });
    await deleteAttachmentQuietly(existing.attachmentUrl);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE contact activities:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
