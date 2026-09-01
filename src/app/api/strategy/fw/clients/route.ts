import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";
import { requireFwAccess } from "../_auth";
import { FW_PROJET_SLUG, serializeFwClient } from "@/lib/fw-prospection";
import { isFwVille } from "@/lib/fw-villes";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;

    await getOrCreateVillaProject(FW_PROJET_SLUG);

    const clients = await prisma.fwClient.findMany({
      include: { contacts: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ dateDefile: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      clients: clients.map((c) => serializeFwClient(c, auth.role, auth.isAdmin)),
    });
  } catch (error) {
    console.error("GET /api/strategy/fw/clients:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;

    await getOrCreateVillaProject(FW_PROJET_SLUG);

    const body = (await request.json().catch(() => ({}))) as {
      nom?: string;
      ville?: string;
      dateDefile?: string | null;
      notes?: string | null;
    };
    const nom = (body.nom || "").trim();
    if (!nom) {
      return NextResponse.json({ error: "Le nom du client est requis." }, { status: 400 });
    }

    const ville = (body.ville || "PARIS").trim().toUpperCase().replace(/ /g, "_");
    if (!isFwVille(ville)) {
      return NextResponse.json({ error: "Ville de Fashion Week inconnue." }, { status: 400 });
    }

    const dateDefile = body.dateDefile ? new Date(body.dateDefile) : null;
    if (dateDefile && Number.isNaN(dateDefile.getTime())) {
      return NextResponse.json({ error: "Date du défilé invalide." }, { status: 400 });
    }

    const client = await prisma.fwClient.create({
      data: {
        nom,
        ville,
        dateDefile,
        notes: (body.notes || "").trim() || null,
        createdById: auth.userId,
      },
      include: { contacts: true },
    });

    return NextResponse.json({
      client: serializeFwClient(client, auth.role, auth.isAdmin),
    });
  } catch (error) {
    console.error("POST /api/strategy/fw/clients:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
