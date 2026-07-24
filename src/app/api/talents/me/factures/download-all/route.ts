import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTalentDemoPublishedCollaborations } from "@/lib/talent-demo";
import { TALENT_PORTAL_DATE_DEBUT } from "@/lib/talent-portal";
import { buildZipFromUrls, zipResponseHeaders, type ZipEntry } from "@/lib/zip-download";

export const dynamic = "force-dynamic";

/**
 * GET /api/talents/me/factures/download-all
 * Télécharge en une archive ZIP les factures que le talent nous a envoyées.
 *
 * Filtres optionnels :
 *   - ?month=YYYY-MM  : uniquement les factures de ce mois
 *   - ?ids=a,b,c      : uniquement ces collaborations (sélection)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const month = params.get("month"); // format YYYY-MM
    const idsParam = params.get("ids");
    const idFilter = idsParam
      ? new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))
      : null;

    const forceDemo = params.get("demo") === "1";
    const envDemo = process.env.TALENT_PORTAL_DEMO === "1";

    type Row = { id: string; marque: string; url: string | null; date: Date | null };
    let rows: Row[];

    if (forceDemo || envDemo) {
      rows = getTalentDemoPublishedCollaborations().map((c) => ({
        id: c.id,
        marque: c.marque,
        url: c.factureTalentUrl,
        date: c.factureTalentRecueAt ? new Date(c.factureTalentRecueAt) : null,
      }));
    } else {
      if (session.user.role !== "TALENT") {
        return NextResponse.json({ error: "Accès réservé aux talents" }, { status: 403 });
      }
      const talent = await prisma.talent.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (!talent) {
        return NextResponse.json({ error: "Aucun profil talent trouvé" }, { status: 404 });
      }
      const collaborations = await prisma.collaboration.findMany({
        where: {
          talentId: talent.id,
          factureTalentUrl: { not: null },
          datePublication: { gte: TALENT_PORTAL_DATE_DEBUT },
        },
        include: { marque: { select: { nom: true } } },
        orderBy: { factureTalentRecueAt: "desc" },
      });
      rows = collaborations.map((c) => ({
        id: c.id,
        marque: c.marque?.nom || "collab",
        url: c.factureTalentUrl,
        date: c.factureTalentRecueAt ?? c.createdAt ?? null,
      }));
    }

    // Application des filtres
    let filtered = rows.filter((r) => r.url);
    if (idFilter) filtered = filtered.filter((r) => idFilter.has(r.id));
    if (month) {
      filtered = filtered.filter((r) => {
        if (!r.date) return false;
        const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
        return key === month;
      });
    }

    if (filtered.length === 0) {
      return NextResponse.json({ error: "Aucune facture à télécharger" }, { status: 404 });
    }

    const entries: ZipEntry[] = filtered.map((r) => {
      const d = r.date ? r.date.toISOString().slice(0, 10) : "sans-date";
      return { url: r.url, name: `${d} - Facture ${r.marque}` };
    });

    const { buffer, added, failed } = await buildZipFromUrls(entries);
    if (added === 0) {
      return NextResponse.json(
        { error: "Impossible de récupérer les factures" },
        { status: 502 }
      );
    }

    const zipName = month
      ? `mes-factures-${month}.zip`
      : idFilter
      ? "mes-factures-selection.zip"
      : "mes-factures-glowup.zip";

    const headers = zipResponseHeaders(zipName, buffer.length);
    if (failed.length > 0) headers.set("X-Zip-Failed", String(failed.length));

    return new NextResponse(buffer as any, { status: 200, headers });
  } catch (error) {
    console.error("❌ Erreur download-all factures talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'archive" },
      { status: 500 }
    );
  }
}
