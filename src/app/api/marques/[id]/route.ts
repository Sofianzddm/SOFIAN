import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  canAccessFullMarqueCrm,
  canWriteMarqueCrm,
} from "@/lib/marque-crm-access";

// GET - Détail d'une marque
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const canFullCrm = canAccessFullMarqueCrm(session.user.role);
    const marque = await prisma.marque.findUnique({
      where: { id: id },
      include: {
        contacts: {
          // NOT source=AO excluait aussi source null (bug Nuxe = 0 contacts).
          where: canFullCrm
            ? undefined
            : { OR: [{ source: { not: "AO" } }, { source: null }] },
          orderBy: [{ principal: "desc" }, { priorite: "asc" }, { createdAt: "asc" }],
          include: {
            outreachTargets: {
              select: {
                id: true,
                status: true,
                cycleCount: true,
                lastSentAt: true,
                nextRecontactAt: true,
                lastRepliedAt: true,
              },
            },
            sousMarques: {
              include: { marque: { select: { id: true, nom: true } } },
            },
          },
        },
        cartoFiles: {
          // Feuilles AO réservées au CRM complet (ADMIN + HEAD_OF_SALES)
          where: canFullCrm ? undefined : { kind: "CARTO" },
          select: { id: true, fileName: true, size: true, createdAt: true, kind: true },
          orderBy: { createdAt: "desc" },
        },
        // Hiérarchie mère / filles (Unilever → Dove, Axe…).
        parent: { select: { id: true, nom: true } },
        children: {
          select: {
            id: true,
            nom: true,
            secteur: true,
            ville: true,
            _count: {
              select: { contacts: true, collaborations: true, sousMarqueContacts: true },
            },
          },
          orderBy: { nom: "asc" },
        },
        // Contacts rattachés à cette marque en tant que sous-marque (portés par
        // une autre marque, souvent la mère) — affichés sur la fiche fille.
        sousMarqueContacts: {
          include: {
            contact: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                email: true,
                poste: true,
                principal: true,
                marque: { select: { id: true, nom: true } },
              },
            },
          },
        },
        collaborations: {
          include: {
            talent: {
              select: {
                prenom: true,
                nom: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
        // Targets outreach au niveau marque (sert à recoller les orphelins
        // marqueContactId=null sur le bon contact par email).
        outreachTargets: {
          select: {
            id: true,
            email: true,
            status: true,
            cycleCount: true,
            lastSentAt: true,
            nextRecontactAt: true,
            lastRepliedAt: true,
            marqueContactId: true,
          },
        },
        _count: {
          select: {
            collaborations: true,
          },
        },
        beneluxLinks: {
          select: { id: true, nom: true },
          take: 1,
        },
      },
    });

    if (!marque) {
      return NextResponse.json(
        { message: "Marque non trouvée" },
        { status: 404 }
      );
    }

    // Si un target est en cycle mais détaché du contact (FK null après fusion),
    // on l'attache en mémoire au contact du même email pour l'UI.
    const orphanByEmail = new Map<
      string,
      {
        id: string;
        status: string;
        cycleCount: number;
        lastSentAt: Date | null;
        nextRecontactAt: Date | null;
        lastRepliedAt: Date | null;
      }
    >();
    for (const t of marque.outreachTargets) {
      if (t.marqueContactId) continue;
      const email = (t.email || "").trim().toLowerCase();
      if (email) orphanByEmail.set(email, t);
    }
    if (orphanByEmail.size > 0) {
      marque.contacts = marque.contacts.map((c) => {
        const email = (c.email || "").trim().toLowerCase();
        const orphan = email ? orphanByEmail.get(email) : undefined;
        if (!orphan || (c.outreachTargets && c.outreachTargets.length > 0)) return c;
        return {
          ...c,
          outreachTargets: [
            {
              id: orphan.id,
              status: orphan.status as (typeof c.outreachTargets)[number]["status"],
              cycleCount: orphan.cycleCount,
              lastSentAt: orphan.lastSentAt,
              nextRecontactAt: orphan.nextRecontactAt,
              lastRepliedAt: orphan.lastRepliedAt,
            },
          ],
        };
      });
    }

    // Ne pas exposer la liste brute des targets dans le JSON fiche (déjà sur contacts).
    const { outreachTargets: _targets, ...marquePayload } = marque;
    void _targets;

    return NextResponse.json(marquePayload);
  } catch (error) {
    console.error("Erreur GET marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération de la marque" },
      { status: 500 }
    );
  }
}

// PUT - Mettre à jour une marque
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWriteMarqueCrm(session.user.role)) {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const data = await request.json();

    const before = await prisma.marque.findUnique({
      where: { id },
      select: { nom: true },
    });

    // Marque mère (optionnelle) : on ne la touche que si le champ est fourni,
    // avec garde anti-cycle (une marque ne peut pas être sa propre ascendante).
    const parentPatch: { parentMarqueId?: string | null } = {};
    if ("parentMarqueId" in data) {
      const newParentId = data.parentMarqueId ? String(data.parentMarqueId) : null;
      if (newParentId) {
        if (newParentId === id) {
          return NextResponse.json(
            { message: "Une marque ne peut pas être sa propre marque mère." },
            { status: 400 }
          );
        }
        let cursor: string | null = newParentId;
        let guard = 0;
        while (cursor && guard < 50) {
          if (cursor === id) {
            return NextResponse.json(
              { message: "Hiérarchie circulaire : cette marque est déjà une ascendante." },
              { status: 400 }
            );
          }
          const p: { parentMarqueId: string | null } | null =
            await prisma.marque.findUnique({
              where: { id: cursor },
              select: { parentMarqueId: true },
            });
          cursor = p?.parentMarqueId ?? null;
          guard += 1;
        }
      }
      parentPatch.parentMarqueId = newParentId;
    }

    // Mettre à jour la marque
    const marque = await prisma.marque.update({
      where: { id: id },
      data: {
        ...parentPatch,
        nom: data.nom,
        secteur: data.secteur || null,
        siteWeb: data.siteWeb || null,
        notes: data.notes || null,
        
        adresseRue: data.adresseRue || null,
        adresseComplement: data.adresseComplement || null,
        codePostal: data.codePostal || null,
        ville: data.ville || null,
        pays: data.pays || "France",
        
        raisonSociale: data.raisonSociale || null,
        formeJuridique: data.formeJuridique || null,
        siret: data.siret || null,
        numeroTVA: data.numeroTVA || null,
        delaiPaiement: data.delaiPaiement ? parseInt(data.delaiPaiement) : 30,
        modePaiement: data.modePaiement || "Virement",
        devise: data.devise || "EUR",
      },
    });

    // Le nom est dénormalisé sur les cibles Outreach : on le synchronise
    // pour que le cycle de contact affiche le nouveau nom de la marque.
    if (before && data.nom && data.nom !== before.nom) {
      await prisma.outreachTarget.updateMany({
        where: { marqueId: id },
        data: { company: data.nom },
      });
    }

    // Si des contacts sont fournis, les mettre à jour
    if (data.contacts) {
      // Supprimer les anciens contacts
      await prisma.marqueContact.deleteMany({
        where: { marqueId: id },
      });

      // Créer les nouveaux contacts
      if (data.contacts.length > 0) {
        await prisma.marqueContact.createMany({
          data: data.contacts.map((contact: any) => ({
            marqueId: id,
            prenom: contact.prenom || null,
            nom: contact.nom,
            email: contact.email || null,
            telephone: contact.telephone || null,
            poste: contact.poste || null,
            principal: contact.principal || false,
            language: contact.language === "en" ? "en" : "fr",
            // Champs de cartographie (import Claude/Excel) — préservés à l'édition
            priorite: contact.priorite || null,
            perimetre: contact.perimetre || null,
            localisation: contact.localisation || null,
            linkedinUrl: contact.linkedinUrl || null,
            source: contact.source || null,
          })),
        });
      }

      // Propage la langue de chaque contact aux cibles Outreach déjà dans le
      // cycle (matché par email) : changer la langue ici adapte la relance.
      for (const contact of data.contacts as Array<{ email?: string; language?: string }>) {
        const email = (contact.email || "").trim().toLowerCase();
        if (!email) continue;
        await prisma.outreachTarget.updateMany({
          where: { marqueId: id, email },
          data: { language: contact.language === "en" ? "en" : "fr" },
        });
      }
    }

    return NextResponse.json(marque);
  } catch (error) {
    console.error("Erreur PUT marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la mise à jour de la marque" },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une marque
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWriteMarqueCrm(session.user.role)) {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }

    const { id } = await params;
    // Vérifier si la marque a des collaborations
    const marque = await prisma.marque.findUnique({
      where: { id: id },
      include: {
        _count: {
          select: { collaborations: true },
        },
      },
    });

    if (!marque) {
      return NextResponse.json(
        { message: "Marque non trouvée" },
        { status: 404 }
      );
    }

    if (marque._count.collaborations > 0) {
      return NextResponse.json(
        { message: "Impossible de supprimer une marque avec des collaborations" },
        { status: 400 }
      );
    }

    // Supprimer les contacts d'abord
    await prisma.marqueContact.deleteMany({
      where: { marqueId: id },
    });

    // Supprimer la marque
    await prisma.marque.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: "Marque supprimée" });
  } catch (error) {
    console.error("Erreur DELETE marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la suppression de la marque" },
      { status: 500 }
    );
  }
}
