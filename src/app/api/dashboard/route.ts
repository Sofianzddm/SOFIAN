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
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1);

    // Filtre "date de référence" pour les stats : datePublication si renseignée (modifiable par le TM), sinon createdAt
    const statutsGagnes: ("EN_COURS" | "PUBLIE" | "FACTURE_RECUE" | "PAYE")[] = ["EN_COURS", "PUBLIE", "FACTURE_RECUE", "PAYE"];
    const whereCaMoisAvecDatePub =
      { statut: { in: statutsGagnes }, datePublication: { gte: startOfMonth, lt: startOfNextMonth } };
    const whereCaMoisSansDatePub =
      { statut: { in: statutsGagnes }, datePublication: null, createdAt: { gte: startOfMonth, lt: startOfNextMonth } };
    const whereCaAnneeAvecDatePub =
      { statut: { in: statutsGagnes }, datePublication: { gte: startOfYear, lt: startOfNextYear } };
    const whereCaAnneeSansDatePub =
      { statut: { in: statutsGagnes }, datePublication: null, createdAt: { gte: startOfYear, lt: startOfNextYear } };

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
        caMoisAvecDatePub,
        caMoisSansDatePub,
        caAnneeAvecDatePub,
        caAnneeSansDatePub,
        commissionMoisAvecDatePub,
        commissionMoisSansDatePub,
        collabsParStatut,
        topTalentsAvecDatePub,
        topTalentsSansDatePub,
        topMarquesAvecDatePub,
        topMarquesSansDatePub,
        performanceTM,
        facturesRelance,
        negociationsSansReponse,
      ] = await Promise.all([
        prisma.talent.count(),
        prisma.marque.count(),
        prisma.collaboration.count({ where: { statut: "EN_COURS" } }),
        // ✅ CORRIGÉ: Compter les vraies négociations
        prisma.negociation.count({
          where: { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } },
        }),
        prisma.collaboration.count({ where: { statut: "PUBLIE" } }),
        prisma.collaboration.count({
          where: { statut: { in: ["PUBLIE", "FACTURE_RECUE"] } },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: whereCaMoisAvecDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: whereCaMoisSansDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: whereCaAnneeAvecDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true },
          where: whereCaAnneeSansDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { commissionEuros: true },
          where: whereCaMoisAvecDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { commissionEuros: true },
          where: whereCaMoisSansDatePub,
        }),
        prisma.collaboration.groupBy({
          by: ["statut"],
          _count: true,
        }),
        prisma.collaboration.groupBy({
          by: ["talentId"],
          _sum: { montantBrut: true },
          where: whereCaAnneeAvecDatePub,
        }),
        prisma.collaboration.groupBy({
          by: ["talentId"],
          _sum: { montantBrut: true },
          where: whereCaAnneeSansDatePub,
        }),
        prisma.collaboration.groupBy({
          by: ["marqueId"],
          _sum: { montantBrut: true },
          where: whereCaAnneeAvecDatePub,
        }),
        prisma.collaboration.groupBy({
          by: ["marqueId"],
          _sum: { montantBrut: true },
          where: whereCaAnneeSansDatePub,
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
                  where: {
                    OR: [
                      { datePublication: { gte: startOfYear, lt: startOfNextYear } },
                      { datePublication: null, createdAt: { gte: startOfYear, lt: startOfNextYear } },
                    ],
                  },
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
        prisma.negociation.findMany({
          where: {
            statut: { in: ["EN_ATTENTE", "EN_DISCUSSION"] },
            lastModifiedAt: { lt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
          },
          include: {
            talent: { select: { prenom: true, nom: true } },
            marque: { select: { nom: true } },
            tm: { select: { prenom: true, nom: true } },
          },
          orderBy: { lastModifiedAt: "asc" },
        }),
      ]);

      // CA / commissions : date de référence = datePublication si présente, sinon createdAt
      const caMoisBrut =
        (Number(caMoisAvecDatePub._sum.montantBrut) || 0) + (Number(caMoisSansDatePub._sum.montantBrut) || 0);
      const caAnneeBrut =
        (Number(caAnneeAvecDatePub._sum.montantBrut) || 0) + (Number(caAnneeSansDatePub._sum.montantBrut) || 0);
      const commissionMois =
        (Number(commissionMoisAvecDatePub._sum.commissionEuros) || 0) + (Number(commissionMoisSansDatePub._sum.commissionEuros) || 0);

      // Fusion top talents / top marques (avec + sans datePublication), tri par CA, top 5
      const talentSums = new Map<string, number>();
      for (const t of topTalentsAvecDatePub) {
        talentSums.set(t.talentId, (talentSums.get(t.talentId) || 0) + Number(t._sum.montantBrut || 0));
      }
      for (const t of topTalentsSansDatePub) {
        talentSums.set(t.talentId, (talentSums.get(t.talentId) || 0) + Number(t._sum.montantBrut || 0));
      }
      const topTalents = Array.from(talentSums.entries())
        .map(([talentId, ca]) => ({ talentId, _sum: { montantBrut: ca } }))
        .sort((a, b) => b._sum.montantBrut - a._sum.montantBrut)
        .slice(0, 5);

      const marqueSums = new Map<string, number>();
      for (const m of topMarquesAvecDatePub) {
        marqueSums.set(m.marqueId, (marqueSums.get(m.marqueId) || 0) + Number(m._sum.montantBrut || 0));
      }
      for (const m of topMarquesSansDatePub) {
        marqueSums.set(m.marqueId, (marqueSums.get(m.marqueId) || 0) + Number(m._sum.montantBrut || 0));
      }
      const topMarques = Array.from(marqueSums.entries())
        .map(([marqueId, ca]) => ({ marqueId, _sum: { montantBrut: ca } }))
        .sort((a, b) => b._sum.montantBrut - a._sum.montantBrut)
        .slice(0, 5);

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
          caMois: caMoisBrut,
          caAnnee: caAnneeBrut,
          commissionMois,
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
        negociationsSansReponse: negociationsSansReponse.map((n) => {
          const jours = Math.floor((Date.now() - new Date(n.lastModifiedAt).getTime()) / (24 * 60 * 60 * 1000));
          return {
            id: n.id,
            reference: n.reference,
            talent: `${n.talent.prenom} ${n.talent.nom}`,
            marque: n.nomMarqueSaisi || n.marque?.nom || "—",
            tm: n.tm ? `${n.tm.prenom} ${n.tm.nom}` : null,
            joursSansReponse: jours,
          };
        }),
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
        negociations,
        negociationsSansReponse,
        caMoisAvec,
        caMoisSans,
        caAnneeAvec,
        caAnneeSans,
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
        prisma.negociation.count({
          where: { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } },
        }),
        prisma.negociation.findMany({
          where: { statut: { in: ["BROUILLON", "EN_ATTENTE", "EN_DISCUSSION"] } },
          include: {
            talent: { select: { id: true, prenom: true, nom: true } },
            marque: { select: { id: true, nom: true } },
            tm: { select: { prenom: true, nom: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
        prisma.negociation.findMany({
          where: {
            statut: { in: ["EN_ATTENTE", "EN_DISCUSSION"] },
            lastModifiedAt: { lt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
          },
          include: {
            talent: { select: { prenom: true, nom: true } },
            marque: { select: { nom: true } },
            tm: { select: { prenom: true, nom: true } },
          },
          orderBy: { lastModifiedAt: "asc" },
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: whereCaMoisAvecDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: whereCaMoisSansDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: whereCaAnneeAvecDatePub,
        }),
        prisma.collaboration.aggregate({
          _sum: { montantBrut: true, commissionEuros: true },
          where: whereCaAnneeSansDatePub,
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
                  where: {
                    OR: [
                      { datePublication: { gte: startOfYear, lt: startOfNextYear } },
                      { datePublication: null, createdAt: { gte: startOfYear, lt: startOfNextYear } },
                    ],
                  },
                  select: { statut: true, montantBrut: true },
                },
              },
            },
          },
        }),
      ]);

      const caMois = (Number(caMoisAvec._sum.montantBrut) || 0) + (Number(caMoisSans._sum.montantBrut) || 0);
      const commissionMois = (Number(caMoisAvec._sum.commissionEuros) || 0) + (Number(caMoisSans._sum.commissionEuros) || 0);
      const caAnnee = (Number(caAnneeAvec._sum.montantBrut) || 0) + (Number(caAnneeSans._sum.montantBrut) || 0);
      const commissionAnnee = (Number(caAnneeAvec._sum.commissionEuros) || 0) + (Number(caAnneeSans._sum.commissionEuros) || 0);

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
          collabsNego: negosEnCours,
          caMois,
          commissionMois,
          caAnnee,
          commissionAnnee,
        },
        negociations: negociations.map((n) => ({
          id: n.id,
          reference: n.reference,
          talent: `${n.talent.prenom} ${n.talent.nom}`,
          marque: n.nomMarqueSaisi || n.marque?.nom || "—",
          statut: n.statut,
          montant: Number(n.budgetFinal || n.budgetSouhaite || n.budgetMarque) || 0,
          tm: n.tm ? `${n.tm.prenom} ${n.tm.nom}` : null,
          createdAt: n.createdAt,
          lastModifiedAt: n.lastModifiedAt,
        })),
        negociationsSansReponse: negociationsSansReponse.map((n) => {
          const jours = Math.floor((Date.now() - new Date(n.lastModifiedAt).getTime()) / (24 * 60 * 60 * 1000));
          return {
            id: n.id,
            reference: n.reference,
            talent: `${n.talent.prenom} ${n.talent.nom}`,
            marque: n.nomMarqueSaisi || n.marque?.nom || "—",
            tm: n.tm ? `${n.tm.prenom} ${n.tm.nom}` : null,
            joursSansReponse: jours,
          };
        }),
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
      ]);

      const talentsAvecBilanRetard = mesTalents.filter(
        (t) => !t.stats || new Date(t.stats.lastUpdate).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
      );

      const cinqJoursMs = 5 * 24 * 60 * 60 * 1000;
      const negociationsSansReponse = mesNegociations
        .filter((n) => ["EN_ATTENTE", "EN_DISCUSSION"].includes(n.statut) && new Date(n.lastModifiedAt).getTime() < Date.now() - cinqJoursMs)
        .map((n) => ({
          id: n.id,
          reference: n.reference,
          talent: `${n.talent.prenom} ${n.talent.nom}`,
          marque: n.nomMarqueSaisi || n.marque?.nom || "—",
          joursSansReponse: Math.floor((Date.now() - new Date(n.lastModifiedAt).getTime()) / (24 * 60 * 60 * 1000)),
        }));

      return NextResponse.json({
        role: "TM",
        stats: {
          mesTalents: mesTalents.length,
          mesNegos: mesNegociations.length,
          mesCollabsEnCours,
          bilansRetard: talentsAvecBilanRetard.length,
        },
        negociationsSansReponse,
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
        negociations: mesNegociations.map((n: any) => ({
          id: n.id,
          reference: n.reference,
          talent: `${n.talent.prenom} ${n.talent.nom}`,
          marque: n.nomMarqueSaisi || n.marque?.nom || "—",
          statut: n.statut,
          source: n.source,
          montant: Number(n.budgetFinal || n.budgetSouhaite || n.budgetMarque) || 0,
          createdAt: n.createdAt,
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