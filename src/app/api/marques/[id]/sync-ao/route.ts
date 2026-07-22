import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { parseCartoTsv } from "@/lib/carto-excel";
import ExcelJS from "exceljs";

/**
 * POST → parse les fichiers AO déjà stockés et crée les contacts source=AO
 * manquants (utile pour les imports faits avant le parsing des contacts AO).
 * Réservé ADMIN.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if ((session.user.role || "") !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: marqueId } = await params;
    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { id: true },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
    }

    const aoFiles = await prisma.marqueCartoFile.findMany({
      where: { marqueId, kind: "AO" },
      orderBy: { createdAt: "desc" },
    });
    if (aoFiles.length === 0) {
      return NextResponse.json({ created: 0, message: "Aucun fichier AO." });
    }

    const existing = await prisma.marqueContact.findMany({
      where: { marqueId, source: "AO" },
      select: { prenom: true, nom: true, email: true },
    });
    const emails = new Set(
      existing.map((c) => (c.email || "").toLowerCase()).filter(Boolean)
    );
    const names = new Set(
      existing.map((c) => `${(c.prenom || "").toLowerCase()}|${c.nom.toLowerCase()}`)
    );

    const clean = (v: unknown): string | null => {
      const s = typeof v === "string" ? v.trim() : "";
      return s || null;
    };
    const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    let created = 0;

    for (const file of aoFiles) {
      const workbook = new ExcelJS.Workbook();
      const ab = file.data.buffer.slice(
        file.data.byteOffset,
        file.data.byteOffset + file.data.byteLength
      ) as ArrayBuffer;
      await workbook.xlsx.load(ab);
      const sheet = workbook.worksheets[0];
      if (!sheet) continue;

      const lines: string[] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const values = row.values as unknown[];
        const cells: string[] = [];
        for (let col = 1; col < Math.max(values.length, 2); col++) {
          const v = values[col];
          if (v == null) cells.push("");
          else if (typeof v === "object" && v !== null && "text" in (v as object)) {
            cells.push(String((v as { text?: string }).text ?? ""));
          } else cells.push(String(v));
        }
        lines.push(cells.join("\t"));
      });

      const rows = parseCartoTsv(lines.join("\n"));
      for (const row of rows.slice(0, 200)) {
        const prenom = clean(row.prenom);
        const nom = clean(row.nom);
        const rawEmail = clean(row.email)?.toLowerCase() || null;
        const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;
        if (!nom && !prenom) continue;

        const nameKey = `${(prenom || "").toLowerCase()}|${(nom || prenom || "").toLowerCase()}`;
        if ((email && emails.has(email)) || names.has(nameKey)) continue;

        await prisma.marqueContact.create({
          data: {
            marqueId,
            prenom,
            nom: nom || prenom || "Contact",
            email,
            poste: clean(row.poste),
            perimetre: clean(row.perimetre),
            localisation: clean(row.localisation),
            priorite: clean(row.priorite),
            linkedinUrl: clean(row.linkedinUrl),
            source: "AO",
          },
        });
        names.add(nameKey);
        if (email) emails.add(email);
        created += 1;
      }
    }

    return NextResponse.json({ created });
  } catch (error) {
    console.error("POST sync-ao:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
