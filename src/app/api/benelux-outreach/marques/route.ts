import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  loadFuzzyCandidatesCached,
  rankFuzzyCandidates,
} from "@/lib/marque-fuzzy-search";

/**
 * GET ?q=… → recherche unifiée pour l'ajout d'un prospect BENELUX.
 * Miroir de /api/outreach/marques (mêmes clés `marques` / `contacts`) pour que
 * la page /outreach fonctionne par simple échange de préfixe d'API. Ici
 * « marque » = entreprise prospect BENELUX (BeneluxCompany).
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

    const companySelect = {
      id: true,
      nom: true,
      secteur: true,
      ville: true,
      contacts: {
        where: { excluded: false },
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
      _count: { select: { outreachTargets: true } },
    };

    const MAX_RESULTS = 8;

    const [marques, contactRows] = await Promise.all([
      prisma.beneluxCompany.findMany({
        where: { nom: { contains: q, mode: "insensitive" } },
        select: companySelect,
        orderBy: { nom: "asc" },
        take: MAX_RESULTS,
      }),
      prisma.beneluxContact.findMany({
        where: {
          excluded: false,
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
          company: { select: companySelect },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    // Fallback flou : rapproche les entreprises même en cas de faute de frappe.
    let marquesResult = marques;
    if (marques.length < MAX_RESULTS) {
      const candidates = await loadFuzzyCandidatesCached("benelux:companies", async () => {
        const rows = await prisma.beneluxCompany.findMany({
          select: { id: true, nom: true },
        });
        return rows.map((r) => ({ id: r.id, labels: [r.nom] }));
      });

      const strongIds = new Set(marques.map((m) => m.id));
      const ranked = rankFuzzyCandidates(q, candidates, { limit: MAX_RESULTS });
      const extraIds = ranked
        .map((r) => r.id)
        .filter((id) => !strongIds.has(id))
        .slice(0, MAX_RESULTS - marques.length);

      if (extraIds.length) {
        const extra = await prisma.beneluxCompany.findMany({
          where: { id: { in: extraIds } },
          select: companySelect,
        });
        const byId = new Map(extra.map((m) => [m.id, m]));
        const ordered = extraIds
          .map((id) => byId.get(id))
          .filter((m): m is (typeof extra)[number] => Boolean(m));
        marquesResult = [...marques, ...ordered];
      }
    }

    const emails = contactRows
      .map((c) => c.email?.toLowerCase())
      .filter((e): e is string => Boolean(e));
    const tracked = emails.length
      ? await prisma.beneluxOutreachTarget.findMany({
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
      // Alias `marque` = entreprise, pour rester compatible avec la page /outreach.
      marque: c.company,
      outreachStatus: c.email ? trackedByEmail.get(c.email.toLowerCase()) || null : null,
    }));

    return NextResponse.json({ marques: marquesResult, contacts });
  } catch (error) {
    console.error("GET /api/benelux-outreach/marques:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
