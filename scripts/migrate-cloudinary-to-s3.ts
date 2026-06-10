/**
 * Migration one-shot : copie les fichiers Cloudinary → Amazon S3 et met à jour les URLs en base.
 *
 * Usage :
 *   pnpm tsx scripts/migrate-cloudinary-to-s3.ts          # dry-run (affiche sans écrire)
 *   pnpm tsx scripts/migrate-cloudinary-to-s3.ts --apply  # exécute la migration
 *
 * Prérequis : AWS_* configurés (.env). Les anciennes URLs Cloudinary restent valides
 * tant que le compte Cloudinary est actif — ce script les remplace par des URLs S3.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  buildKey,
  extFromContentType,
  isS3Configured,
  uploadBufferToS3,
} from "../src/lib/s3";

const APPLY = process.argv.includes("--apply");
const CLOUDINARY_HOST = "res.cloudinary.com";

type UrlRef = {
  label: string;
  url: string;
  apply: (newUrl: string) => Promise<void>;
};

const cache = new Map<string, string>();

function isCloudinaryUrl(url: string | null | undefined): url is string {
  return Boolean(url && url.includes(CLOUDINARY_HOST));
}

/** Déduit une clé S3 depuis l'URL Cloudinary (conserve le dossier d'origine). */
function s3KeyFromCloudinaryUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // .../image/upload/v123/folder/file.jpg  ou  .../image/upload/folder/file.jpg
    const uploadIdx = parts.indexOf("upload");
    const afterUpload =
      uploadIdx >= 0 ? parts.slice(uploadIdx + 1) : parts.slice(-2);
    const withoutVersion =
      afterUpload[0]?.startsWith("v") && /^\d+$/.test(afterUpload[0].slice(1))
        ? afterUpload.slice(1)
        : afterUpload;
    if (withoutVersion.length >= 2) {
      const folder = withoutVersion.slice(0, -1).join("/");
      const file = decodeURIComponent(withoutVersion[withoutVersion.length - 1]!);
      return buildKey(`migrated/${folder}`, file);
    }
  } catch {
    /* fallback */
  }
  const file = url.split("/").pop() || `file-${Date.now()}.bin`;
  return buildKey("migrated/unknown", decodeURIComponent(file));
}

async function migrateUrl(url: string): Promise<string> {
  if (cache.has(url)) return cache.get(url)!;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType =
    res.headers.get("content-type")?.split(";")[0] ||
    "application/octet-stream";

  let key = s3KeyFromCloudinaryUrl(url);
  if (!key.includes(".")) {
    key = `${key}.${extFromContentType(contentType)}`;
  }

  const newUrl = await uploadBufferToS3(buffer, { key, contentType });
  cache.set(url, newUrl);
  return newUrl;
}

async function migrateStringField(
  refs: UrlRef[],
  value: string | null | undefined,
  label: string,
  apply: (v: string) => Promise<void>
) {
  if (!isCloudinaryUrl(value)) return;
  refs.push({
    label,
    url: value,
    apply: async (newUrl) => apply(newUrl),
  });
}

async function collectRefs(): Promise<UrlRef[]> {
  const refs: UrlRef[] = [];

  const talents = await prisma.talent.findMany({
    select: { id: true, photo: true, kitPhotos: true },
  });
  for (const t of talents) {
    await migrateStringField(refs, t.photo, `Talent ${t.id} photo`, async (u) => {
      await prisma.talent.update({ where: { id: t.id }, data: { photo: u } });
    });
    for (let i = 0; i < t.kitPhotos.length; i++) {
      const u = t.kitPhotos[i];
      if (!isCloudinaryUrl(u)) continue;
      const idx = i;
      refs.push({
        label: `Talent ${t.id} kitPhotos[${idx}]`,
        url: u,
        apply: async (newUrl) => {
          const fresh = await prisma.talent.findUnique({
            where: { id: t.id },
            select: { kitPhotos: true },
          });
          const next = [...(fresh?.kitPhotos ?? t.kitPhotos)];
          next[idx] = newUrl;
          await prisma.talent.update({
            where: { id: t.id },
            data: { kitPhotos: next },
          });
        },
      });
    }
  }

  const stats = await prisma.talentStats.findMany({
    select: { talentId: true, storyScreenshots: true },
  });
  for (const s of stats) {
    const raw = s.storyScreenshots as
      | string[]
      | { views30d?: string[]; views7d?: string[]; linkClicks30d?: string[] }
      | null;
    if (!raw) continue;

    const applySlots = async (
      slot: "views30d" | "views7d" | "linkClicks30d",
      urls: string[]
    ) => {
      const base =
        raw && !Array.isArray(raw)
          ? {
              views30d: [...(raw.views30d ?? [])],
              views7d: [...(raw.views7d ?? [])],
              linkClicks30d: [...(raw.linkClicks30d ?? [])],
            }
          : {
              views30d: Array.isArray(raw) ? [...raw] : [],
              views7d: [] as string[],
              linkClicks30d: [] as string[],
            };

      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        if (!isCloudinaryUrl(u)) continue;
        const idx = i;
        refs.push({
          label: `TalentStats ${s.talentId} ${slot}[${idx}]`,
          url: u,
          apply: async (newUrl) => {
            const row = await prisma.talentStats.findUnique({
              where: { talentId: s.talentId },
            });
            const cur = row?.storyScreenshots as typeof raw;
            const b =
              cur && !Array.isArray(cur)
                ? {
                    views30d: [...(cur.views30d ?? [])],
                    views7d: [...(cur.views7d ?? [])],
                    linkClicks30d: [...(cur.linkClicks30d ?? [])],
                  }
                : {
                    views30d: Array.isArray(cur) ? [...cur] : [],
                    views7d: [] as string[],
                    linkClicks30d: [] as string[],
                  };
            b[slot][idx] = newUrl;
            await prisma.talentStats.update({
              where: { talentId: s.talentId },
              data: { storyScreenshots: b },
            });
          },
        });
      }
    };

    if (Array.isArray(raw)) {
      await applySlots("views30d", raw);
    } else {
      await applySlots("views30d", raw.views30d ?? []);
      await applySlots("views7d", raw.views7d ?? []);
      await applySlots("linkClicks30d", raw.linkClicks30d ?? []);
    }
  }

  const collabs = await prisma.collaboration.findMany({
    select: {
      id: true,
      factureTalentUrl: true,
      contratMarquePdfUrl: true,
    },
  });
  for (const c of collabs) {
    await migrateStringField(
      refs,
      c.factureTalentUrl,
      `Collaboration ${c.id} factureTalentUrl`,
      async (u) => {
        await prisma.collaboration.update({
          where: { id: c.id },
          data: { factureTalentUrl: u },
        });
      }
    );
    await migrateStringField(
      refs,
      c.contratMarquePdfUrl,
      `Collaboration ${c.id} contratMarquePdfUrl`,
      async (u) => {
        await prisma.collaboration.update({
          where: { id: c.id },
          data: { contratMarquePdfUrl: u },
        });
      }
    );
  }

  const versions = await prisma.contratMarqueVersion.findMany({
    select: { id: true, pdfUrl: true },
  });
  for (const v of versions) {
    await migrateStringField(
      refs,
      v.pdfUrl,
      `ContratMarqueVersion ${v.id}`,
      async (u) => {
        await prisma.contratMarqueVersion.update({
          where: { id: v.id },
          data: { pdfUrl: u },
        });
      }
    );
  }

  const docs = await prisma.document.findMany({
    select: { id: true, signedDocumentUrl: true, fichierUrl: true },
  });
  for (const d of docs) {
    await migrateStringField(
      refs,
      d.signedDocumentUrl,
      `Document ${d.id} signedDocumentUrl`,
      async (u) => {
        await prisma.document.update({
          where: { id: d.id },
          data: { signedDocumentUrl: u },
        });
      }
    );
    await migrateStringField(
      refs,
      d.fichierUrl,
      `Document ${d.id} fichierUrl`,
      async (u) => {
        await prisma.document.update({
          where: { id: d.id },
          data: { fichierUrl: u },
        });
      }
    );
  }

  const brands = await prisma.brand.findMany({ select: { id: true, logo: true } });
  for (const b of brands) {
    await migrateStringField(refs, b.logo, `Brand ${b.id} logo`, async (u) => {
      await prisma.brand.update({ where: { id: b.id }, data: { logo: u } });
    });
  }

  const partners = await prisma.partner.findMany({
    select: { id: true, logo: true },
  });
  for (const p of partners) {
    await migrateStringField(refs, p.logo, `Partner ${p.id} logo`, async (u) => {
      await prisma.partner.update({ where: { id: p.id }, data: { logo: u } });
    });
  }

  const projects = await prisma.agencyProject.findMany({
    select: { id: true, coverImage: true, images: true },
  });
  for (const p of projects) {
    await migrateStringField(
      refs,
      p.coverImage,
      `AgencyProject ${p.id} coverImage`,
      async (u) => {
        await prisma.agencyProject.update({
          where: { id: p.id },
          data: { coverImage: u },
        });
      }
    );
    const imgs = Array.isArray(p.images)
      ? (p.images as string[])
      : [];
    for (let i = 0; i < imgs.length; i++) {
      const u = imgs[i];
      if (!isCloudinaryUrl(u)) continue;
      const idx = i;
      refs.push({
        label: `AgencyProject ${p.id} images[${idx}]`,
        url: u,
        apply: async (newUrl) => {
          const fresh = await prisma.agencyProject.findUnique({
            where: { id: p.id },
            select: { images: true },
          });
          const next = [...((fresh?.images as string[]) ?? imgs)];
          next[idx] = newUrl;
          await prisma.agencyProject.update({
            where: { id: p.id },
            data: { images: next as Prisma.InputJsonValue },
          });
        },
      });
    }
  }

  const dinners = await prisma.dinnerCampaign.findMany({
    select: { id: true, logoUrl: true, eventPhotos: true },
  });
  for (const d of dinners) {
    await migrateStringField(
      refs,
      d.logoUrl,
      `DinnerCampaign ${d.id} logoUrl`,
      async (u) => {
        await prisma.dinnerCampaign.update({
          where: { id: d.id },
          data: { logoUrl: u },
        });
      }
    );
    const photos = Array.isArray(d.eventPhotos)
      ? d.eventPhotos.map(String)
      : [];
    for (let i = 0; i < photos.length; i++) {
      const u = photos[i];
      if (!isCloudinaryUrl(u)) continue;
      const idx = i;
      refs.push({
        label: `DinnerCampaign ${d.id} eventPhotos[${idx}]`,
        url: u,
        apply: async (newUrl) => {
          const fresh = await prisma.dinnerCampaign.findUnique({
            where: { id: d.id },
            select: { eventPhotos: true },
          });
          const next = [
            ...((fresh?.eventPhotos as string[]) ?? photos).map(String),
          ];
          next[idx] = newUrl;
          await prisma.dinnerCampaign.update({
            where: { id: d.id },
            data: { eventPhotos: next as Prisma.InputJsonValue },
          });
        },
      });
    }
  }

  const screenshots = await prisma.activationReportScreenshot.findMany({
    select: { id: true, imageUrl: true },
  });
  for (const s of screenshots) {
    await migrateStringField(
      refs,
      s.imageUrl,
      `ActivationReportScreenshot ${s.id}`,
      async (u) => {
        await prisma.activationReportScreenshot.update({
          where: { id: s.id },
          data: { imageUrl: u },
        });
      }
    );
  }

  const settings = await prisma.cannesSharedSetting.findMany();
  for (const row of settings) {
    const val = row.value;
    if (typeof val === "object" && val && "photoUrl" in val) {
      const u = (val as { photoUrl?: string }).photoUrl;
      if (!isCloudinaryUrl(u)) continue;
      refs.push({
        label: `CannesSharedSetting ${row.key}`,
        url: u,
        apply: async (newUrl) => {
          await prisma.cannesSharedSetting.update({
            where: { key: row.key },
            data: {
              value: { ...(val as object), photoUrl: newUrl },
            },
          });
        },
      });
    }
  }

  // Déduplique les URLs identiques (même fichier référencé plusieurs fois)
  const byUrl = new Map<string, UrlRef[]>();
  for (const r of refs) {
    const list = byUrl.get(r.url) ?? [];
    list.push(r);
    byUrl.set(r.url, list);
  }

  const unique: UrlRef[] = [];
  for (const [, group] of byUrl) {
    const first = group[0]!;
    unique.push({
      label: group.map((g) => g.label).join(" | "),
      url: first.url,
      apply: async (newUrl) => {
        for (const g of group) await g.apply(newUrl);
      },
    });
  }

  return unique;
}

async function main() {
  if (!isS3Configured()) {
    console.error("❌ AWS_* non configurés — impossible de migrer.");
    process.exit(1);
  }

  const refs = await collectRefs();
  console.log(
    `\n${APPLY ? "🚀 APPLY" : "👀 DRY-RUN"} — ${refs.length} URL(s) Cloudinary unique(s)\n`
  );

  if (refs.length === 0) {
    console.log("Rien à migrer.");
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const ref of refs) {
    try {
      if (APPLY) {
        const newUrl = await migrateUrl(ref.url);
        await ref.apply(newUrl);
        console.log(`✅ ${ref.label}\n   ${ref.url}\n   → ${newUrl}`);
      } else {
        console.log(`• ${ref.label}\n  ${ref.url}`);
      }
      ok++;
    } catch (e) {
      fail++;
      console.error(`❌ ${ref.label}:`, e);
    }
  }

  console.log(`\nTerminé : ${ok} ok, ${fail} erreur(s).`);
  if (!APPLY) {
    console.log("\nRelance avec --apply pour exécuter la migration.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
