import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";

// Route publique: GET /api/partners/[id]/export
// ATTENTION: le paramètre "id" est en réalité le slug du partenaire.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const slug = id;

    const partner = await prisma.partner.findFirst({
      where: {
        slug,
        isActive: true,
      },
    });

    if (!partner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ⚠️ TOUJOURS afficher TOUS les talents (le champ actif n'existe pas dans le modèle Talent)
    const talentsList = await prisma.talent.findMany({
      include: { stats: true, tarifs: true },
      orderBy: { prenom: "asc" },
    });

    // Récupérer les tarifs négociés pour ce partenaire
    const overrides = await prisma.partnerTarifOverride.findMany({
      where: { partnerId: partner.id },
    });
    const overrideMap = new Map(overrides.map((o) => [o.talentId, o]));

    // Créer le workbook Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Glow Up Agence";
    workbook.created = new Date();

    // Feuille 1 : Talents
    const talentsSheet = workbook.addWorksheet("Talents");
    
    // Titre principal (ligne 1)
    talentsSheet.mergeCells("A1:I1");
    const titleRow = talentsSheet.getRow(1);
    titleRow.height = 30;
    titleRow.getCell(1).value = "TALENTS";
    titleRow.getCell(1).font = { 
      name: "Arial", 
      size: 16, 
      bold: true, 
      color: { argb: "FFFFFFFF" } 
    };
    titleRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF220101" },
    };
    titleRow.getCell(1).alignment = { 
      vertical: "middle", 
      horizontal: "center" 
    };

    // En-têtes écrits en ligne 2 (sinon écrasés par le titre)
    const talentsHeaders = [
      "Prénom",
      "Nom",
      "Handle IG",
      "Handle TT",
      "Niches",
      "IG Abonnés",
      "IG Engagement %",
      "TT Abonnés",
      "TT Engagement %",
    ];
    talentsSheet.columns = [
      { key: "prenom", width: 18 },
      { key: "nom", width: 18 },
      { key: "handleIg", width: 22 },
      { key: "handleTt", width: 22 },
      { key: "niches", width: 35 },
      { key: "igFollowers", width: 16 },
      { key: "igEngagement", width: 18 },
      { key: "ttFollowers", width: 16 },
      { key: "ttEngagement", width: 18 },
    ];

    const headerRow = talentsSheet.getRow(2);
    talentsHeaders.forEach((text, i) => {
      headerRow.getCell(i + 1).value = text;
    });
    headerRow.height = 25;
    headerRow.font = { 
      name: "Arial", 
      size: 11, 
      bold: true, 
      color: { argb: "FFFFFFFF" } 
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB06F70" },
    };
    headerRow.alignment = { 
      vertical: "middle", 
      horizontal: "center" 
    };
    
    // Bordures pour les en-têtes
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF220101" } },
        left: { style: "thin", color: { argb: "FF220101" } },
        bottom: { style: "thin", color: { argb: "FF220101" } },
        right: { style: "thin", color: { argb: "FF220101" } },
      };
    });

    talentsList.forEach((talent, index) => {
      const handleIg = talent.instagram?.replace("@", "") || "";
      const handleTt = talent.tiktok?.replace("@", "") || "";
      const row = talentsSheet.addRow({
        prenom: talent.prenom,
        nom: talent.nom,
        handleIg,
        handleTt,
        niches: (talent.niches || []).join(", "),
        igFollowers: talent.stats?.igFollowers || "",
        igEngagement: talent.stats?.igEngagement
          ? `${Number(talent.stats.igEngagement).toFixed(2)}%`
          : "",
        ttFollowers: talent.stats?.ttFollowers || "",
        ttEngagement: talent.stats?.ttEngagement
          ? `${Number(talent.stats.ttEngagement).toFixed(2)}%`
          : "",
      });

      // Style alterné pour les lignes
      const isEven = index % 2 === 0;
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFF5EDE0" : "FFFFFFFF" },
      };
      
      // Bordures pour toutes les cellules
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE0E0E0" } },
          left: { style: "thin", color: { argb: "FFE0E0E0" } },
          bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
          right: { style: "thin", color: { argb: "FFE0E0E0" } },
        };
        cell.font = { name: "Arial", size: 10 };
        cell.alignment = { vertical: "middle", wrapText: true };
      });

      // Liens cliquables Instagram et TikTok (après eachCell pour garder le style)
      if (handleIg) {
        const cellIg = row.getCell("handleIg");
        cellIg.value = { text: handleIg, hyperlink: `https://instagram.com/${handleIg}` };
        cellIg.font = { name: "Arial", size: 10, color: { argb: "FFE4405F" }, underline: true };
      }
      if (handleTt) {
        const cellTt = row.getCell("handleTt");
        cellTt.value = { text: handleTt, hyperlink: `https://tiktok.com/@${handleTt}` };
        cellTt.font = { name: "Arial", size: 10, color: { argb: "FF000000" }, underline: true };
      }
      
      // Mise en forme spéciale pour les nombres
      if (talent.stats?.igFollowers) {
        row.getCell("igFollowers").numFmt = "#,##0";
        row.getCell("igFollowers").font = { name: "Arial", size: 10, bold: true, color: { argb: "FFB06F70" } };
      }
      if (talent.stats?.ttFollowers) {
        row.getCell("ttFollowers").numFmt = "#,##0";
        row.getCell("ttFollowers").font = { name: "Arial", size: 10, bold: true, color: { argb: "FF220101" } };
      }
      if (talent.stats?.igEngagement) {
        row.getCell("igEngagement").font = { name: "Arial", size: 10, bold: true, color: { argb: "FFE91E63" } };
      }
      if (talent.stats?.ttEngagement) {
        row.getCell("ttEngagement").font = { name: "Arial", size: 10, bold: true, color: { argb: "FF000000" } };
      }
      
      row.height = 20;
    });

    // Feuille 2 : Tarifs
    const tarifsSheet = workbook.addWorksheet("Tarifs");
    
    // Titre principal (ligne 1) — ne pas écraser les en-têtes
    tarifsSheet.mergeCells("A1:N1");
    const tarifsTitleRow = tarifsSheet.getRow(1);
    tarifsTitleRow.height = 30;
    tarifsTitleRow.getCell(1).value = "Nos tarifs";
    tarifsTitleRow.getCell(1).font = { 
      name: "Arial", 
      size: 16, 
      bold: true, 
      color: { argb: "FFFFFFFF" } 
    };
    tarifsTitleRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF220101" },
    };
    tarifsTitleRow.getCell(1).alignment = { 
      vertical: "middle", 
      horizontal: "center" 
    };

    // Colonnes avec clés uniquement (en-têtes écrits manuellement en ligne 2)
    const tarifsHeaders = [
      "Prénom",
      "Nom",
      "Story Instagram",
      "Post Instagram",
      "Reel Instagram",
      "Story Concours",
      "Post Concours",
      "Post Commun (UGC)",
      "Vidéo TikTok",
      "Vidéo YouTube",
      "YouTube Short",
      "Shooting photo",
      "Event / Apparition",
      "Ambassadeur",
    ];
    tarifsSheet.columns = [
      { key: "prenom", width: 18 },
      { key: "nom", width: 18 },
      { key: "storyIg", width: 18 },
      { key: "postIg", width: 18 },
      { key: "reelIg", width: 18 },
      { key: "storyConcours", width: 18 },
      { key: "postConcours", width: 18 },
      { key: "postCommun", width: 18 },
      { key: "tiktok", width: 18 },
      { key: "youtube", width: 18 },
      { key: "youtubeShort", width: 18 },
      { key: "shooting", width: 18 },
      { key: "event", width: 20 },
      { key: "ambassadeur", width: 18 },
    ];

    // Ligne 2 : en-têtes avec noms des livrables (sinon écrasés par le titre)
    const tarifsHeaderRow = tarifsSheet.getRow(2);
    tarifsHeaders.forEach((text, i) => {
      tarifsHeaderRow.getCell(i + 1).value = text;
    });
    tarifsHeaderRow.height = 25;
    tarifsHeaderRow.font = { 
      name: "Arial", 
      size: 11, 
      bold: true, 
      color: { argb: "FFFFFFFF" } 
    };
    tarifsHeaderRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB06F70" },
    };
    tarifsHeaderRow.alignment = { 
      vertical: "middle", 
      horizontal: "center" 
    };
    
    // Bordures pour les en-têtes
    tarifsHeaderRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF220101" } },
        left: { style: "thin", color: { argb: "FF220101" } },
        bottom: { style: "thin", color: { argb: "FF220101" } },
        right: { style: "thin", color: { argb: "FF220101" } },
      };
    });

    talentsList.forEach((talent, index) => {
      const ov = overrideMap.get(talent.id);
      const defaultTarifs = talent.tarifs;
      
      // Merger avec les overrides si ils existent
      const mergedTarifs = ov && defaultTarifs
        ? {
            tarifStory: ov.tarifStory !== null && ov.tarifStory !== undefined ? Number(ov.tarifStory) : defaultTarifs.tarifStory ? Number(defaultTarifs.tarifStory) : null,
            tarifPost: ov.tarifPost !== null && ov.tarifPost !== undefined ? Number(ov.tarifPost) : defaultTarifs.tarifPost ? Number(defaultTarifs.tarifPost) : null,
            tarifReel: ov.tarifReel !== null && ov.tarifReel !== undefined ? Number(ov.tarifReel) : defaultTarifs.tarifReel ? Number(defaultTarifs.tarifReel) : null,
            tarifStoryConcours: ov.tarifStoryConcours !== null && ov.tarifStoryConcours !== undefined ? Number(ov.tarifStoryConcours) : defaultTarifs.tarifStoryConcours ? Number(defaultTarifs.tarifStoryConcours) : null,
            tarifPostConcours: ov.tarifPostConcours !== null && ov.tarifPostConcours !== undefined ? Number(ov.tarifPostConcours) : defaultTarifs.tarifPostConcours ? Number(defaultTarifs.tarifPostConcours) : null,
            tarifPostCommun: ov.tarifPostCommun !== null && ov.tarifPostCommun !== undefined ? Number(ov.tarifPostCommun) : defaultTarifs.tarifPostCommun ? Number(defaultTarifs.tarifPostCommun) : null,
            tarifTiktokVideo: ov.tarifTiktokVideo !== null && ov.tarifTiktokVideo !== undefined ? Number(ov.tarifTiktokVideo) : defaultTarifs.tarifTiktokVideo ? Number(defaultTarifs.tarifTiktokVideo) : null,
            tarifYoutubeVideo: ov.tarifYoutubeVideo !== null && ov.tarifYoutubeVideo !== undefined ? Number(ov.tarifYoutubeVideo) : defaultTarifs.tarifYoutubeVideo ? Number(defaultTarifs.tarifYoutubeVideo) : null,
            tarifYoutubeShort: ov.tarifYoutubeShort !== null && ov.tarifYoutubeShort !== undefined ? Number(ov.tarifYoutubeShort) : defaultTarifs.tarifYoutubeShort ? Number(defaultTarifs.tarifYoutubeShort) : null,
            tarifShooting: ov.tarifShooting !== null && ov.tarifShooting !== undefined ? Number(ov.tarifShooting) : defaultTarifs.tarifShooting ? Number(defaultTarifs.tarifShooting) : null,
            tarifEvent: ov.tarifEvent !== null && ov.tarifEvent !== undefined ? Number(ov.tarifEvent) : defaultTarifs.tarifEvent ? Number(defaultTarifs.tarifEvent) : null,
            tarifAmbassadeur: ov.tarifAmbassadeur !== null && ov.tarifAmbassadeur !== undefined ? Number(ov.tarifAmbassadeur) : defaultTarifs.tarifAmbassadeur ? Number(defaultTarifs.tarifAmbassadeur) : null,
          }
        : defaultTarifs
          ? {
              tarifStory: defaultTarifs.tarifStory ? Number(defaultTarifs.tarifStory) : null,
              tarifPost: defaultTarifs.tarifPost ? Number(defaultTarifs.tarifPost) : null,
              tarifReel: defaultTarifs.tarifReel ? Number(defaultTarifs.tarifReel) : null,
              tarifStoryConcours: defaultTarifs.tarifStoryConcours ? Number(defaultTarifs.tarifStoryConcours) : null,
              tarifPostConcours: defaultTarifs.tarifPostConcours ? Number(defaultTarifs.tarifPostConcours) : null,
              tarifPostCommun: defaultTarifs.tarifPostCommun ? Number(defaultTarifs.tarifPostCommun) : null,
              tarifTiktokVideo: defaultTarifs.tarifTiktokVideo ? Number(defaultTarifs.tarifTiktokVideo) : null,
              tarifYoutubeVideo: defaultTarifs.tarifYoutubeVideo ? Number(defaultTarifs.tarifYoutubeVideo) : null,
              tarifYoutubeShort: defaultTarifs.tarifYoutubeShort ? Number(defaultTarifs.tarifYoutubeShort) : null,
              tarifShooting: defaultTarifs.tarifShooting ? Number(defaultTarifs.tarifShooting) : null,
              tarifEvent: defaultTarifs.tarifEvent ? Number(defaultTarifs.tarifEvent) : null,
              tarifAmbassadeur: defaultTarifs.tarifAmbassadeur ? Number(defaultTarifs.tarifAmbassadeur) : null,
            }
          : null;

      const row = tarifsSheet.addRow({
        prenom: talent.prenom,
        nom: talent.nom,
        storyIg: mergedTarifs?.tarifStory ? `${mergedTarifs.tarifStory.toFixed(2)} €` : "",
        postIg: mergedTarifs?.tarifPost ? `${mergedTarifs.tarifPost.toFixed(2)} €` : "",
        reelIg: mergedTarifs?.tarifReel ? `${mergedTarifs.tarifReel.toFixed(2)} €` : "",
        storyConcours: mergedTarifs?.tarifStoryConcours ? `${mergedTarifs.tarifStoryConcours.toFixed(2)} €` : "",
        postConcours: mergedTarifs?.tarifPostConcours ? `${mergedTarifs.tarifPostConcours.toFixed(2)} €` : "",
        postCommun: mergedTarifs?.tarifPostCommun ? `${mergedTarifs.tarifPostCommun.toFixed(2)} €` : "",
        tiktok: mergedTarifs?.tarifTiktokVideo ? `${mergedTarifs.tarifTiktokVideo.toFixed(2)} €` : "",
        youtube: mergedTarifs?.tarifYoutubeVideo ? `${mergedTarifs.tarifYoutubeVideo.toFixed(2)} €` : "",
        youtubeShort: mergedTarifs?.tarifYoutubeShort ? `${mergedTarifs.tarifYoutubeShort.toFixed(2)} €` : "",
        shooting: mergedTarifs?.tarifShooting ? `${mergedTarifs.tarifShooting.toFixed(2)} €` : "",
        event: mergedTarifs?.tarifEvent ? `${mergedTarifs.tarifEvent.toFixed(2)} €` : "",
        ambassadeur: mergedTarifs?.tarifAmbassadeur ? `${mergedTarifs.tarifAmbassadeur.toFixed(2)} €` : "",
      });
      
      // Style alterné pour les lignes
      const isEven = index % 2 === 0;
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFF5EDE0" : "FFFFFFFF" },
      };
      
      // Bordures pour toutes les cellules
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE0E0E0" } },
          left: { style: "thin", color: { argb: "FFE0E0E0" } },
          bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
          right: { style: "thin", color: { argb: "FFE0E0E0" } },
        };
        cell.font = { name: "Arial", size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      
      // Mise en forme spéciale pour les tarifs (en gras et couleur)
      ["storyIg", "postIg", "reelIg", "storyConcours", "postConcours", "postCommun", "tiktok", "youtube", "youtubeShort", "shooting", "event", "ambassadeur"].forEach((key) => {
        const cell = row.getCell(key);
        if (cell.value && cell.value !== "") {
          cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFB06F70" } };
        }
      });
      
      row.height = 20;
    });

    // Générer le buffer Excel
    const buffer = await workbook.xlsx.writeBuffer();

    // Retourner le fichier
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="GlowUp_Talents_${partner.name.replace(/[^a-z0-9]/gi, "_")}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Erreur GET /api/partners/[id]/export:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'export Excel" },
      { status: 500 }
    );
  }
}
