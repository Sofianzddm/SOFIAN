// src/app/api/dashboard/route.ts
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

    const user = session.user as { id: string; role: string; name: string };
    const role = user.role;

    // Les talents ont leur propre dashboard
    if (role === "TALENT") {
      return NextResponse.json({ 
        error: "Accès refusé. Veuillez utiliser le portail créateur." 
      }, { status: 403 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // ============================================
    // ADMIN - Accès total
    // ============================================
    if (role === "ADMIN") {
      const [
        totalTalents,
        totalMarques,
        collabsEnCours,
        negosEnCours,
        collabsPublie,
        facturesEnAttente,
        caMoisBrut,
        caAnneeBrut,
        commissionMois,
        collabsParStatut,
        topTalents,
        topMarques,
        performanceTM,
        facturesRelance,
      ] = await Promise.all([
        prisma.talent.count(),
        prisma.marque.count(),
        prisma.collaboration.count({ where: { statut: "EN_COURS" } }),
        // ✅ CORRIGÉ: Compter les vraies négociations
        prisma.negociation.count({ 
          where: { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } } 
        }),
        prisma.collaboration.count({ where: { statut: "PUBLIE" } }),
        prisma.collaboration.count({
          where: { statut: { in: ["PUBLIE", "FACTURE_RECUE"] } },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfMonth },
          },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfYear },
          },
        }),
        prisma.collaboration.aggregate({
          _sum: { commissionEuros: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfMonth },
          },
        }),
        prisma.collaboration.groupBy({
          by: ["statut"],
          _count: true,
        }),
        prisma.collaboration.groupBy({
          by: ["talentId"],
          _sum: { montantBrut: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfYear },
          },
          orderBy: { _sum: { montantBrut: "desc" } },
          take: 5,
        }),
        prisma.collaboration.groupBy({
          by: ["marqueId"],
          _sum: { montantBrut: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfYear },
          },
          orderBy: { _sum: { montantBrut: "desc" } },
          take: 5,
        }),
        prisma.user.findMany({
          where: { role: "TM", actif: true },
          select: {
            id: true,
            prenom: true,
            nom: true,
            talentsGeres: {
              select: {
                id: true,
                collaborations: {
                  where: { createdAt: { gte: startOfYear } },
                  select: { statut: true, montantBrut: true },
                },
              },
            },
          },
        }),
        prisma.collaboration.findMany({
          where: {
            statut: { in: ["PUBLIE", "FACTURE_RECUE"] },
            datePublication: { lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          include: { talent: true, marque: true },
          orderBy: { datePublication: "asc" },
        }),
      ]);

      // Enrichir données
      const talentIds = topTalents.map((t) => t.talentId);
      const talents = await prisma.talent.findMany({
        where: { id: { in: talentIds } },
        select: { id: true, prenom: true, nom: true },
      });
      const talentsMap = Object.fromEntries(talents.map((t) => [t.id, t]));

      const marqueIds = topMarques.map((m) => m.marqueId);
      const marques = await prisma.marque.findMany({
        where: { id: { in: marqueIds } },
        select: { id: true, nom: true },
      });
      const marquesMap = Object.fromEntries(marques.map((m) => [m.id, m]));

      const tmPerformance = performanceTM.map((tm) => {
        const collabs = tm.talentsGeres.flatMap((t) => t.collaborations);
        const totalCollabs = collabs.length;
        const collabsGagnees = collabs.filter((c) =>
          ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"].includes(c.statut)
        ).length;
        const ca = collabs
          .filter((c) => ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"].includes(c.statut))
          .reduce((sum, c) => sum + Number(c.montantBrut), 0);
        const tauxConversion = totalCollabs > 0 ? Math.round((collabsGagnees / totalCollabs) * 100) : 0;

        return {
          id: tm.id,
          nom: `${tm.prenom} ${tm.nom}`,
          talents: tm.talentsGeres.length,
          collabsEnCours: collabs.filter((c) => c.statut === "EN_COURS").length,
          ca,
          tauxConversion,
        };
      });

      return NextResponse.json({
        role: "ADMIN",
        stats: {
          totalTalents,
          totalMarques,
          collabsEnCours,
          collabsNego: negosEnCours, // ✅ Utilise le vrai compteur de négociations
          collabsPublie,
          facturesEnAttente,
          caMois: Number(caMoisBrut._sum.montantBrut) || 0,
          caAnnee: Number(caAnneeBrut._sum.montantBrut) || 0,
          commissionMois: Number(commissionMois._sum.commissionEuros) || 0,
        },
        pipeline: collabsParStatut.map((s) => ({ statut: s.statut, count: s._count })),
        topTalents: topTalents.map((t) => ({
          id: t.talentId,
          nom: talentsMap[t.talentId] ? `${talentsMap[t.talentId].prenom} ${talentsMap[t.talentId].nom}` : "Inconnu",
          ca: Number(t._sum.montantBrut) || 0,
        })),
        topMarques: topMarques.map((m) => ({
          id: m.marqueId,
          nom: marquesMap[m.marqueId]?.nom || "Inconnue",
          ca: Number(m._sum.montantBrut) || 0,
        })),
        tmPerformance,
        facturesRelance: facturesRelance.map((f) => {
          const jours = f.datePublication
            ? Math.floor((Date.now() - new Date(f.datePublication).getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          return {
            id: f.id,
            reference: f.reference,
            talent: `${f.talent.prenom} ${f.talent.nom}`,
            marque: f.marque.nom,
            montant: Number(f.montantBrut),
            jours,
            statut: jours >= 90 ? "contentieux" : jours >= 60 ? "relance2" : "relance1",
          };
        }),
      });
    }

    // ============================================
    // HEAD_OF - Pôle Influence
    // ============================================
    if (role === "HEAD_OF") {
      const [
        totalTalents,
        talentsSansTarifs,
        talentsAvecBilanRetard,
        negosEnCours,
        caMois,
        caAnnee,
        performanceTM,
      ] = await Promise.all([
        prisma.talent.count(),
        prisma.talent.count({ where: { tarifs: null } }),
        prisma.talent.count({
          where: {
            OR: [
              { stats: null },
              { stats: { lastUpdate: { lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
            ],
          },
        }),
        // ✅ CORRIGÉ: Compter les vraies négociations
        prisma.negociation.count({ 
          where: { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } } 
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfMonth },
          },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfYear },
          },
        }),
        prisma.user.findMany({
          where: { role: "TM", actif: true },
          select: {
            id: true,
            prenom: true,
            nom: true,
            talentsGeres: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                stats: { select: { lastUpdate: true } },
                tarifs: { select: { id: true } },
                collaborations: {
                  where: { createdAt: { gte: startOfYear } },
                  select: { statut: true, montantBrut: true },
                },
              },
            },
          },
        }),
      ]);

      const tmBilans = performanceTM.map((tm) => {
        const talents = tm.talentsGeres;
        const collabs = talents.flatMap((t) => t.collaborations);
        const ca = collabs
          .filter((c) => ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"].includes(c.statut))
          .reduce((sum, c) => sum + Number(c.montantBrut), 0);
        const talentsRetard = talents.filter(
          (t) => !t.stats || new Date(t.stats.lastUpdate).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
        );
        const talentsSansTarif = talents.filter((t) => !t.tarifs);

        return {
          id: tm.id,
          nom: `${tm.prenom} ${tm.nom}`,
          talents: talents.length,
          ca,
          bilansRetard: talentsRetard.length,
          sansTarifs: talentsSansTarif.length,
          talentsDetail: talents.map((t) => ({
            id: t.id,
            nom: `${t.prenom} ${t.nom}`,
            bilanOk: t.stats && new Date(t.stats.lastUpdate).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000,
            tarifsOk: !!t.tarifs,
          })),
        };
      });

      return NextResponse.json({
        role: "HEAD_OF",
        stats: {
          totalTalents,
          talentsSansTarifs,
          talentsAvecBilanRetard,
          collabsNego: negosEnCours, // ✅ Utilise le vrai compteur
          caMois: Number(caMois._sum.montantBrut) || 0,
          commissionMois: Number(caMois._sum.commissionEuros) || 0,
          caAnnee: Number(caAnnee._sum.montantBrut) || 0,
          commissionAnnee: Number(caAnnee._sum.commissionEuros) || 0,
        },
        tmBilans,
      });
    }

    // ============================================
    // TM - Ses talents uniquement
    // ============================================
    if (role === "TM") {
      const [
        mesTalents,
        mesNegociations, // ✅ CORRIGÉ: Utilise la table Negociation
        mesCollabsEnCours,
        mesCollabsPublie,
        caMois,
      ] = await Promise.all([
        prisma.talent.findMany({
          where: { managerId: user.id },
          include: {
            stats: { select: { lastUpdate: true, igFollowers: true, ttFollowers: true } },
            tarifs: { select: { id: true } },
            _count: { select: { collaborations: true } },
          },
        }),
        // ✅ CORRIGÉ: Chercher dans la table Negociation, pas Collaboration
        prisma.negociation.findMany({
          where: { 
            tmId: user.id,
            statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] }
          },
          include: { 
            talent: { select: { id: true, prenom: true, nom: true } }, 
            marque: { select: { id: true, nom: true } },
            livrables: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.collaboration.count({
          where: { statut: "EN_COURS", talent: { managerId: user.id } },
        }),
        prisma.collaboration.findMany({
          where: { statut: "PUBLIE", talent: { managerId: user.id } },
          include: { talent: true, marque: true },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: {
            talent: { managerId: user.id },
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfMonth },
          },
        }),
      ]);

      const talentsAvecBilanRetard = mesTalents.filter(
        (t) => !t.stats || new Date(t.stats.lastUpdate).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
      );

      return NextResponse.json({
        role: "TM",
        stats: {
          mesTalents: mesTalents.length,
          mesNegos: mesNegociations.length, // ✅ Compte les vraies négos
          mesCollabsEnCours,
          aFacturer: mesCollabsPublie.length,
          bilansRetard: talentsAvecBilanRetard.length,
          caMois: Number(caMois._sum.montantBrut) || 0,
        },
        talents: mesTalents.map((t) => ({
          id: t.id,
          nom: `${t.prenom} ${t.nom}`,
          photo: t.photo,
          followers: (t.stats?.igFollowers || 0) + (t.stats?.ttFollowers || 0),
          collabs: t._count.collaborations,
          bilanRetard: !t.stats || new Date(t.stats.lastUpdate).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000,
          joursDepuisBilan: t.stats
            ? Math.floor((Date.now() - new Date(t.stats.lastUpdate).getTime()) / (1000 * 60 * 60 * 24))
            : 999,
        })),
        // ✅ CORRIGÉ: Mapper les vraies négociations
        negociations: mesNegociations.map((n) => ({
          id: n.id,
          reference: n.reference,
          talent: `${n.talent.prenom} ${n.talent.nom}`,
          marque: n.marque.nom,
          statut: n.statut,
          source: n.source,
          montant: Number(n.budgetFinal || n.budgetSouhaite || n.budgetMarque) || 0,
          createdAt: n.createdAt,
        })),
        aFacturer: mesCollabsPublie.map((c) => ({
          id: c.id,
          reference: c.reference,
          talent: `${c.talent.prenom} ${c.talent.nom}`,
          marque: c.marque.nom,
          montant: Number(c.montantBrut),
        })),
      });
    }

    // ============================================
    // HEAD_OF_INFLUENCE - Dashboard Influence
    // ============================================
    if (role === "HEAD_OF_INFLUENCE") {
      const [
        totalTalents,
        collabsEnCours,
        negosEnCours,
        caMois,
        caAnnee,
      ] = await Promise.all([
        prisma.talent.count(),
        prisma.collaboration.count({ where: { statut: "EN_COURS" } }),
        prisma.negociation.count({ 
          where: { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } } 
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfMonth },
          },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfYear },
          },
        }),
      ]);

      return NextResponse.json({
        role: "HEAD_OF_INFLUENCE",
        stats: {
          totalTalents,
          collabsEnCours,
          collabsNego: negosEnCours,
          caMois: Number(caMois._sum.montantBrut) || 0,
          commissionMois: Number(caMois._sum.commissionEuros) || 0,
          caAnnee: Number(caAnnee._sum.montantBrut) || 0,
          commissionAnnee: Number(caAnnee._sum.commissionEuros) || 0,
        },
      });
    }

    // ============================================
    // HEAD_OF_SALES - Dashboard Sales
    // ============================================
    if (role === "HEAD_OF_SALES") {
      const [
        totalMarques,
        negosEnCours,
        caMois,
        caAnnee,
      ] = await Promise.all([
        prisma.marque.count(),
        prisma.negociation.count({ 
          where: { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } } 
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfMonth },
          },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: {
            statut: { in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"] },
            createdAt: { gte: startOfYear },
          },
        }),
      ]);

      return NextResponse.json({
        role: "HEAD_OF_SALES",
        stats: {
          totalMarques,
          collabsNego: negosEnCours,
          caMois: Number(caMois._sum.montantBrut) || 0,
          caAnnee: Number(caAnnee._sum.montantBrut) || 0,
        },
      });
    }

    // ============================================
    // CM - Dashboard Community Manager
    // ============================================
    if (role === "CM") {
      const [
        collabsEnCours,
        collabsPublie,
      ] = await Promise.all([
        prisma.collaboration.count({ where: { statut: "EN_COURS" } }),
        prisma.collaboration.count({ where: { statut: "PUBLIE" } }),
      ]);

      return NextResponse.json({
        role: "CM",
        stats: {
          collabsEnCours,
          collabsPublie,
        },
      });
    }

    return NextResponse.json({ error: "Rôle non reconnu" }, { status: 400 });
  } catch (error) {
    console.error("Erreur dashboard:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}