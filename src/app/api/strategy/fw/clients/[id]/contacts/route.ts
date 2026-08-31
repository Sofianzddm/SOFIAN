import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFwAccess } from "../../../_auth";
import {
  FW_EMAIL_RE,
  serializeFwClient,
  statutFromContacts,
} from "@/lib/fw-prospection";

type ContactInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;
    if (!auth.isAdmin) {
      return NextResponse.json(
        { error: "Seuls les ADMIN peuvent noter les emails." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await prisma.fwClient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { contacts?: ContactInput[] };
    if (!Array.isArray(body.contacts)) {
      return NextResponse.json({ error: "contacts doit être un tableau." }, { status: 400 });
    }

    const seen = new Set<string>();
    const contacts: Array<{
      email: string;
      firstName: string | null;
      lastName: string | null;
      role: string | null;
      addedById: string;
    }> = [];
    for (const raw of body.contacts) {
      const email = String(raw?.email || "").trim().toLowerCase();
      if (!email) continue;
      if (!FW_EMAIL_RE.test(email)) {
        return NextResponse.json({ error: `Email invalide : ${email}` }, { status: 400 });
      }
      if (seen.has(email)) continue;
      seen.add(email);
      contacts.push({
        email,
        firstName: String(raw?.firstName || "").trim() || null,
        lastName: String(raw?.lastName || "").trim() || null,
        role: String(raw?.role || "").trim() || null,
        addedById: auth.userId,
      });
    }

    const nextStatut = statutFromContacts(existing.statut, contacts.length > 0);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.fwContact.deleteMany({ where: { clientId: id } });
      if (contacts.length > 0) {
        await tx.fwContact.createMany({
          data: contacts.map((c) => ({ ...c, clientId: id })),
        });
      }
      return tx.fwClient.update({
        where: { id },
        data: { statut: nextStatut },
        include: { contacts: { orderBy: { createdAt: "asc" } } },
      });
    });

    return NextResponse.json({
      client: serializeFwClient(updated, auth.role, true),
    });
  } catch (error) {
    console.error("PUT /api/strategy/fw/clients/[id]/contacts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
