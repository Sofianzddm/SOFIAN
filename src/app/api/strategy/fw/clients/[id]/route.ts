import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFwAccess } from "../../_auth";
import { FW_STATUTS_MANUELS, serializeFwClient } from "@/lib/fw-prospection";
import { isFwVille } from "@/lib/fw-villes";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;

    const { id } = await params;
    const forSend = request.nextUrl.searchParams.get("forSend") === "1";

    const client = await prisma.fwClient.findUnique({
      where: { id },
      include: { contacts: { orderBy: { createdAt: "asc" } } },
    });
    if (!client) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }

    const includeContacts = auth.isAdmin || forSend;
    return NextResponse.json({
      client: serializeFwClient(client, auth.role, includeContacts),
    });
  } catch (error) {
    console.error("GET /api/strategy/fw/clients/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;

    const { id } = await params;
    const existing = await prisma.fwClient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      nom?: string;
      ville?: string;
      dateDefile?: string | null;
      notes?: string | null;
      statut?: string;
    };

    let ville: string | undefined;
    if (body.ville !== undefined) {
      const next = body.ville.trim().toUpperCase().replace(/ /g, "_");
      if (!isFwVille(next)) {
        return NextResponse.json({ error: "Ville de Fashion Week inconnue." }, { status: 400 });
      }
      ville = next;
    }

    if (body.statut !== undefined) {
      if (!FW_STATUTS_MANUELS.includes(body.statut as (typeof FW_STATUTS_MANUELS)[number])) {
        return NextResponse.json(
          { error: "Statut non autorisé. Les mails déterminent « à compléter » / « prêt »." },
          { status: 400 }
        );
      }
    }

    let dateDefile: Date | null | undefined = undefined;
    if (body.dateDefile !== undefined) {
      if (!body.dateDefile) {
        dateDefile = null;
      } else {
        const d = new Date(body.dateDefile);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "Date du défilé invalide." }, { status: 400 });
        }
        dateDefile = d;
      }
    }

    const updated = await prisma.fwClient.update({
      where: { id },
      data: {
        nom: body.nom?.trim() || undefined,
        ville,
        dateDefile,
        notes: body.notes === undefined ? undefined : (body.notes || "").trim() || null,
        statut: body.statut?.trim() || undefined,
      },
      include: { contacts: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({
      client: serializeFwClient(updated, auth.role, auth.isAdmin),
    });
  } catch (error) {
    console.error("PATCH /api/strategy/fw/clients/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;

    const { id } = await params;
    await prisma.fwClient.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/strategy/fw/clients/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
