import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canWritePrestataireCrm } from "@/lib/prestataire-crm-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const prestataireId = String(id || "").trim();
    const exists = await prisma.prestataire.findUnique({
      where: { id: prestataireId },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: "Prestataire introuvable." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const created = await prisma.prestataireContact.create({
      data: {
        prestataireId,
        prenom: String(body.prenom || "").trim() || null,
        nom: String(body.nom || "").trim() || null,
        email: String(body.email || "").trim() || null,
        telephone: String(body.telephone || "").trim() || null,
        role: String(body.role || "").trim() || null,
        notes: String(body.notes || "").trim() || null,
        principal: Boolean(body.principal),
      },
    });

    return NextResponse.json({ contact: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/prestataires/[id]/contacts:", error);
    return NextResponse.json({ error: "Erreur création contact" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const contactId = String(request.nextUrl.searchParams.get("contactId") || "").trim();
    if (!contactId) {
      return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    }

    const contact = await prisma.prestataireContact.findFirst({
      where: { id: contactId, prestataireId: String(id || "").trim() },
    });
    if (!contact) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });

    await prisma.prestataireContact.delete({ where: { id: contactId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/prestataires/[id]/contacts:", error);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
