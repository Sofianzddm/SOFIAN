import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ADMIN_ROLES = ["ADMIN", "HEAD_OF_INFLUENCE"] as const;

export async function getSessionAndContact(request: NextRequest, contactId: string) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }) };
  }

  const userId = session.user.id;
  const role = (session.user.role || "") as string;

  const contact = await prisma.prospectionContact.findUnique({
    where: { id: contactId },
    include: {
      fichier: {
        select: {
          id: true,
          titre: true,
          userId: true,
        },
      },
      commentaires: {
        orderBy: { createdAt: "asc" },
        include: {
          auteur: {
            select: {
              id: true,
              prenom: true,
              nom: true,
            },
          },
        },
      },
      historique: {
        orderBy: { createdAt: "asc" },
        include: {
          auteur: {
            select: {
              id: true,
              prenom: true,
              nom: true,
            },
          },
        },
      },
    },
  });

  if (!contact) {
    return { error: NextResponse.json({ error: "Contact introuvable" }, { status: 404 }) };
  }

  const canSeeAll = ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
  const isOwner = contact.fichier.userId === userId;

  if (!canSeeAll && !isOwner) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  return { session, role, contact };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { contactId } = await params;
    const result = await getSessionAndContact(request, contactId);
    if ("error" in result) return result.error;

    const { contact } = result;

    const payload = {
      id: contact.id,
      nomOpportunite: contact.nomOpportunite,
      prenom: contact.prenom,
      nom: contact.nom,
      email: contact.email,
      statut: contact.statut,
      notes: contact.notes,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      prochainStatut: contact.prochainStatut,
      prochainDate: contact.prochainDate,
      actionPrevue: contact.actionPrevue,
      derniereFait: contact.derniereFait,
      actionUpdatedAt: contact.actionUpdatedAt,
      fichier: {
        id: contact.fichier.id,
        titre: contact.fichier.titre,
      },
      commentaires: contact.commentaires.map((c) => ({
        id: c.id,
        contenu: c.contenu,
        createdAt: c.createdAt,
        auteur: {
          id: c.auteur.id,
          name: `${c.auteur.prenom} ${c.auteur.nom}`.trim(),
          image: null as string | null,
        },
      })),
      historique: contact.historique.map((h) => ({
        id: h.id,
        type: h.type,
        detail: h.detail,
        createdAt: h.createdAt,
        auteur: {
          id: h.auteur.id,
          name: `${h.auteur.prenom} ${h.auteur.nom}`.trim(),
          image: null as string | null,
        },
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Erreur GET /api/prospection/[id]/contacts/[contactId]:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement du contact" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { contactId } = await params;
    const result = await getSessionAndContact(request, contactId);
    if ("error" in result) return result.error;

    const { contact, session } = result;

    const body = await request.json();
    const {
      nomOpportunite,
      prenom,
      nom,
      email,
      statut,
      notes,
      prochainStatut,
      prochainDate,
      actionPrevue,
      derniereFait,
    } = body as {
      nomOpportunite?: string;
      prenom?: string;
      nom?: string;
      email?: string;
      statut?: string;
      notes?: string;
      prochainStatut?: string | null;
      prochainDate?: string | null;
      actionPrevue?: string | null;
      derniereFait?: string | null;
      talentId?: string;
    };

    const data: any = {};

    if (typeof nomOpportunite === "string") {
      const value = nomOpportunite.trim();
      if (!value) {
        return NextResponse.json({ error: "Nom d'opportunité requis" }, { status: 400 });
      }
      data.nomOpportunite = value;
    }

    if (typeof prenom === "string") data.prenom = prenom || null;
    if (typeof nom === "string") data.nom = nom || null;
    if (typeof email === "string") data.email = email || null;
    if (typeof notes === "string") data.notes = notes || null;
    let statutChange = false;
    let previousStatut: string | null = null;
    let newStatut: string | null = null;
    if (typeof statut === "string") {
      data.statut = statut as any;
      if (statut !== contact.statut) {
        statutChange = true;
        previousStatut = contact.statut as string;
        newStatut = statut;
      }
    }

    let actionChange = false;
    let previousActionStatut: string | null = null;
    let newActionStatut: string | null = null;
    if (typeof prochainStatut !== "undefined") {
      const value = prochainStatut === null ? null : String(prochainStatut);
      data.prochainStatut = value as any;
      if (value !== contact.prochainStatut) {
        actionChange = true;
        previousActionStatut = contact.prochainStatut ?? null;
        newActionStatut = value;
      }
    }

    if (typeof prochainDate !== "undefined") {
      data.prochainDate = prochainDate ? new Date(prochainDate) : null;
    }

    if (typeof actionPrevue !== "undefined") {
      data.actionPrevue = actionPrevue || null;
    }

    if (typeof derniereFait !== "undefined") {
      data.derniereFait = derniereFait || null;
    }

    if (
      typeof prochainStatut !== "undefined" ||
      typeof prochainDate !== "undefined" ||
      typeof actionPrevue !== "undefined" ||
      typeof derniereFait !== "undefined"
    ) {
      data.actionUpdatedAt = new Date();
    }

    if (typeof (body as any).talentId === "string") {
      const talentId = (body as any).talentId as string;
      data.talentId = talentId || null;
    }

    const updated = await prisma.prospectionContact.update({
      where: { id: contactId },
      data,
    });

    if (statutChange && previousStatut && newStatut) {
      try {
        await prisma.prospectionHistorique.create({
          data: {
            contactId,
            auteurId: session.user.id,
            type: "STATUT_CHANGE",
            detail: `Statut changé : ${previousStatut} → ${newStatut}`,
          },
        });
      } catch (err) {
        console.error("Erreur lors de la création de l'historique de statut:", err);
      }
    }

    if (actionChange && newActionStatut) {
      try {
        const dateLabel =
          data.prochainDate instanceof Date
            ? data.prochainDate.toLocaleDateString("fr-FR")
            : contact.prochainDate
            ? contact.prochainDate.toLocaleDateString("fr-FR")
            : "sans date";
        await prisma.prospectionHistorique.create({
          data: {
            contactId,
            auteurId: session.user.id,
            type: "ACTION",
            detail: `Action planifiée : ${newActionStatut} pour le ${dateLabel}`,
          },
        });
      } catch (err) {
        console.error(
          "Erreur lors de la création de l'historique de prochaine action:",
          err
        );
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erreur PATCH /api/prospection/[id]/contacts/[contactId]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { contactId } = await params;
    const result = await getSessionAndContact(request, contactId);
    if ("error" in result) return result.error;

    const { role } = result;

    // HEAD_OF_INFLUENCE ne peut pas supprimer
    if (role === "HEAD_OF_INFLUENCE") {
      return NextResponse.json({ error: "Suppression non autorisée" }, { status: 403 });
    }

    await prisma.prospectionContact.delete({
      where: { id: contactId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/prospection/[id]/contacts/[contactId]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du contact" },
      { status: 500 }
    );
  }
}

