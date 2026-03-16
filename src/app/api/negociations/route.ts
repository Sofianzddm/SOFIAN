import React from "react";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logDelegationActivite } from "@/lib/delegations";
import { getTalentIdsAccessibles } from "@/lib/delegations";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { NewNegociationEmail } from "@/lib/emails/NewNegociationEmail";

// GET - Liste des négociations (filtrée par rôle)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statut = searchParams.get("statut");
    const tmId = searchParams.get("tmId");

    // Construire le where selon le rôle
    const where: any = {};

    // TM : ne voir que les négos dont le talent est accessible
    // (talents propres + talents délégués actifs), indépendamment du tmId.
    if (session.user.role === "TM") {
      const talentIds = await getTalentIdsAccessibles(session.user.id as string);
      // Si aucun talent accessible, on force un IN vide pour ne rien retourner.
      where.talentId = { in: talentIds.length > 0 ? talentIds : ["__none__"] };
    }
    // Head Of et Admin voient tout (possibilité de filtrer par TM)
    else if (tmId) {
      where.tmId = tmId;
    }

    if (statut) {
      where.statut = statut;
    }

    const negociations = await prisma.negociation.findMany({
      where,
      include: {
        tm: {
          select: { id: true, prenom: true, nom: true },
        },
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
            managerId: true,
            manager: { select: { prenom: true, nom: true } },
            delegations: {
              where: { actif: true },
              select: { actif: true },
            },
          },
        },
        marque: {
          select: { id: true, nom: true, secteur: true },
        },
        livrables: true,
        validateur: {
          select: { id: true, prenom: true, nom: true },
        },
        _count: {
          select: { commentaires: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(negociations);
  } catch (error) {
    console.error("Erreur GET négociations:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// POST - Créer une négociation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const data = await request.json();
    const isTM = session.user.role === "TM";

    if (!data.talentId) {
      return NextResponse.json({ message: "Talent obligatoire" }, { status: 400 });
    }
    // Marque : soit marqueId (existant), soit nomMarqueSaisi (texte libre → fiche marque créée à la validation)
    const hasMarque = data.marqueId || (data.nomMarqueSaisi && String(data.nomMarqueSaisi).trim());
    if (!hasMarque) {
      return NextResponse.json({ message: "Nom de la marque obligatoire" }, { status: 400 });
    }

    // Générer la référence NEG-2026-0001
    const year = new Date().getFullYear();
    const compteur = await prisma.compteur.upsert({
      where: { type_annee: { type: "NEG", annee: year } },
      update: { dernierNumero: { increment: 1 } },
      create: { type: "NEG", annee: year, dernierNumero: 1 },
    });
    const reference = `NEG-${year}-${String(compteur.dernierNumero).padStart(4, "0")}`;

    const nomMarqueSaisi = data.nomMarqueSaisi ? String(data.nomMarqueSaisi).trim() : null;
    const marqueId = data.marqueId || null;
    // TM ne gère que les entrants → forcer INBOUND côté serveur
    const source: "INBOUND" | "OUTBOUND" =
      isTM ? "INBOUND" : data.source === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

    // Créer la négociation (marqueId optionnel si nomMarqueSaisi fourni)
    const negociation = await prisma.negociation.create({
      data: {
        reference,
        tmId: session.user.id, // Le TM connecté
        talentId: data.talentId,
        marqueId,
        nomMarqueSaisi: nomMarqueSaisi || null,
        contactMarque: data.contactMarque || null,
        emailContact: data.emailContact || null,
        source,
        brief: data.brief || null,
        budgetMarque: data.budgetMarque ? parseFloat(data.budgetMarque) : null,
        budgetSouhaite: data.budgetSouhaite ? parseFloat(data.budgetSouhaite) : null,
        dateDeadline: data.dateDeadline ? new Date(data.dateDeadline) : null,
        statut: "BROUILLON", // Créer en brouillon, le TM devra soumettre
        livrables: {
          create: (data.livrables || []).map((l: any) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite || 1,
            prixDemande: l.prixDemande ? parseFloat(l.prixDemande) : null,
            prixSouhaite: l.prixSouhaite ? parseFloat(l.prixSouhaite) : null,
            description: l.description || null,
          })),
        },
      },
      include: {
        tm: { select: { prenom: true, nom: true } },
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { id: true, nom: true } },
        livrables: true,
      },
    });

    // Log d'activité de délégation (création négo)
    logDelegationActivite({
      talentId: negociation.talentId,
      auteurId: session.user.id,
      type: "NEGO_CREEE",
      entiteType: "NEGO",
      entiteId: negociation.id,
      entiteRef: negociation.reference,
      detail: "Nouvelle négociation créée",
    }).catch(console.error);

    // Notifier les Head of Influence par email
    try {
      const heads = await prisma.user.findMany({
        where: {
          actif: true,
          role: "HEAD_OF_INFLUENCE",
        },
        select: {
          id: true,
          email: true,
          prenom: true,
          nom: true,
        },
      });

      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();

      if (heads.length > 0 && resendKey && fromEmail) {
        const tmName = `${negociation.tm.prenom} ${negociation.tm.nom}`.trim();
        const talentName = negociation.talent
          ? `${negociation.talent.prenom} ${negociation.talent.nom}`.trim()
          : "—";
        const marqueName = negociation.marque?.nom || negociation.nomMarqueSaisi || "—";
        const brief =
          (data.brief && String(data.brief).trim().slice(0, 280)) || "Aucun brief renseigné.";

        const link = `/negociations/${negociation.id}`;
        const rawBase =
          (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").trim();
        const baseUrl = rawBase.replace(/\/$/, "");
        const url = `${baseUrl}${link}`;

        const subject = `[NÉGO] Nouvelle négociation ${marqueName}`;
        const resend = new Resend(resendKey);

        for (const head of heads) {
          if (!head.email) continue;
          try {
            const html = await render(
              React.createElement(NewNegociationEmail, {
                headName: head.prenom?.trim() || "Head of Influence",
                reference: negociation.reference,
                talentName,
                marqueName,
                tmName,
                source: negociation.source,
                brief,
                url,
                variant: "created",
              })
            );
            await resend.emails.send({
              from: fromEmail.includes("<")
                ? fromEmail
                : `Glow Up Agence <${fromEmail}>`,
              to: head.email,
              subject,
              html,
            });
          } catch (err) {
            console.error("Erreur envoi email nouvelle négo:", head.email, err);
          }
        }
      }
    } catch (err) {
      console.error("Erreur lors des notifications email Head of:", err);
    }

    return NextResponse.json(negociation, { status: 201 });
  } catch (error) {
    console.error("Erreur POST négociation:", error);
    return NextResponse.json({ message: "Erreur lors de la création" }, { status: 500 });
  }
}
