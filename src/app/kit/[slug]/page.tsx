"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  getInstagramProfileUrl,
  normalizeInstagramHandle,
} from "@/lib/social-links";
import { localizeTalentAttribute } from "@/lib/talent-attributes";

// Intervalle de polling : on rafraîchit le kit toutes les 30s tant
// que l'onglet est visible. À chaque retour de focus on force aussi
// un refetch immédiat.
const POLL_INTERVAL_MS = 30_000;

// ============================================
// I18N
// ============================================
type Lang = "fr" | "en";

const LANG_STORAGE_KEY = "glowup.kit.lang";

const translations = {
  fr: {
    // Badge live
    liveLabel: "Live",
    syncing: "Sync…",
    refreshNow: "Actualiser maintenant",
    justNow: "à l'instant",
    minutesShort: "min",
    // Toggle
    switchToEnglish: "Voir en anglais",
    switchToFrench: "Voir en français",
    // Cover
    kitMediaLabel: "Kit Media",
    contentCreator: "Créateur de contenu",
    // Présentation
    presentationFooter: "Présentation",
    presentationTitle: "Présentation",
    presentationFallback: "Présentation à venir.",
    contact: "Contact",
    location: "Localisation",
    skinType: "Type de peau",
    hairType: "Type de cheveux",
    hairColor: "Couleur de cheveux",
    selectedClients: "Selected clients",
    // Analytics
    instagramAnalyticsTitle: "INSTAGRAM ANALYTIQUE",
    tiktokAnalyticsTitle: "TIKTOK ANALYTIQUE",
    instagramFooter: "Statistiques Instagram",
    tiktokFooter: "Statistiques TikTok",
    last30Days: "30 derniers jours",
    followers: "ABONNÉS",
    community: "Communauté",
    engagementRate: "Tx d'engagement",
    genders: "GENRES",
    women: "FEMMES",
    men: "HOMMES",
    mainAgeRange: "TRANCHE D'ÂGE PRINCIPALE",
    mainLocations: "LIEUX PRINCIPAUX",
    france: "FRANCE",
    others: "Autres",
    // Closing
    address: "Adresse",
    socials: "Réseaux",
    // États
    loading: "Chargement…",
    notFoundTitle: "Kit media introuvable",
    notFoundDesc: "Le lien que vous avez utilisé n'est plus valide.",
  },
  en: {
    liveLabel: "Live",
    syncing: "Sync…",
    refreshNow: "Refresh now",
    justNow: "just now",
    minutesShort: "min",
    switchToEnglish: "View in English",
    switchToFrench: "View in French",
    kitMediaLabel: "Media Kit",
    contentCreator: "Content creator",
    presentationFooter: "About",
    presentationTitle: "About",
    presentationFallback: "About text coming soon.",
    contact: "Contact",
    location: "Location",
    skinType: "Skin type",
    hairType: "Hair type",
    hairColor: "Hair color",
    selectedClients: "Selected clients",
    instagramAnalyticsTitle: "INSTAGRAM ANALYTICS",
    tiktokAnalyticsTitle: "TIKTOK ANALYTICS",
    instagramFooter: "Instagram analytics",
    tiktokFooter: "TikTok analytics",
    last30Days: "Last 30 days",
    followers: "FOLLOWERS",
    community: "Community",
    engagementRate: "Engagement rate",
    genders: "GENDERS",
    women: "WOMEN",
    men: "MEN",
    mainAgeRange: "MAIN AGE RANGE",
    mainLocations: "MAIN LOCATIONS",
    france: "FRANCE",
    others: "Others",
    address: "Address",
    socials: "Socials",
    loading: "Loading…",
    notFoundTitle: "Media kit not found",
    notFoundDesc: "The link you used is no longer valid.",
  },
} as const;

// On élargit le type des valeurs en `string` pour que fr et en
// restent assignables au même `Dictionary` (sinon `as const` créerait
// des types littéraux incompatibles entre les deux variantes).
type Dictionary = {
  readonly [K in keyof (typeof translations)["fr"]]: string;
};

// ============================================
// TYPES
// ============================================

interface PlatformStats {
  followers: number | null;
  followersEvol: number | null;
  engagement: number | null;
  engagementEvol: number | null;
  genreFemme: number | null;
  genreHomme: number | null;
  age13_17: number | null;
  age18_24: number | null;
  age25_34: number | null;
  age35_44: number | null;
  age45Plus: number | null;
  locFrance: number | null;
  locAutre: string | null;
}

interface KitTalent {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  photo: string | null;
  // Tableau de 10 photos additionnelles (slots null si manquants).
  // Distribution dans le kit :
  //   [0,1,2] : bandeau présentation
  //   [3,4,5] : colonne IG analytics
  //   [6,7,8] : colonne TT analytics
  //   [9]     : photo bonus (lookbook futur)
  kitPhotos: (string | null)[];
  presentation: string | null;
  presentationEn: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  snapchat: string | null;
  niches: string[];
  ville: string | null;
  pays: string | null;
  typePeau: string | null;
  typeCheveux: string | null;
  couleurCheveux: string | null;
  selectedClients: string[];
  instagramStats: PlatformStats | null;
  tiktokStats: PlatformStats | null;
  youtubeStats: { abonnes: number | null; abonnesEvol: number | null } | null;
  updatedAt: string;
}

// ============================================
// HELPERS
// ============================================

function formatFollowers(num: number | null): string {
  if (!num) return "—";
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

function formatPercent(n: number | null, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(digits).replace(".", ",") + "%";
}

function formatEvol(n: number | null): {
  label: string;
  positive: boolean;
  zero: boolean;
} | null {
  if (n === null || n === undefined) return null;
  const zero = n === 0;
  const positive = n >= 0;
  const value = Math.abs(n)
    .toFixed(n === 0 ? 0 : 2)
    .replace(".", ",");
  return {
    label: `${positive ? "▲" : "▼"} ${positive ? "+" : "-"}${value}%`,
    positive,
    zero,
  };
}

// ============================================
// SVG ASSETS
// ============================================

function GlowUpLogo({
  className = "",
  color = "#220101",
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

function InstagramGlyph({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function TikTokGlyph({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.69a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.12z" />
    </svg>
  );
}

// ============================================
// BADGE LIVE
// ============================================
//
// Petit indicateur fixé en haut à droite qui montre que la donnée
// est tirée en direct de la fiche talent. Cliquable pour rafraîchir.
//
function LiveBadge({
  lastSyncAt,
  isRefreshing,
  onRefresh,
  t,
}: {
  lastSyncAt: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  t: Dictionary;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  function relativeTime(ts: number | null): string {
    if (!ts) return "—";
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 5) return t.justNow;
    if (diff < 60) return `${diff}s`;
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes} ${t.minutesShort}`;
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
        title={t.refreshNow}
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
          {isRefreshing ? t.syncing : t.liveLabel}
        </span>
        <span className="text-[10px] text-white/40 font-switzer hidden sm:inline">
          · {relativeTime(lastSyncAt)}
        </span>
      </button>
    </div>
  );
}

// ============================================
// LANG TOGGLE
// ============================================
//
// Bouton flottant en haut à gauche pour basculer entre FR et EN.
// Le choix est persisté en localStorage pour suivre l'utilisateur
// d'un kit à l'autre.
//
function LangToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
}) {
  return (
    <div className="fixed top-3 left-3 z-50 sm:top-4 sm:left-4">
      <div className="flex items-center rounded-full bg-white/10 backdrop-blur-md border border-white/15 p-1">
        <button
          type="button"
          onClick={() => onChange("fr")}
          className={`px-2.5 py-1 rounded-full text-[10px] font-switzer tracking-[0.2em] uppercase transition-colors ${
            lang === "fr"
              ? "bg-white/85 text-[#220101]"
              : "text-white/70 hover:text-white"
          }`}
        >
          FR
        </button>
        <button
          type="button"
          onClick={() => onChange("en")}
          className={`px-2.5 py-1 rounded-full text-[10px] font-switzer tracking-[0.2em] uppercase transition-colors ${
            lang === "en"
              ? "bg-white/85 text-[#220101]"
              : "text-white/70 hover:text-white"
          }`}
        >
          EN
        </button>
      </div>
    </div>
  );
}

// ============================================
// COULEURS (extraites du PDF Manon Delsol)
// ============================================
const C = {
  cream: "#F2E8D5", // fond pages claires
  ink: "#220101", // marron / "noir" Glow Up
  inkSoft: "#3F1E1E",
  burgundy: "#5C2A30", // utilisé pour les barres "remplies"
  lime: "#D9E58F", // vert clair sidebar
  limeBar: "#C9D77A", // version barre
  evolGreen: "#E5F2B5",
  evolGreenInk: "#4a5d23",
  // Placeholder photos manquantes : nuance plus foncée que le fond crème
  // pour qu'on voie clairement les slots vides sans casser l'harmonie.
  placeholder: "#E5DCC9",
  placeholderInk: "#220101",
} as const;

// ============================================
// COMPOSANT PHOTO
// ============================================
//
// Affiche une photo en object-cover. Si le slot est null/vide,
// affiche un carré "placeholder" crème (jamais de bord blanc qui détonne).
//
function KitPhoto({
  src,
  alt,
  aspectRatio = "3 / 4",
  focusY = 15,
  className = "",
}: {
  src: string | null | undefined;
  alt: string;
  aspectRatio?: string;
  focusY?: number; // en %
  className?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{
        aspectRatio,
        backgroundColor: C.placeholder,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          style={{ objectPosition: `center ${focusY}%` }}
        />
      ) : (
        // Placeholder : ligne diagonale fine, façon "slot photo vide"
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full opacity-30"
        >
          <line
            x1="0"
            y1="0"
            x2="100"
            y2="100"
            stroke={C.placeholderInk}
            strokeWidth="0.4"
          />
          <line
            x1="100"
            y1="0"
            x2="0"
            y2="100"
            stroke={C.placeholderInk}
            strokeWidth="0.4"
          />
        </svg>
      )}
    </div>
  );
}

// ============================================
// BARRES STATS
// ============================================
//
// Convention du PDF :
// - track (fond) : marron Glow Up #220101
// - fill (rempli) : vert lime #C9D77A
// - extrémités arrondies, hauteur ~6px
//
function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 6,
        backgroundColor: C.ink,
        borderRadius: 9999,
      }}
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          backgroundColor: C.limeBar,
          borderRadius: 9999,
        }}
      />
    </div>
  );
}

function StatBarRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value === null || value === undefined) return null;
  return (
    <div className="grid grid-cols-[68px_1fr_44px] items-center gap-3 py-[5px]">
      <span className="text-[9px] tracking-[0.18em] text-[#220101] font-switzer">
        {label}
      </span>
      <ProgressBar value={value} />
      <span className="text-right text-[10px] text-[#220101] font-switzer">
        {formatPercent(value, 0)}
      </span>
    </div>
  );
}

function EvolBadge({ value }: { value: number | null }) {
  const evol = formatEvol(value);
  if (!evol) return null;
  return (
    <span
      className="inline-flex items-center text-[10px] font-switzer px-2 py-[2px] leading-none rounded-sm"
      style={{
        backgroundColor: C.evolGreen,
        color: C.evolGreenInk,
      }}
    >
      {evol.label}
    </span>
  );
}

// ============================================
// WRAPPER PAGE A4
// ============================================
//
// Strict A4 portrait — width:height = 210:297.
// Sur desktop : largeur max 794px (A4 à 96dpi),
// ombre prononcée pour effet "page imprimée".
// Sur mobile : pleine largeur, ratio conservé.
//
// Dimensions "design" d'une page A4 à 96dpi.
// Toute la mise en page intérieure est faite à cette taille (en px fixes),
// puis on applique un transform:scale() basé sur la largeur réelle de
// l'article via ResizeObserver → la page reste pixel-perfect sur desktop
// et se réduit proportionnellement sur mobile/tablette.
const A4_DESIGN_WIDTH = 794;
const A4_DESIGN_HEIGHT = 1123; // 794 * 297 / 210

// Hook : mesure la largeur de l'article et applique scale(width/794)
// sur l'inner. Garanti tous navigateurs (pas de container queries).
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

function PageA4({
  children,
  background = C.cream,
  className = "",
  pageLabel,
  pageNumber,
  textColor = C.ink,
}: {
  children: React.ReactNode;
  background?: string;
  className?: string;
  pageLabel?: string;
  pageNumber?: string;
  textColor?: string;
}) {
  const { outerRef, innerRef } = useA4Scale();
  return (
    <article
      ref={outerRef}
      className={`relative w-full mx-auto overflow-hidden ${className}`}
      style={{
        maxWidth: A4_DESIGN_WIDTH,
        aspectRatio: "210 / 297",
        background,
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
        {children}
        {(pageLabel || pageNumber) && (
          <div
            className="absolute bottom-[18px] left-0 right-0 px-[36px] flex items-end justify-between"
            style={{ color: textColor }}
          >
            <span className="text-[9px] uppercase tracking-[0.25em] font-switzer opacity-80">
              {pageLabel}
            </span>
            <span className="text-[9px] uppercase tracking-[0.25em] font-switzer opacity-80">
              {pageNumber}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

// ============================================
// SECTIONS
// ============================================

function CoverPage({ talent, t }: { talent: KitTalent; t: Dictionary }) {
  return (
    <PageA4
      // Dégradé linéaire bordeaux qui colle au PDF Manon Delsol :
      // rouge bordeaux moyen en haut → noir bordeaux en bas.
      background="linear-gradient(180deg, #A75858 0%, #843A3A 22%, #5E2424 48%, #341212 76%, #1A0808 100%)"
      textColor="#F5EDE0"
      pageLabel={t.kitMediaLabel}
      pageNumber={String(new Date().getFullYear())}
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Logo Glow Up */}
        <div className="pt-[36px] flex justify-center">
          <GlowUpLogo className="h-[14px]" color="#F5EDE0" />
        </div>

        {/* Nom du talent */}
        <div className="px-[36px] mt-[58px]">
          <h1
            className="font-spectral-medium-italic text-[#F5EDE0] leading-[0.95] text-center"
            style={{
              fontSize: "clamp(40px, 9.4vw, 78px)",
              letterSpacing: "0.005em",
            }}
          >
            {talent.prenom.toUpperCase()} {talent.nom.toUpperCase()}
          </h1>
        </div>

        {/* Photo */}
        <div className="flex-1 flex items-center justify-center px-[44px]">
          <div
            className="relative w-full max-w-[320px]"
            style={{ aspectRatio: "3 / 4" }}
          >
            {talent.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={talent.photo}
                alt={`${talent.prenom} ${talent.nom}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#5C2424] to-[#2A0F0F] flex items-center justify-center">
                <span className="text-6xl text-[#F5EDE0]/40 font-spectral-light tracking-[0.3em]">
                  {talent.prenom.charAt(0)}
                  {talent.nom.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Rôle + niches */}
        <div className="pb-[90px] px-[36px] text-center text-[#F5EDE0]">
          <p className="text-[14px] font-spectral-light-italic">
            {t.contentCreator}
          </p>
          {talent.niches.length > 0 && (
            <p className="mt-[22px] text-[10px] font-switzer tracking-[0.55em] uppercase">
              {talent.niches
                .slice(0, 3)
                .join("   /   ")
                .toUpperCase()}
            </p>
          )}
        </div>
      </div>
    </PageA4>
  );
}

function PresentationPage({
  talent,
  t,
  lang,
}: {
  talent: KitTalent;
  t: Dictionary;
  lang: Lang;
}) {
  const ttHandle = talent.tiktok?.replace(/^@/, "");
  const igUrl = getInstagramProfileUrl(talent.instagram);
  const ttUrl = ttHandle ? `https://tiktok.com/@${ttHandle}` : null;

  // Bascule du texte de présentation : version EN si dispo, sinon
  // fallback sur la version FR pour ne jamais laisser un kit vide.
  const presentationText =
    lang === "en"
      ? talent.presentationEn || talent.presentation
      : talent.presentation;

  // Localisation : "VILLE, PAYS" — on enlève les préfixes "soorts-" etc.
  // et on évite la duplication France/France.
  const localisation = (() => {
    const ville = (talent.ville || "")
      .replace(/^soorts[\s-]?/i, "")
      .trim();
    const pays = (talent.pays || "").trim();
    return [ville, pays]
      .filter(Boolean)
      .map((s) => s.toUpperCase())
      .join(", ");
  })();

  // Attributs beauté (peau / cheveux) — affichés seulement si renseignés,
  // traduits selon la langue du kit.
  const beautyAttrs = [
    { label: t.skinType, value: localizeTalentAttribute(talent.typePeau, lang) },
    { label: t.hairType, value: localizeTalentAttribute(talent.typeCheveux, lang) },
    {
      label: t.hairColor,
      value: localizeTalentAttribute(talent.couleurCheveux, lang),
    },
  ].filter((a) => a.value);

  return (
    <PageA4
      background={C.cream}
      pageLabel={t.presentationFooter}
      pageNumber="02"
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Header logo */}
        <div className="pt-[28px] flex justify-center">
          <GlowUpLogo className="h-[14px]" color={C.ink} />
        </div>

        {/* Bandeau de 3 photos juxtaposées (slots 0,1,2 de kitPhotos)
            comme dans le PDF. Chaque photo est en 3:4 portrait. */}
        <div className="mt-[26px] px-[36px]">
          <div className="grid grid-cols-3 gap-[8px]">
            {[0, 1, 2].map((i) => (
              <KitPhoto
                key={`pres-${i}`}
                src={talent.kitPhotos?.[i] || (i === 1 ? talent.photo : null)}
                alt={`${talent.prenom} ${talent.nom} ${i + 1}`}
                aspectRatio="3 / 4"
                focusY={15}
              />
            ))}
          </div>
        </div>

        {/* Corps : sidebar verte + texte
            - flex-1 pour remplir l'espace vertical restant
            - pb-[60px] pour laisser respirer au-dessus du footer page */}
        <div className="flex-1 min-h-0 mt-[24px] mb-[60px] px-[36px] grid grid-cols-[150px_1fr] gap-[26px]">
          {/* Sidebar lime — h-full pour s'étirer jusqu'en bas */}
          <aside
            className="h-full p-[18px] flex flex-col gap-[18px] text-[#220101]"
            style={{ backgroundColor: C.lime }}
          >
            {talent.email && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.25em] mb-[6px] font-switzer">
                  {t.contact}
                </p>
                <a
                  href={`mailto:${talent.email}`}
                  className="text-[10px] font-spectral-light break-all hover:underline lowercase"
                >
                  {talent.email}
                </a>
              </div>
            )}

            {localisation && (
              <div>
                <p className="text-[8px] uppercase tracking-[0.25em] mb-[6px] font-switzer">
                  {t.location}
                </p>
                <p className="text-[10px] font-spectral-light tracking-wide leading-snug">
                  {localisation}
                </p>
              </div>
            )}

            {beautyAttrs.map((attr) => (
              <div key={attr.label}>
                <p className="text-[8px] uppercase tracking-[0.25em] mb-[6px] font-switzer">
                  {attr.label}
                </p>
                <p className="text-[10px] font-spectral-light tracking-wide leading-snug">
                  {attr.value}
                </p>
              </div>
            ))}

            {/* Socials toujours collés en bas de la sidebar */}
            {(igUrl || ttUrl) && (
              <div className="mt-auto pt-[12px] space-y-[6px]">
                {igUrl && (
                  <a
                    href={igUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[10px] font-switzer tracking-[0.25em] uppercase underline underline-offset-[3px] hover:opacity-70"
                  >
                    Instagram
                  </a>
                )}
                {ttUrl && (
                  <a
                    href={ttUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[10px] font-switzer tracking-[0.25em] uppercase underline underline-offset-[3px] hover:opacity-70"
                  >
                    TikTok
                  </a>
                )}
              </div>
            )}
          </aside>

          {/* Texte présentation + selected clients */}
          <div className="flex flex-col min-h-0">
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#220101] font-switzer mb-[6px]">
              {t.presentationTitle}
            </p>
            <div
              className="h-px mb-[12px]"
              style={{ backgroundColor: "#220101" }}
            />
            <p
              className="text-[#220101] font-spectral-light"
              style={{
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              {presentationText || t.presentationFallback}
            </p>

            {talent.selectedClients.length > 0 && (
              <div className="mt-[24px]">
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#220101] font-switzer mb-[6px]">
                  {t.selectedClients}
                </p>
                <div
                  className="h-px mb-[12px]"
                  style={{ backgroundColor: "#220101" }}
                />
                <p
                  className="text-[#220101] font-spectral-light tracking-[0.04em] uppercase"
                  style={{ fontSize: 14, lineHeight: 1.45 }}
                >
                  {talent.selectedClients.join(" · ")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageA4>
  );
}

function AnalyticsPage({
  talent,
  platform,
  stats,
  pageNumber,
  t,
}: {
  talent: KitTalent;
  platform: "instagram" | "tiktok";
  stats: PlatformStats;
  pageNumber: string;
  t: Dictionary;
}) {
  const isIg = platform === "instagram";
  const title = isIg ? t.instagramAnalyticsTitle : t.tiktokAnalyticsTitle;
  const footerLabel = isIg ? t.instagramFooter : t.tiktokFooter;

  const handleUrl = isIg
    ? getInstagramProfileUrl(talent.instagram)
    : talent.tiktok
    ? `https://tiktok.com/@${talent.tiktok.replace(/^@/, "")}`
    : null;
  const handleLabel = isIg ? "INSTAGRAM" : "TIKTOK";

  return (
    <PageA4
      background={C.cream}
      pageLabel={footerLabel}
      pageNumber={pageNumber}
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Logo */}
        <div className="pt-[28px] flex justify-center">
          <GlowUpLogo className="h-[14px]" color={C.ink} />
        </div>

        <div className="flex-1 mt-[26px] px-[36px] grid grid-cols-[150px_1fr] gap-[28px]">
          {/* Colonne gauche : 3 photos verticales empilées comme le PDF.
              IG → slots 3,4,5  /  TT → slots 6,7,8 */}
          <div className="flex flex-col gap-[8px]">
            {(isIg ? [3, 4, 5] : [6, 7, 8]).map((i) => (
              <KitPhoto
                key={`analytics-${platform}-${i}`}
                src={talent.kitPhotos?.[i] || (i === 3 || i === 6 ? talent.photo : null)}
                alt={`${talent.prenom} ${talent.nom} ${i}`}
                aspectRatio="3 / 4"
                focusY={15}
              />
            ))}
          </div>

          {/* Stats */}
          <div className="flex flex-col">
            <h2 className="text-[#220101] text-[15px] font-switzer font-bold tracking-[0.04em]">
              {title}
            </h2>
            <p className="text-[#220101] text-[9px] uppercase tracking-[0.25em] font-switzer mt-[2px]">
              {t.last30Days}
            </p>

            {/* ABONNÉS */}
            <div className="mt-[42px]">
              <p className="text-[#220101] text-[12px] font-spectral-light font-bold tracking-wide mb-[10px]">
                {t.followers}
              </p>
              <div className="grid grid-cols-2 gap-4 mb-[8px]">
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#220101]/70 font-switzer">
                  {t.community}
                </p>
                <p className="text-[8px] uppercase tracking-[0.22em] text-[#220101]/70 font-switzer">
                  {t.engagementRate}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="flex items-center gap-[8px] flex-wrap">
                  {isIg ? (
                    <InstagramGlyph className="w-[14px] h-[14px] text-[#220101]" />
                  ) : (
                    <TikTokGlyph className="w-[14px] h-[14px] text-[#220101]" />
                  )}
                  <span className="text-[15px] font-switzer text-[#220101]">
                    {formatFollowers(stats.followers)}
                  </span>
                  <EvolBadge value={stats.followersEvol} />
                </div>
                <div className="flex items-center gap-[8px] flex-wrap">
                  <span className="text-[15px] font-switzer text-[#220101]">
                    {formatPercent(stats.engagement, 2)}
                  </span>
                  <EvolBadge value={stats.engagementEvol} />
                </div>
              </div>
            </div>

            {/* GENRES */}
            {(stats.genreFemme !== null || stats.genreHomme !== null) && (
              <div className="mt-[28px]">
                <p className="text-[#220101] text-[12px] font-spectral-light font-bold tracking-wide mb-[6px]">
                  {t.genders}
                </p>
                <StatBarRow label={t.women} value={stats.genreFemme} />
                <StatBarRow label={t.men} value={stats.genreHomme} />
              </div>
            )}

            {/* TRANCHES D'ÂGE */}
            {(stats.age13_17 !== null ||
              stats.age18_24 !== null ||
              stats.age25_34 !== null ||
              stats.age35_44 !== null ||
              stats.age45Plus !== null) && (
              <div className="mt-[24px]">
                <p className="text-[#220101] text-[12px] font-spectral-light font-bold tracking-wide mb-[6px]">
                  {t.mainAgeRange}
                </p>
                <StatBarRow label="13-17" value={stats.age13_17} />
                <StatBarRow label="18-24" value={stats.age18_24} />
                <StatBarRow label="25-34" value={stats.age25_34} />
                <StatBarRow label="35-44" value={stats.age35_44} />
                {stats.age45Plus !== null && stats.age45Plus > 0 && (
                  <StatBarRow label="45+" value={stats.age45Plus} />
                )}
              </div>
            )}

            {/* LIEUX */}
            {stats.locFrance !== null && (
              <div className="mt-[24px]">
                <p className="text-[#220101] text-[12px] font-spectral-light font-bold tracking-wide mb-[6px]">
                  {t.mainLocations}
                </p>
                <StatBarRow label={t.france} value={stats.locFrance} />
                {stats.locAutre && (
                  <p className="text-[9px] text-[#220101]/60 font-switzer mt-[6px]">
                    {t.others} : {stats.locAutre}
                  </p>
                )}
              </div>
            )}

            {/* CTA lien réseau */}
            {handleUrl && (
              <a
                href={handleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-[26px] inline-block text-[10px] font-switzer tracking-[0.3em] underline underline-offset-[3px] text-[#220101] hover:opacity-70"
              >
                {handleLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </PageA4>
  );
}

function ClosingPage({ t }: { t: Dictionary }) {
  return (
    <PageA4
      // Dégradé inverse du cover : noir bordeaux en haut → rouge bordeaux moyen en bas
      background="linear-gradient(180deg, #1A0808 0%, #341212 24%, #5E2424 52%, #843A3A 78%, #A75858 100%)"
      textColor="#F5EDE0"
    >
      {/* Définition d'un gradient pour le logo géant (effet métallique) */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient
            id="glowupMetallic"
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#E8C0BD" />
            <stop offset="35%" stopColor="#C58A8A" />
            <stop offset="60%" stopColor="#874141" />
            <stop offset="100%" stopColor="#4A1E1E" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-[40px] text-center text-[#F5EDE0]">
        {/* GLOWUP géant avec dégradé métallique */}
        <GlowUpLogo
          className="w-[280px] max-w-[64%] h-auto mb-[28px]"
          color="url(#glowupMetallic)"
        />

        <h2
          className="font-spectral-light leading-[1.05] mb-[60px]"
          style={{ fontSize: "clamp(22px, 3.6vw, 30px)" }}
        >
          THE RISE{" "}
          <span className="font-spectral-medium-italic">of</span> IDEAS
        </h2>

        <div className="space-y-[28px] w-full max-w-[300px]">
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] mb-[8px] opacity-70 font-switzer">
              {t.address}
            </p>
            <p className="text-[11px] font-spectral-light leading-relaxed">
              1330 Avenue Guilibert de la Lauziere,
              <br />
              13290 AIX-EN-PROVENCE
            </p>
          </div>

          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] mb-[8px] opacity-70 font-switzer">
              {t.contact}
            </p>
            <a
              href="mailto:s.zeddam@glowupagence.fr"
              className="text-[11px] font-spectral-light hover:opacity-80"
            >
              s.zeddam@glowupagence.fr
            </a>
          </div>

          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] mb-[10px] opacity-70 font-switzer">
              {t.socials}
            </p>
            <div className="flex flex-col gap-[6px] items-center">
              <a
                href="https://instagram.com/glowithup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-switzer tracking-[0.3em] underline underline-offset-[3px] hover:opacity-70"
              >
                INSTAGRAM
              </a>
              <a
                href="https://tiktok.com/@glowithup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-switzer tracking-[0.3em] underline underline-offset-[3px] hover:opacity-70"
              >
                TIKTOK
              </a>
            </div>
          </div>
        </div>

        <p className="absolute bottom-[28px] left-0 right-0 text-center text-[9px] tracking-[0.35em] opacity-60 font-switzer">
          ©{new Date().getFullYear()} GLOW UP
        </p>
      </div>
    </PageA4>
  );
}

// ============================================
// PAGE
// ============================================

export default function KitMediaPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [talent, setTalent] = useState<KitTalent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Langue d'affichage. Initialisée à "fr" puis hydratée côté client
  // depuis localStorage pour ne pas casser le SSR.
  const [lang, setLang] = useState<Lang>("fr");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "fr" || saved === "en") {
        setLang(saved);
      }
    } catch {
      // localStorage inaccessible (mode privé Safari…) : on garde "fr"
    }
  }, []);
  const handleLangChange = useCallback((next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);
  const t = translations[lang];

  // On garde l'état d'annulation dans une ref pour pouvoir l'utiliser
  // depuis les handlers visibility / interval.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      if (meta.parentNode) meta.parentNode.removeChild(meta);
    };
  }, []);

  // Fetch unitaire. On y ajoute un timestamp pour buster tout cache CDN/navigateur.
  const fetchTalent = useCallback(
    async (opts: { showSpinner?: boolean } = {}) => {
      if (!slug) return;
      if (opts.showSpinner) setIsRefreshing(true);
      try {
        const res = await fetch(`/api/kit/${slug}?_t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!mountedRef.current) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as KitTalent;
          if (!mountedRef.current) return;
          setTalent(data);
          setLastSyncAt(Date.now());
          setNotFound(false);
        }
      } catch (err) {
        console.error("Kit media load error:", err);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [slug]
  );

  // Premier chargement
  useEffect(() => {
    fetchTalent();
  }, [fetchTalent]);

  // Polling régulier + refetch quand l'onglet redevient visible
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
          font-family: "Spectral-Light", "Cormorant Garamond", Georgia,
            serif;
        }
        .font-spectral-light-italic {
          font-family: "Spectral-LightItalic", "Cormorant Garamond",
            Georgia, serif;
          font-style: italic;
        }
        .font-switzer {
          font-family: "Switzer", "Inter", system-ui, sans-serif;
        }
      `}</style>

      {loading ? (
        <div className="min-h-screen bg-[#1a0808] flex items-center justify-center">
          <div className="text-[#F5EDE0] text-xs tracking-[0.3em] uppercase font-switzer">
            {t.loading}
          </div>
        </div>
      ) : notFound || !talent ? (
        <div className="min-h-screen bg-[#1a0808] flex flex-col items-center justify-center px-6 text-center text-[#F5EDE0]">
          <GlowUpLogo className="h-8 mb-6" color="#F5EDE0" />
          <h1 className="text-3xl font-spectral-light mb-3">
            {t.notFoundTitle}
          </h1>
          <p className="opacity-60 font-spectral-light">{t.notFoundDesc}</p>
        </div>
      ) : (
        <main
          className="min-h-screen w-full"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, #2a1313 0%, #150909 50%, #0c0606 100%)",
          }}
        >
          {/* Bascule de langue */}
          <LangToggle lang={lang} onChange={handleLangChange} />

          {/* Indicateur "live" discret */}
          <LiveBadge
            lastSyncAt={lastSyncAt}
            isRefreshing={isRefreshing}
            onRefresh={() => fetchTalent({ showSpinner: true })}
            t={t}
          />

          {/* Conteneur des pages A4 */}
          <div className="mx-auto py-8 sm:py-12 md:py-16 px-3 sm:px-6 md:px-8 flex flex-col items-center gap-8 sm:gap-12 md:gap-16">
            <CoverPage talent={talent} t={t} />
            <PresentationPage talent={talent} t={t} lang={lang} />
            {talent.instagramStats && talent.instagramStats.followers ? (
              <AnalyticsPage
                talent={talent}
                platform="instagram"
                stats={talent.instagramStats}
                pageNumber="03"
                t={t}
              />
            ) : null}
            {talent.tiktokStats && talent.tiktokStats.followers ? (
              <AnalyticsPage
                talent={talent}
                platform="tiktok"
                stats={talent.tiktokStats}
                pageNumber="04"
                t={t}
              />
            ) : null}
            <ClosingPage t={t} />
          </div>
        </main>
      )}
    </>
  );
}
