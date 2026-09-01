import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFwAccess } from "../../../_auth";
import {
  contactHasFwEmail,
  fwClientInclude,
  serializeFwClient,
  statutFromContacts,
} from "@/lib/fw-prospection";

type ContactInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  perimetre?: string;
  localisation?: string;
  linkedinUrl?: string;
  note?: string;
  marquesGerees?: string;
  marche?: string;
};

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
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
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      role: string | null;
      perimetre: string | null;
      localisation: string | null;
      linkedinUrl: string | null;
      note: string | null;
      marquesGerees: string | null;
      marche: string | null;
      emailLookupStatus: string;
      emailLookupQueuedAt: Date | null;
      addedById: string;
    }> = [];
    for (const raw of body.contacts) {
      const emailRaw = String(raw?.email || "").trim().toLowerCase();
      const email = contactHasFwEmail(emailRaw) ? emailRaw : "";
      if (emailRaw && !email) {
        return NextResponse.json({ error: `Email invalide : ${emailRaw}` }, { status: 400 });
      }
      const firstName = clean(raw?.firstName);
      const lastName = clean(raw?.lastName);
      if (!email && !firstName && !lastName) continue;
      const dedupe = email || `n:${(firstName || "").toLowerCase()}|${(lastName || "").toLowerCase()}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      contacts.push({
        email: email || null,
        firstName,
        lastName,
        role: clean(raw?.role),
        perimetre: clean(raw?.perimetre),
        localisation: clean(raw?.localisation),
        linkedinUrl: clean(raw?.linkedinUrl),
        note: clean(raw?.note),
        marquesGerees: clean(raw?.marquesGerees),
        marche: clean(raw?.marche),
        emailLookupStatus: email ? "FOUND" : "QUEUED",
        emailLookupQueuedAt: email ? null : new Date(),
        addedById: auth.userId,
      });
    }

    const hasEmails = contacts.some((c) => contactHasFwEmail(c.email));
    const nextStatut = statutFromContacts(existing.statut, hasEmails);

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
        include: fwClientInclude,
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
