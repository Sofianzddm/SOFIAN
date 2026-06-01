import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;

    const marque = await prisma.marque.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { principal: "desc" } },
        aliases: { orderBy: { createdAt: "desc" }, take: 20 },
        _count: {
          select: {
            collaborations: true,
            negociations: true,
            demandesGift: true,
            inboundOpportunities: true,
            contactMissions: true,
            opportunitesMarque: true,
            demandesEntrantes: true,
            quotes: true,
          },
        },
      },
    });

    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
    }

    const [
      inboundOpportunities,
      contactMissions,
      negociations,
      collaborations,
      demandesGift,
      opportunitesMarque,
      demandesEntrantes,
      quotes,
    ] = await Promise.all([
      prisma.inboundOpportunity.findMany({
        where: { marqueId: id },
        orderBy: { receivedAt: "desc" },
        take: 30,
        select: {
          id: true,
          subject: true,
          senderEmail: true,
          senderName: true,
          talentName: true,
          status: true,
          category: true,
          receivedAt: true,
          extractedBrand: true,
        },
      }),
      prisma.contactMission.findMany({
        where: { marqueId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          creatorName: true,
          targetBrand: true,
          stage: true,
          status: true,
          sentAt: true,
          replied: true,
          createdAt: true,
        },
      }),
      prisma.negociation.findMany({
        where: { marqueId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          reference: true,
          statut: true,
          source: true,
          budgetMarque: true,
          createdAt: true,
          talent: { select: { prenom: true, nom: true } },
        },
      }),
      prisma.collaboration.findMany({
        where: { marqueId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          reference: true,
          statut: true,
          montantBrut: true,
          source: true,
          createdAt: true,
          talent: { select: { prenom: true, nom: true } },
        },
      }),
      prisma.demandeGift.findMany({
        where: { marqueId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          reference: true,
          statut: true,
          typeGift: true,
          createdAt: true,
          talent: { select: { prenom: true, nom: true } },
        },
      }),
      prisma.opportuniteMarque.findMany({
        where: { marqueId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          nomMarque: true,
          statut: true,
          budgetEstime: true,
          createdAt: true,
        },
      }),
      prisma.demandeEntrante.findMany({
        where: { marqueId: id },
        orderBy: { date: "desc" },
        take: 20,
        select: {
          id: true,
          subject: true,
          from: true,
          status: true,
          date: true,
          extractedBrand: true,
        },
      }),
      prisma.quote.findMany({
        where: { marqueId: id },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          reference: true,
          status: true,
          totalTTC: true,
          createdAt: true,
        },
      }),
    ]);

    type TimelineItem = {
      id: string;
      type: string;
      label: string;
      sublabel?: string;
      date: string;
      href?: string;
      meta?: Record<string, unknown>;
    };

    const timeline: TimelineItem[] = [];

    for (const i of inboundOpportunities) {
      timeline.push({
        id: `inbound-${i.id}`,
        type: "INBOUND",
        label: i.subject,
        sublabel: `${i.talentName} · ${i.senderEmail}`,
        date: i.receivedAt.toISOString(),
        href: `/inbound/${i.id}`,
        meta: { status: i.status, category: i.category },
      });
    }
    for (const m of contactMissions) {
      timeline.push({
        id: `mission-${m.id}`,
        type: "PIPELINE",
        label: `${m.creatorName} → ${m.targetBrand}`,
        sublabel: m.stage,
        date: (m.sentAt || m.createdAt).toISOString(),
        href: `/strategy/projet-individuel-talent/pipeline`,
        meta: { status: m.status, replied: m.replied },
      });
    }
    for (const n of negociations) {
      timeline.push({
        id: `nego-${n.id}`,
        type: "NEGO",
        label: n.reference,
        sublabel: n.talent ? `${n.talent.prenom} ${n.talent.nom}` : undefined,
        date: n.createdAt.toISOString(),
        href: `/negociations/${n.id}`,
        meta: { statut: n.statut, source: n.source },
      });
    }
    for (const c of collaborations) {
      timeline.push({
        id: `collab-${c.id}`,
        type: "COLLAB",
        label: c.reference,
        sublabel: c.talent ? `${c.talent.prenom} ${c.talent.nom}` : undefined,
        date: c.createdAt.toISOString(),
        href: `/collaborations/${c.id}`,
        meta: { statut: c.statut, montantBrut: c.montantBrut },
      });
    }
    for (const g of demandesGift) {
      timeline.push({
        id: `gift-${g.id}`,
        type: "GIFT",
        label: g.reference,
        sublabel: g.talent ? `${g.talent.prenom} ${g.talent.nom}` : undefined,
        date: g.createdAt.toISOString(),
        href: `/gifts`,
        meta: { statut: g.statut, typeGift: g.typeGift },
      });
    }
    for (const o of opportunitesMarque) {
      timeline.push({
        id: `opp-${o.id}`,
        type: "OPPORTUNITE",
        label: o.nomMarque,
        sublabel: o.statut,
        date: o.createdAt.toISOString(),
        meta: { budgetEstime: o.budgetEstime },
      });
    }
    for (const d of demandesEntrantes) {
      timeline.push({
        id: `demande-${d.id}`,
        type: "DEMANDE_ENTRANTE",
        label: d.subject,
        sublabel: d.from,
        date: d.date.toISOString(),
        href: `/demandes-entrantes`,
        meta: { status: d.status },
      });
    }

    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      marque,
      counts: marque._count,
      timeline: timeline.slice(0, 80),
      inboundOpportunities,
      contactMissions,
      negociations,
      collaborations,
      demandesGift,
      opportunitesMarque,
      demandesEntrantes,
      quotes,
    });
  } catch (error) {
    console.error("GET /api/marques/[id]/crm:", error);
    return NextResponse.json({ error: "Erreur CRM" }, { status: 500 });
  }
}
