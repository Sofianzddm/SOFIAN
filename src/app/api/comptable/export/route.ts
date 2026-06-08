import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireComptable } from "@/lib/comptable/auth";
import {
  getComptaData,
  getComptaSummary,
  buildEcritures,
  buildJournalVentes,
  buildJournalBanque,
  buildTvaSummary,
  buildTvaEncaissement,
  buildBalanceClients,
  buildGrandLivre,
  buildBalanceGenerale,
  buildControles,
  parsePeriode,
  Periode,
} from "@/lib/comptable/accounting";
import {
  generateFEC,
  fecFileName,
  generateLiasseComptable,
  generateSingleSheet,
  buildJournalVentesSheet,
  buildJournalBanqueSheet,
  buildTvaSheet,
  buildTvaEncaissementSheet,
  buildBalanceClientsSheet,
  buildGrandLivreSheet,
  buildBalanceGeneraleSheet,
  buildControlesSheet,
  buildEcrituresSheet,
  generateJournalVentesCSV,
  generateEcrituresCSV,
  generateQuadratus,
  generateSageCSV,
} from "@/lib/comptable/exports";
import { generateJustificatifsZip } from "@/lib/comptable/justificatifs";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function periodeStamp(periode: Periode): string {
  const f = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate()
    ).padStart(2, "0")}`;
  return `${f(periode.dateDebut)}-${f(periode.dateFin)}`;
}

export async function GET(request: NextRequest) {
  const guard = await requireComptable(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "liasse").toLowerCase();
    const periode = parsePeriode(
      searchParams.get("dateDebut"),
      searchParams.get("dateFin")
    );

    const settings = await prisma.agenceSettings.findFirst();
    const agence = {
      nom: settings?.nom ?? "Glow Up Agence",
      siret: settings?.siret ?? null,
      numeroTVA: settings?.numeroTVA ?? null,
    };
    const siren = settings?.siret?.replace(/\D/g, "").slice(0, 9) ?? null;

    const data = await getComptaData(periode);
    const stamp = periodeStamp(periode);

    switch (type) {
      case "fec": {
        const lines = buildEcritures(data);
        const fec = generateFEC(lines);
        return new NextResponse(fec, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fecFileName(siren, periode)}"`,
          },
        });
      }

      case "ecritures-csv": {
        const lines = buildEcritures(data);
        const csv = generateEcrituresCSV(lines);
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="ecritures-${stamp}.csv"`,
          },
        });
      }

      case "ventes-csv": {
        const rows = buildJournalVentes(data);
        const csv = generateJournalVentesCSV(rows);
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="journal-ventes-${stamp}.csv"`,
          },
        });
      }

      case "ventes": {
        const rows = buildJournalVentes(data);
        const buffer = await generateSingleSheet((wb) =>
          buildJournalVentesSheet(wb, rows, periode, agence)
        );
        return xlsxResponse(buffer, `journal-ventes-${stamp}.xlsx`);
      }

      case "banque": {
        const rows = buildJournalBanque(data);
        const buffer = await generateSingleSheet((wb) =>
          buildJournalBanqueSheet(wb, rows, periode, agence)
        );
        return xlsxResponse(buffer, `journal-banque-${stamp}.xlsx`);
      }

      case "tva": {
        const rows = buildTvaSummary(data);
        const buffer = await generateSingleSheet((wb) =>
          buildTvaSheet(wb, rows, periode, agence)
        );
        return xlsxResponse(buffer, `recap-tva-${stamp}.xlsx`);
      }

      case "creances": {
        const rows = buildBalanceClients(data);
        const buffer = await generateSingleSheet((wb) =>
          buildBalanceClientsSheet(wb, rows, periode, agence)
        );
        return xlsxResponse(buffer, `balance-clients-${stamp}.xlsx`);
      }

      case "ecritures": {
        const lines = buildEcritures(data);
        const buffer = await generateSingleSheet((wb) =>
          buildEcrituresSheet(wb, lines)
        );
        return xlsxResponse(buffer, `ecritures-${stamp}.xlsx`);
      }

      case "tva-encaissement": {
        const tvaEnc = buildTvaEncaissement(data);
        const buffer = await generateSingleSheet((wb) =>
          buildTvaEncaissementSheet(
            wb,
            tvaEnc.rows,
            tvaEnc.encaissementsNonLettres,
            periode,
            agence
          )
        );
        return xlsxResponse(buffer, `tva-encaissement-${stamp}.xlsx`);
      }

      case "grand-livre": {
        const comptes = buildGrandLivre(buildEcritures(data));
        const buffer = await generateSingleSheet((wb) =>
          buildGrandLivreSheet(wb, comptes, periode, agence)
        );
        return xlsxResponse(buffer, `grand-livre-${stamp}.xlsx`);
      }

      case "balance": {
        const rows = buildBalanceGenerale(buildEcritures(data));
        const buffer = await generateSingleSheet((wb) =>
          buildBalanceGeneraleSheet(wb, rows, periode, agence)
        );
        return xlsxResponse(buffer, `balance-generale-${stamp}.xlsx`);
      }

      case "controles": {
        const anomalies = buildControles(data);
        const buffer = await generateSingleSheet((wb) =>
          buildControlesSheet(wb, anomalies, periode, agence)
        );
        return xlsxResponse(buffer, `controles-${stamp}.xlsx`);
      }

      case "quadratus": {
        const txt = generateQuadratus(buildEcritures(data));
        return new NextResponse(txt, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="quadratus-${stamp}.txt"`,
          },
        });
      }

      case "sage": {
        const csv = generateSageCSV(buildEcritures(data));
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="sage-pennylane-${stamp}.csv"`,
          },
        });
      }

      case "justificatifs": {
        const { buffer } = await generateJustificatifsZip(periode);
        return new NextResponse(buffer as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="justificatifs-${stamp}.zip"`,
          },
        });
      }

      case "liasse":
      default: {
        const summary = await getComptaSummary(periode);
        const tvaEnc = buildTvaEncaissement(data);
        const ecritures = buildEcritures(data);
        const buffer = await generateLiasseComptable({
          summary,
          ventes: buildJournalVentes(data),
          banque: buildJournalBanque(data),
          tva: buildTvaSummary(data),
          tvaEncaissement: tvaEnc.rows,
          encaissementsNonLettres: tvaEnc.encaissementsNonLettres,
          creances: buildBalanceClients(data),
          grandLivre: buildGrandLivre(ecritures),
          balance: buildBalanceGenerale(ecritures),
          anomalies: buildControles(data),
          ecritures,
          periode,
          agence,
        });
        return xlsxResponse(buffer, `liasse-comptable-${stamp}.xlsx`);
      }
    }
  } catch (error) {
    console.error("Erreur GET /api/comptable/export:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'export comptable" },
      { status: 500 }
    );
  }
}

function xlsxResponse(buffer: Buffer, filename: string) {
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
