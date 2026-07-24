import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildZipFromUrls, zipResponseHeaders, type ZipEntry } from "@/lib/zip-download";

export const dynamic = "force-dynamic";

/**
 * GET /api/factures/talents/download-all
 * Réservé à l'équipe interne : télécharge en une archive ZIP les factures
 * talent (collaborations avec `factureTalentUrl`).
 *
 * Filtres optionnels :
 *   - ?statut=FACTURE_RECUE|PAYE|PUBLIE|…
 *   - ?month=YYYY-MM   (basé sur la date de réception de la facture)
 *   - ?talentId=...
 *   - ?ids=a,b,c
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user || !role || role === "TALENT") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const statut = params.get("statut");
    const month = params.get("month");
    const talentId = params.get("talentId");
    const idsParam = params.get("ids");
    const ids = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const collaborations = await prisma.collaboration.findMany({
      where: {
        factureTalentUrl: { not: null },
        ...(statut ? { statut: statut as any } : {}),
        ...(talentId ? { talentId } : {}),
        ...(ids ? { id: { in: ids } } : {}),
      },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
      },
      orderBy: { factureTalentRecueAt: "desc" },
    });

    let rows = collaborations.map((c) => ({
      url: c.factureTalentUrl,
      talent: `${c.talent?.prenom ?? ""} ${c.talent?.nom ?? ""}`.trim() || "talent",
      marque: c.marque?.nom || "collab",
      reference: c.reference,
      date: c.factureTalentRecueAt ?? c.createdAt ?? null,
    }));

    if (month) {
      rows = rows.filter((r) => {
        if (!r.date) return false;
        const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
        return key === month;
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucune facture talent à télécharger" }, { status: 404 });
    }

    const entries: ZipEntry[] = rows.map((r) => {
      const d = r.date ? r.date.toISOString().slice(0, 10) : "sans-date";
      return { url: r.url, name: `${d} - ${r.talent} - ${r.marque} - ${r.reference}` };
    });

    const { buffer, added, failed } = await buildZipFromUrls(entries);
    if (added === 0) {
      return NextResponse.json(
        { error: "Impossible de récupérer les factures" },
        { status: 502 }
      );
    }

    const zipName = month
      ? `factures-talent-${month}.zip`
      : statut
      ? `factures-talent-${statut.toLowerCase()}.zip`
      : "factures-talent.zip";

    const headers = zipResponseHeaders(zipName, buffer.length);
    if (failed.length > 0) headers.set("X-Zip-Failed", String(failed.length));

    return new NextResponse(buffer as any, { status: 200, headers });
  } catch (error) {
    console.error("❌ Erreur download-all factures talent (admin):", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'archive" },
      { status: 500 }
    );
  }
}
