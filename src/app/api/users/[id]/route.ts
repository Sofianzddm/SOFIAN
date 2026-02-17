import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET - Détail d'un utilisateur
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    // Un utilisateur peut voir ses propres infos
    // Les ADMIN et HEAD_OF peuvent voir tous les utilisateurs
    if (
      session.user.id !== id &&
      !["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"].includes(session.user.role)
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        role: true,
        actif: true,
        createdAt: true,
        updatedAt: true,
        talent: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erreur GET user:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT - Mettre à jour un utilisateur
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json();

    // Un utilisateur peut modifier ses propres infos (sauf le rôle)
    // Seuls les ADMIN peuvent modifier le rôle et l'état actif
    const isOwnProfile = session.user.id === id;
    const isAdmin = session.user.role === "ADMIN";

    if (!isOwnProfile && !isAdmin) {
      return NextResponse.json({ 
        error: "Permissions insuffisantes" 
      }, { status: 403 });
    }

    // Préparer les données de mise à jour
    const updateData: any = {};

    if (data.prenom !== undefined) updateData.prenom = data.prenom;
    if (data.nom !== undefined) updateData.nom = data.nom;
    if (data.email !== undefined) {
      // Vérifier si l'email est déjà utilisé
      const existing = await prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: id },
        },
      });
      if (existing) {
        return NextResponse.json({ 
          error: "Cet email est déjà utilisé par un autre utilisateur" 
        }, { status: 400 });
      }
      updateData.email = data.email;
    }

    // Seuls les ADMIN peuvent modifier le rôle, l'état actif, la liaison Talent et le mot de passe
    if (isAdmin) {
      if (data.role !== undefined) updateData.role = data.role;
      if (data.actif !== undefined) updateData.actif = data.actif;
      if (data.password && data.password.trim().length >= 6) {
        updateData.password = await bcrypt.hash(data.password, 10);
      } else if (data.password && data.password.trim().length > 0) {
        return NextResponse.json({
          error: "Le mot de passe doit contenir au moins 6 caractères",
        }, { status: 400 });
      }
    }

    // Liaison User (TALENT) ↔ Fiche Talent : mettre à jour Talent.userId
    if (isAdmin && data.talentId !== undefined) {
      const talentId = data.talentId === "" || data.talentId == null ? null : data.talentId;
      await prisma.talent.updateMany({
        where: { userId: id },
        data: { userId: null },
      });
      if (talentId) {
        await prisma.talent.update({
          where: { id: talentId },
          data: { userId: id },
        });
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        role: true,
        actif: true,
        updatedAt: true,
        talent: { select: { id: true, prenom: true, nom: true } },
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erreur PUT user:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PATCH - Désactiver/Réactiver un utilisateur (soft delete)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent désactiver/réactiver
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ 
        error: "Seuls les administrateurs peuvent désactiver des utilisateurs" 
      }, { status: 403 });
    }

    const { id } = await params;
    const { actif } = await request.json();

    // Empêcher de se désactiver soi-même
    if (session.user.id === id && actif === false) {
      return NextResponse.json({ 
        error: "Vous ne pouvez pas désactiver votre propre compte" 
      }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { actif },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        role: true,
        actif: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erreur PATCH user:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE - Supprimer définitivement un utilisateur
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Seuls les ADMIN peuvent supprimer
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ 
        error: "Seuls les administrateurs peuvent supprimer des utilisateurs" 
      }, { status: 403 });
    }

    const { id } = await params;

    // Empêcher de se supprimer soi-même
    if (session.user.id === id) {
      return NextResponse.json({ 
        error: "Vous ne pouvez pas supprimer votre propre compte" 
      }, { status: 400 });
    }

    // Vérifier les dépendances
    const [negosCount, collabsCount] = await Promise.all([
      prisma.negociation.count({ where: { tmId: id } }),
      prisma.collaboration.count({ where: { talent: { managerId: id } } }),
    ]);

    if (negosCount > 0 || collabsCount > 0) {
      return NextResponse.json({ 
        error: `Impossible de supprimer cet utilisateur car il est lié à ${negosCount} négociation(s) et ${collabsCount} collaboration(s). Utilisez la désactivation à la place.` 
      }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Utilisateur supprimé avec succès" });
  } catch (error) {
    console.error("Erreur DELETE user:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
