import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { findOrCreateMarque } from "@/lib/marque-resolver";

/**
 * POST → ajout rapide d'un contact depuis la fiche marque (sans passer par
 * la page d'édition qui remplace toute la liste).
 */
export async function POST(
  request: NextRequest,
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
      select: { id: true },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque non trouvée" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      prenom?: string;
      nom?: string;
      email?: string;
      telephone?: string;
      poste?: string;
      linkedinUrl?: string;
      language?: string;
    };

    const prenom = (body.prenom || "").trim();
    const nom = (body.nom || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    if (!prenom && !nom) {
      return NextResponse.json({ error: "Nom ou prénom requis." }, { status: 400 });
    }
    if (body.language !== "fr" && body.language !== "en") {
      return NextResponse.json(
        { error: "Langue du contact requise (français ou anglais)." },
        { status: 400 }
      );
    }
    const language: "fr" | "en" = body.language;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    if (email) {
      const dup = await prisma.marqueContact.findFirst({
        where: { marqueId: id, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Un contact avec cet email existe déjà sur cette marque." },
          { status: 409 }
        );
      }
    }

    const contact = await prisma.marqueContact.create({
      data: {
        marqueId: id,
        prenom: prenom || null,
        nom: nom || prenom,
        email: email || null,
        telephone: (body.telephone || "").trim() || null,
        poste: (body.poste || "").trim() || null,
        linkedinUrl: (body.linkedinUrl || "").trim() || null,
        language,
      },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("POST /api/marques/[id]/contacts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * PATCH → mise à jour rapide d'un contact depuis la fiche marque (sans passer
 * par la page d'édition). Aujourd'hui : la langue du contact, propagée aux
 * cibles Outreach déjà dans le cycle (matché par email) pour adapter la relance.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      contactId?: string;
      language?: string;
      addSousMarqueId?: string;
      removeSousMarqueId?: string;
      newSousMarqueName?: string;
    };

    const contactId = (body.contactId || "").trim();
    if (!contactId) {
      return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    }

    // Mode « sous-marques » : rattache / détache le contact à une ou plusieurs
    // marques filles (le contact RESTE sur sa marque, il peut couvrir plusieurs
    // sous-marques). Différent du déplacement : c'est une liaison N-à-N.
    const addSousMarqueId = (body.addSousMarqueId || "").trim();
    const removeSousMarqueId = (body.removeSousMarqueId || "").trim();
    const newSousMarqueName = (body.newSousMarqueName || "").trim();
    if (addSousMarqueId || removeSousMarqueId || newSousMarqueName) {
      const contact = await prisma.marqueContact.findFirst({
        where: { id: contactId, marqueId: id },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact non trouvé." }, { status: 404 });
      }

      // Détacher une sous-marque
      if (removeSousMarqueId) {
        await prisma.marqueContactSousMarque.deleteMany({
          where: { contactId: contact.id, marqueId: removeSousMarqueId },
        });
        return NextResponse.json({ ok: true });
      }

      // Résout la sous-marque à rattacher (existante ou créée à la volée).
      let targetId = addSousMarqueId;
      if (!targetId && newSousMarqueName) {
        const resolved = await findOrCreateMarque({ name: newSousMarqueName, source: "MANUAL" });
        targetId = resolved.marqueId;
        if (targetId === id) {
          return NextResponse.json(
            { error: "Une marque ne peut pas être sa propre sous-marque." },
            { status: 400 }
          );
        }
        const t = await prisma.marque.findUnique({
          where: { id: targetId },
          select: { parentMarqueId: true },
        });
        if (t && !t.parentMarqueId) {
          await prisma.marque.update({
            where: { id: targetId },
            data: { parentMarqueId: id },
          });
        }
      }

      // La cible doit être une sous-marque de la marque courante.
      const target = await prisma.marque.findFirst({
        where: { id: targetId, parentMarqueId: id },
        select: { id: true, nom: true },
      });
      if (!target) {
        return NextResponse.json(
          { error: "La marque cible n'est pas une sous-marque de cette marque." },
          { status: 400 }
        );
      }

      await prisma.marqueContactSousMarque.upsert({
        where: { contactId_marqueId: { contactId: contact.id, marqueId: target.id } },
        create: { contactId: contact.id, marqueId: target.id },
        update: {},
      });

      return NextResponse.json({ ok: true, target });
    }

    if (body.language !== "fr" && body.language !== "en") {
      return NextResponse.json(
        { error: "Langue invalide (français ou anglais)." },
        { status: 400 }
      );
    }
    const language: "fr" | "en" = body.language;

    const contact = await prisma.marqueContact.findFirst({
      where: { id: contactId, marqueId: id },
      select: { id: true, email: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact non trouvé." }, { status: 404 });
    }

    const updated = await prisma.marqueContact.update({
      where: { id: contact.id },
      data: { language },
    });

    // Propage la langue à la cible Outreach déjà dans le cycle (matché par email).
    const email = (contact.email || "").trim().toLowerCase();
    if (email) {
      await prisma.outreachTarget.updateMany({
        where: { marqueId: id, email },
        data: { language },
      });
    }

    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error("PATCH /api/marques/[id]/contacts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * DELETE → suppression d'un contact d'une marque (depuis la fiche marque).
 * Le contact à supprimer est passé via le paramètre `contactId`.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const contactId = request.nextUrl.searchParams.get("contactId");
    if (!contactId) {
      return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    }

    const contact = await prisma.marqueContact.findFirst({
      where: { id: contactId, marqueId: id },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact non trouvé." }, { status: 404 });
    }

    await prisma.marqueContact.delete({ where: { id: contact.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/marques/[id]/contacts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
