import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"] as const;

function monthTitle(date: Date) {
  const mois = date
    .toLocaleDateString("fr-FR", { month: "long" })
    .replace(/^\p{Letter}/u, (c) => c.toUpperCase());
  return `${mois} ${date.getFullYear()}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const { id } = await params;
    const opp = await prisma.inboundOpportunity.findUnique({ where: { id } });
    if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["NEW", "IN_REVIEW"].includes(opp.status)) {
      return NextResponse.json({ error: "Already processed" }, { status: 400 });
    }

    const headOfSales = await prisma.user.findFirst({
      where: { role: "HEAD_OF_SALES", actif: true },
      select: { id: true, prenom: true, nom: true },
    });
    if (!headOfSales) {
      return NextResponse.json(
        { error: "Aucune Head of Sales active trouvee" },
        { status: 500 }
      );
    }

    const now = new Date();
    const mois = now.getMonth() + 1;
    const annee = now.getFullYear();
    const baseTitle = `Inbound - ${monthTitle(now)}`;

    const fichier =
      (await prisma.fichierProspection.findFirst({
        where: {
          userId: headOfSales.id,
          mois,
          annee,
          titre: baseTitle,
        },
        select: { id: true, titre: true },
      })) ||
      (await prisma.fichierProspection.create({
        data: {
          userId: headOfSales.id,
          mois,
          annee,
          titre: baseTitle,
        },
        select: { id: true, titre: true },
      }));

    const notes = [
      `Opportunite INBOUND detectee le ${opp.receivedAt.toLocaleDateString("fr-FR")}`,
      `Recu par: ${opp.talentName} (${opp.talentEmail})`,
      `Sujet: ${opp.subject}`,
      opp.briefSummary ? `Brief: ${opp.briefSummary}` : null,
      opp.extractedBudget ? `Budget: ${opp.extractedBudget}` : null,
      opp.extractedDeadline ? `Deadline: ${opp.extractedDeadline}` : null,
      opp.extractedDeliverables ? `Deliverables: ${opp.extractedDeliverables}` : null,
      `Source: ${opp.senderName || opp.senderEmail} (${opp.senderDomain})`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const createdContact = await prisma.prospectionContact.create({
      data: {
        fichierId: fichier.id,
        talentId: opp.talentId,
        nomOpportunite: opp.extractedBrand || opp.senderDomain,
        prenom: opp.senderName || null,
        nom: null,
        email: opp.senderEmail,
        statut: "EN_ATTENTE",
        notes,
      },
      select: { id: true },
    });

    await prisma.inboundOpportunity.update({
      where: { id: opp.id },
      data: {
        status: "CONVERTED",
        convertedToProspectionId: createdContact.id,
        convertedAt: new Date(),
        convertedById: session.user.id,
      },
    });

    await prisma.notification.create({
      data: {
        userId: headOfSales.id,
        type: "INBOUND_OPPORTUNITY",
        titre: `✅ Nouvelle prospection inbound: ${opp.extractedBrand || opp.senderDomain}`,
        message: `Convertie depuis le mail recu par ${opp.talentName}.`,
        lien: `/prospection/${fichier.id}`,
        lu: false,
      },
    });

    return NextResponse.json({
      ok: true,
      prospectionId: fichier.id,
      prospectionContactId: createdContact.id,
    });
  } catch (error) {
    console.error("POST /api/inbound/opportunities/[id]/convert error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
