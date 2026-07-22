import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { parseWorksheetCartoRows } from "@/lib/carto-excel";

/**
 * POST → parse la feuille 2 (AO) des classeurs carto d'origine et crée les
 * contacts source=AO manquants. Réservé ADMIN.
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

    // On parse la feuille 2 du classeur ORIGINAL (plus fiable que le fichier AO extrait)
    const sourceFiles = await prisma.marqueCartoFile.findMany({
      where: {
        marqueId,
        OR: [{ kind: "CARTO" }, { kind: "AO" }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (sourceFiles.length === 0) {
      return NextResponse.json({ created: 0, message: "Aucun fichier carto/AO." });
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
    const seenKeys = new Set<string>();

    for (const file of sourceFiles) {
      const bytes = Buffer.from(file.data);
      // Classeur original → feuille 2 ; fichier AO extrait → feuille 1
      const sheetIndex = file.kind === "AO" ? 0 : 1;
      let rows;
      try {
        rows = await parseWorksheetCartoRows(bytes, sheetIndex);
      } catch (e) {
        console.warn("[sync-ao] parse échoué pour", file.fileName, e);
        continue;
      }
      if (rows.length === 0) continue;

      for (const row of rows.slice(0, 200)) {
        const prenom = clean(row.prenom);
        const nom = clean(row.nom);
        const rawEmail = clean(row.email)?.toLowerCase() || null;
        const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;
        if (!nom && !prenom) continue;

        const nameKey = `${(prenom || "").toLowerCase()}|${(nom || prenom || "").toLowerCase()}`;
        if (seenKeys.has(nameKey)) continue;
        seenKeys.add(nameKey);
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

      // Un classeur original a suffi
      if (file.kind === "CARTO" && rows.length > 0) break;
    }

    return NextResponse.json({ created });
  } catch (error) {
    console.error("POST sync-ao:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
