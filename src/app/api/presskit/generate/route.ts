import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchBrandData } from "@/lib/brandfetch";
import { updateContactPresskitUrl } from "@/lib/hubspot";
import { formatBlocTalents } from "@/lib/presskit-bloc";

type InputBrand = {
  companyName: string;
  domain?: string | null;
  talentIds?: string[];
  contacts?: Array<{ hubspotContactId: string; email?: string }>;
};

const STATUS = {
  PENDING: "PENDING",
  BRAND_READY: "BRAND_READY",
  TALENTS_READY: "TALENTS_READY",
  BLOC_READY: "BLOC_READY",
  HUBSPOT_READY: "HUBSPOT_READY",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function upsertBatchBrand(args: {
  batchId: string;
  brandId: string;
  status: string;
  talentIds?: string[];
  hubspotContactIds?: string[];
  error?: string | null;
}) {
  const { batchId, brandId, status, talentIds = [], hubspotContactIds = [], error = null } = args;
  await prisma.batchBrand.upsert({
    where: {
      batchId_brandId: { batchId, brandId },
    },
    update: {
      status,
      talentIds,
      hubspotContactIds,
      error,
    },
    create: {
      batchId,
      brandId,
      status,
      talentIds,
      hubspotContactIds,
      error,
    },
  });
}

async function processBrandForBatch(batchId: string, brandData: InputBrand) {
  const companyName = String(brandData.companyName || "").trim();
  const slug = toSlug(companyName);
  const talentIds = Array.isArray(brandData.talentIds) ? brandData.talentIds : [];
  const contacts = Array.isArray(brandData.contacts) ? brandData.contacts : [];
  const contactIds = contacts.map((c) => c.hubspotContactId).filter(Boolean);

  if (!companyName || !slug) {
    throw new Error("Marque invalide (nom ou slug manquant)");
  }

  // 1) Brand upsert
  let brandfetchData = {
    name: null as string | null,
    logo: null as string | null,
    primaryColor: null as string | null,
    secondaryColor: null as string | null,
    description: null as string | null,
  };
  if (brandData.domain && brandData.domain.trim() !== "") {
    brandfetchData = await fetchBrandData(brandData.domain);
  }
  const brandName =
    companyName ||
    brandData.domain
      ?.replace(/^www\./, "")
      ?.replace(/\.(com|fr|net|org)$/, "")
      ?.replace(/-/g, " ")
      ?.split(" ")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") ||
    "Marque";

  const brand = await prisma.brand.upsert({
    where: { slug },
    update: {
      name: brandName,
      domain: brandData.domain || null,
      logo: brandfetchData.logo,
      primaryColor: brandfetchData.primaryColor,
      secondaryColor: brandfetchData.secondaryColor,
      description: brandfetchData.description || "Marque",
    },
    create: {
      name: brandName,
      slug,
      domain: brandData.domain || null,
      niche: "Press Kit",
      logo: brandfetchData.logo,
      primaryColor: brandfetchData.primaryColor,
      secondaryColor: brandfetchData.secondaryColor,
      description: brandfetchData.description || "Marque",
    },
  });

  await upsertBatchBrand({
    batchId,
    brandId: brand.id,
    status: STATUS.BRAND_READY,
    talentIds,
    hubspotContactIds: contactIds,
  });

  // 2) Talents
  if (talentIds.length === 0) {
    throw new Error("Aucun talent sélectionné");
  }
  const talents = await prisma.talent.findMany({
    where: { id: { in: talentIds }, isArchived: false },
    include: { stats: true },
  });
  const keptIds: string[] = [];
  const existingPresskits = await prisma.pressKitTalent.findMany({
    where: { brandId: brand.id },
  });
  const existingByTalentId = new Map(existingPresskits.map((pkt) => [pkt.talentId, pkt]));
  for (let order = 0; order < talents.length; order++) {
    const talent = talents[order];
    const existing = existingByTalentId.get(talent.id);
    if (existing) {
      const updated = await prisma.pressKitTalent.update({
        where: { id: existing.id },
        data: { order },
      });
      keptIds.push(updated.id);
    } else {
      const created = await prisma.pressKitTalent.create({
        data: {
          brandId: brand.id,
          talentId: talent.id,
          pitch: "",
          order,
        },
      });
      keptIds.push(created.id);
    }
  }
  await prisma.pressKitTalent.deleteMany({
    where: {
      brandId: brand.id,
      id: { notIn: keptIds },
    },
  });
  await upsertBatchBrand({
    batchId,
    brandId: brand.id,
    status: STATUS.TALENTS_READY,
    talentIds,
    hubspotContactIds: contactIds,
  });

  // 3) Bloc talents
  const brandWithTalents = await prisma.brand.findUnique({
    where: { id: brand.id },
    include: {
      presskitTalents: {
        orderBy: { order: "asc" },
        include: { talent: { include: { stats: true } } },
      },
    },
  });
  const blocTalents =
    brandWithTalents?.presskitTalents?.length
      ? formatBlocTalents(
          brandWithTalents.presskitTalents.map((pkt) => {
            const t = pkt.talent;
            const s = t.stats;
            return {
              prenom: t.prenom,
              pitch: pkt.pitch || "",
              instagramHandle: t.instagram?.replace(/^@/, "").trim() || null,
              igFollowers: s?.igFollowers ?? 0,
              ttFollowers: s?.ttFollowers ?? 0,
              ytAbonnes: s?.ytAbonnes ?? 0,
            };
          }),
          "html"
        )
      : undefined;

  await upsertBatchBrand({
    batchId,
    brandId: brand.id,
    status: STATUS.BLOC_READY,
    talentIds,
    hubspotContactIds: contactIds,
  });

  // 4) HubSpot contacts update
  for (const contact of contacts) {
    const presskitUrl = `https://app.glowupagence.fr/book/${slug}?cid=${contact.hubspotContactId}`;
    await updateContactPresskitUrl(
      contact.hubspotContactId,
      presskitUrl,
      blocTalents ?? undefined
    );
  }

  await upsertBatchBrand({
    batchId,
    brandId: brand.id,
    status: STATUS.COMPLETED,
    talentIds,
    hubspotContactIds: contactIds,
    error: null,
  });

  return { brandId: brand.id, companyName, contactsUpdated: contactIds.length };
}

/**
 * POST /api/presskit/generate
 * Génère les press kits pour un batch de marques
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const body = await request.json();
    const { batchName, brands, batchId: retryBatchId } = body as {
      batchName?: string;
      brands?: InputBrand[];
      batchId?: string;
    };

    if (!retryBatchId && (!batchName || !brands || !Array.isArray(brands))) {
      return NextResponse.json(
        { message: "Paramètres invalides" },
        { status: 400 }
      );
    }

    let batch:
      | { id: string; name: string; totalBrands: number }
      | null = null;
    let brandsToProcess: InputBrand[] = [];

    if (retryBatchId) {
      const existingBatch = await prisma.batch.findUnique({
        where: { id: retryBatchId },
        include: {
          brands: {
            where: { status: { not: STATUS.COMPLETED } },
            include: { brand: true },
          },
        },
      });
      if (!existingBatch) {
        return NextResponse.json({ message: "Batch introuvable" }, { status: 404 });
      }
      batch = {
        id: existingBatch.id,
        name: existingBatch.name,
        totalBrands: existingBatch.totalBrands,
      };
      brandsToProcess = existingBatch.brands.map((bb) => ({
        companyName: bb.brand.name,
        domain: bb.brand.domain,
        talentIds: bb.talentIds || [],
        contacts: (bb.hubspotContactIds || []).map((id) => ({
          hubspotContactId: id,
        })),
      }));
      await prisma.batch.update({
        where: { id: batch.id },
        data: {
          status: "processing",
        },
      });
      console.log(
        `\n🔁 Reprise batch ${batch.id}: ${brandsToProcess.length} marques restantes\n`
      );
    } else {
      const safeBrands = brands || [];
      console.log(
        `\n🚀 Démarrage génération batch: ${batchName} (${safeBrands.length} marques)\n`
      );
      const created = await prisma.batch.create({
        data: {
          name: String(batchName),
          status: "processing",
          totalBrands: safeBrands.length,
        },
      });
      batch = { id: created.id, name: created.name, totalBrands: created.totalBrands };
      brandsToProcess = safeBrands;
      console.log(`✅ Batch créé: ${batch.id}\n`);
    }

    // Traiter les marques par paquets de 5 en parallèle (rate limits)
    const batchSize = 5;
    let completed = 0;
    let failed = 0;
    const failedBrands: string[] = [];

    for (let i = 0; i < brandsToProcess.length; i += batchSize) {
      const chunk = brandsToProcess.slice(i, i + batchSize);

      await Promise.all(
        chunk.map(async (brandData) => {
          try {
            console.log(`\n🏢 Traitement: ${brandData.companyName}`);
            await processBrandForBatch(batch.id, brandData);

            completed++;
            console.log(
              `  ✅ ${brandData.companyName} terminé (${completed}/${brandsToProcess.length})\n`
            );
          } catch (error) {
            failed++;
            console.error(`  ❌ Erreur pour ${brandData.companyName}:`, error);
            if (brandData.companyName) {
              failedBrands.push(String(brandData.companyName));
            }
            try {
              const slug = toSlug(String(brandData.companyName || ""));
              const brand = await prisma.brand.findUnique({
                where: { slug },
              });
              if (brand) {
                const contactIds =
                  Array.isArray(brandData.contacts)
                    ? brandData.contacts.map((c) => c.hubspotContactId).filter(Boolean)
                    : [];
                await upsertBatchBrand({
                  batchId: batch.id,
                  brandId: brand.id,
                  status: STATUS.FAILED,
                  error: error instanceof Error ? error.message : "Erreur inconnue",
                  hubspotContactIds: contactIds,
                  talentIds: brandData.talentIds || [],
                });
              }
            } catch (e) {
              console.error(`  ❌ Impossible de créer BatchBrand pour l'erreur:`, e);
            }
          }
        })
      );
    }

    // Mettre à jour le batch final
    await prisma.batch.update({
      where: { id: batch.id },
      data: {
        status: failed > 0 ? "partial" : "completed",
        completed: {
          increment: completed,
        },
        failed: {
          increment: failed,
        },
      },
    });

    console.log(`\n✅ Batch terminé: ${completed} réussies, ${failed} échouées\n`);

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      total: brandsToProcess.length,
      completed,
      failed,
      failedBrands,
    });
  } catch (error) {
    console.error("❌ Erreur génération batch:", error);
    return NextResponse.json(
      { message: "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}
