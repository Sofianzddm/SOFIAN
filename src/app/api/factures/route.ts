// src/app/api/factures/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const now = new Date();
    const user = session.user as { id: string; role?: string };
    const isAdmin = user.role === "ADMIN";
    const isHeadOfSales = user.role === "HEAD_OF_SALES";
    const isCm = user.role === "CM";
    const salesScopeWhere = isHeadOfSales
      ? { createdById: user.id }
      : isCm
        ? { collaboration: { accountManagerId: user.id } }
        : {};
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // ============================================
    // FACTURES MARQUES (Documents de type FACTURE) + liste complète pour la page factures
    // ============================================
    const facturesMarques = await prisma.document.findMany({
      where: {
        type: "FACTURE",
        ...(salesScopeWhere),
      },
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
      where: {
        type: "FACTURE",
        ...(salesScopeWhere),
      },
      include: {
        collaboration: {
          select: {
            id: true,
            reference: true,
            talent: { select: { id: true, prenom: true, nom: true } },
            marque: {
              select: {
                id: true,
                nom: true,
                contacts: {
                  where: { email: { not: null } },
                  select: { id: true, prenom: true, nom: true, email: true, principal: true },
                  orderBy: { principal: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ============================================
    // DEVIS (documents type DEVIS) pour l'onglet Devis de la page factures
    // ============================================
    const devisDocuments = await prisma.document.findMany({
      where: {
        type: "DEVIS",
        ...(salesScopeWhere),
      },
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
    // AVOIRS (documents type AVOIR) pour l'onglet Avoirs de la page factures
    // ============================================
    const avoirsDocuments = await prisma.document.findMany({
      where: {
        type: "AVOIR",
        ...(salesScopeWhere),
      },
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
      if (isAdmin && c.paidAt) {
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
        paidAt: isAdmin ? c.paidAt : null,
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
    
    // Factures marques en retard (échéance dépassée, non payées)
    // On inclut ENVOYE et VALIDE (Enregistré) car dans le workflow actuel les factures
    // restent souvent en VALIDE même quand elles ont été transmises à la marque.
    const facturesEnRetard = await prisma.document.count({
      where: {
        type: "FACTURE",
        statut: { in: ["ENVOYE", "VALIDE"] },
        dateEcheance: { lt: now },
      },
    });

    // Factures marques en attente de paiement (non payées)
    const facturesEnAttente = await prisma.document.count({
      where: {
        type: "FACTURE",
        statut: { in: ["ENVOYE", "VALIDE"] },
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

    // Historique des relances (destinataire réel + auteur) pour l'onglet Relances
    const docsWithRelanceIds = documents
      .filter((d) => d.relance1SentAt || d.relance2SentAt || d.relance3SentAt)
      .map((d) => d.id);
    const relanceEvents =
      docsWithRelanceIds.length > 0
        ? await prisma.documentEvent.findMany({
            where: { documentId: { in: docsWithRelanceIds }, type: "REMINDER_SENT" },
            orderBy: { createdAt: "asc" },
            select: {
              documentId: true,
              description: true,
              createdAt: true,
              user: { select: { id: true, prenom: true, nom: true } },
            },
          })
        : [];

    const parseRelanceLevel = (description: string | null): 1 | 2 | 3 | null => {
      if (!description) return null;
      if (description.startsWith("1ère relance envoyée à ")) return 1;
      if (description.startsWith("2ème relance envoyée à ")) return 2;
      if (description.startsWith("3ème relance envoyée à ")) return 3;
      return null;
    };
    const parseRelanceEmail = (description: string | null, level: 1 | 2 | 3): string | null => {
      if (!description) return null;
      const prefix =
        level === 1
          ? "1ère relance envoyée à "
          : level === 2
            ? "2ème relance envoyée à "
            : "3ème relance envoyée à ";
      if (!description.startsWith(prefix)) return null;
      const email = description.slice(prefix.length).trim();
      return email || null;
    };

    const relancesByDoc = new Map<
      string,
      Array<{
        level: 1 | 2 | 3;
        sentAt: string;
        sentTo: string | null;
        sentBy: { id: string; prenom: string; nom: string } | null;
      }>
    >();
    for (const ev of relanceEvents) {
      const level = parseRelanceLevel(ev.description);
      if (!level) continue;
      const entry = {
        level,
        sentAt: ev.createdAt.toISOString(),
        sentTo: parseRelanceEmail(ev.description, level),
        sentBy: ev.user ?? null,
      };
      const list = relancesByDoc.get(ev.documentId) ?? [];
      // garder le plus récent pour un même niveau
      const withoutLevel = list.filter((r) => r.level !== level);
      withoutLevel.push(entry);
      relancesByDoc.set(ev.documentId, withoutLevel.sort((a, b) => a.level - b.level));
    }

    // ============================================
    // RESPONSE — masquer infos de paiement pour non-ADMIN (marque nous a réglé / talent payé)
    // ============================================
    const maskStatutDoc = (statut: string) => (isAdmin ? statut : statut === "PAYE" ? "ENVOYE" : statut);
    const statsPayload = isAdmin
      ? { entreesMois, sortiesMois, caNetMois, entreesAnnee, sortiesAnnee, caNetAnnee, evolMois, facturesEnRetard, facturesEnAttente, talentsAPayer }
      : { entreesMois: 0, sortiesMois: 0, caNetMois: 0, entreesAnnee: 0, sortiesAnnee: 0, caNetAnnee: 0, evolMois: 0, facturesEnRetard, facturesEnAttente, talentsAPayer: 0 };

    return NextResponse.json({
      stats: statsPayload,
      // Liste complète pour la page factures (toutes les factures, avec collaboration optionnelle)
      documents: documents.map((d) => {
        const principalContact = d.collaboration?.marque?.contacts?.[0] ?? null;
        const relanceHistory = relancesByDoc.get(d.id) ?? [];
        // Destinataire probable pour la prochaine relance (même logique simplifiée que l'API relance)
        const relanceDestinataire =
          d.clientEmail?.trim() ||
          principalContact?.email?.trim() ||
          null;
        const lastRelance = [...relanceHistory].sort(
          (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
        )[0] ?? null;
        return {
          id: d.id,
          reference: d.reference,
          type: d.type,
          statut: maskStatutDoc(d.statut),
          titre: d.titre ?? null,
          montantHT: Number(d.montantHT),
          montantTTC: Number(d.montantTTC),
          devise: d.devise || "EUR",
          dateDocument: d.dateDocument,
          dateEmission: d.dateEmission,
          dateEcheance: d.dateEcheance,
          createdAt: d.createdAt,
          clientNom: d.clientNom ?? null,
          clientEmail: d.clientEmail ?? null,
          relance1SentAt: d.relance1SentAt,
          relance2SentAt: d.relance2SentAt,
          relance3SentAt: d.relance3SentAt,
          relanceHistory,
          lastRelance,
          relanceDestinataire,
          collaboration: d.collaboration
            ? {
                id: d.collaboration.id,
                reference: d.collaboration.reference,
                talent: d.collaboration.talent,
                marque: d.collaboration.marque ? { id: d.collaboration.marque.id, nom: d.collaboration.marque.nom } : null,
                marqueContact: principalContact
                  ? { id: principalContact.id, prenom: principalContact.prenom, nom: principalContact.nom, email: principalContact.email }
                  : null,
              }
            : null,
        };
      }),
      // Filtrer les factures sans collaboration (au cas où)
      facturesMarques: facturesMarques
        .filter((f) => f.collaboration !== null)
        .map((f) => {
          const baseStatut = maskStatutDoc(f.statut);
          return {
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
            statut:
              f.dateEcheance &&
              new Date(f.dateEcheance) < now &&
              (baseStatut === "ENVOYE" || baseStatut === "VALIDE")
                ? "EN_RETARD"
                : baseStatut,
            dateEmission: f.dateEmission,
            dateEcheance: f.dateEcheance,
          };
        }),
      facturesTalents,
      monthlyData: isAdmin ? monthlyData : monthlyData.map((m) => ({ ...m, entrees: 0, sorties: 0, net: 0 })),
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
      // Avoirs pour l'onglet Avoirs (montants stockés en négatif)
      avoirs: avoirsDocuments.map((d) => ({
        id: d.id,
        reference: d.reference,
        type: d.type,
        statut: d.statut,
        titre: d.titre ?? null,
        montantHT: Number(d.montantHT),
        montantTTC: Number(d.montantTTC),
        devise: d.devise || "EUR",
        dateEmission: d.dateEmission,
        dateDocument: d.dateDocument,
        createdAt: d.createdAt,
        clientNom: d.clientNom ?? null,
        clientEmail: d.clientEmail ?? null,
        collaboration: d.collaboration
          ? {
              id: d.collaboration.id,
              reference: d.collaboration.reference,
              talent: d.collaboration.talent,
              marque: d.collaboration.marque
                ? { id: d.collaboration.marque.id, nom: d.collaboration.marque.nom }
                : null,
            }
          : null,
      })),
      avoirsStats: { total: avoirsDocuments.length },
    });
  } catch (error) {
    console.error("Erreur API factures:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}