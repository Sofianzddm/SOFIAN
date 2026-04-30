import path from "path";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/cannes/auth";

function toSocialUrl(value: string | null | undefined, platform: "instagram" | "tiktok") {
  if (!value) return "";
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const username = raw.replace(/^@/, "");
  if (!username) return "";
  return platform === "instagram"
    ? `https://instagram.com/${username}`
    : `https://www.tiktok.com/@${username}`;
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const presences = await prisma.cannesPresence.findMany({
    where: { talentId: { not: null } },
    orderBy: [{ arrivalDate: "asc" }],
    include: {
      talent: {
        select: {
          prenom: true,
          nom: true,
          instagram: true,
          tiktok: true,
        },
      },
    },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glow Up Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Presences Talents");
  sheet.columns = [
    { key: "prenom", width: 18 },
    { key: "nom", width: 18 },
    { key: "arrivalDate", width: 16 },
    { key: "departureDate", width: 16 },
    { key: "hotel", width: 28 },
    { key: "instagram", width: 40 },
    { key: "tiktok", width: 40 },
  ];

  sheet.mergeCells("A1:G1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "Festival de Cannes 2026 - Presence Talents";
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF220101" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;

  const logoPath = path.join(process.cwd(), "public", "Logo.png");
  try {
    const logoBuffer = await readFile(logoPath);
    const logoId = workbook.addImage({ base64: logoBuffer.toString("base64"), extension: "png" });
    sheet.addImage(logoId, {
      tl: { col: 0.2, row: 0.15 },
      ext: { width: 90, height: 24 },
      editAs: "oneCell",
    });
  } catch {
    // Ignore if logo cannot be loaded; export should still work.
  }

  const headers = ["Prenom", "Nom", "Date arrivee", "Date depart", "Hotel", "Instagram", "TikTok"];
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

  presences.forEach((presence, index) => {
    const row = sheet.addRow({
      prenom: presence.talent?.prenom || "",
      nom: presence.talent?.nom || "",
      arrivalDate: presence.arrivalDate,
      departureDate: presence.departureDate,
      hotel: presence.hotel || "",
      instagram: "",
      tiktok: "",
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
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    row.getCell("arrivalDate").numFmt = "dd/mm/yyyy";
    row.getCell("departureDate").numFmt = "dd/mm/yyyy";

    const instagramUrl = toSocialUrl(presence.talent?.instagram, "instagram");
    if (instagramUrl) {
      const igCell = row.getCell("instagram");
      igCell.value = { text: instagramUrl, hyperlink: instagramUrl };
      igCell.font = { name: "Arial", size: 10, color: { argb: "FFE4405F" }, underline: true };
    }

    const tiktokUrl = toSocialUrl(presence.talent?.tiktok, "tiktok");
    if (tiktokUrl) {
      const ttCell = row.getCell("tiktok");
      ttCell.value = { text: tiktokUrl, hyperlink: tiktokUrl };
      ttCell.font = { name: "Arial", size: 10, color: { argb: "FF000000" }, underline: true };
    }
  });

  sheet.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `cannes-2026-presences-talents-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
