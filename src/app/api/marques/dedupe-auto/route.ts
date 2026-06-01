import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { marqueSlug } from "@/lib/marque-resolver";
import { mergeMarques } from "@/lib/marque-merge";

const ALLOWED = ["ADMIN", "HEAD_OF"];

/**
 * Fusionne automatiquement TOUS les groupes de marques ayant le même slug.
 *
 * Heuristique de sélection de la fiche "cible" (gardée) :
 *   - score = collabs*10 + negos*5 + inbounds + missions + contacts
 *   - en cas d'égalité, la plus ancienne gagne.
 *
 * Si `body.dryRun = true`, retourne le plan sans rien fusionner.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (!ALLOWED.includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = body.dryRun === true;

    const all = await prisma.marque.findMany({
      select: {
        id: true,
        nom: true,
        slug: true,
        createdAt: true,
        _count: {
          select: {
            collaborations: true,
            negociations: true,
            inboundOpportunities: true,
            contactMissions: true,
            demandesGift: true,
            contacts: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    type Row = (typeof all)[number] & { computedSlug: string };
    const bySlug = new Map<string, Row[]>();
    for (const m of all) {
      const slug = (m.slug && m.slug.trim()) || marqueSlug(m.nom);
      if (!slug) continue;
      const arr = bySlug.get(slug) ?? [];
      arr.push({ ...m, computedSlug: slug });
      bySlug.set(slug, arr);
    }

    type Plan = { keep: string; keepNom: string; merge: { id: string; nom: string }[] };
    const plans: Plan[] = [];
    for (const [, rows] of bySlug.entries()) {
      if (rows.length < 2) continue;
      const sorted = [...rows].sort((a, b) => {
        const score = (r: Row) =>
          r._count.collaborations * 10 +
          r._count.negociations * 5 +
          r._count.inboundOpportunities +
          r._count.contactMissions +
          r._count.contacts;
        const sb = score(b);
        const sa = score(a);
        if (sb !== sa) return sb - sa;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const keep = sorted[0];
      const merge = sorted.slice(1).map((r) => ({ id: r.id, nom: r.nom }));
      plans.push({ keep: keep.id, keepNom: keep.nom, merge });
    }

    if (dryRun) {
      return NextResponse.json({ dryRun: true, plans, totalToMerge: plans.reduce((s, p) => s + p.merge.length, 0) });
    }

    let merged = 0;
    const results: Array<{ keep: string; from: string; ok: boolean; error?: string }> = [];
    for (const plan of plans) {
      for (const source of plan.merge) {
        try {
          await mergeMarques(plan.keep, source.id);
          merged++;
          results.push({ keep: plan.keep, from: source.id, ok: true });
        } catch (e) {
          results.push({
            keep: plan.keep,
            from: source.id,
            ok: false,
            error: e instanceof Error ? e.message : "unknown",
          });
        }
      }
    }

    return NextResponse.json({ merged, results });
  } catch (error) {
    console.error("POST /api/marques/dedupe-auto:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
