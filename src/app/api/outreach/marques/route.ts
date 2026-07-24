import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  loadFuzzyCandidatesCached,
  rankFuzzyCandidates,
} from "@/lib/marque-fuzzy-search";

/**
 * GET ?q=nike → recherche unifiée CRM pour l'ajout d'un client Outreach.
 * Retourne :
 *  - marques  : fiches marque correspondantes (nom ou alias) avec leurs contacts
 *  - contacts : personnes correspondantes (prénom, nom ou email) avec leur marque
 * Chaque contact indique s'il est déjà suivi dans le cycle Outreach.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({ marques: [], contacts: [] });
    }

    const marqueSelect = {
      id: true,
      nom: true,
      secteur: true,
      ville: true,
      parent: { select: { id: true, nom: true } },
      contacts: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          principal: true,
        },
        orderBy: [{ principal: "desc" as const }, { createdAt: "asc" as const }],
      },
      _count: { select: { collaborations: true, outreachTargets: true } },
    };

    const MAX_RESULTS = 8;

    const [marques, contactRows] = await Promise.all([
      prisma.marque.findMany({
        where: {
          OR: [
            { nom: { contains: q, mode: "insensitive" } },
            { aliases: { some: { label: { contains: q, mode: "insensitive" } } } },
          ],
        },
        select: marqueSelect,
        orderBy: { nom: "asc" },
        take: MAX_RESULTS,
      }),
      // Recherche par personne : prénom, nom ou email
      prisma.marqueContact.findMany({
        where: {
          OR: [
            { prenom: { contains: q, mode: "insensitive" } },
            { nom: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          principal: true,
          marque: { select: marqueSelect },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    // Fallback flou : si peu de résultats exacts, on rapproche les marques même
    // en cas de faute de frappe (ex. "nkie" → "Nike", "adiddas" → "Adidas").
    let marquesResult = marques;
    if (marques.length < MAX_RESULTS) {
      const candidates = await loadFuzzyCandidatesCached("outreach:marques", async () => {
        const rows = await prisma.marque.findMany({
          select: { id: true, nom: true, aliases: { select: { label: true } } },
        });
        return rows.map((r) => ({
          id: r.id,
          labels: [r.nom, ...r.aliases.map((a) => a.label)],
        }));
      });

      const strongIds = new Set(marques.map((m) => m.id));
      const ranked = rankFuzzyCandidates(q, candidates, { limit: MAX_RESULTS });
      const extraIds = ranked
        .map((r) => r.id)
        .filter((id) => !strongIds.has(id))
        .slice(0, MAX_RESULTS - marques.length);

      if (extraIds.length) {
        const extra = await prisma.marque.findMany({
          where: { id: { in: extraIds } },
          select: marqueSelect,
        });
        const byId = new Map(extra.map((m) => [m.id, m]));
        const ordered = extraIds
          .map((id) => byId.get(id))
          .filter((m): m is (typeof extra)[number] => Boolean(m));
        marquesResult = [...marques, ...ordered];
      }
    }

    // Marque les contacts déjà suivis dans le cycle Outreach
    const emails = contactRows
      .map((c) => c.email?.toLowerCase())
      .filter((e): e is string => Boolean(e));
    const tracked = emails.length
      ? await prisma.outreachTarget.findMany({
          where: { email: { in: emails } },
          select: { email: true, status: true },
        })
      : [];
    const trackedByEmail = new Map(tracked.map((t) => [t.email.toLowerCase(), t.status]));

    const contacts = contactRows.map((c) => ({
      id: c.id,
      prenom: c.prenom,
      nom: c.nom,
      email: c.email,
      poste: c.poste,
      principal: c.principal,
      marque: c.marque,
      outreachStatus: c.email ? trackedByEmail.get(c.email.toLowerCase()) || null : null,
    }));

    return NextResponse.json({ marques: marquesResult, contacts });
  } catch (error) {
    console.error("GET /api/outreach/marques:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
