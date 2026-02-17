import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/track
 * Enregistre les événements de tracking pour les press kits
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, slug, sessionId, hubspotContactId, data } = body;

    if (!event || !slug || !sessionId) {
      return NextResponse.json(
        { message: "Paramètres manquants" },
        { status: 400 }
      );
    }

    // Récupérer la marque
    const brand = await prisma.brand.findUnique({
      where: { slug },
    });

    if (!brand) {
      return NextResponse.json(
        { message: "Marque introuvable" },
        { status: 404 }
      );
    }

    // Traiter l'événement selon le type
    switch (event) {
      case "view":
        // Vérifier si une session existe déjà pour ce sessionId
        const existingSession = await prisma.pageView.findFirst({
          where: {
            brandId: brand.id,
            sessionId,
          },
        });

        if (!existingSession) {
          // Compter les visites précédentes de ce contact
          const visitNumber = hubspotContactId
            ? await prisma.pageView.count({
                where: {
                  brandId: brand.id,
                  hubspotContactId,
                },
              }) + 1
            : 1;

          // Créer une nouvelle session
          await prisma.pageView.create({
            data: {
              brandId: brand.id,
              hubspotContactId,
              sessionId,
              visitNumber,
              durationSeconds: 0,
              scrollDepthPercent: 0,
              talentsViewed: [],
              ctaClicked: false,
            },
          });

          console.log(`📊 Nouvelle visite enregistrée: ${brand.name} (session ${sessionId})`);
        }
        break;

      case "session_end":
        // Mettre à jour la session avec les données finales
        await prisma.pageView.updateMany({
          where: {
            brandId: brand.id,
            sessionId,
          },
          data: {
            durationSeconds: data?.durationSeconds || 0,
            scrollDepthPercent: data?.scrollDepthPercent || 0,
            talentsViewed: data?.talentsViewed || [],
          },
        });

        console.log(`📊 Session terminée: ${brand.name} — ${data?.durationSeconds}s, scroll ${data?.scrollDepthPercent}%`);
        break;

      case "cta_click":
        // Marquer le CTA comme cliqué
        await prisma.pageView.updateMany({
          where: {
            brandId: brand.id,
            sessionId,
          },
          data: {
            ctaClicked: true,
          },
        });

        console.log(`📊 CTA cliqué: ${brand.name}`);
        break;

      case "talentbook_click":
        // Marquer le clic sur le lien Talent Book
        await prisma.pageView.updateMany({
          where: {
            brandId: brand.id,
            sessionId,
          },
          data: {
            talentbookClicked: true,
          },
        });

        console.log(`📊 Talent Book cliqué: ${brand.name}`);
        break;

      case "talent_click":
        // Talent modal ouvert (juste un log, on ne stocke pas en base pour l'instant)
        console.log(`📊 Talent cliqué: ${brand.name} - Talent ${data?.talentId}`);
        break;

      case "talent_modal_duration":
        // Stocker la durée passée sur ce talent spécifique
        const pageView = await prisma.pageView.findFirst({
          where: {
            brandId: brand.id,
            sessionId,
          },
        });

        if (pageView && data?.talentId && data?.durationSeconds) {
          // Récupérer les durées existantes
          const existingDurations = (pageView.talentDurations as Record<string, number>) || {};
          
          // Ajouter ou mettre à jour la durée pour ce talent
          existingDurations[data.talentId] = 
            (existingDurations[data.talentId] || 0) + data.durationSeconds;

          // Sauvegarder en base
          await prisma.pageView.update({
            where: { id: pageView.id },
            data: {
              talentDurations: existingDurations,
            },
          });

          console.log(`📊 Durée modal talent stockée: ${brand.name} - Talent ${data.talentId} - ${data.durationSeconds}s`);
        }
        break;

      case "scroll_complete":
        // Utilisateur a scrollé jusqu'en bas (juste un log pour l'instant)
        console.log(`📊 Scroll complet: ${brand.name}`);
        break;

      default:
        return NextResponse.json(
          { message: "Type d'événement invalide" },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur tracking:", error);
    return NextResponse.json(
      { message: "Erreur lors de l'enregistrement" },
      { status: 500 }
    );
  }
}
