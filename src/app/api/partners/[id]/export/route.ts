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
    
    // Titre principal
    talentsSheet.mergeCells("A1:J1");
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

    // En-têtes de colonnes
    talentsSheet.columns = [
      { header: "Prénom", key: "prenom", width: 18 },
      { header: "Nom", key: "nom", width: 18 },
      { header: "Handle IG", key: "handleIg", width: 22 },
      { header: "Handle TT", key: "handleTt", width: 22 },
      { header: "Niches", key: "niches", width: 35 },
      { header: "IG Abonnés", key: "igFollowers", width: 16 },
      { header: "IG Engagement %", key: "igEngagement", width: 18 },
      { header: "TT Abonnés", key: "ttFollowers", width: 16 },
      { header: "TT Engagement %", key: "ttEngagement", width: 18 },
      { header: "Bio", key: "bio", width: 60 },
    ];

    const headerRow = talentsSheet.getRow(2);
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
      const row = talentsSheet.addRow({
        prenom: talent.prenom,
        nom: talent.nom,
        handleIg: talent.instagram?.replace("@", "") || "",
        handleTt: talent.tiktok?.replace("@", "") || "",
        niches: (talent.niches || []).join(", "),
        igFollowers: talent.stats?.igFollowers || "",
        igEngagement: talent.stats?.igEngagement
          ? `${Number(talent.stats.igEngagement).toFixed(2)}%`
          : "",
        ttFollowers: talent.stats?.ttFollowers || "",
        ttEngagement: talent.stats?.ttEngagement
          ? `${Number(talent.stats.ttEngagement).toFixed(2)}%`
          : "",
        bio: talent.presentation || "",
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
    
    // Titre principal
    tarifsSheet.mergeCells("A1:J1");
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

    tarifsSheet.columns = [
      { header: "Prénom", key: "prenom", width: 18 },
      { header: "Nom", key: "nom", width: 18 },
      { header: "Story IG", key: "storyIg", width: 16 },
      { header: "Post IG", key: "postIg", width: 16 },
      { header: "Reel IG", key: "reelIg", width: 16 },
      { header: "TikTok", key: "tiktok", width: 16 },
      { header: "YouTube", key: "youtube", width: 16 },
      { header: "Shooting", key: "shooting", width: 16 },
      { header: "Event", key: "event", width: 16 },
      { header: "Ambassadeur", key: "ambassadeur", width: 18 },
    ];

    const tarifsHeaderRow = tarifsSheet.getRow(2);
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
            tarifStory: ov.tarifStory !== null && ov.tarifStory !== undefined
              ? Number(ov.tarifStory)
              : defaultTarifs.tarifStory ? Number(defaultTarifs.tarifStory) : null,
            tarifPost: ov.tarifPost !== null && ov.tarifPost !== undefined
              ? Number(ov.tarifPost)
              : defaultTarifs.tarifPost ? Number(defaultTarifs.tarifPost) : null,
            tarifReel: ov.tarifReel !== null && ov.tarifReel !== undefined
              ? Number(ov.tarifReel)
              : defaultTarifs.tarifReel ? Number(defaultTarifs.tarifReel) : null,
            tarifTiktokVideo: ov.tarifTiktokVideo !== null && ov.tarifTiktokVideo !== undefined
              ? Number(ov.tarifTiktokVideo)
              : defaultTarifs.tarifTiktokVideo ? Number(defaultTarifs.tarifTiktokVideo) : null,
            tarifYoutubeVideo: ov.tarifYoutubeVideo !== null && ov.tarifYoutubeVideo !== undefined
              ? Number(ov.tarifYoutubeVideo)
              : defaultTarifs.tarifYoutubeVideo ? Number(defaultTarifs.tarifYoutubeVideo) : null,
            tarifShooting: ov.tarifShooting !== null && ov.tarifShooting !== undefined
              ? Number(ov.tarifShooting)
              : defaultTarifs.tarifShooting ? Number(defaultTarifs.tarifShooting) : null,
            tarifEvent: ov.tarifEvent !== null && ov.tarifEvent !== undefined
              ? Number(ov.tarifEvent)
              : defaultTarifs.tarifEvent ? Number(defaultTarifs.tarifEvent) : null,
            tarifAmbassadeur: ov.tarifAmbassadeur !== null && ov.tarifAmbassadeur !== undefined
              ? Number(ov.tarifAmbassadeur)
              : defaultTarifs.tarifAmbassadeur ? Number(defaultTarifs.tarifAmbassadeur) : null,
          }
        : defaultTarifs
          ? {
              tarifStory: defaultTarifs.tarifStory ? Number(defaultTarifs.tarifStory) : null,
              tarifPost: defaultTarifs.tarifPost ? Number(defaultTarifs.tarifPost) : null,
              tarifReel: defaultTarifs.tarifReel ? Number(defaultTarifs.tarifReel) : null,
              tarifTiktokVideo: defaultTarifs.tarifTiktokVideo ? Number(defaultTarifs.tarifTiktokVideo) : null,
              tarifYoutubeVideo: defaultTarifs.tarifYoutubeVideo ? Number(defaultTarifs.tarifYoutubeVideo) : null,
              tarifShooting: defaultTarifs.tarifShooting ? Number(defaultTarifs.tarifShooting) : null,
              tarifEvent: defaultTarifs.tarifEvent ? Number(defaultTarifs.tarifEvent) : null,
              tarifAmbassadeur: defaultTarifs.tarifAmbassadeur ? Number(defaultTarifs.tarifAmbassadeur) : null,
            }
          : null;

      const row = tarifsSheet.addRow({
        prenom: talent.prenom,
        nom: talent.nom,
        storyIg: mergedTarifs?.tarifStory
          ? `${mergedTarifs.tarifStory.toFixed(2)} €`
          : "",
        postIg: mergedTarifs?.tarifPost
          ? `${mergedTarifs.tarifPost.toFixed(2)} €`
          : "",
        reelIg: mergedTarifs?.tarifReel
          ? `${mergedTarifs.tarifReel.toFixed(2)} €`
          : "",
        tiktok: mergedTarifs?.tarifTiktokVideo
          ? `${mergedTarifs.tarifTiktokVideo.toFixed(2)} €`
          : "",
        youtube: mergedTarifs?.tarifYoutubeVideo
          ? `${mergedTarifs.tarifYoutubeVideo.toFixed(2)} €`
          : "",
        shooting: mergedTarifs?.tarifShooting
          ? `${mergedTarifs.tarifShooting.toFixed(2)} €`
          : "",
        event: mergedTarifs?.tarifEvent
          ? `${mergedTarifs.tarifEvent.toFixed(2)} €`
          : "",
        ambassadeur: mergedTarifs?.tarifAmbassadeur
          ? `${mergedTarifs.tarifAmbassadeur.toFixed(2)} €`
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
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      
      // Mise en forme spéciale pour les tarifs (en gras et couleur)
      ["storyIg", "postIg", "reelIg", "tiktok", "youtube", "shooting", "event", "ambassadeur"].forEach((key) => {
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
