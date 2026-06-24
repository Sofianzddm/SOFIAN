import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
