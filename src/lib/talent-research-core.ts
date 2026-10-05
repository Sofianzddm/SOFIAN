/**
 * Cœur partagé de la recherche créateur (CRM + Instagram).
 * Utilisé par casting/talent-research et strategy/brand-simulator.
 */
import prisma from "@/lib/prisma";
import { fetchInstagramProfileSnapshot } from "@/lib/instagram-import";
import { normalizeInstagramHandle } from "@/lib/social-links";

export const TALENT_RESEARCH_TOOLS = [
  { type: "web_search" },
  { type: "x_search" },
] as const;

export type CrmTalent = {
  id: string;
  prenom: string;
  nom: string;
  bio: string | null;
  presentation: string | null;
  presentationEn: string | null;
  niches: string[];
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  pays: string | null;
  ville: string | null;
  selectedClients: string[];
  collaborations: Array<{ marqueNom: string }>;
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
};

export type IgBundle = {
  biography: string;
  fullName: string;
  followersCount?: number;
  captions: string[];
  note: string;
};

export function asStr(v: unknown): string {
  return String(v ?? "").trim();
}

export async function loadCrmTalent(talentId: string): Promise<CrmTalent | null> {
  const t = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      bio: true,
      presentation: true,
      presentationEn: true,
      niches: true,
      instagram: true,
      tiktok: true,
      youtube: true,
      pays: true,
      ville: true,
      selectedClients: true,
      stats: {
        select: {
          igFollowers: true,
          igEngagement: true,
          ttFollowers: true,
          ttEngagement: true,
        },
      },
      collaborations: {
        take: 12,
        orderBy: { createdAt: "desc" },
        select: { marque: { select: { nom: true } } },
      },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    prenom: t.prenom,
    nom: t.nom,
    bio: t.bio,
    presentation: t.presentation,
    presentationEn: t.presentationEn,
    niches: t.niches || [],
    instagram: t.instagram,
    tiktok: t.tiktok,
    youtube: t.youtube,
    pays: t.pays,
    ville: t.ville,
    selectedClients: t.selectedClients || [],
    collaborations: (t.collaborations || [])
      .map((c) => ({ marqueNom: String(c.marque?.nom || "").trim() }))
      .filter((c) => c.marqueNom),
    igFollowers: Number(t.stats?.igFollowers || 0),
    igEngagement: Number(t.stats?.igEngagement || 0),
    ttFollowers: Number(t.stats?.ttFollowers || 0),
    ttEngagement: Number(t.stats?.ttEngagement || 0),
  };
}

export async function loadIgBundle(instagram: string | null): Promise<IgBundle> {
  const handle = normalizeInstagramHandle(instagram || "");
  if (!handle) {
    return {
      biography: "",
      fullName: "",
      captions: [],
      note: "pas de handle Instagram",
    };
  }
  if (!process.env.APIFY_TOKEN?.trim()) {
    return {
      biography: "",
      fullName: "",
      captions: [],
      note: "APIFY_TOKEN absente — IG non scrapé (web/X + CRM seulement)",
    };
  }
  try {
    const snap = await fetchInstagramProfileSnapshot(handle, 16, {
      timeoutMs: 50_000,
    });
    const captions = snap.captions.map((i) => i.caption).filter(Boolean);
    const parts = [
      captions.length ? `${captions.length} captions` : "0 caption",
      snap.biography ? "bio IG" : null,
      snap.followersCount ? `${snap.followersCount} followers scrapés` : null,
    ].filter(Boolean);
    return {
      biography: snap.biography || "",
      fullName: snap.fullName || "",
      followersCount: snap.followersCount,
      captions,
      note: parts.join(" · "),
    };
  } catch (e) {
    return {
      biography: "",
      fullName: "",
      captions: [],
      note: `Instagram indisponible (${e instanceof Error ? e.message : "erreur"})`,
    };
  }
}

export function formatTalentStatsBits(talent: CrmTalent, ig: IgBundle): string {
  const statsBits = [
    talent.igFollowers > 0
      ? `IG ${talent.igFollowers.toLocaleString("fr-FR")} abonnés`
      : null,
    talent.igEngagement > 0 ? `eng. IG ${talent.igEngagement}%` : null,
    talent.ttFollowers > 0
      ? `TT ${talent.ttFollowers.toLocaleString("fr-FR")} abonnés`
      : null,
    talent.ttEngagement > 0 ? `eng. TT ${talent.ttEngagement}%` : null,
    ig.followersCount
      ? `followers IG scrapés ${ig.followersCount.toLocaleString("fr-FR")}`
      : null,
  ].filter(Boolean);
  return statsBits.length ? statsBits.join(" · ") : "—";
}

export function uniqueCollabLabels(talent: CrmTalent, max = 14): string[] {
  const collabs = [
    ...talent.collaborations.map((c) => c.marqueNom),
    ...talent.selectedClients,
  ].filter(Boolean);
  return Array.from(new Set(collabs)).slice(0, max);
}

/** Mappe niches CRM → secteurs Marque CRM. */
export function nichesToSecteurs(niches: string[]): string[] {
  const map: Array<{ re: RegExp; secteur: string }> = [
    { re: /beaut[eé]|makeup|make-up|skincare|soin|cosm[eé]/i, secteur: "Beauté" },
    { re: /mode|fashion|streetwear|luxe mode/i, secteur: "Mode" },
    { re: /food|cuisine|gastro|resto|culinaire/i, secteur: "Food" },
    { re: /tech|gaming|high-?tech|digital/i, secteur: "Tech" },
    { re: /sport|fitness|running|yoga|outdoor/i, secteur: "Sport" },
    { re: /luxe|luxury|premium/i, secteur: "Luxe" },
    { re: /auto|voiture|mobility/i, secteur: "Automobile" },
    { re: /finance|banque|fintech|assurance/i, secteur: "Finance" },
    { re: /sant[eé]|health|wellness|bien-?[eê]tre/i, secteur: "Santé" },
    { re: /voyage|travel|tourisme/i, secteur: "Voyage" },
    {
      re: /entertainment|cin[eé]|s[eé]rie|tv|humour|comedy|culture/i,
      secteur: "Entertainment",
    },
    { re: /lifestyle|maman|mom|famille|family|quotidien/i, secteur: "Lifestyle" },
  ];
  const out = new Set<string>();
  for (const n of niches) {
    for (const { re, secteur } of map) {
      if (re.test(n)) out.add(secteur);
    }
  }
  if (out.size === 0) out.add("Lifestyle");
  return Array.from(out);
}
