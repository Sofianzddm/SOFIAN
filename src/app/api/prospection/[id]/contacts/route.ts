import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ADMIN_ROLES = ["ADMIN", "HEAD_OF_INFLUENCE"] as const;

async function canEditFichier(request: NextRequest, fichierId: string) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }) };
  }

  const userId = session.user.id;
  const role = (session.user.role || "") as string;

  const fichier = await prisma.fichierProspection.findUnique({
    where: { id: fichierId },
  });

  if (!fichier) {
    return { error: NextResponse.json({ error: "Fichier introuvable" }, { status: 404 }) };
  }

  const canSeeAll = ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
  const isOwner = fichier.userId === userId;

  if (!canSeeAll && !isOwner) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  // HEAD_OF_INFLUENCE peut créer / modifier mais pas supprimer (géré côté DELETE)
  return { session, role, fichier };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await canEditFichier(request, id);
    if ("error" in result) return result.error;

    const body = await request.json();
    const {
      nomOpportunite,
      prenom,
      nom,
      email,
      montantBrut,
      statut,
      notes,
    } = body as {
      nomOpportunite?: string;
      prenom?: string;
      nom?: string;
      email?: string;
      montantBrut?: number | string;
      statut?: string;
      notes?: string;
    };

    const finalNomOpp = (nomOpportunite || "").trim();
    if (!finalNomOpp) {
      return NextResponse.json({ error: "Nom d'opportunité requis" }, { status: 400 });
    }

    const data: any = {
      fichierId: id,
      nomOpportunite: finalNomOpp,
    };

    if (typeof prenom === "string") data.prenom = prenom || null;
    if (typeof nom === "string") data.nom = nom || null;
    if (typeof email === "string") data.email = email || null;
    if (typeof montantBrut !== "undefined") {
      const value =
        typeof montantBrut === "string"
          ? parseFloat(montantBrut.replace(",", "."))
          : Number(montantBrut);
      data.montantBrut = Number.isFinite(value) ? value : 0;
    }
    if (typeof notes === "string") data.notes = notes || null;
    if (typeof statut === "string") {
      data.statut = statut as any;
    }

    const contact = await prisma.prospectionContact.create({
      data,
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/prospection/[id]/contacts:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du contact" },
      { status: 500 }
    );
  }
}

