import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET → contacts importés depuis une cartographie (fichier Claude/Excel)
 * pas encore entrés dans le cycle outreach. Il suffit de noter leur email
 * dans /outreach pour les faire passer dans « À contacter ».
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

    const contacts = await prisma.marqueContact.findMany({
      where: {
        source: "CARTO",
        outreachExcluded: false,
        outreachTargets: { none: {} },
        // On masque UNIQUEMENT les contacts encore en file d'enrichissement
        // (emails à trouver). Tous les autres (statut null, FOUND, NOT_FOUND…)
        // restent visibles. NB : `{ not: "QUEUED" }` seul exclurait aussi les
        // null, d'où le OR explicite pour les conserver.
        OR: [
          { emailLookupStatus: null },
          { emailLookupStatus: { not: "QUEUED" } },
        ],
      },
      orderBy: [{ priorite: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        poste: true,
        perimetre: true,
        localisation: true,
        priorite: true,
        linkedinUrl: true,
        language: true,
        emailSuggested: true,
        emailLookupStatus: true,
        marqueId: true,
        marque: { select: { nom: true, siteWeb: true } },
        sousMarques: { select: { marque: { select: { nom: true } } } },
      },
    });

    // Emails déjà suivis dans le cycle (via une AUTRE fiche de la même personne)
    // → on ne les propose pas une 2e fois en « À contacter ».
    const emails = contacts
      .map((c) => c.email?.toLowerCase())
      .filter((e): e is string => Boolean(e));
    const inCycle = emails.length
      ? await prisma.outreachTarget.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      : [];
    const inCycleSet = new Set(inCycle.map((t) => t.email.toLowerCase()));

    // Dédoublonnage par email : une personne = une seule ligne, en agrégeant
    // toutes les marques (fiche + sous-marques) qu'elle couvre.
    type Entry = {
      id: string;
      prenom: string | null;
      nom: string;
      email: string | null;
      poste: string | null;
      perimetre: string | null;
      localisation: string | null;
      priorite: string | null;
      linkedinUrl: string | null;
      language: string;
      marqueId: string;
      company: string;
      siteWeb: string | null;
      emailSuggested: string | null;
      emailLookupStatus: string | null;
      brands: Set<string>;
    };
    const byEmail = new Map<string, Entry>();
    const ordered: Entry[] = [];

    for (const c of contacts) {
      const emailLc = c.email?.toLowerCase() || "";
      if (emailLc && inCycleSet.has(emailLc)) continue;

      const own = c.marque.nom;
      const subs = c.sousMarques.map((s) => s.marque.nom);

      if (emailLc && byEmail.has(emailLc)) {
        const entry = byEmail.get(emailLc)!;
        for (const b of [own, ...subs]) entry.brands.add(b);
        continue;
      }

      const entry: Entry = {
        id: c.id,
        prenom: c.prenom,
        nom: c.nom,
        email: c.email,
        poste: c.poste,
        perimetre: c.perimetre,
        localisation: c.localisation,
        priorite: c.priorite,
        linkedinUrl: c.linkedinUrl,
        language: c.language,
        marqueId: c.marqueId,
        company: own,
        siteWeb: c.marque.siteWeb,
        emailSuggested: c.emailSuggested,
        emailLookupStatus: c.emailLookupStatus,
        brands: new Set<string>([own, ...subs]),
      };
      if (emailLc) byEmail.set(emailLc, entry);
      ordered.push(entry);
    }

    return NextResponse.json({
      contacts: ordered.map(({ brands, siteWeb: _sw, ...c }) => ({
        ...c,
        coveredBrands: Array.from(brands).filter((b) => b && b !== c.company),
      })),
    });
  } catch (error) {
    console.error("GET /api/outreach/pending-contacts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
