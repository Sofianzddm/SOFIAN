import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      if (!["TM", "ADMIN"].includes(user.role)) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }

      const whereTalent: any = { isArchived: false };
      if (user.role === "TM") {
        // TM : uniquement ses talents
        whereTalent.managerId = user.id;
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
      // TM voit uniquement ses demandes
      where.tmId = id;
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

    // Seuls les TM et ADMIN peuvent créer des demandes
    if (!["TM", "ADMIN"].includes(user.role)) {
      return NextResponse.json(
        { error: "Seuls les Talent Managers et Admin peuvent créer des demandes de gifts" },
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

    // Vérifier que le TM gère bien ce talent (sauf pour les ADMIN)
    let talent;
    if (user.role === "TM") {
      talent = await prisma.talent.findFirst({
        where: {
          id: talentId,
          managerId: user.id,
        },
      });

      if (!talent) {
        return NextResponse.json(
          { error: "Vous ne gérez pas ce talent" },
          { status: 403 }
        );
      }
    } else {
      // Pour les ADMIN, vérifier simplement que le talent existe
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
      const destinataires = await prisma.user.findMany({
        where: {
          role: { in: ["HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "ADMIN"] },
          actif: true,
          id: { not: user.id }, // ne pas notifier l'auteur
        },
        select: { id: true },
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
    } catch (notifError) {
      console.error("Erreur création notifications gifts (création):", notifError);
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
