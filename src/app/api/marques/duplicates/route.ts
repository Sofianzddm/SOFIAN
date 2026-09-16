import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  detectExactDuplicateGroups,
  detectFuzzyDuplicateGroups,
  loadMarquesForDedupe,
} from "@/lib/marque-fuzzy-detect";

const ALLOWED = ["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "HEAD_OF_INFLUENCE"];

/**
 * GET /api/marques/duplicates
 *
 * Analyse tout le CRM marques :
 * @param mode  "exact" (défaut) — même nom normalisé / même slug
 *              "fuzzy"          — + typos, préfixes, trigrammes
 * @param threshold  0.0..1.0 (défaut 0.78) — seuil trigramme
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (!ALLOWED.includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") || "exact") as "exact" | "fuzzy";
    const threshold = Math.max(
      0.5,
      Math.min(0.95, parseFloat(searchParams.get("threshold") || "0.78"))
    );

    const rows = await loadMarquesForDedupe(prisma);
    const exact = detectExactDuplicateGroups(rows);
    const claimed = new Set<string>();
    for (const g of exact) for (const m of g.marques) claimed.add(m.id);

    const groups =
      mode === "fuzzy"
        ? [...exact, ...detectFuzzyDuplicateGroups(rows, threshold, claimed)]
        : exact;

    groups.sort((a, b) => b.marques.length - a.marques.length);

    return NextResponse.json({
      mode,
      threshold,
      groups,
      totalGroups: groups.length,
      totalMarquesAFusionner: groups.reduce((sum, g) => sum + (g.marques.length - 1), 0),
    });
  } catch (error) {
    console.error("GET /api/marques/duplicates:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
