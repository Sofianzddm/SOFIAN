"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  getInstagramProfileUrl,
  normalizeInstagramHandle,
} from "@/lib/social-links";

// Polling : on rafraîchit toutes les 30s tant que l'onglet est visible.
// Tout changement de stats / tarif côté admin est ainsi visible quasi-live.
const POLL_INTERVAL_MS = 30_000;

// ============================================
// TYPES
// ============================================

interface PlatformAudience {
  followers: number | null;
  followersEvol: number | null;
  engagement: number | null;
  engagementEvol: number | null;
}

interface TarifsBlock {
  tarifStory: number | null;
  tarifStoryConcours: number | null;
  tarifPost: number | null;
  tarifPostConcours: number | null;
  tarifPostCommun: number | null;
  tarifPostCrosspost: number | null;
  tarifReel: number | null;
  tarifReelCrosspost: number | null;
  tarifReelConcours: number | null;
  tarifTiktokVideo: number | null;
  tarifTiktokConcours: number | null;
  tarifYoutubeVideo: number | null;
  tarifYoutubeShort: number | null;
  tarifSnapchatStory: number | null;
  tarifSnapchatSpotlight: number | null;
  tarifEvent: number | null;
  tarifShooting: number | null;
  tarifAmbassadeur: number | null;
}

type TarifKey = keyof TarifsBlock;

interface TarifsTalent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  niches: string[];
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  stats: {
    instagram: PlatformAudience | null;
    tiktok: PlatformAudience | null;
    youtube: PlatformAudience | null;
  };
  tarifs: TarifsBlock | null;
  updatedAt: string;
}

type PlatformKey = "instagram" | "youtube" | "tiktok";

// ============================================
// HELPERS
// ============================================

function formatFollowers(num: number | null): string {
  if (num === null || num === undefined) return "—";
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return m.toFixed(1).replace(".", ",") + "M";
  }
  if (num >= 1000) {
    const k = num / 1000;
    if (k >= 100) return Math.round(k) + "K";
    return k.toFixed(1).replace(".", ",") + "K";
  }
  return num.toString();
}

function formatPercent(n: number | null, digits = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(digits).replace(".", ",") + "%";
}

function formatEvol(
  n: number | null,
  unit: "%" | "PT" = "%"
): { label: string; positive: boolean } | null {
  if (n === null || n === undefined) return null;
  const positive = n >= 0;
  const value = Math.abs(n)
    .toFixed(n === 0 ? 0 : 2)
    .replace(".", ",");
  const suffix = unit === "PT" ? "PT" : "%";
  // Maquette : « ▲ 2,09% » / « ▲ 0,17PT » (espace après le triangle).
  return {
    label: `${positive ? "▲" : "▼"} ${value}${suffix}`,
    positive,
  };
}

function formatTarif(value: number | null): string {
  if (value === null || value === undefined) return "—";
  // Pas de séparateur de milliers pour coller exactement à la maquette
  // (« 1400€ HT », « 2800€ HT »…).
  return `${Math.round(value)}€ HT`;
}

// ============================================
// COULEURS (calées sur la maquette Claire Perrier)
// ============================================
const C = {
  black: "#000000",
  cream: "#F5EDE0",
  borderWhite: "rgba(255,255,255,0.55)",
  borderWhiteInner: "rgba(255,255,255,0.28)",
  line: "rgba(255,255,255,0.22)",
  evolGreen: "#D9E58F",
  evolGreenInk: "#1a1a1a",
} as const;

// ============================================
// LOGO GLOWUP
// ============================================
function GlowUpLogo({
  className = "",
  color = "#F5EDE0",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 478 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M58.1427 49.2504L58.3576 71.3492C37.4442 81.0362 14.7263 69.0428 13.6522 39.6706C12.4814 9.08627 46.7247 -4.15158 72.0098 31.2816L72.332 31.1851L68.7015 13.2164C40.7525 -1.42677 0 9.56901 0 44.7019C0 81.8515 49.5067 92.6542 72.9765 62.6706V38.2439H52.7936C55.0385 41.269 58.1535 45.5172 58.1535 49.2504H58.1427Z"
        fill={color}
      />
      <path
        d="M97.8426 74.7713V8.05642H83.0089V78.719H138.692L138.832 65.0843C130.69 71.553 114.578 74.7713 102.418 74.7713H97.8319H97.8426Z"
        fill={color}
      />
      <path
        d="M204.397 15.3297C187.866 2.30643 163.966 4.82741 150.518 20.3824C137.392 36.2378 139.745 58.9481 156.168 71.9714C172.699 84.2867 196.921 81.9695 210.465 66.3179C223.376 50.6664 220.605 27.7523 204.386 15.3405L204.397 15.3297ZM198.747 58.9374C185.836 73.9774 172.194 80.3389 158.531 69.5362C148.499 61.5656 148.499 44.2084 161.302 29.3614C173.891 14.4179 190.948 9.27936 202.259 17.5611C215.385 27.2481 211.228 44.1011 198.747 58.9481V58.9374Z"
        fill={color}
      />
      <path
        d="M403.637 8.46407V45.4099C403.637 82.9672 355.742 88.213 355.742 45.9141V8.05642H340.596V46.9225C340.596 90.8412 407.171 91.5492 407.171 45.8175V8.05642H403.648V8.46407H403.637Z"
        fill={color}
      />
      <path
        d="M446.925 8.05642H416.301V78.719H431.135V50.1515L446.925 50.0549C464.745 49.9584 477.333 41.3763 477.333 28.5461C477.333 16.6385 464.745 8.05642 446.925 8.05642ZM440.093 46.4075H431.135V10.792H440.093C454.82 10.792 461.533 15.8232 461.533 27.3339C461.533 40.2606 454.809 46.4075 440.093 46.4075Z"
        fill={color}
      />
      <path
        d="M325.451 0.0107276L317.395 8.05642L320.102 10.7598C324.678 15.5657 322.895 20.9832 319.522 27.6343L302.239 62.0591L278.984 18.1511L273.861 8.65716L273.538 8.05642H257.212L257.319 8.26024L262.12 16.9389L272.894 37.4286L260.52 61.9625L236.416 17.9473L231.078 8.56062L230.756 8.05642H214.536L214.859 8.56062L220.294 18.2476L255.181 79.9313H255.396L275.235 40.8614L296.783 79.9313H296.997L333.486 8.24952L333.593 8.04569H333.496L325.44 0L325.451 0.0107276Z"
        fill={color}
      />
    </svg>
  );
}

// ============================================
// GLYPHS RÉSEAUX
// ============================================

function InstagramGlyph({
  className = "",
  color = "currentColor",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function YouTubeGlyph({
  className = "",
  badge = false,
}: {
  className?: string;
  badge?: boolean;
}) {
  if (badge) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-[3px] bg-[#FF0033] ${className}`}
        style={{ width: 18, height: 12 }}
      >
        <span
          aria-hidden
          style={{
            width: 0,
            height: 0,
            borderTop: "3px solid transparent",
            borderBottom: "3px solid transparent",
            borderLeft: "5px solid #fff",
            marginLeft: 1,
          }}
        />
      </span>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TikTokGlyph({
  className = "",
  color = "currentColor",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={color}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V7.95a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.38z" />
    </svg>
  );
}

// ============================================
// BADGE LIVE
// ============================================
function LiveBadge({
  lastSyncAt,
  isRefreshing,
  onRefresh,
}: {
  lastSyncAt: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  function relativeTime(ts: number | null): string {
    if (!ts) return "—";
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 5) return "à l'instant";
    if (diff < 60) return `${diff}s`;
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h`;
  }

  return (
    <div className="fixed top-3 right-3 z-50 sm:top-4 sm:right-4">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="group flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-md border border-white/15 px-3 py-1.5 transition-colors disabled:opacity-70"
        title="Actualiser maintenant"
      >
        <span className="relative inline-flex h-2 w-2">
          {!isRefreshing && (
            <span className="absolute inset-0 inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isRefreshing ? "bg-amber-300" : "bg-emerald-400"
            }`}
          />
        </span>
        <span className="text-[10px] uppercase tracking-[0.25em] text-white/80 font-switzer">
          {isRefreshing ? "Sync…" : "Live"}
        </span>
        <span className="text-[10px] text-white/40 font-switzer hidden sm:inline">
          · {relativeTime(lastSyncAt)}
        </span>
      </button>
    </div>
  );
}

// ============================================
// COMPOSANTS BADGES / LIGNES STATS
// ============================================

function EvolBadge({
  value,
  unit = "%",
}: {
  value: number | null;
  unit?: "%" | "PT";
}) {
  const evol = formatEvol(value, unit);
  if (!evol) return null;
  return (
    <span
      className="inline-flex items-center text-[9px] font-switzer px-[5px] py-[3px] leading-none"
      style={{
        backgroundColor: C.evolGreen,
        color: C.evolGreenInk,
        borderRadius: 2,
      }}
    >
      {evol.label}
    </span>
  );
}

function PlatformIconForStat({ platform }: { platform: PlatformKey }) {
  // Petit pictogramme à gauche du chiffre de communauté.
  if (platform === "instagram") {
    return <InstagramGlyph className="w-[12px] h-[12px]" color={C.cream} />;
  }
  if (platform === "youtube") {
    return <YouTubeGlyph badge className="" />;
  }
  return <TikTokGlyph className="w-[12px] h-[12px]" color={C.cream} />;
}

function StatLine({
  platform,
  value,
  evol,
  evolUnit = "%",
  suffix,
}: {
  platform: PlatformKey;
  value: string;
  evol: number | null;
  evolUnit?: "%" | "PT";
  /** "k" suffixé en plus petit (« 95k »). */
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-[8px] flex-wrap">
      <PlatformIconForStat platform={platform} />
      <span className="text-[14px] font-switzer text-[#F5EDE0] leading-none flex items-baseline">
        {value}
        {suffix && (
          <span className="text-[11px] ml-[1px]">{suffix}</span>
        )}
      </span>
      <EvolBadge value={evol} unit={evolUnit} />
    </div>
  );
}

/**
 * Décompose "95K", "2,3M" en {valeur, suffixe} pour pouvoir styler le
 * suffixe en plus petit comme sur la maquette.
 */
function splitFormatted(num: number | null): { value: string; suffix?: string } {
  if (num === null || num === undefined) return { value: "—" };
  const formatted = formatFollowers(num);
  const match = /^(.+?)([KM])$/i.exec(formatted);
  if (match) return { value: match[1], suffix: match[2].toLowerCase() };
  return { value: formatted };
}

// ============================================
// LIGNES TARIFS
// ============================================

type TarifRowDef = {
  key: TarifKey;
  platform: PlatformKey | "snapchat" | "event";
  label: string;
};

// Toutes les prestations gérées en base. Les lignes dont le tarif est vide
// (null ou 0) sont filtrées avant l'affichage, donc la grille s'adapte
// automatiquement à ce qui est renseigné sur la fiche talent.
const TARIF_ROWS: TarifRowDef[] = [
  // Instagram
  { key: "tarifStory", platform: "instagram", label: "STORY" },
  { key: "tarifStoryConcours", platform: "instagram", label: "STORY CONCOURS" },
  { key: "tarifPost", platform: "instagram", label: "POST" },
  { key: "tarifPostConcours", platform: "instagram", label: "POST CONCOURS" },
  { key: "tarifPostCommun", platform: "instagram", label: "POST COMMUN" },
  { key: "tarifPostCrosspost", platform: "instagram", label: "POST CROSSPOST" },
  { key: "tarifReel", platform: "instagram", label: "REEL" },
  { key: "tarifReelCrosspost", platform: "instagram", label: "REEL CROSSPOST" },
  { key: "tarifReelConcours", platform: "instagram", label: "REEL CONCOURS" },
  // YouTube
  { key: "tarifYoutubeShort", platform: "youtube", label: "SHORT" },
  { key: "tarifYoutubeVideo", platform: "youtube", label: "INTÉGRATION" },
  // TikTok
  { key: "tarifTiktokVideo", platform: "tiktok", label: "VIDÉO" },
  { key: "tarifTiktokConcours", platform: "tiktok", label: "VIDÉO CONCOURS" },
  // Snapchat
  { key: "tarifSnapchatStory", platform: "snapchat", label: "STORY" },
  { key: "tarifSnapchatSpotlight", platform: "snapchat", label: "SPOTLIGHT" },
  // Autres
  { key: "tarifEvent", platform: "event", label: "EVENT" },
  { key: "tarifShooting", platform: "event", label: "SHOOTING" },
  { key: "tarifAmbassadeur", platform: "event", label: "AMBASSADEUR" },
];

function PlatformLabel({
  platform,
  compactSize = 17,
}: {
  platform: TarifRowDef["platform"];
  /** Taille de la signature "Instagram" — réduite quand la grille est dense. */
  compactSize?: number;
}) {
  if (platform === "instagram") {
    return (
      <span
        className="font-spectral-medium-italic text-[#F5EDE0] leading-none"
        style={{ fontSize: compactSize }}
      >
        Instagram
      </span>
    );
  }
  if (platform === "youtube") {
    return (
      <span className="inline-flex items-center gap-[7px]">
        <YouTubeGlyph badge />
        <span
          className="font-switzer text-[#F5EDE0]"
          style={{ fontSize: 11, fontStyle: "italic" }}
        >
          YouTube
        </span>
      </span>
    );
  }
  if (platform === "tiktok") {
    return (
      <span className="inline-flex items-center gap-[7px]">
        <TikTokGlyph className="w-[13px] h-[13px]" color="#F5EDE0" />
        <span className="font-switzer text-[11px] text-[#F5EDE0]">TikTok</span>
      </span>
    );
  }
  if (platform === "snapchat") {
    return (
      <span
        className="font-switzer text-[#F5EDE0]"
        style={{ fontSize: 11, letterSpacing: "0.04em" }}
      >
        Snapchat
      </span>
    );
  }
  // "event" : prestations physiques (Event / Shooting / Ambassadeur).
  return (
    <span
      className="font-switzer text-[#F5EDE0] uppercase"
      style={{ fontSize: 9.5, letterSpacing: "0.22em" }}
    >
      Prestation
    </span>
  );
}

// ============================================
// PAGE INTERNE (A4)
// ============================================

// Dimensions "design" A4 à 96dpi. Le contenu intérieur est tracé à cette
// taille (px fixes), puis on applique transform:scale() via ResizeObserver
// pour rester pixel-perfect sur desktop et tenir sur mobile.
const A4_DESIGN_WIDTH = 794;
const A4_DESIGN_HEIGHT = 1123; // 794 * 297 / 210

function useA4Scale() {
  const outerRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const apply = () => {
      const w = outer.clientWidth;
      if (!w) return;
      const scale = Math.min(1, w / A4_DESIGN_WIDTH);
      inner.style.transform = `scale(${scale})`;
    };

    apply();

    const ro = new ResizeObserver(apply);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  return { outerRef, innerRef };
}

function TarifPage({ talent }: { talent: TarifsTalent }) {
  const year = new Date().getFullYear();
  const { outerRef, innerRef } = useA4Scale();

  // Plateformes disponibles pour bloc audience (uniquement celles avec data)
  const audienceRows: {
    platform: PlatformKey;
    data: PlatformAudience;
    profileUrl: string | null;
    label: string;
  }[] = [];

  const ig = talent.stats.instagram;
  if (ig && ig.followers) {
    audienceRows.push({
      platform: "instagram",
      data: ig,
      profileUrl: getInstagramProfileUrl(talent.instagram),
      label: "INSTAGRAM",
    });
  }
  const yt = talent.stats.youtube;
  if (yt && yt.followers) {
    const ytHandle = (talent.youtube || "").replace(/^@/, "").trim();
    audienceRows.push({
      platform: "youtube",
      data: yt,
      profileUrl: ytHandle
        ? ytHandle.startsWith("http")
          ? ytHandle
          : `https://youtube.com/${ytHandle.startsWith("@") ? ytHandle : `@${ytHandle}`}`
        : null,
      label: "YOUTUBE",
    });
  }
  const tt = talent.stats.tiktok;
  if (tt && tt.followers) {
    const ttHandle = (talent.tiktok || "").replace(/^@/, "").trim();
    audienceRows.push({
      platform: "tiktok",
      data: tt,
      profileUrl: ttHandle ? `https://tiktok.com/@${ttHandle}` : null,
      label: "TIKTOK",
    });
  }

  // Tarifs effectivement renseignés
  const tarifRows = talent.tarifs
    ? TARIF_ROWS.filter((r) => {
        const v = talent.tarifs ? talent.tarifs[r.key] : null;
        return v !== null && v !== undefined && v > 0;
      }).map((r) => ({
        ...r,
        value: talent.tarifs ? talent.tarifs[r.key] : null,
      }))
    : [];

  return (
    <article
      ref={outerRef}
      className="relative w-full mx-auto overflow-hidden"
      style={{
        maxWidth: A4_DESIGN_WIDTH,
        aspectRatio: "210 / 297",
        backgroundColor: C.black,
        boxShadow:
          "0 30px 90px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.25)",
      }}
    >
      <div
        ref={innerRef}
        className="absolute top-0 left-0"
        style={{
          width: A4_DESIGN_WIDTH,
          height: A4_DESIGN_HEIGHT,
          transformOrigin: "top left",
        }}
      >
        {/* Double cadre blanc (maquette) */}
        <div
          className="absolute inset-[12px] pointer-events-none z-30"
          style={{ border: `1px solid ${C.borderWhite}` }}
        />
        <div
          className="absolute inset-[16px] pointer-events-none z-30"
          style={{ border: `1px solid ${C.borderWhiteInner}` }}
        />

        <div className="absolute inset-0 flex flex-col">
        {/* Zone haute : dégradé bordeaux → noir.
            Multi-stops avec courbe douce pour éviter les bandes visibles
            et créer une transition cinématographique vers la section noire. */}
        <section
          className="relative flex flex-col shrink-0"
          style={{
            background: [
              // Léger halo radial chaud en haut pour adoucir l'arrivée du bordeaux
              "radial-gradient(120% 80% at 50% -10%, rgba(196,128,128,0.55) 0%, rgba(196,128,128,0) 60%)",
              // Dégradé principal vertical, courbe progressive bordeaux → noir
              "linear-gradient(180deg, #A86C6C 0%, #9C5C5C 10%, #8D4848 22%, #783636 36%, #5F2727 52%, #461B1B 66%, #2E1212 78%, #1A0A0A 88%, #0A0404 96%, #000000 100%)",
            ].join(", "),
          }}
        >
          <div className="pt-[32px] flex justify-center shrink-0">
            <GlowUpLogo className="h-[13px]" color={C.cream} />
          </div>

          <div className="mt-[24px] px-[44px] pb-[28px] grid grid-cols-[1fr_220px] gap-[22px] items-start">
            <div className="flex flex-col min-w-0">
              <h1
                className="font-spectral-medium-italic text-[#F5EDE0] leading-[1.05]"
                style={{ fontSize: 28 }}
              >
                {talent.prenom}{" "}
                <span className="uppercase">{talent.nom}</span>
              </h1>

              {talent.niches.length > 0 && (
                <p
                  className="mt-[12px] text-[#F5EDE0] font-switzer uppercase"
                  style={{ fontSize: 8.5, letterSpacing: "0.28em" }}
                >
                  {talent.niches
                    .slice(0, 3)
                    .map((n) => n.toUpperCase())
                    .join(" / ")}
                  {" /"}
                </p>
              )}

              <p
                className="mt-[8px] text-[#F5EDE0] font-spectral-light-italic"
                style={{ fontSize: 14 }}
              >
                Créatrice de contenu
              </p>

              {audienceRows.length > 0 && (
                <div className="mt-[28px]">
                  <div className="grid grid-cols-2 gap-x-[36px] mb-[14px]">
                    <p
                      className="text-[#F5EDE0]/80 font-switzer uppercase"
                      style={{ fontSize: 8, letterSpacing: "0.24em" }}
                    >
                      Communauté
                    </p>
                    <p
                      className="text-[#F5EDE0]/80 font-switzer uppercase"
                      style={{ fontSize: 8, letterSpacing: "0.2em" }}
                    >
                      Tx d&apos;engagement
                    </p>
                  </div>

                  {audienceRows.map((row) => {
                    const split = splitFormatted(row.data.followers);
                    return (
                      <div
                        key={row.platform}
                        className="grid grid-cols-2 gap-x-[36px] items-center mb-[12px] last:mb-0"
                      >
                        <StatLine
                          platform={row.platform}
                          value={split.value}
                          suffix={split.suffix}
                          evol={row.data.followersEvol}
                          evolUnit="%"
                        />
                        <div className="flex items-center gap-[8px]">
                          <span className="text-[14px] font-switzer text-[#F5EDE0] leading-none">
                            {formatPercent(row.data.engagement, 2)}
                          </span>
                          <EvolBadge
                            value={row.data.engagementEvol}
                            unit="PT"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {audienceRows.length > 0 && (
                <div className="mt-[22px] flex flex-wrap gap-x-[32px] gap-y-[6px]">
                  {audienceRows.map((row) =>
                    row.profileUrl ? (
                      <a
                        key={row.platform}
                        href={row.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#F5EDE0] font-spectral-light underline underline-offset-[4px] hover:opacity-80 uppercase"
                        style={{ fontSize: 11, letterSpacing: "0.2em" }}
                      >
                        {row.label}
                      </a>
                    ) : (
                      <span
                        key={row.platform}
                        className="text-[#F5EDE0]/75 font-spectral-light underline underline-offset-[4px] uppercase"
                        style={{ fontSize: 11, letterSpacing: "0.2em" }}
                      >
                        {row.label}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>

            <div
              className="relative w-full overflow-hidden shrink-0"
              style={{ aspectRatio: "4 / 5" }}
            >
              {talent.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={talent.photo}
                  alt={`${talent.prenom} ${talent.nom}`}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: "center 20%" }}
                />
              ) : (
                <div className="w-full h-full bg-[#4A2222] flex items-center justify-center">
                  <span className="text-4xl text-[#F5EDE0]/35 font-spectral-light">
                    {talent.prenom.charAt(0)}
                    {talent.nom.charAt(0)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Séparateur horizontal : trait fin avec halo bordeaux discret pour
            adoucir la jonction entre les deux zones. */}
        <div
          className="shrink-0 relative w-full z-10"
          style={{ height: 1 }}
        >
          {/* Halo soft au-dessus pour fondre la fin du bordeaux */}
          <div
            className="absolute left-0 right-0 -top-[40px] h-[40px] pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)",
            }}
          />
          {/* Halo soft en dessous pour amorcer le noir */}
          <div
            className="absolute left-0 right-0 top-[1px] h-[60px] pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(90,30,30,0.35) 0%, rgba(0,0,0,0) 100%)",
            }}
          />
          {/* Le trait lui-même */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(245,237,224,0) 0%, rgba(245,237,224,0.35) 18%, rgba(245,237,224,0.45) 50%, rgba(245,237,224,0.35) 82%, rgba(245,237,224,0) 100%)",
            }}
          />
        </div>

        {/* Zone basse : fond noir + grille tarifaire */}
        <section
          className="relative flex-1 flex flex-col"
          style={{ backgroundColor: C.black }}
        >
          <div className="flex-1 px-[44px] pt-[28px] pb-[40px] flex flex-col">
            <h2
              className="text-center font-spectral-light text-[#F5EDE0] shrink-0"
              style={{ fontSize: 14, letterSpacing: "0.12em" }}
            >
              <span className="opacity-60 mx-[8px]">•</span>
              GRILLE TARIFAIRE {year}
              <span className="opacity-60 mx-[8px]">•</span>
            </h2>

            <div className="mt-[24px] flex-1 min-h-0 flex flex-col">
              <div
                className="grid grid-cols-[148px_1fr_108px] items-end pb-[12px] text-[#F5EDE0]/65 font-switzer uppercase shrink-0"
                style={{ fontSize: 7.5, letterSpacing: "0.28em" }}
              >
                <span>Plateforme</span>
                <span className="text-center">Prestations</span>
                <span className="text-right">Tarifs</span>
              </div>
              <div className="h-px shrink-0" style={{ background: C.line }} />

              {tarifRows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[#F5EDE0]/50 font-spectral-light-italic text-[12px]">
                    Grille tarifaire à venir.
                  </p>
                </div>
              ) : (
                (() => {
                  // Pas vertical adapté au nombre de lignes pour garder une
                  // grille bien aérée même quand toutes les prestations sont
                  // renseignées (jusqu'à 18 lignes en théorie).
                  const n = tarifRows.length;
                  const padY = n <= 9 ? 11 : n <= 12 ? 8 : n <= 15 ? 6 : 5;
                  const labelSize = n <= 12 ? 9.5 : 8.5;
                  const priceSize = n <= 12 ? 13 : 12;
                  const platformSize = n <= 12 ? 17 : 15;
                  return (
                    <div className="flex-1 flex flex-col">
                      {tarifRows.map((row, idx) => (
                        <div key={row.key} className="shrink-0">
                          <div
                            className="grid grid-cols-[148px_1fr_108px] items-center"
                            style={{
                              paddingTop: padY,
                              paddingBottom: padY,
                            }}
                          >
                            <PlatformLabel
                              platform={row.platform}
                              compactSize={platformSize}
                            />
                            <span
                              className="text-center text-[#F5EDE0] font-switzer uppercase"
                              style={{
                                fontSize: labelSize,
                                letterSpacing: "0.2em",
                              }}
                            >
                              {row.label}
                            </span>
                            <span
                              className="text-right font-spectral-medium-italic text-[#F5EDE0]"
                              style={{ fontSize: priceSize }}
                            >
                              {formatTarif(row.value)}
                            </span>
                          </div>
                          {idx < tarifRows.length - 1 && (
                            <div
                              className="h-px"
                              style={{ background: C.line }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </section>
      </div>
      </div>
    </article>
  );
}

// ============================================
// PAGE PUBLIQUE
// ============================================

export default function TarifsPublicPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [talent, setTalent] = useState<TarifsTalent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Robots meta de secours côté client (en plus du layout serveur).
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      if (meta.parentNode) meta.parentNode.removeChild(meta);
    };
  }, []);

  const fetchTalent = useCallback(
    async (opts: { showSpinner?: boolean } = {}) => {
      if (!slug) return;
      if (opts.showSpinner) setIsRefreshing(true);
      try {
        const res = await fetch(`/api/tarifs/${slug}?_t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!mountedRef.current) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as TarifsTalent;
          if (!mountedRef.current) return;
          setTalent(data);
          setLastSyncAt(Date.now());
          setNotFound(false);
        }
      } catch (err) {
        console.error("Tarifs page load error:", err);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [slug]
  );

  useEffect(() => {
    fetchTalent();
  }, [fetchTalent]);

  useEffect(() => {
    if (!slug) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchTalent();
      }
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchTalent();
      }
    };
    const onFocus = () => fetchTalent();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [slug, fetchTalent]);

  return (
    <>
      <style jsx global>{`
        @font-face {
          font-family: "Spectral-MediumItalic";
          src: url("/fonts/Spectral-MediumItalic.ttf") format("truetype");
          font-weight: 500;
          font-style: italic;
          font-display: swap;
        }
        @font-face {
          font-family: "Spectral-Light";
          src: url("/fonts/Spectral-Light.ttf") format("truetype");
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: "Spectral-LightItalic";
          src: url("/fonts/Spectral-LightItalic.ttf") format("truetype");
          font-weight: 300;
          font-style: italic;
          font-display: swap;
        }
        @font-face {
          font-family: "Switzer";
          src: url("/fonts/Switzer-Light.ttf") format("truetype");
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }
        .font-spectral-medium-italic {
          font-family: "Spectral-MediumItalic", "Cormorant Garamond",
            Georgia, serif;
        }
        .font-spectral-light {
          font-family: "Spectral-Light", "Cormorant Garamond", Georgia, serif;
        }
        .font-spectral-light-italic {
          font-family: "Spectral-LightItalic", "Cormorant Garamond", Georgia,
            serif;
          font-style: italic;
        }
        .font-switzer {
          font-family: "Switzer", "Inter", system-ui, sans-serif;
        }
      `}</style>

      {loading ? (
        <div className="min-h-screen bg-[#0B0707] flex items-center justify-center">
          <div className="text-[#F5EDE0] text-xs tracking-[0.3em] uppercase font-switzer">
            Chargement…
          </div>
        </div>
      ) : notFound || !talent ? (
        <div className="min-h-screen bg-[#0B0707] flex flex-col items-center justify-center px-6 text-center text-[#F5EDE0]">
          <GlowUpLogo className="h-8 mb-6" color="#F5EDE0" />
          <h1 className="text-3xl font-spectral-light mb-3">
            Grille tarifaire introuvable
          </h1>
          <p className="opacity-60 font-spectral-light">
            Le lien que vous avez utilisé n'est plus valide.
          </p>
        </div>
      ) : (
        <main
          className="min-h-screen w-full"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, #2a1313 0%, #150909 50%, #0c0606 100%)",
          }}
        >
          <LiveBadge
            lastSyncAt={lastSyncAt}
            isRefreshing={isRefreshing}
            onRefresh={() => fetchTalent({ showSpinner: true })}
          />

          <div className="mx-auto py-8 sm:py-12 md:py-16 px-3 sm:px-6 md:px-8 flex flex-col items-center">
            <TarifPage talent={talent} />
          </div>
        </main>
      )}
    </>
  );
}

// `normalizeInstagramHandle` est importé pour symétrie avec la page kit
// mais nous utilisons `getInstagramProfileUrl` directement plus haut.
// (Évite un warning d'import inutilisé sans rouvrir un cycle.)
void normalizeInstagramHandle;
