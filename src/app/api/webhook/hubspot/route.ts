import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Client } from "@hubspot/api-client";

/**
 * Webhook HubSpot
 * 
 * Écoute les events HubSpot pour:
 * - Trigger la génération de press kit quand un contact est ajouté à une liste
 * - Mettre à jour le champ press_kit_url sur la fiche company
 */

export async function POST(request: NextRequest) {
  try {
    const events = await request.json();

    if (!Array.isArray(events)) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    const hubspotClient = process.env.HUBSPOT_API_KEY
      ? new Client({ accessToken: process.env.HUBSPOT_API_KEY })
      : null;

    for (const event of events) {
      // Event type: company added to list
      if (event.subscriptionType === 'company.creation' || event.subscriptionType === 'contact.creation') {
        const companyId = event.objectId;

        if (!hubspotClient) {
          console.warn('HubSpot API key not configured');
          continue;
        }

        try {
          // Récupérer les infos de la company depuis HubSpot
          const company = await hubspotClient.crm.companies.basicApi.getById(companyId);
          const properties = company.properties;

          const brandData = {
            hubspotId: companyId,
            name: properties.name || 'Unknown',
            domain: properties.domain || properties.website || '',
            niche: properties.industry || properties.type || 'general',
            description: properties.description || '',
          };

          // Vérifier si le press kit existe déjà
          const existingBrand = await prisma.brand.findFirst({
            where: {
              hubspotId: companyId,
            },
          });

          if (!existingBrand) {
            // Créer un batch pour cette marque
            const batch = await prisma.batch.create({
              data: {
                name: `Webhook - ${brandData.name}`,
                totalBrands: 1,
                status: 'processing',
              },
            });

            // Trigger la génération via l'API generate-batch
            fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/presskit/generate-batch`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                brands: [brandData],
                batchName: batch.name,
              }),
            }).catch(err => {
              console.error('Error triggering batch generation:', err);
            });
          }
        } catch (error) {
          console.error(`Error processing company ${companyId}:`, error);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
