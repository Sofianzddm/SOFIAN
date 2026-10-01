import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessPrestataireCrm } from "@/lib/prestataire-crm-access";
import {
  isValidPrestataireCategorie,
  PRESTATAIRE_CATEGORIE_LABEL,
  PRESTATAIRE_IMPORT_ENTITY_COLUMN,
  PRESTATAIRE_IMPORT_EXAMPLES,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";

/**
 * GET → Excel modèle pour import bulk (colonne établissement + contact).
 * ?categorie=HOTEL|TRAITEUR|…
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessPrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const catRaw = String(request.nextUrl.searchParams.get("categorie") || "HOTEL")
      .trim()
      .toUpperCase();
    const categorie: PrestataireCategorie = isValidPrestataireCategorie(catRaw)
      ? catRaw
      : "HOTEL";
    const label = PRESTATAIRE_CATEGORIE_LABEL[categorie];
    const entityCol = PRESTATAIRE_IMPORT_ENTITY_COLUMN[categorie];
    const [ex1, ex2] = PRESTATAIRE_IMPORT_EXAMPLES[categorie];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Glowup";
    const sheet = workbook.addWorksheet("Import");

    sheet.columns = [
      { header: entityCol, key: "hotel", width: 28 },
      { header: "Ville", key: "ville", width: 16 },
      { header: "Prénom", key: "prenom", width: 14 },
      { header: "Nom", key: "nom", width: 16 },
      { header: "Email", key: "email", width: 28 },
      { header: "Rôle", key: "role", width: 22 },
      { header: "Téléphone", key: "tel", width: 16 },
      { header: "LinkedIn", key: "linkedin", width: 32 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF4F4F5" },
    };

    // 2 lignes même établissement → fusionnées en 1 fiche
    sheet.addRow({
      hotel: ex1,
      ville: "Paris",
      prenom: "Camille",
      nom: "Dupont",
      email: "camille.dupont@exemple.com",
      role: "Directrice commerciale",
      tel: "+33 1 23 45 67 89",
      linkedin: "",
    });
    sheet.addRow({
      hotel: ex1,
      ville: "Paris",
      prenom: "Julien",
      nom: "Martin",
      email: "julien.martin@exemple.com",
      role: "Responsable partenariats",
      tel: "",
      linkedin: "",
    });
    sheet.addRow({
      hotel: ex2,
      ville: "Lyon",
      prenom: "Sarah",
      nom: "Bernard",
      email: "sarah.bernard@exemple.com",
      role: "Contact",
      tel: "",
      linkedin: "",
    });

    const note = workbook.addWorksheet("Consigne");
    note.getColumn(1).width = 95;
    note.addRow([
      `Modèle d’import ${label} — une ligne = un contact rattaché à un établissement.`,
    ]);
    note.addRow([
      `Colonne « ${entityCol} » obligatoire. Plusieurs lignes avec le même nom → une seule fiche, contacts fusionnés.`,
    ]);
    note.addRow([
      `Colonnes reconnues : ${entityCol} / Établissement / Prestataire, Ville, Prénom, Nom, Email, Rôle / Poste, Téléphone, LinkedIn.`,
    ]);
    note.addRow(["Supprime les lignes d’exemple avant d’importer ton fichier."]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `modele-import-${categorie.toLowerCase()}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    console.error("GET /api/prestataires/modele-import:", error);
    return NextResponse.json({ error: "Erreur génération modèle" }, { status: 500 });
  }
}
