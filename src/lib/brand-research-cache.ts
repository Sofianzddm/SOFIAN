/**
 * Cache obligatoire des analyses marque (brand-research xAI).
 * TTL : 7 jours — 1 paiement Grok / marque(+focus+contexte) / semaine.
 */

import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { normalizeBrandKey } from "@/lib/outreach-vps-brand-match";

export const BRAND_RESEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type BrandResearchCachePayload = {
  recentCampaigns: string;
  newProducts: string;
  availabilityFrEu: string;
  brandPositioning: string;
  influenceStrategy: string;
};

export function brandResearchCacheKeyParts(opts: {
  brandName: string;
  focus?: string;
  projectContext?: string | null;
}): { brandKey: string; focus: string; contextHash: string } | null {
  const brandKey = normalizeBrandKey(opts.brandName);
  if (!brandKey) return null;
  const focus = opts.focus === "BE" ? "BE" : "FR";
  const ctx = String(opts.projectContext || "").trim();
  const contextHash = ctx
    ? createHash("sha256").update(ctx).digest("hex").slice(0, 16)
    : "";
  return { brandKey, focus, contextHash };
}

export function isUsableBrandResearchPayload(
  p: Partial<BrandResearchCachePayload> | null | undefined
): p is BrandResearchCachePayload {
  if (!p || typeof p !== "object") return false;
  return Boolean(
    String(p.newProducts || "").trim() ||
      String(p.brandPositioning || "").trim() ||
      String(p.influenceStrategy || "").trim() ||
      String(p.recentCampaigns || "").trim() ||
      String(p.availabilityFrEu || "").trim()
  );
}

function normalizePayload(
  raw: unknown
): BrandResearchCachePayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const payload: BrandResearchCachePayload = {
    recentCampaigns: String(o.recentCampaigns || "").trim(),
    newProducts: String(o.newProducts || "").trim(),
    availabilityFrEu: String(o.availabilityFrEu || "").trim(),
    brandPositioning: String(o.brandPositioning || "").trim(),
    influenceStrategy: String(o.influenceStrategy || "").trim(),
  };
  return isUsableBrandResearchPayload(payload) ? payload : null;
}

/** Lit le cache s’il est frais (< 7 j). */
export async function getBrandResearchCache(opts: {
  brandName: string;
  focus?: string;
  projectContext?: string | null;
}): Promise<{
  payload: BrandResearchCachePayload;
  fetchedAt: Date;
  brandKey: string;
} | null> {
  const parts = brandResearchCacheKeyParts(opts);
  if (!parts) return null;

  const row = await prisma.brandResearchCache.findUnique({
    where: {
      brandKey_focus_contextHash: {
        brandKey: parts.brandKey,
        focus: parts.focus,
        contextHash: parts.contextHash,
      },
    },
  });
  if (!row) return null;

  const age = Date.now() - row.fetchedAt.getTime();
  if (age > BRAND_RESEARCH_CACHE_TTL_MS) return null;

  const payload = normalizePayload(row.payload);
  if (!payload) return null;

  return {
    payload,
    fetchedAt: row.fetchedAt,
    brandKey: parts.brandKey,
  };
}

/** Upsert après un appel xAI réussi. */
export async function setBrandResearchCache(opts: {
  brandName: string;
  focus?: string;
  projectContext?: string | null;
  payload: BrandResearchCachePayload;
}): Promise<void> {
  const parts = brandResearchCacheKeyParts(opts);
  if (!parts) return;
  if (!isUsableBrandResearchPayload(opts.payload)) return;

  const now = new Date();
  await prisma.brandResearchCache.upsert({
    where: {
      brandKey_focus_contextHash: {
        brandKey: parts.brandKey,
        focus: parts.focus,
        contextHash: parts.contextHash,
      },
    },
    create: {
      brandKey: parts.brandKey,
      brandName: String(opts.brandName || "").trim() || parts.brandKey,
      focus: parts.focus,
      contextHash: parts.contextHash,
      payload: opts.payload,
      source: "xai",
      fetchedAt: now,
    },
    update: {
      brandName: String(opts.brandName || "").trim() || parts.brandKey,
      payload: opts.payload,
      source: "xai",
      fetchedAt: now,
    },
  });
}
