import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getFinanceStats,
  getCAParMois,
  getRepartitionParTalent,
  getRepartitionParMarque,
  getRepartitionParSource,
  getPeriodeMoisEnCours,
  PeriodeFilter,
} from "@/lib/finance/analytics";
import { generateExcelReport, generateCSV } from "@/lib/finance/export";

// POST - Générer export Excel ou CSV
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { format, dateDebut, dateFin, pole } = body;

    let periode: PeriodeFilter;

    if (dateDebut && dateFin) {
      periode = {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        pole: pole || undefined,
      };
    } else {
      periode = { ...getPeriodeMoisEnCours(), pole: pole || undefined };
    }

    // Récupérer toutes les données avec filtre pôle
    const [stats, evolution, talents, marques, sources] = await Promise.all([
      getFinanceStats(periode),
      getCAParMois(12, pole || undefined),
      getRepartitionParTalent(periode, 20),
      getRepartitionParMarque(periode, 20),
      getRepartitionParSource(periode),
    ]);

    // Générer nom de fichier avec pôle si filtré
    const poleSuffix = pole ? `-${pole.toLowerCase()}` : "";
    const dateStr = new Date().toISOString().split("T")[0];

    if (format === "excel") {
      const buffer = await generateExcelReport(stats, evolution, {
        talents,
        marques,
        sources,
      });

      return new NextResponse(buffer as any, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="rapport-finance${poleSuffix}-${dateStr}.xlsx"`,
        },
      });
    } else if (format === "csv") {
      const csv = generateCSV(stats, evolution);

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="rapport-finance${poleSuffix}-${dateStr}.csv"`,
        },
      });
    } else {
      return NextResponse.json({ error: "Format non supporté" }, { status: 400 });
    }
  } catch (error) {
    console.error("Erreur POST /api/finance/export:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'export" },
      { status: 500 }
    );
  }
}
