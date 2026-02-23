// src/app/api/factures/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // ============================================
    // FACTURES MARQUES (Documents de type FACTURE) + liste complète pour la page factures
    // ============================================
    const facturesMarques = await prisma.document.findMany({
      where: { type: "FACTURE" },
      include: {
        collaboration: {
          include: {
            talent: { select: { prenom: true, nom: true } },
            marque: { select: { nom: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Liste complète des documents FACTURE pour la page liste (Collaboration n'a pas marqueContact, on met null)
    const documents = await prisma.document.findMany({
      where: { type: "FACTURE" },
      include: {
        collaboration: {
          select: {
            id: true,
            reference: true,
            talent: { select: { id: true, prenom: true, nom: true } },
            marque: { select: { id: true, nom: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ============================================
    // DEVIS (documents type DEVIS) pour l'onglet Devis de la page factures
    // ============================================
    const devisDocuments = await prisma.document.findMany({
      where: { type: "DEVIS" },
      include: {
        collaboration: {
          select: {
            id: true,
            reference: true,
            talent: { select: { id: true, prenom: true, nom: true } },
            marque: { select: { id: true, nom: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const devisEnAttente = devisDocuments.filter(
      (d) => d.statut === "VALIDE" || d.statut === "ENVOYE"
    ).length;
    const devisExpire = devisDocuments.filter((d) => {
      if (d.statut === "ANNULE") return false;
      const validUntil = d.dateEcheance ?? new Date(new Date(d.dateEmission).getTime() + 30 * 24 * 60 * 60 * 1000);
      return new Date(validUntil) < now;
    }).length;

    // ============================================
    // FACTURES TALENTS (Collaborations avec facture reçue ou à payer)
    // ============================================
    const collabsAvecFacture = await prisma.collaboration.findMany({
      where: {
        statut: { in: ["FACTURE_RECUE", "PAYE", "PUBLIE"] },
      },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const facturesTalents = collabsAvecFacture.map((c) => {
      let statut = "EN_ATTENTE";
      if (c.paidAt) {
        statut = "PAYE";
      } else if (c.factureTalentRecueAt) {
        statut = "A_PAYER";
      }

      return {
        id: c.id,
        reference: c.reference,
        talent: c.talent,
        marque: c.marque,
        montantNet: Number(c.montantNet),
        factureTalentUrl: c.factureTalentUrl,
        factureTalentRecueAt: c.factureTalentRecueAt,
        paidAt: c.paidAt,
        statut,
      };
    });

    // ============================================
    // STATS CE MOIS
    // ============================================
    
    // Entrées du mois (factures marques payées ce mois)
    const entreesMonth = await prisma.document.aggregate({
      _sum: { montantTTC: true },
      where: {
        type: "FACTURE",
        statut: "PAYE",
        datePaiement: { gte: startOfMonth },
      },
    });

    // Sorties du mois (talents payés ce mois)
    const sortiesMonth = await prisma.collaboration.aggregate({
      _sum: { montantNet: true },
      where: {
        paidAt: { gte: startOfMonth },
      },
    });

    const entreesMois = Number(entreesMonth._sum.montantTTC) || 0;
    const sortiesMois = Number(sortiesMonth._sum.montantNet) || 0;
    const caNetMois = entreesMois - sortiesMois;

    // ============================================
    // STATS MOIS DERNIER (pour évolution)
    // ============================================
    const entreesLastMonth = await prisma.document.aggregate({
      _sum: { montantTTC: true },
      where: {
        type: "FACTURE",
        statut: "PAYE",
        datePaiement: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
    });

    const sortiesLastMonth = await prisma.collaboration.aggregate({
      _sum: { montantNet: true },
      where: {
        paidAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
    });

    const caNetLastMonth = (Number(entreesLastMonth._sum.montantTTC) || 0) - (Number(sortiesLastMonth._sum.montantNet) || 0);
    const evolMois = caNetLastMonth > 0 ? Math.round(((caNetMois - caNetLastMonth) / caNetLastMonth) * 100) : 0;

    // ============================================
    // STATS ANNÉE
    // ============================================
    const entreesYear = await prisma.document.aggregate({
      _sum: { montantTTC: true },
      where: {
        type: "FACTURE",
        statut: "PAYE",
        datePaiement: { gte: startOfYear },
      },
    });

    const sortiesYear = await prisma.collaboration.aggregate({
      _sum: { montantNet: true },
      where: {
        paidAt: { gte: startOfYear },
      },
    });

    const entreesAnnee = Number(entreesYear._sum.montantTTC) || 0;
    const sortiesAnnee = Number(sortiesYear._sum.montantNet) || 0;
    const caNetAnnee = entreesAnnee - sortiesAnnee;

    // ============================================
    // ALERTES
    // ============================================
    
    // Factures marques en retard (envoyées depuis + de 30j)
    const facturesEnRetard = await prisma.document.count({
      where: {
        type: "FACTURE",
        statut: "ENVOYE",
        dateEcheance: { lt: now },
      },
    });

    // Factures marques en attente de paiement
    const facturesEnAttente = await prisma.document.count({
      where: {
        type: "FACTURE",
        statut: "ENVOYE",
      },
    });

    // Talents à payer (facture reçue mais pas payé)
    const talentsAPayer = await prisma.collaboration.count({
      where: {
        factureTalentRecueAt: { not: null },
        paidAt: null,
      },
    });

    // ============================================
    // DATA MENSUELLE (6 derniers mois pour performance)
    // ============================================
    const monthlyData: { mois: string; entrees: number; sorties: number; net: number }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthEntrees = await prisma.document.aggregate({
        _sum: { montantTTC: true },
        where: {
          type: "FACTURE",
          statut: "PAYE",
          datePaiement: { gte: monthStart, lte: monthEnd },
        },
      });

      const monthSorties = await prisma.collaboration.aggregate({
        _sum: { montantNet: true },
        where: {
          paidAt: { gte: monthStart, lte: monthEnd },
        },
      });

      const entrees = Number(monthEntrees._sum.montantTTC) || 0;
      const sorties = Number(monthSorties._sum.montantNet) || 0;

      monthlyData.push({
        mois: monthStart.toLocaleDateString("fr-FR", { month: "short" }),
        entrees,
        sorties,
        net: entrees - sorties,
      });
    }

    // ============================================
    // RESPONSE
    // ============================================
    return NextResponse.json({
      stats: {
        entreesMois,
        sortiesMois,
        caNetMois,
        entreesAnnee,
        sortiesAnnee,
        caNetAnnee,
        evolMois,
        facturesEnRetard,
        facturesEnAttente,
        talentsAPayer,
      },
      // Liste complète pour la page factures (toutes les factures, avec collaboration optionnelle)
      documents: documents.map((d) => ({
        id: d.id,
        reference: d.reference,
        type: d.type,
        statut: d.statut,
        montantHT: Number(d.montantHT),
        montantTTC: Number(d.montantTTC),
        dateEmission: d.dateEmission,
        dateEcheance: d.dateEcheance,
        createdAt: d.createdAt,
        collaboration: d.collaboration
          ? {
              id: d.collaboration.id,
              reference: d.collaboration.reference,
              talent: d.collaboration.talent,
              marque: d.collaboration.marque,
              marqueContact: null,
            }
          : null,
      })),
      // Filtrer les factures sans collaboration (au cas où)
      facturesMarques: facturesMarques
        .filter((f) => f.collaboration !== null)
        .map((f) => ({
          id: f.id,
          reference: f.reference,
          collaboration: {
            id: f.collaborationId,
            reference: f.collaboration!.reference,
            talent: f.collaboration!.talent,
            marque: f.collaboration!.marque,
          },
          montantHT: Number(f.montantHT),
          montantTTC: Number(f.montantTTC),
          statut: f.dateEcheance && new Date(f.dateEcheance) < now && f.statut === "ENVOYE" ? "EN_RETARD" : f.statut,
          dateEmission: f.dateEmission,
          dateEcheance: f.dateEcheance,
        })),
      facturesTalents,
      monthlyData,
      // Devis pour l'onglet Devis (même source que les factures, même auth)
      devis: devisDocuments.map((d) => ({
        id: d.id,
        reference: d.reference,
        type: d.type,
        statut: d.statut,
        titre: d.titre,
        dateEmission: d.dateEmission,
        dateEcheance: d.dateEcheance,
        montantHT: Number(d.montantHT),
        montantTTC: Number(d.montantTTC),
        createdAt: d.createdAt,
        collaboration: d.collaboration
          ? {
              id: d.collaboration.id,
              reference: d.collaboration.reference,
              talent: d.collaboration.talent,
              marque: d.collaboration.marque,
              marqueContact: null,
            }
          : null,
      })),
      devisStats: { enAttente: devisEnAttente, expire: devisExpire },
    });
  } catch (error) {
    console.error("Erreur API factures:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}