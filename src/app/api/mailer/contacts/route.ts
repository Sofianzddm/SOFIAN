import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET → recherche de contacts pour le rédacteur de mails (/admin/mailer).
 *   - ?market=FR      : contacts du CRM FR (marque_contacts, avec email).
 *   - ?market=BENELUX : contacts de l'annuaire BENELUX (benelux_contacts).
 *   - ?q=... (>= 2 car.) : filtre sur prénom, nom, email ou nom d'entreprise.
 * Renvoie jusqu'à 15 résultats { id, name, email, poste, company, market }.
 * Réservé à l'ADMIN (comme la page mailer).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const market = (request.nextUrl.searchParams.get("market") || "FR").toUpperCase();
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({ contacts: [] });
    }

    if (market === "BENELUX") {
      const rows = await prisma.beneluxContact.findMany({
        where: {
          excluded: false,
          email: { not: null },
          OR: [
            { prenom: { contains: q, mode: "insensitive" } },
            { nom: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { nom: { contains: q, mode: "insensitive" } } },
          ],
        },
        orderBy: [{ principal: "desc" }, { prenom: "asc" }],
        take: 15,
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          company: { select: { nom: true } },
        },
      });
      return NextResponse.json({
        contacts: rows
          .filter((c) => c.email)
          .map((c) => ({
            id: c.id,
            name: [c.prenom, c.nom].filter(Boolean).join(" "),
            email: c.email as string,
            poste: c.poste,
            company: c.company.nom,
            market: "BENELUX" as const,
          })),
      });
    }

    const rows = await prisma.marqueContact.findMany({
      where: {
        email: { not: null },
        OR: [
          { prenom: { contains: q, mode: "insensitive" } },
          { nom: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { marque: { nom: { contains: q, mode: "insensitive" } } },
        ],
      },
      orderBy: [{ principal: "desc" }, { nom: "asc" }],
      take: 15,
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        poste: true,
        marque: { select: { nom: true } },
      },
    });
    return NextResponse.json({
      contacts: rows
        .filter((c) => c.email)
        .map((c) => ({
          id: c.id,
          name: [c.prenom, c.nom].filter(Boolean).join(" "),
          email: c.email as string,
          poste: c.poste,
          company: c.marque.nom,
          market: "FR" as const,
        })),
    });
  } catch (error) {
    console.error("GET /api/mailer/contacts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
