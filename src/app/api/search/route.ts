import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "10");

    if (query.length < 2) {
      return NextResponse.json({
        talents: [],
        marques: [],
        collaborations: [],
        negociations: [],
        users: [],
      });
    }

    const userRole = session.user.role;

    // Recherche talents
    const talentsPromise = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM", "CM"].includes(userRole)
      ? prisma.talent.findMany({
          where: {
            OR: [
              { prenom: { contains: query, mode: "insensitive" } },
              { nom: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { instagram: { contains: query, mode: "insensitive" } },
              { tiktok: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
            email: true,
            ville: true,
          },
          take: limit,
        })
      : Promise.resolve([]);

    // Recherche marques
    const marquesPromise = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"].includes(userRole)
      ? prisma.marque.findMany({
          where: {
            OR: [
              { nom: { contains: query, mode: "insensitive" } },
              { raisonSociale: { contains: query, mode: "insensitive" } },
              { secteur: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            nom: true,
            secteur: true,
            raisonSociale: true,
          },
          take: limit,
        })
      : Promise.resolve([]);

    // Recherche collaborations
    const collaborationsPromise = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"].includes(userRole)
      ? prisma.collaboration.findMany({
          where: {
            OR: [
              { reference: { contains: query, mode: "insensitive" } },
              { talent: { prenom: { contains: query, mode: "insensitive" } } },
              { talent: { nom: { contains: query, mode: "insensitive" } } },
              { marque: { nom: { contains: query, mode: "insensitive" } } },
            ],
          },
          select: {
            id: true,
            reference: true,
            statut: true,
            montantBrut: true,
            talent: {
              select: {
                prenom: true,
                nom: true,
                photo: true,
              },
            },
            marque: {
              select: {
                nom: true,
              },
            },
          },
          take: limit,
        })
      : Promise.resolve([]);

    // Recherche négociations
    const negociationsPromise = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"].includes(userRole)
      ? prisma.negociation.findMany({
          where: {
            OR: [
              { reference: { contains: query, mode: "insensitive" } },
              { talent: { prenom: { contains: query, mode: "insensitive" } } },
              { talent: { nom: { contains: query, mode: "insensitive" } } },
              { marque: { nom: { contains: query, mode: "insensitive" } } },
            ],
          },
          select: {
            id: true,
            reference: true,
            statut: true,
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
          take: limit,
        })
      : Promise.resolve([]);

    // Recherche utilisateurs (seulement pour ADMIN et HEAD_OF)
    const usersPromise = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"].includes(userRole)
      ? prisma.user.findMany({
          where: {
            actif: true,
            OR: [
              { prenom: { contains: query, mode: "insensitive" } },
              { nom: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            role: true,
          },
          take: limit,
        })
      : Promise.resolve([]);

    const [talents, marques, collaborations, negociations, users] = await Promise.all([
      talentsPromise,
      marquesPromise,
      collaborationsPromise,
      negociationsPromise,
      usersPromise,
    ]);

    return NextResponse.json({
      talents,
      marques,
      collaborations,
      negociations,
      users,
    });
  } catch (error) {
    console.error("Erreur recherche:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
