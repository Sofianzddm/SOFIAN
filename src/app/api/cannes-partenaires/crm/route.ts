import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";

/**
 * CRM isolé Cannes Partenaires :
 * marques du pipeline + contacts CARTO outreachExcluded (hors outreach FR).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!canAccessCannesPartenaires(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }
    // Aligné strategy : emails contacts masqués pour STRATEGY_PLANNER
    const hideEmails = role === "STRATEGY_PLANNER";

    const projet = await getOrCreateVillaProject(CANNES_PARTENAIRES_SLUG);
    const q = String(request.nextUrl.searchParams.get("q") || "")
      .trim()
      .toLowerCase();

    const opportunites = await prisma.opportuniteMarque.findMany({
      where: { projetId: projet.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        nomMarque: true,
        marqueId: true,
        statut: true,
        secteur: true,
        contactQualifie: true,
        lastEmailSentAt: true,
        emailRepliedAt: true,
        updatedAt: true,
        marque: {
          select: {
            id: true,
            nom: true,
            secteur: true,
            siteWeb: true,
            ville: true,
            contacts: {
              where: {
                source: "CARTO",
                outreachExcluded: true,
              },
              orderBy: [{ priorite: "asc" }, { nom: "asc" }],
              select: {
                id: true,
                prenom: true,
                nom: true,
                email: true,
                poste: true,
                priorite: true,
                perimetre: true,
                linkedinUrl: true,
                emailLookupStatus: true,
              },
            },
          },
        },
      },
    });

    let rows = opportunites.map((o) => {
      const rawContacts = o.marque?.contacts || [];
      const withEmail = rawContacts.filter((c) =>
        Boolean((c.email || "").trim())
      ).length;
      const contacts = hideEmails
        ? rawContacts.map((c) => ({
            ...c,
            email: c.email ? "[masqué]" : null,
          }))
        : rawContacts;
      return {
        opportuniteId: o.id,
        nomMarque: o.nomMarque,
        marqueId: o.marqueId,
        statut: o.statut,
        secteur: o.secteur || o.marque?.secteur || null,
        siteWeb: o.marque?.siteWeb || null,
        ville: o.marque?.ville || null,
        contactQualifie: o.contactQualifie,
        lastEmailSentAt: o.lastEmailSentAt,
        emailRepliedAt: o.emailRepliedAt,
        updatedAt: o.updatedAt,
        contactsCount: contacts.length,
        emailsCount: withEmail,
        contacts,
      };
    });

    if (q) {
      rows = rows.filter((r) => {
        const blob = [
          r.nomMarque,
          r.secteur,
          r.ville,
          ...r.contacts.map(
            (c) =>
              `${c.prenom || ""} ${c.nom} ${c.email || ""} ${c.poste || ""}`
          ),
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }

    return NextResponse.json({
      projet: { id: projet.id, slug: projet.slug, nom: projet.nom },
      marques: rows,
      totals: {
        marques: rows.length,
        contacts: rows.reduce((n, r) => n + r.contactsCount, 0),
        emails: rows.reduce((n, r) => n + r.emailsCount, 0),
      },
    });
  } catch (e) {
    console.error("GET /api/cannes-partenaires/crm:", e);
    return NextResponse.json({ error: "Erreur CRM Cannes" }, { status: 500 });
  }
}
