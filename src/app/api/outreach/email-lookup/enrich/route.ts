import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { domainFromWebsite } from "@/lib/email-pattern";
import { compareEnrichmentProviders } from "@/lib/enrichment/compare";
import type { EnrichPersonInput } from "@/lib/enrichment/types";

/**
 * POST → enrichit un contact via Apollo + Lusha en parallèle,
 * renvoie les résultats côte à côte pour comparaison / choix manuel.
 *
 * Body: {
 *   prenom?, nom, linkedinUrl?, company?,
 *   refs?: [{ id, market }]  // pour résoudre le domaine site web
 * }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

type Market = "FR" | "BENELUX" | "AGENCY" | "FW";

async function resolveDomainFromRefs(
  refs: Array<{ id: string; market: Market }>
): Promise<{ company: string | null; domain: string | null }> {
  for (const ref of refs) {
    if (ref.market === "FR") {
      const c = await prisma.marqueContact.findUnique({
        where: { id: ref.id },
        select: {
          marque: { select: { nom: true, siteWeb: true } },
        },
      });
      if (c) {
        return {
          company: c.marque.nom,
          domain: domainFromWebsite(c.marque.siteWeb),
        };
      }
    }
    if (ref.market === "BENELUX") {
      const c = await prisma.beneluxContact.findUnique({
        where: { id: ref.id },
        select: {
          company: { select: { nom: true, siteWeb: true } },
        },
      });
      if (c) {
        return {
          company: c.company.nom,
          domain: domainFromWebsite(c.company.siteWeb),
        };
      }
    }
    if (ref.market === "AGENCY") {
      const c = await prisma.agencyContact.findUnique({
        where: { id: ref.id },
        select: { partner: { select: { name: true } } },
      });
      if (c) {
        return { company: c.partner.name, domain: null };
      }
    }
    if (ref.market === "FW") {
      const c = await prisma.fwContact.findUnique({
        where: { id: ref.id },
        select: { client: { select: { nom: true } } },
      });
      if (c) {
        return { company: c.client.nom, domain: null };
      }
    }
  }
  return { company: null, domain: null };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const prenom =
      typeof body.prenom === "string" ? body.prenom.trim() || null : null;
    const nom = typeof body.nom === "string" ? body.nom.trim() : "";
    const linkedinUrl =
      typeof body.linkedinUrl === "string"
        ? body.linkedinUrl.trim() || null
        : null;
    let company =
      typeof body.company === "string" ? body.company.trim() || null : null;
    let domain =
      typeof body.domain === "string" ? body.domain.trim() || null : null;

    const refsRaw = Array.isArray(body.refs) ? body.refs : [];
    const refs = refsRaw
      .map((r: { id?: unknown; market?: unknown }) => ({
        id: typeof r?.id === "string" ? r.id : "",
        market: r?.market as Market,
      }))
      .filter(
        (r: { id: string; market: Market }) =>
          r.id &&
          (r.market === "FR" ||
            r.market === "BENELUX" ||
            r.market === "AGENCY" ||
            r.market === "FW")
      );

    if (!nom && !linkedinUrl) {
      return NextResponse.json(
        { error: "Nom ou LinkedIn requis" },
        { status: 400 }
      );
    }

    if (refs.length > 0 && (!domain || !company)) {
      const resolved = await resolveDomainFromRefs(refs);
      if (!company) company = resolved.company;
      if (!domain) domain = resolved.domain;
    }

    const input: EnrichPersonInput = {
      prenom,
      nom: nom || "",
      linkedinUrl,
      company,
      domain,
    };

    const result = await compareEnrichmentProviders(input);

    // Ne pas renvoyer les payloads bruts (bruit + taille) au client.
    const { apollo, lusha, ...rest } = result;
    return NextResponse.json({
      ...rest,
      apollo: { ...apollo, raw: undefined },
      lusha: { ...lusha, raw: undefined },
    });
  } catch (error) {
    console.error("POST /api/outreach/email-lookup/enrich:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
