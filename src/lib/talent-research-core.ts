/**
 * Cœur partagé de la recherche créateur (CRM + Instagram).
 * Utilisé par casting/talent-research et strategy/brand-simulator.
 */
import prisma from "@/lib/prisma";
import { fetchInstagramProfileSnapshot } from "@/lib/instagram-import";
import { fetchTikTokRecentCaptions } from "@/lib/social-stats";
import { normalizeInstagramHandle } from "@/lib/social-links";
import { buildTalentPerfReachHighlight } from "@/lib/talent-perf-reach";

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
  snapchat: string | null;
  pays: string | null;
  ville: string | null;
  nationalite: string | null;
  /** Âge calculé depuis dateNaissance, si connue */
  age: number | null;
  selectedClients: string[];
  collaborations: Array<{ marqueNom: string }>;
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
  /** Évolution abonnés / engagement CRM (%) */
  igFollowersEvol: number | null;
  ttFollowersEvol: number | null;
  igEngagementEvol: number | null;
  ttEngagementEvol: number | null;
  /** Stories / Snap (fiche + stats internes) */
  storyViews30d: number | null;
  storyViews7d: number | null;
  storyViewsMax: number | null;
  storyLinkClicks30d: number | null;
  moyenneVuesStory: number | null;
  moyenneVuesSnap: number | null;
  /** Dernier mois de perfs mensuelles */
  igMoyenneVuesReels: number | null;
  igMoyenneLikes: number | null;
  igMeilleurReelVues: number | null;
  igMeilleurReelUrl: string | null;
  ttMoyenneVues: number | null;
  ttMoyenneLikes: number | null;
  ttMeilleurTiktokVues: number | null;
  ttMeilleurTiktokUrl: string | null;
  perfNotes: string | null;
  perfMoisLabel: string | null;
  /** Notes internes fiche profil talent */
  notesInternes: string | null;
  /** Lifestyle / beauté fiche (matching marques poussé) */
  sports: string[];
  animaux: string[];
  mobilite: string[];
  nombreEnfants: number | null;
  agesEnfants: string[];
  enceinte: boolean;
  typePeau: string | null;
  typeCheveux: string | null;
  couleurCheveux: string | null;
  tendancePeau: string[];
  tendanceCheveux: string[];
};

export type IgBundle = {
  biography: string;
  fullName: string;
  followersCount?: number;
  postsCount?: number;
  externalUrl?: string;
  captions: string[];
  topHashtags: string[];
  topMentions: string[];
  /** Captions / textes TikTok scrapés Apify (si handle + deep). */
  tiktokCaptions: string[];
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
      snapchat: true,
      pays: true,
      ville: true,
      nationalite: true,
      dateNaissance: true,
      selectedClients: true,
      notesInternes: true,
      moyenneVuesStory: true,
      moyenneVuesSnap: true,
      sports: true,
      animaux: true,
      mobilite: true,
      nombreEnfants: true,
      agesEnfants: true,
      enceinte: true,
      typePeau: true,
      typeCheveux: true,
      couleurCheveux: true,
      tendancePeau: true,
      tendanceCheveux: true,
      stats: {
        select: {
          igFollowers: true,
          igEngagement: true,
          igFollowersEvol: true,
          igEngagementEvol: true,
          ttFollowers: true,
          ttEngagement: true,
          ttFollowersEvol: true,
          ttEngagementEvol: true,
          storyViews30d: true,
          storyViews7d: true,
          storyLinkClicks30d: true,
        },
      },
      performancesMensuelles: {
        orderBy: [{ annee: "desc" }, { mois: "desc" }],
        take: 1,
        select: {
          annee: true,
          mois: true,
          igMoyenneVuesReels: true,
          igMoyenneLikes: true,
          igMeilleurReelVues: true,
          igMeilleurReelUrl: true,
          ttMoyenneVues: true,
          ttMoyenneLikes: true,
          ttMeilleurTiktokVues: true,
          ttMeilleurTiktokUrl: true,
          notes: true,
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
  const perf = t.performancesMensuelles[0] ?? null;
  const story30 = t.stats?.storyViews30d ?? null;
  const story7 = t.stats?.storyViews7d ?? null;
  const storyPeak = Math.max(story30 ?? 0, story7 ?? 0);
  let age: number | null = null;
  if (t.dateNaissance) {
    const birth = new Date(t.dateNaissance);
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;
      if (years >= 0 && years < 120) age = years;
    }
  }
  const moisLabels = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  const perfMoisLabel =
    perf?.mois && perf?.annee
      ? `${moisLabels[perf.mois - 1] || perf.mois} ${perf.annee}`
      : null;
  const n = (v: unknown): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;
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
    snapchat: t.snapchat,
    pays: t.pays,
    ville: t.ville,
    nationalite: t.nationalite?.trim() || null,
    age,
    selectedClients: t.selectedClients || [],
    collaborations: (t.collaborations || [])
      .map((c) => ({ marqueNom: String(c.marque?.nom || "").trim() }))
      .filter((c) => c.marqueNom),
    igFollowers: Number(t.stats?.igFollowers || 0),
    igEngagement: Number(t.stats?.igEngagement || 0),
    igFollowersEvol: n(t.stats?.igFollowersEvol),
    igEngagementEvol: n(t.stats?.igEngagementEvol),
    ttFollowers: Number(t.stats?.ttFollowers || 0),
    ttEngagement: Number(t.stats?.ttEngagement || 0),
    ttFollowersEvol: n(t.stats?.ttFollowersEvol),
    ttEngagementEvol: n(t.stats?.ttEngagementEvol),
    storyViews30d: story30,
    storyViews7d: story7,
    storyViewsMax: storyPeak > 0 ? storyPeak : null,
    storyLinkClicks30d: t.stats?.storyLinkClicks30d ?? null,
    moyenneVuesStory: t.moyenneVuesStory ?? null,
    moyenneVuesSnap: t.moyenneVuesSnap ?? null,
    igMoyenneVuesReels: perf?.igMoyenneVuesReels ?? null,
    igMoyenneLikes: perf?.igMoyenneLikes ?? null,
    igMeilleurReelVues: perf?.igMeilleurReelVues ?? null,
    igMeilleurReelUrl: perf?.igMeilleurReelUrl ?? null,
    ttMoyenneVues: perf?.ttMoyenneVues ?? null,
    ttMoyenneLikes: perf?.ttMoyenneLikes ?? null,
    ttMeilleurTiktokVues: perf?.ttMeilleurTiktokVues ?? null,
    ttMeilleurTiktokUrl: perf?.ttMeilleurTiktokUrl ?? null,
    perfNotes: perf?.notes?.trim() || null,
    perfMoisLabel,
    notesInternes: t.notesInternes?.trim() || null,
    sports: t.sports || [],
    animaux: t.animaux || [],
    mobilite: t.mobilite || [],
    nombreEnfants: t.nombreEnfants ?? null,
    agesEnfants: t.agesEnfants || [],
    enceinte: Boolean(t.enceinte),
    typePeau: t.typePeau?.trim() || null,
    typeCheveux: t.typeCheveux?.trim() || null,
    couleurCheveux: t.couleurCheveux?.trim() || null,
    tendancePeau: t.tendancePeau || [],
    tendanceCheveux: t.tendanceCheveux || [],
  };
}

/** Bloc lifestyle / beauté fiche pour prompts matching marques. */
export function formatTalentLifestyleBlock(talent: CrmTalent): string {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`- ${label} : ${value}`);
  };

  push("Sports / activités", talent.sports.length ? talent.sports.join(", ") : null);
  push("Animaux", talent.animaux.length ? talent.animaux.join(", ") : null);
  if (talent.enceinte) {
    lines.push("- Grossesse : oui");
  }
  if (talent.nombreEnfants != null && talent.nombreEnfants > 0) {
    push(
      "Enfants",
      `${talent.nombreEnfants}${
        talent.agesEnfants.length ? ` (${talent.agesEnfants.join(", ")})` : ""
      }`
    );
  }
  push("Type de peau", talent.typePeau);
  push(
    "Tendances peau",
    talent.tendancePeau.length ? talent.tendancePeau.join(", ") : null
  );
  push(
    "Cheveux",
    [
      talent.typeCheveux,
      talent.couleurCheveux,
      talent.tendanceCheveux.length ? talent.tendanceCheveux.join(", ") : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
  push(
    "Mobilité",
    talent.mobilite.length ? talent.mobilite.join(", ") : null
  );

  if (lines.length === 0) {
    return "- (aucun attribut lifestyle / beauté renseigné sur la fiche)";
  }
  return lines.join("\n");
}

/**
 * Dump complet de la fiche talent utile au matching marques
 * (identité, textes, lifestyle, notes internes, réseaux).
 */
export function formatFullTalentFicheBlock(talent: CrmTalent): string {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`- ${label} : ${value}`);
  };
  const name = `${talent.prenom} ${talent.nom}`.trim();

  push("Nom", name);
  push("Âge", talent.age != null ? `${talent.age} ans` : null);
  push("Nationalité", talent.nationalite);
  push(
    "Ville / pays",
    [talent.ville, talent.pays].filter(Boolean).join(", ") || null
  );
  push("Niches CRM", talent.niches.length ? talent.niches.join(", ") : null);
  push("Présentation FR", talent.presentation?.trim() || null);
  push("Présentation EN", talent.presentationEn?.trim() || null);
  push("Bio CRM", talent.bio?.trim() || null);
  push(
    "Notes internes TM (TRÈS IMPORTANT — moments de vie, projets, angles)",
    talent.notesInternes?.trim() || null
  );
  push("Notes perfs TM", talent.perfNotes);
  push("Instagram", talent.instagram);
  push("TikTok", talent.tiktok);
  push("YouTube", talent.youtube);
  push("Snapchat", talent.snapchat);

  lines.push("═══ LIFESTYLE / BEAUTÉ ═══");
  lines.push(formatTalentLifestyleBlock(talent));

  const clients = uniqueCollabLabels(talent, 40);
  push(
    "Clients / collabs connus",
    clients.length ? clients.join(", ") : null
  );

  return lines.join("\n");
}

export async function loadIgBundle(
  instagram: string | null,
  options?: {
    /** Scrape Apify poussé (plus de posts, captions longues, hashtags/@). */
    deep?: boolean;
    /** Handle TikTok pour scraper aussi les captions (mode deep). */
    tiktok?: string | null;
  }
): Promise<IgBundle> {
  const empty = (note: string): IgBundle => ({
    biography: "",
    fullName: "",
    captions: [],
    topHashtags: [],
    topMentions: [],
    tiktokCaptions: [],
    note,
  });

  const handle = normalizeInstagramHandle(instagram || "");
  const deep = Boolean(options?.deep);
  const ttRaw = String(options?.tiktok || "").trim();
  const ttHandle = ttRaw
    ? ttRaw
        .replace(/^@/, "")
        .replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, "")
        .replace(/\/+$/, "")
        .replace(/[?#].*$/, "")
        .trim() || null
    : null;

  if (!handle && !(deep && ttHandle)) {
    return empty("pas de handle Instagram");
  }
  if (!process.env.APIFY_TOKEN?.trim()) {
    return empty(
      "APIFY_TOKEN absente — IG/TikTok non scrapés (web/X + CRM seulement)"
    );
  }

  const igCount = deep ? 36 : 16;
  const igTimeout = deep ? 95_000 : 50_000;

  const [igResult, ttResult] = await Promise.all([
    handle
      ? fetchInstagramProfileSnapshot(handle, igCount, {
          timeoutMs: igTimeout,
          deep,
        })
          .then((snap) => ({ ok: true as const, snap }))
          .catch((e) => ({
            ok: false as const,
            error: e instanceof Error ? e.message : "erreur",
          }))
      : Promise.resolve({
          ok: false as const,
          error: "pas de handle Instagram",
        }),
    deep && ttHandle
      ? fetchTikTokRecentCaptions(ttHandle, 14, { timeoutMs: 70_000 })
      : Promise.resolve({ captions: [] as string[], note: "" }),
  ]);

  if (!igResult.ok) {
    return {
      ...empty(`Instagram indisponible (${igResult.error})`),
      tiktokCaptions: ttResult.captions,
      note: [
        `Instagram indisponible (${igResult.error})`,
        ttResult.note || null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const snap = igResult.snap;
  const captions = snap.captions.map((i) => i.caption).filter(Boolean);
  const parts = [
    deep ? "Apify deep" : null,
    captions.length ? `${captions.length} captions IG` : "0 caption IG",
    snap.biography ? "bio IG" : null,
    snap.followersCount
      ? `${snap.followersCount.toLocaleString("fr-FR")} followers`
      : null,
    snap.topHashtags.length
      ? `${snap.topHashtags.length} hashtags`
      : null,
    snap.topMentions.length
      ? `${snap.topMentions.length} @mentions`
      : null,
    ttResult.note || null,
  ].filter(Boolean);

  return {
    biography: snap.biography || "",
    fullName: snap.fullName || "",
    followersCount: snap.followersCount,
    postsCount: snap.postsCount,
    externalUrl: snap.externalUrl,
    captions,
    topHashtags: snap.topHashtags || [],
    topMentions: snap.topMentions || [],
    tiktokCaptions: ttResult.captions,
    note: parts.join(" · "),
  };
}

function fmtPct(v: number): string {
  return `${v.toFixed(1).replace(/\.0$/, "")}%`;
}

function fmtInt(v: number): string {
  return v.toLocaleString("fr-FR");
}

function evolLabel(v: number, platform: string): string | null {
  if (v < 5) return null;
  return `${platform} ${v >= 15 ? "forte croissance" : "en croissance"} (+${fmtPct(v)})`;
}

/** Snapshot compact de TOUTES les données perf CRM utiles au pitch. */
export function formatTalentStatsBits(talent: CrmTalent, ig: IgBundle): string {
  const statsBits = [
    talent.igFollowers > 0 ? `IG ${fmtInt(talent.igFollowers)} abonnés` : null,
    talent.igEngagement > 0 ? `eng. IG ${talent.igEngagement}%` : null,
    talent.ttFollowers > 0 ? `TT ${fmtInt(talent.ttFollowers)} abonnés` : null,
    talent.ttEngagement > 0 ? `eng. TT ${talent.ttEngagement}%` : null,
    ig.followersCount ? `followers IG scrapés ${fmtInt(ig.followersCount)}` : null,
  ].filter(Boolean);

  const reach = buildTalentPerfReachHighlight({
    igFollowers: talent.igFollowers,
    ttFollowers: talent.ttFollowers,
    igMoyenneVuesReels: talent.igMoyenneVuesReels,
    igMeilleurReelVues: talent.igMeilleurReelVues,
    ttMoyenneVues: talent.ttMoyenneVues,
    ttMeilleurTiktokVues: talent.ttMeilleurTiktokVues,
    storyViewsMax: talent.storyViewsMax,
  });
  if (reach) {
    statsBits.push(
      `Portée CRM (${reach.priority === "must" ? "forte vs abonnés" : "notable vs abonnés"}) : ${reach.fr}`
    );
  }

  // Contenu — TikTok / Reels / posts (dernier mois saisi)
  if (talent.perfMoisLabel) {
    statsBits.push(`Perfs mensuelles (${talent.perfMoisLabel})`);
  }
  if (talent.ttMeilleurTiktokVues && talent.ttMeilleurTiktokVues > 0) {
    statsBits.push(`meilleur TikTok ${fmtInt(talent.ttMeilleurTiktokVues)} vues`);
  }
  if (talent.ttMoyenneVues && talent.ttMoyenneVues > 0) {
    statsBits.push(`moy. TikTok ${fmtInt(talent.ttMoyenneVues)} vues`);
  }
  if (talent.ttMoyenneLikes && talent.ttMoyenneLikes > 0) {
    statsBits.push(`moy. likes TT ${fmtInt(talent.ttMoyenneLikes)}`);
  }
  if (talent.igMeilleurReelVues && talent.igMeilleurReelVues > 0) {
    statsBits.push(`meilleur Reel ${fmtInt(talent.igMeilleurReelVues)} vues`);
  }
  if (talent.igMoyenneVuesReels && talent.igMoyenneVuesReels > 0) {
    statsBits.push(`moy. Reels ${fmtInt(talent.igMoyenneVuesReels)} vues`);
  }
  if (talent.igMoyenneLikes && talent.igMoyenneLikes > 0) {
    statsBits.push(`moy. likes IG ${fmtInt(talent.igMoyenneLikes)}`);
  }

  // Stories / Snap
  if (talent.storyViews30d && talent.storyViews30d > 0) {
    statsBits.push(`peak stories 30j ${fmtInt(talent.storyViews30d)} vues`);
  }
  if (talent.storyViews7d && talent.storyViews7d > 0) {
    statsBits.push(`peak stories 7j ${fmtInt(talent.storyViews7d)} vues`);
  }
  if (talent.storyLinkClicks30d && talent.storyLinkClicks30d > 0) {
    statsBits.push(`clics lien stories 30j ${fmtInt(talent.storyLinkClicks30d)}`);
  }
  if (talent.moyenneVuesStory && talent.moyenneVuesStory > 0) {
    statsBits.push(`moy. vues story ${fmtInt(talent.moyenneVuesStory)}`);
  }
  if (talent.moyenneVuesSnap && talent.moyenneVuesSnap > 0) {
    statsBits.push(`moy. vues Snap ${fmtInt(talent.moyenneVuesSnap)}`);
  }

  // Momentum abonnés / engagement
  for (const bit of [
    talent.ttFollowersEvol != null ? evolLabel(talent.ttFollowersEvol, "Momentum abonnés TT") : null,
    talent.igFollowersEvol != null ? evolLabel(talent.igFollowersEvol, "Momentum abonnés IG") : null,
  ]) {
    if (bit) statsBits.push(bit);
  }
  if (talent.ttEngagementEvol != null && talent.ttEngagementEvol >= 5) {
    statsBits.push(`eng. TT en hausse (+${fmtPct(talent.ttEngagementEvol)})`);
  }
  if (talent.igEngagementEvol != null && talent.igEngagementEvol >= 5) {
    statsBits.push(`eng. IG en hausse (+${fmtPct(talent.igEngagementEvol)})`);
  }

  if (talent.perfNotes) {
    statsBits.push(`Notes TM : ${talent.perfNotes}`);
  }
  if (talent.notesInternes) {
    statsBits.push(`Notes internes : ${talent.notesInternes}`);
  }

  return statsBits.length ? statsBits.join(" · ") : "—";
}

/** Bloc détaillé pour le prompt analyse créateur (toutes les sources CRM). */
export function formatCrmContentPerformanceBlock(talent: CrmTalent): string {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`- ${label} : ${value}`);
  };

  push(
    "Période perfs mensuelles",
    talent.perfMoisLabel
  );
  push(
    "TikTok — meilleur / moyenne vues",
    [
      talent.ttMeilleurTiktokVues ? `${fmtInt(talent.ttMeilleurTiktokVues)} (best)` : null,
      talent.ttMoyenneVues ? `${fmtInt(talent.ttMoyenneVues)} (moy.)` : null,
      talent.ttMoyenneLikes ? `${fmtInt(talent.ttMoyenneLikes)} likes moy.` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
  if (talent.ttMeilleurTiktokUrl) push("TikTok — URL best", talent.ttMeilleurTiktokUrl);
  push(
    "Reels / posts IG — meilleur / moyenne vues",
    [
      talent.igMeilleurReelVues ? `${fmtInt(talent.igMeilleurReelVues)} (best)` : null,
      talent.igMoyenneVuesReels ? `${fmtInt(talent.igMoyenneVuesReels)} (moy.)` : null,
      talent.igMoyenneLikes ? `${fmtInt(talent.igMoyenneLikes)} likes moy.` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
  if (talent.igMeilleurReelUrl) push("Reel — URL best", talent.igMeilleurReelUrl);
  push(
    "Stories",
    [
      talent.storyViews30d ? `peak 30j ${fmtInt(talent.storyViews30d)}` : null,
      talent.storyViews7d ? `peak 7j ${fmtInt(talent.storyViews7d)}` : null,
      talent.storyLinkClicks30d
        ? `clics lien 30j ${fmtInt(talent.storyLinkClicks30d)}`
        : null,
      talent.moyenneVuesStory ? `moy. ${fmtInt(talent.moyenneVuesStory)}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
  push(
    "Snap",
    talent.moyenneVuesSnap ? `moy. ${fmtInt(talent.moyenneVuesSnap)} vues` : null
  );
  push(
    "Évol. abonnés",
    [
      talent.ttFollowersEvol != null ? `TT ${fmtPct(talent.ttFollowersEvol)}` : null,
      talent.igFollowersEvol != null ? `IG ${fmtPct(talent.igFollowersEvol)}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
  push(
    "Évol. engagement",
    [
      talent.ttEngagementEvol != null ? `TT ${fmtPct(talent.ttEngagementEvol)}` : null,
      talent.igEngagementEvol != null ? `IG ${fmtPct(talent.igEngagementEvol)}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
  push("Notes TM (perfs mensuelles)", talent.perfNotes);
  push("Notes internes (fiche profil)", talent.notesInternes);

  const reach = buildTalentPerfReachHighlight({
    igFollowers: talent.igFollowers,
    ttFollowers: talent.ttFollowers,
    igMoyenneVuesReels: talent.igMoyenneVuesReels,
    igMeilleurReelVues: talent.igMeilleurReelVues,
    ttMoyenneVues: talent.ttMoyenneVues,
    ttMeilleurTiktokVues: talent.ttMeilleurTiktokVues,
    storyViewsMax: talent.storyViewsMax,
  });
  if (reach) {
    push(
      `Signal pitch (${reach.priority === "must" ? "fort vs abonnés" : "notable vs abonnés"})`,
      reach.fr
    );
  }

  if (lines.length === 0) {
    return "- (aucune perf contenu CRM saisie — s'appuyer sur la recherche web/X)";
  }
  return lines.join("\n");
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
    { re: /beaut[eé]|makeup|make-up|skincare|soin|cosm[eé]|haircare|peau/i, secteur: "Beauté" },
    { re: /mode|fashion|streetwear|luxe mode/i, secteur: "Mode" },
    { re: /food|cuisine|gastro|resto|culinaire|nutrition|hydrat/i, secteur: "Food" },
    { re: /tech|gaming|high-?tech|digital/i, secteur: "Tech" },
    {
      re: /sport|fitness|running|yoga|outdoor|triathlon|iron.?man|natation|cyclisme|musculation|crossfit|pilates|surf|padel|tennis|randonn|ski|combat|escalade|golf|equitation/i,
      secteur: "Sport",
    },
    { re: /luxe|luxury|premium/i, secteur: "Luxe" },
    { re: /auto|voiture|mobility/i, secteur: "Automobile" },
    { re: /finance|banque|fintech|assurance/i, secteur: "Finance" },
    { re: /sant[eé]|health|wellness|bien-?[eê]tre|recovery/i, secteur: "Santé" },
    { re: /voyage|travel|tourisme/i, secteur: "Voyage" },
    {
      re: /entertainment|cin[eé]|s[eé]rie|tv|humour|comedy|culture/i,
      secteur: "Entertainment",
    },
    {
      re: /lifestyle|maman|mom|famille|family|quotidien|grossesse|maternit|parentalit|enfants?|\bpet\b|animaux/i,
      secteur: "Lifestyle",
    },
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

/**
 * Secteurs CRM dérivés des niches + lifestyle (sports, famille, animaux…).
 * Ex. Running / Iron Man → Sport ; enfants → Lifestyle.
 */
export function talentToSecteurs(talent: CrmTalent): string[] {
  const signals = [
    ...talent.niches,
    ...talent.sports,
    ...(talent.animaux.length ? ["animaux", "pet"] : []),
    ...(talent.nombreEnfants != null && talent.nombreEnfants > 0
      ? ["famille", "maman", "parentalité"]
      : []),
    ...(talent.enceinte ? ["grossesse", "maman", "maternité"] : []),
    ...(talent.typePeau || talent.tendancePeau.length
      ? ["beauté", "skincare"]
      : []),
    ...(talent.typeCheveux || talent.tendanceCheveux.length
      ? ["beauté", "haircare"]
      : []),
  ];
  return nichesToSecteurs(signals);
}
