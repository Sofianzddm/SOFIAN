import path from "path";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { formatInTimeZone } from "date-fns-tz";

import { requireCannesEditor } from "@/lib/cannes/auth";
import { htmlToPlainTextForExport } from "@/lib/cannes/cannesTaskNotes";
import { prisma } from "@/lib/prisma";

import { PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";

export async function GET() {
  const { error } = await requireCannesEditor();
  if (error) return error;

  const presences = await prisma.cannesPresence.findMany({
    where: { userId: { not: null } },
    orderBy: [{ user: { nom: "asc" } }, { user: { prenom: "asc" } }],
    include: {
      user: { select: { prenom: true, nom: true } },
      planningSlots: { orderBy: { startsAt: "asc" } },
    },
  });

  type Row = {
    collab: string;
    dateParis: string;
    heureDebut: string;
    heureFin: string;
    titre: string;
    lieu: string;
    consignes: string;
  };

  const rows: Row[] = [];
  for (const p of presences) {
    const collab = `${p.user?.prenom ?? ""} ${p.user?.nom ?? ""}`.trim() || "—";
    for (const s of p.planningSlots) {
      rows.push({
        collab,
        dateParis: formatInTimeZone(s.startsAt, PARIS_TZ, "yyyy-MM-dd"),
        heureDebut: formatInTimeZone(s.startsAt, PARIS_TZ, "HH:mm"),
        heureFin: formatInTimeZone(s.endsAt, PARIS_TZ, "HH:mm"),
        titre: (s.title || "").trim(),
        lieu: (s.location || "").trim(),
        consignes: htmlToPlainTextForExport(s.notes || ""),
      });
    }
  }

  rows.sort((a, b) => {
    const c = a.dateParis.localeCompare(b.dateParis);
    if (c !== 0) return c;
    const n = a.collab.localeCompare(b.collab, "fr");
    if (n !== 0) return n;
    return a.heureDebut.localeCompare(b.heureDebut);
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Creneaux equipe");
  sheet.columns = [
    { key: "collab", width: 26 },
    { key: "dateParis", width: 14 },
    { key: "heureDebut", width: 10 },
    { key: "heureFin", width: 10 },
    { key: "titre", width: 28 },
    { key: "lieu", width: 24 },
    { key: "consignes", width: 50 },
  ];

  sheet.mergeCells("A1:G1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "Festival de Cannes 2026 — Créneaux horaires équipe (Europe/Paris)";
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF220101" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  const logoPath = path.join(process.cwd(), "public", "Logo.png");
  try {
    const logoBuffer = await readFile(logoPath);
    const logoId = workbook.addImage({ base64: logoBuffer.toString("base64"), extension: "png" });
    sheet.addImage(logoId, {
      tl: { col: 0.2, row: 0.12 },
      ext: { width: 88, height: 24 },
      editAs: "oneCell",
    });
  } catch {
    // export sans logo si fichier absent
  }

  const headers = [
    "Collaborateur",
    "Date (Paris)",
    "Heure début",
    "Heure fin",
    "Titre / activité",
    "Lieu",
    "Consignes (texte)",
  ];
  const headerRow = sheet.getRow(2);
  headers.forEach((value, index) => {
    headerRow.getCell(index + 1).value = value;
  });
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB06F70" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E0D8" } },
      left: { style: "thin", color: { argb: "FFE5E0D8" } },
      bottom: { style: "thin", color: { argb: "FFE5E0D8" } },
      right: { style: "thin", color: { argb: "FFE5E0D8" } },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  rows.forEach((r, index) => {
    const row = sheet.addRow({
      collab: r.collab,
      dateParis: r.dateParis,
      heureDebut: r.heureDebut,
      heureFin: r.heureFin,
      titre: r.titre,
      lieu: r.lieu,
      consignes: r.consignes,
    });
    row.height = 20;
    row.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF1A1110" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? "FFF5EBE0" : "FFFFFFFF" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E0D8" } },
        left: { style: "thin", color: { argb: "FFE5E0D8" } },
        bottom: { style: "thin", color: { argb: "FFE5E0D8" } },
        right: { style: "thin", color: { argb: "FFE5E0D8" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });

  if (rows.length === 0) {
    const row = sheet.addRow({
      collab: "— Aucun créneau horaire enregistré pour l’équipe —",
      dateParis: "",
      heureDebut: "",
      heureFin: "",
      titre: "",
      lieu: "",
      consignes: "",
    });
    row.getCell(1).font = { italic: true, color: { argb: "FF6B625C" } };
  }

  sheet.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `cannes-2026-creneaux-equipe-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
