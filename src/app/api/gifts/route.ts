import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { Role } from "@prisma/client";
import { GiftNouvelleDemandeEmail } from "@/emails/GiftNouvelleDemandeEmail";

// GET /api/gifts
// - Liste des demandes de gifts (mode normal)
// - Liste des talents filtrés pour le formulaire (mode=talents)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    const { searchParams } = new URL(req.url);
    const statut = searchParams.get("statut");
    const talentId = searchParams.get("talentId");
    const mode = searchParams.get("mode");

    // Mode spécial: récupération des talents filtrés pour le formulaire de création
    if (mode === "talents") {
      if (!["TM", "CM", "ADMIN"].includes(user.role)) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }

      const whereTalent: any = { isArchived: false };
      if (user.role === "TM") {
        // TM : ses talents directs + talents délégués
        whereTalent.OR = [
          { managerId: user.id },
          {
            delegations: {
              some: {
                tmRelaiId: user.id,
                actif: true,
              },
            },
          },
        ];
      }

      const talents = await prisma.talent.findMany({
        where: whereTalent,
        select: {
          id: true,
          prenom: true,
          nom: true,
          instagram: true,
          adresse: true,
          codePostal: true,
          ville: true,
          pays: true,
        },
        orderBy: [
          { prenom: "asc" },
          { nom: "asc" },
        ],
      });

      return NextResponse.json(talents);
    }

    // Mode par défaut : liste des demandes de gifts
    const { role, id } = user;

    // Construction de la requête selon le rôle
    let where: any = {};

    if (role === "TM") {
      // TM voit ses demandes + celles des talents qui lui sont délégués
      where.OR = [
        { tmId: id },
        {
          talent: {
            delegations: {
              some: {
                tmRelaiId: id,
                actif: true,
              },
            },
          },
        },
      ];
    } else if (role === "CM") {
      // Account Manager (CM) voit toutes les demandes
      // Optionnel : filtrer celles qui lui sont assignées
      // where.accountManagerId = user.id;
    } else if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    if (statut && statut !== "TOUS") {
      where.statut = statut;
    }

    if (talentId) {
      where.talentId = talentId;
    }

    const demandes = await prisma.demandeGift.findMany({
      where,
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
            instagram: true,
          },
        },
        tm: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        accountManager: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        marque: {
          select: {
            id: true,
            nom: true,
          },
        },
        commentaires: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            contenu: true,
            createdAt: true,
            auteur: {
              select: {
                prenom: true,
                nom: true,
              },
            },
          },
        },
      },
      orderBy: [
        { priorite: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(demandes);
  } catch (error) {
    console.error("Erreur GET /api/gifts:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// POST /api/gifts - Créer une demande de gift
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls les TM, CM et ADMIN peuvent créer des demandes
    if (!["TM", "CM", "ADMIN"].includes(user.role)) {
      return NextResponse.json(
        { error: "Seuls les Talent Managers, Account Managers et Admin peuvent créer des demandes de gifts" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      talentId,
      marqueId,
      typeGift,
      description,
      justification,
      valeurEstimee,
      priorite,
      dateSouhaitee,
      adresseLivraison,
      statut,
      // Champs hébergement
      destination,
      dateArrivee,
      dateDepart,
      nombrePersonnes,
      typeHebergement,
      categorie,
      demandesSpeciales,
    } = body;

    // Validation
    if (!talentId || !typeGift || !description) {
      return NextResponse.json(
        { error: "Champs obligatoires manquants" },
        { status: 400 }
      );
    }

    // Vérifier les droits talent selon le rôle créateur
    let talent;
    if (user.role === "TM") {
      talent = await prisma.talent.findFirst({
        where: {
          id: talentId,
          OR: [
            { managerId: user.id },
            {
              delegations: {
                some: {
                  tmRelaiId: user.id,
                  actif: true,
                },
              },
            },
          ],
        },
      });

      if (!talent) {
        return NextResponse.json(
          { error: "Vous ne gérez pas ce talent" },
          { status: 403 }
        );
      }
    } else {
      // Pour les CM / ADMIN, vérifier simplement que le talent existe
      talent = await prisma.talent.findUnique({
        where: { id: talentId },
      });

      if (!talent) {
        return NextResponse.json(
          { error: "Talent introuvable" },
          { status: 404 }
        );
      }
    }

    // Générer la référence
    const year = new Date().getFullYear();
    const lastDemande = await prisma.demandeGift.findFirst({
      where: {
        reference: {
          startsWith: `GIFT-${year}-`,
        },
      },
      orderBy: { reference: "desc" },
    });

    let nextNumber = 1;
    if (lastDemande) {
      const lastNumber = parseInt(lastDemande.reference.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    const reference = `GIFT-${year}-${nextNumber.toString().padStart(4, "0")}`;

    // Créer la demande
    const demande = await prisma.demandeGift.create({
      data: {
        reference,
        talentId,
        // Si création par CM/ADMIN, la demande est rattachée au TM responsable du talent.
        tmId: user.role === "TM" ? user.id : talent.managerId ?? user.id,
        marqueId: marqueId || null,
        typeGift,
        description,
        justification: justification || null,
        valeurEstimee: valeurEstimee ? parseFloat(valeurEstimee) : null,
        priorite: priorite || "NORMALE",
        datesouhaitee: dateSouhaitee ? new Date(dateSouhaitee) : null,
        adresseLivraison: adresseLivraison || null,
        statut: statut || "EN_ATTENTE", // Par défaut EN_ATTENTE (soumise)
        // Hébergement (HOTEL)
        destination: destination || null,
        dateArrivee: dateArrivee ? new Date(dateArrivee) : null,
        dateDepart: dateDepart ? new Date(dateDepart) : null,
        nombrePersonnes: nombrePersonnes ? parseInt(nombrePersonnes, 10) : null,
        typeHebergement: typeHebergement || null,
        categorie: categorie || null,
        demandesSpeciales: demandesSpeciales || null,
      },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
          },
        },
        marque: {
          select: {
            nom: true,
          },
        },
      },
    });

    // Créer des notifications pour les AM + ADMIN (CM exclu, hors auteur)
    try {
      const staffRoles: Role[] = [
        "HEAD_OF",
        "HEAD_OF_INFLUENCE",
        "HEAD_OF_SALES",
        "ADMIN",
      ];
      const destinataires = await prisma.user.findMany({
        where: {
          role: { in: staffRoles },
          actif: true,
          id: { not: user.id }, // ne pas notifier l'auteur
        },
        select: { id: true, prenom: true, email: true },
      });

      const talentName = `${demande.talent.prenom} ${demande.talent.nom}`.trim();
      const message = `Nouvelle demande de gift ${demande.reference} pour ${talentName} — ${typeGift}`;

      for (const dest of destinataires) {
        await prisma.notification.create({
          data: {
            userId: dest.id,
            type: "GENERAL",
            titre: "Nouvelle demande de gift",
            message,
            lien: `/gifts/${demande.id}`,
            actorId: user.id,
            talentId: talentId,
            marqueId: marqueId || null,
          },
        });
      }

      // Emails transactionnels pour nouvelle demande (AM + ADMIN)
      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
      if (resendKey && fromEmail) {
        const resend = new Resend(resendKey);
        const link = `/gifts/${demande.id}`;
        const rawBase =
          (process.env.NEXT_PUBLIC_BASE_URL ||
            "https://app.glowupagence.fr")?.trim() || "";
        const baseUrl = rawBase.replace(/\/$/, "");
        const url = `${baseUrl}${link}`;

        const isHotel = typeGift === "HOTEL";
        const hotelDestination = demande.destination || null;
        let hotelDatesLabel: string | null = null;
        if (demande.dateArrivee || demande.dateDepart) {
          const parts: string[] = [];
          if (demande.dateArrivee) {
            parts.push(
              `du ${new Date(demande.dateArrivee).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}`
            );
          }
          if (demande.dateDepart) {
            parts.push(
              `au ${new Date(demande.dateDepart).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}`
            );
          }
          hotelDatesLabel = parts.join(" ");
        }

        let dateSouhaiteeLabel: string | null = null;
        if (demande.datesouhaitee) {
          dateSouhaiteeLabel = new Date(
            demande.datesouhaitee
          ).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
        }
        const creatorName =
          (session.user as any)?.prenom && (session.user as any)?.nom
            ? `${(session.user as any).prenom} ${(session.user as any).nom}`.trim()
            : "Talent Manager";

        const baseSubject = `🎁 Nouvelle demande de gift ${demande.reference} — ${talentName}`;
        const urgentPrefix =
          demande.priorite === "URGENTE" ? "🚨 URGENT — " : "";
        const subject = `${urgentPrefix}${baseSubject}`;

        for (const dest of destinataires) {
          if (!dest.email) continue;
          if (!dest.prenom && !dest.email) continue;
          try {
            const recipientName = dest.prenom?.trim() || "Glow Up";
            const html = await render(
              React.createElement(GiftNouvelleDemandeEmail, {
                recipientName,
                reference: demande.reference,
                talentName,
                typeGift,
                priorite: demande.priorite || "NORMALE",
                tmName: creatorName,
                url,
                isHotel,
                hotelDestination,
                hotelDatesLabel,
                hotelCategorie: demande.categorie || null,
                description: demande.description,
                dateSouhaiteeLabel,
              })
            );
            await resend.emails.send({
              from: fromEmail.includes("<")
                ? fromEmail
                : `Glow Up Agence <${fromEmail}>`,
              to: dest.email,
              subject,
              html,
            });
          } catch (err) {
            console.error(
              "Erreur envoi email nouvelle demande gift:",
              dest.email,
              err
            );
          }
        }
      }
    } catch (notifError) {
      console.error(
        "Erreur création notifications/emails gifts (création):",
        notifError
      );
    }

    return NextResponse.json(demande, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/gifts:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la demande" },
      { status: 500 }
    );
  }
}
