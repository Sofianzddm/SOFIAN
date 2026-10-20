// GET — JWT DocuSeal builder pour contrat marque
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { parseContratSignataires } from "@/lib/collab-contrat-upload";

function canAccessBuilder(role: string): boolean {
  return ["ADMIN", "JURISTE", "HEAD_OF_INFLUENCE"].includes(role);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (!canAccessBuilder(role)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const { id } = await params;
    const docusealKey = process.env.DOCUSEAL_API_KEY?.trim();
    if (!docusealKey) {
      return NextResponse.json({ error: "DocuSeal n'est pas configuré" }, { status: 503 });
    }
    const accountEmail = process.env.DOCUSEAL_ACCOUNT_EMAIL?.trim();
    if (!accountEmail) {
      return NextResponse.json(
        { error: "DOCUSEAL_ACCOUNT_EMAIL manquant dans la configuration" },
        { status: 503 }
      );
    }

    const collab = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
    });
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (collab.contratMarqueStatut !== "APPROUVE") {
      return NextResponse.json(
        { error: "Le builder n'est disponible que sur un contrat approuvé (non encore envoyé)." },
        { status: 400 }
      );
    }
    if (!collab.contratMarqueDocusealTemplateId) {
      return NextResponse.json(
        { error: "Aucun template DocuSeal — préparez d'abord la signature." },
        { status: 400 }
      );
    }

    const signataires = parseContratSignataires(collab.contratMarqueSignataires);
    if (signataires.length === 0) {
      return NextResponse.json({ error: "Aucun signataire configuré" }, { status: 400 });
    }

    const titre = `Contrat marque — ${collab.talent.prenom} ${collab.talent.nom} x ${collab.marque.nom}`;
    const jwtPayload = {
      user_email: accountEmail,
      integration_email: signataires[0].email,
      name: `${collab.reference} — ${titre}`,
      template_id: collab.contratMarqueDocusealTemplateId,
    };
    const builderToken = jwt.sign(jwtPayload, docusealKey, { algorithm: "HS256" });

    return NextResponse.json({
      builderToken,
      titre,
      signataires,
      talentName: `${collab.talent.prenom} ${collab.talent.nom}`.trim(),
      marqueName: collab.marque.nom,
      backHref:
        role === "JURISTE" ? `/juriste/${id}` : `/collaborations/${id}/contrat-marque`,
    });
  } catch (error) {
    console.error("GET contrat-marque/builder:", error);
    return NextResponse.json(
      { error: "Erreur lors de la préparation du builder" },
      { status: 500 }
    );
  }
}
