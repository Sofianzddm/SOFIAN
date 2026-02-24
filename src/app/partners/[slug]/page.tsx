"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Globe,
  Star,
  Play,
  Camera,
  Euro,
  Users,
  Heart,
  ExternalLink,
} from "lucide-react";

// Helper pour générer un visitor ID anonyme (cookie-based pour partenaire)
function getVisitorId(): string {
  if (typeof document === "undefined") return "";

  let id = document.cookie.match(/partner_visitor=([^;]+)/)?.[1];
  if (!id) {
    id = crypto.randomUUID();
    document.cookie = `partner_visitor=${id};max-age=${60 * 60 * 24 * 365};path=/`;
  }
  return id;
}

// Helper pour tracker les événements partenaire
function trackEvent(
  partnerId: string,
  action: "view" | "talent_click" | "cta_click" | "filter" | "excel_download" | "session_end",
  talentId?: string,
  talentName?: string,
  durationSeconds?: number
) {
  if (typeof window === "undefined") return;

  const payload: Record<string, unknown> = {
    partnerId,
    action,
    visitorId: getVisitorId(),
    talentClicked: talentId,
    talentName,
  };
  if (durationSeconds != null) payload.duration = durationSeconds;

  const body = JSON.stringify(payload);
  const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true as const };

  if (action === "session_end" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/partners/tracking", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/partners/tracking", opts).catch(() => {});
}

// Les descriptions de projet sont stockées en HTML (éditeur riche côté dashboard)
// On s'assure ici de bien décoder d'éventuelles entités HTML (&lt;div&gt; → <div>)
function decodeHtmlEntities(html: string) {
  if (!html) return "";
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Types
interface TalentStats {
  igFollowers: number | null;
  igFollowersEvol: number | null;
  igEngagement: number | null;
  igEngagementEvol: number | null;
  igGenreFemme: number | null;
  igGenreHomme: number | null;
  igAge13_17: number | null;
  igAge18_24: number | null;
  igAge25_34: number | null;
  igAge35_44: number | null;
  igAge45Plus: number | null;
  igLocFrance: number | null;
  ttFollowers: number | null;
  ttFollowersEvol: number | null;
  ttEngagement: number | null;
  ttEngagementEvol: number | null;
  ttGenreFemme: number | null;
  ttGenreHomme: number | null;
  ttAge13_17: number | null;
  ttAge18_24: number | null;
  ttAge25_34: number | null;
  ttAge35_44: number | null;
  ttAge45Plus: number | null;
  ttLocFrance: number | null;
  ytAbonnes: number | null;
  ytAbonnesEvol: number | null;
}

interface TalentTarifs {
  tarifStory: number | null;
  tarifStoryConcours: number | null;
  tarifPost: number | null;
  tarifPostConcours: number | null;
  tarifPostCommun: number | null;
  tarifReel: number | null;
  tarifTiktokVideo: number | null;
  tarifYoutubeVideo: number | null;
  tarifYoutubeShort: number | null;
  tarifEvent: number | null;
  tarifShooting: number | null;
  tarifAmbassadeur: number | null;
}

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  bio: string | null;
  photo: string | null;
  presentation: string | null;
  presentationEn: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  niches: string[];
  ville: string | null;
  pays: string | null;
  stats: TalentStats | null;
  tarifs: TalentTarifs | null;
  /** true si ce talent a des tarifs négociés pour ce partenaire */
  tarifNegocieAvecAccord?: boolean;
}

interface Partner {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  description: string | null;
  message: string | null;
}

interface ProjectLink {
  label: string;
  url: string;
}

interface Project {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  images: string[] | null;
  links: ProjectLink[] | null;
  videoUrl: string | null;
  category: string | null;
  date: string | null;
  location: string | null;
  talents: Array<{
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
    role: string | null;
    stats?: {
      igFollowers: number;
      ttFollowers: number;
    } | null;
  }>;
}

// Traductions
const translations = {
  fr: {
    tagline: "THE RISE of IDEAS",
    ourTalents: "nos",
    talents: "talents",
    discover: "Découvrez notre roster d'influenceurs",
    all: "Tous",
    contentCreator: "CRÉATEUR DE CONTENU",
    presentation: "PRÉSENTATION",
    community: "COMMUNAUTÉ",
    engagementRate: "TX D'ENGAGEMENT",
    clearAll: "Tout effacer",
    sendByEmail: "Envoyer par mail",
    sendByEmailShort: "Mail",
    selectionSubject: "Ma sélection de talents",
    selected: "sélectionné",
    selectedPlural: "sélectionnés",
    talent: "talent",
    talentsPlural: "talents",
    noTalents: "Aucun talent trouvé",
    tryOther: "Essayez d'autres filtres",
    loading: "Chargement...",
    sortBy: "Trier par",
    sortDefault: "Par défaut",
    sortIgFollowers: "Abonnés Instagram",
    sortTtFollowers: "Abonnés TikTok",
    sortYtFollowers: "Abonnés YouTube",
    sortName: "Nom A-Z",
  },
  en: {
    tagline: "THE RISE of IDEAS",
    ourTalents: "our",
    talents: "talents",
    discover: "Discover our influencer roster",
    all: "All",
    contentCreator: "CONTENT CREATOR",
    presentation: "ABOUT",
    community: "COMMUNITY",
    engagementRate: "ENGAGEMENT RATE",
    clearAll: "Clear all",
    sendByEmail: "Send by email",
    sendByEmailShort: "Email",
    selectionSubject: "My talent selection",
    selected: "selected",
    selectedPlural: "selected",
    talent: "talent",
    talentsPlural: "talents",
    noTalents: "No talents found",
    tryOther: "Try other filters",
    loading: "Loading...",
    sortBy: "Sort by",
    sortDefault: "Default",
    sortIgFollowers: "Instagram followers",
    sortTtFollowers: "TikTok followers",
    sortYtFollowers: "YouTube subscribers",
    sortName: "Name A-Z",
  },
};

type Lang = "fr" | "en";
type SortOption = "default" | "ig-followers" | "tt-followers" | "yt-followers" | "name";

const nicheCategories = [
  { id: "all", label: { fr: "Tous", en: "All" } },
  { id: "beauty", label: { fr: "Beauty", en: "Beauty" } },
  { id: "fashion", label: { fr: "Fashion", en: "Fashion" } },
  { id: "lifestyle", label: { fr: "Lifestyle", en: "Lifestyle" } },
  { id: "family", label: { fr: "Family", en: "Family" } },
  { id: "sport", label: { fr: "Sport", en: "Sport" } },
  { id: "voyage", label: { fr: "Voyage", en: "Travel" } },
  { id: "food", label: { fr: "Food", en: "Food" } },
  { id: "travel", label: { fr: "Travel", en: "Travel" } },
  { id: "creative", label: { fr: "Creative", en: "Creative" } },
  { id: "animaux", label: { fr: "Animaux", en: "Pets" } },
];

function formatFollowers(num: number | null): string {
  if (!num) return "—";
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(".", ",") + "M";
  if (num >= 1000) {
    const k = num / 1000;
    if (k >= 100) return Math.round(k) + "K";
    return k.toFixed(1).replace(".", ",") + "K";
  }
  return num.toString();
}

function getInitials(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

// Logo SVG Component
function GlowUpLogo({ className = "", color = "#ffffff" }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 478 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M58.1427 49.2504L58.3576 71.3492C37.4442 81.0362 14.7263 69.0428 13.6522 39.6706C12.4814 9.08627 46.7247 -4.15158 72.0098 31.2816L72.332 31.1851L68.7015 13.2164C40.7525 -1.42677 0 9.56901 0 44.7019C0 81.8515 49.5067 92.6542 72.9765 62.6706V38.2439H52.7936C55.0385 41.269 58.1535 45.5172 58.1535 49.2504H58.1427Z" fill={color}/>
      <path d="M97.8426 74.7713V8.05642H83.0089V78.719H138.692L138.832 65.0843C130.69 71.553 114.578 74.7713 102.418 74.7713H97.8319H97.8426Z" fill={color}/>
      <path d="M204.397 15.3297C187.866 2.30643 163.966 4.82741 150.518 20.3824C137.392 36.2378 139.745 58.9481 156.168 71.9714C172.699 84.2867 196.921 81.9695 210.465 66.3179C223.376 50.6664 220.605 27.7523 204.386 15.3405L204.397 15.3297ZM198.747 58.9374C185.836 73.9774 172.194 80.3389 158.531 69.5362C148.499 61.5656 148.499 44.2084 161.302 29.3614C173.891 14.4179 190.948 9.27936 202.259 17.5611C215.385 27.2481 211.228 44.1011 198.747 58.9481V58.9374Z" fill={color}/>
      <path d="M403.637 8.46407V45.4099C403.637 82.9672 355.742 88.213 355.742 45.9141V8.05642H340.596V46.9225C340.596 90.8412 407.171 91.5492 407.171 45.8175V8.05642H403.648V8.46407H403.637Z" fill={color}/>
      <path d="M446.925 8.05642H416.301V78.719H431.135V50.1515L446.925 50.0549C464.745 49.9584 477.333 41.3763 477.333 28.5461C477.333 16.6385 464.745 8.05642 446.925 8.05642ZM440.093 46.4075H431.135V10.792H440.093C454.82 10.792 461.533 15.8232 461.533 27.3339C461.533 40.2606 454.809 46.4075 440.093 46.4075Z" fill={color}/>
      <path d="M325.451 0.0107276L317.395 8.05642L320.102 10.7598C324.678 15.5657 322.895 20.9832 319.522 27.6343L302.239 62.0591L278.984 18.1511L273.861 8.65716L273.538 8.05642H257.212L257.319 8.26024L262.12 16.9389L272.894 37.4286L260.52 61.9625L236.416 17.9473L231.078 8.56062L230.756 8.05642H214.536L214.859 8.56062L220.294 18.2476L255.181 79.9313H255.396L275.235 40.8614L296.783 79.9313H296.997L333.486 8.24952L333.593 8.04569H333.496L325.44 0L325.451 0.0107276Z" fill={color}/>
    </svg>
  );
}

function HeartIcon({ filled = false, className = "" }: { filled?: boolean; className?: string }) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  );
}

function SortIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M6 12h12M9 18h6" strokeLinecap="round"/>
    </svg>
  );
}

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  );
}

function YouTubeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

// Composant Card Talent
function TalentCard({ 
  talent, 
  onClick, 
  isFavorite, 
  onToggleFavorite 
}: { 
  talent: Talent; 
  onClick: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const hasPhoto = talent.photo && talent.photo.trim() !== "";

  return (
    <article
      onClick={onClick}
      className="group bg-white rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(34,1,1,0.15)] active:scale-[0.99]"
      style={{ boxShadow: "0 4px 24px rgba(34, 1, 1, 0.06)" }}
    >
      <div className="relative h-[240px] sm:h-[300px] md:h-[340px] overflow-hidden bg-[#F5EDE0]">
        {hasPhoto ? (
          <img
            src={talent.photo!}
            alt={`${talent.prenom} ${talent.nom}`}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
            <span className="text-8xl text-[#F5EDE0]/60 tracking-widest font-spectral-light">
              {getInitials(talent.prenom, talent.nom)}
            </span>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-[#220101]/90 via-[#220101]/30 to-transparent" />
        
        <div className="absolute bottom-3 left-3 right-3 sm:bottom-5 sm:left-5 sm:right-5">
          <p className="text-[#F5EDE0]/70 text-sm sm:text-base font-spectral-medium-italic">
            {talent.prenom}
          </p>
          <p className="text-[#F5EDE0] text-lg sm:text-2xl tracking-wide font-spectral-light">
            {talent.nom.toUpperCase()}
          </p>
          {(talent.instagram || talent.tiktok) && (
            <p className="text-[#F5EDE0]/50 text-xs sm:text-sm font-switzer mt-0.5 sm:mt-1">
              @{talent.instagram?.replace('@', '') || talent.tiktok?.replace('@', '')}
            </p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`absolute top-3 left-3 sm:top-4 sm:left-4 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-lg touch-manipulation ${
            isFavorite 
              ? "bg-[#B06F70] text-white scale-110" 
              : "bg-white/90 text-[#220101]/40 hover:text-[#B06F70] hover:scale-110"
          }`}
        >
          <HeartIcon filled={isFavorite} className="w-5 h-5" />
        </button>

        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex gap-1.5 sm:gap-2">
          {talent.instagram && talent.stats?.igFollowers && (
            <a
              href={`https://instagram.com/${talent.instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-7 h-7 sm:w-8 sm:h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm touch-manipulation"
            >
              <InstagramIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#220101]" />
            </a>
          )}
          {talent.tiktok && talent.stats?.ttFollowers && (
            <a
              href={`https://tiktok.com/@${talent.tiktok.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-7 h-7 sm:w-8 sm:h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm touch-manipulation"
            >
              <TikTokIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#220101]" />
            </a>
          )}
          {talent.youtube && talent.stats?.ytAbonnes && (
            <a
              href={`https://youtube.com/@${talent.youtube.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-7 h-7 sm:w-8 sm:h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm touch-manipulation"
            >
              <YouTubeIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#220101]" />
            </a>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-5">
        <p className="text-[10px] sm:text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-2 sm:mb-3 font-spectral-light line-clamp-1">
          {talent.niches.length > 0 ? talent.niches.slice(0, 3).join(" · ") : "Créateur de contenu"}
        </p>

        <div className="space-y-1.5 sm:space-y-2">
          {talent.stats?.igFollowers && (
            <div className="flex items-center justify-between py-2 px-2.5 sm:py-2.5 sm:px-3 bg-[#F5EDE0]/50 rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <a
                  href={`https://instagram.com/${talent.instagram?.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:scale-125 transition-transform shrink-0"
                >
                  <InstagramIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#220101]/60 hover:text-[#E1306C]" />
                </a>
                <span className="font-switzer text-[#220101] text-xs sm:text-sm">
                  {formatFollowers(talent.stats.igFollowers)}
                </span>
                {talent.stats.igFollowersEvol !== null && talent.stats.igFollowersEvol > 0 && (
                  <span className="text-[11px] font-switzer text-[#4a5d23] bg-[#E5F2B5] px-2 py-0.5 rounded">
                    ▲ {talent.stats.igFollowersEvol.toFixed(2).replace(".", ",")}%
                  </span>
                )}
              </div>
              <span className="font-switzer text-[#220101] text-xs sm:text-sm">
                {talent.stats.igEngagement?.toFixed(2).replace(".", ",") || "—"}%
              </span>
            </div>
          )}

          {talent.stats?.ttFollowers && (
            <div className="flex items-center justify-between py-2 px-2.5 sm:py-2.5 sm:px-3 bg-[#F5EDE0]/50 rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <a
                  href={`https://tiktok.com/@${talent.tiktok?.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:scale-125 transition-transform shrink-0"
                >
                  <TikTokIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#220101]/60 hover:text-black" />
                </a>
                <span className="font-switzer text-[#220101] text-xs sm:text-sm">
                  {formatFollowers(talent.stats.ttFollowers)}
                </span>
                {talent.stats.ttFollowersEvol !== null && talent.stats.ttFollowersEvol > 0 && (
                  <span className="text-[11px] font-switzer text-[#4a5d23] bg-[#E5F2B5] px-2 py-0.5 rounded">
                    ▲ {talent.stats.ttFollowersEvol.toFixed(2).replace(".", ",")}%
                  </span>
                )}
              </div>
              <span className="font-switzer text-[#220101] text-xs sm:text-sm">
                {talent.stats.ttEngagement?.toFixed(2).replace(".", ",") || "—"}%
              </span>
            </div>
          )}

          {talent.stats?.ytAbonnes && (
            <div className="flex items-center justify-between py-2 px-2.5 sm:py-2.5 sm:px-3 bg-[#F5EDE0]/50 rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <a
                  href={`https://youtube.com/@${talent.youtube?.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:scale-125 transition-transform shrink-0"
                >
                  <YouTubeIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#220101]/60 hover:text-[#FF0000]" />
                </a>
                <span className="font-switzer text-[#220101] text-xs sm:text-sm">
                  {formatFollowers(talent.stats.ytAbonnes)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// Composants helper pour démographies
function GenderBar({ label, value, color, emoji }: { label: string; value: number; color: string; emoji: string }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[#220101]/70 font-medium flex items-center gap-2 text-sm">
          <span className="text-lg">{emoji}</span>
          {label}
        </span>
        <span className="font-bold text-[#220101] text-base">{value}%</span>
      </div>
      <div className="h-3 bg-[#220101]/10 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function AgeBar({ label, value }: { label: string; value: number }) {
  const maxValue = 60;
  const width = Math.min((value / maxValue) * 100, 100);
  
  return (
    <div className="flex items-center gap-3">
      <span className="text-[#220101]/60 text-xs w-20">{label}</span>
      <div className="flex-1 h-2.5 bg-[#220101]/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-[#B06F70] to-[#220101] rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="font-bold text-[#220101] w-12 text-right text-sm">{value}%</span>
    </div>
  );
}

function TarifCard({ icon, label, price, color }: {
  icon: React.ReactNode;
  label: string;
  price: number;
  color: string;
}) {
  const colorClasses: Record<string, { bg: string; text: string; icon: string }> = {
    pink: { bg: "bg-pink-50", text: "text-pink-600", icon: "bg-pink-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", icon: "bg-purple-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", icon: "bg-amber-100" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", icon: "bg-blue-100" },
    teal: { bg: "bg-teal-50", text: "text-teal-600", icon: "bg-teal-100" },
    gray: { bg: "bg-gray-50", text: "text-gray-700", icon: "bg-gray-200" },
  };
  
  const c = colorClasses[color] || colorClasses.gray;

  return (
    <div className={`relative overflow-hidden ${c.bg} rounded-xl p-4 border border-[#220101]/10 hover:shadow-md transition-all cursor-default`}>
      <div className={`w-8 h-8 ${c.icon} rounded-lg flex items-center justify-center ${c.text} mb-2`}>
        {icon}
      </div>
      <p className="text-[#220101]/70 text-xs mb-1">{label}</p>
      <p className={`text-lg font-bold ${c.text}`}>
        {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(price)}
      </p>
    </div>
  );
}

// Composant Modal COMPLET avec stats détaillées, démographies et tarifs
function TalentModal({ 
  talent, 
  onClose,
  isFavorite,
  onToggleFavorite,
  lang,
  translatedPresentation,
  isTranslating,
  partnerName,
}: { 
  talent: Talent | null; 
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  lang: Lang;
  translatedPresentation?: string;
  isTranslating?: boolean;
  /** Nom du partenaire (pour afficher "Tarif négocié avec accord (NOM)") */
  partnerName?: string;
}) {
  if (!talent) return null;

  const [activeTab, setActiveTab] = useState<"instagram" | "tiktok">("instagram");
  const hasPhoto = talent.photo && talent.photo.trim() !== "";
  const t = translations[lang];
  const stats = talent.stats;
  const tarifs = talent.tarifs;
  const hasInstagram = talent.instagram && stats?.igFollowers;
  const hasTiktok = talent.tiktok && stats?.ttFollowers;
  
  const displayPresentation = lang === "en" 
    ? (translatedPresentation || talent.presentationEn || talent.presentation)
    : talent.presentation;

  // Auto-select tab based on available data
  useEffect(() => {
    if (hasTiktok && !hasInstagram) {
      setActiveTab("tiktok");
    }
  }, [hasInstagram, hasTiktok]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#220101]/90 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#F5EDE0] w-full max-w-6xl max-h-[90vh] sm:max-h-[95vh] rounded-xl sm:rounded-2xl md:rounded-[2rem] overflow-hidden shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[90vh] sm:max-h-[95vh] overflow-y-auto">
          {/* Header avec photo de profil en petit carré */}
          <div className="relative bg-gradient-to-br from-[#220101] to-[#3a1a1a] p-4 sm:p-6 md:p-8">
            {/* Boutons */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 w-9 h-9 sm:w-10 sm:h-10 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center text-[#220101] transition-all hover:scale-110 shadow-xl font-switzer text-base sm:text-lg touch-manipulation"
            >
              ✕
            </button>

            <button
              onClick={onToggleFavorite}
              className={`absolute top-3 left-3 sm:top-4 sm:left-4 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-xl touch-manipulation ${
                isFavorite 
                  ? "bg-[#B06F70] text-white" 
                  : "bg-white/95 backdrop-blur-sm text-[#220101]/40 hover:text-[#B06F70]"
              }`}
            >
              <HeartIcon filled={isFavorite} className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Contenu avec photo de profil */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 pt-12 sm:pt-8">
              {/* Photo de profil en petit carré */}
              <div className="flex-shrink-0 flex justify-center sm:justify-start">
                {hasPhoto ? (
                  <img
                    src={talent.photo!}
                    alt={`${talent.prenom} ${talent.nom}`}
                    className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-xl object-cover border-4 border-white/20 shadow-xl"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-xl bg-gradient-to-br from-[#B06F70] to-[#220101] flex items-center justify-center border-4 border-white/20 shadow-xl">
                    <span className="text-2xl sm:text-3xl md:text-4xl text-[#F5EDE0]/80 tracking-widest font-spectral-light">
                      {getInitials(talent.prenom, talent.nom)}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 text-white text-center sm:text-left min-w-0">
                <h2 className="text-2xl sm:text-3xl md:text-4xl mb-2 leading-tight">
                  <span className="font-spectral-medium-italic">{talent.prenom}</span>{" "}
                  <span className="font-spectral-light">{talent.nom.toUpperCase()}</span>
                </h2>
                {(talent.instagram || talent.tiktok) && (
                  <p className="text-[#F5EDE0]/80 text-sm md:text-base font-switzer mb-2">
                    @{talent.instagram?.replace('@', '') || talent.tiktok?.replace('@', '')}
                  </p>
                )}
                {talent.niches.length > 0 && (
                  <p className="text-xs md:text-sm uppercase tracking-[0.15em] font-spectral-light">
                    {talent.niches.join(" / ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 md:p-8 lg:p-10 space-y-6 sm:space-y-8">
            {/* Présentation */}
            {(talent.presentation || displayPresentation) && (
              <div>
                <p className="text-xs text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-switzer">
                  {t.presentation}
                </p>
                {isTranslating ? (
                  <div className="flex items-center gap-2 text-[#220101]/50">
                    <div className="w-4 h-4 border-2 border-[#220101]/20 border-t-[#220101] rounded-full animate-spin" />
                    <span className="font-switzer text-sm">Translating...</span>
                  </div>
                ) : (
                  <p className="text-[#220101] leading-relaxed text-base md:text-lg font-spectral-light">
                    {displayPresentation}
                  </p>
                )}
              </div>
            )}

            {/* Stats Section avec onglets */}
            {(hasInstagram || hasTiktok) && (
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-[#220101]/10">
                {/* Tab Header */}
                <div className="flex border-b border-[#220101]/10">
                  {hasInstagram && (
                    <button
                      onClick={() => setActiveTab("instagram")}
                      className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3 sm:py-4 font-semibold transition-all text-sm sm:text-base touch-manipulation ${
                        activeTab === "instagram"
                          ? "text-pink-500 bg-gradient-to-b from-pink-50 to-transparent border-b-2 border-pink-500"
                          : "text-[#220101]/40 hover:text-[#220101]/60 hover:bg-[#F5EDE0]"
                      }`}
                    >
                      <InstagramIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span>Instagram</span>
                      {stats?.igFollowers && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "instagram" ? "bg-pink-100 text-pink-600" : "bg-[#F5EDE0] text-[#220101]/50"}`}>
                          {formatFollowers(stats.igFollowers)}
                        </span>
                      )}
                    </button>
                  )}
                  {hasTiktok && (
                    <button
                      onClick={() => setActiveTab("tiktok")}
                      className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3 sm:py-4 font-semibold transition-all text-sm sm:text-base touch-manipulation ${
                        activeTab === "tiktok"
                          ? "text-[#220101] bg-gradient-to-b from-gray-100 to-transparent border-b-2 border-[#220101]"
                          : "text-[#220101]/40 hover:text-[#220101]/60 hover:bg-[#F5EDE0]"
                      }`}
                    >
                      <TikTokIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span>TikTok</span>
                      {stats?.ttFollowers && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "tiktok" ? "bg-gray-200 text-[#220101]" : "bg-[#F5EDE0] text-[#220101]/50"}`}>
                          {formatFollowers(stats.ttFollowers)}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Tab Content */}
                <div className="p-4 sm:p-6">
                  {activeTab === "instagram" && hasInstagram && (
                    <div className="space-y-4 sm:space-y-6">
                      {/* Main Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                        <div className="bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                            {stats?.igFollowersEvol !== null && stats.igFollowersEvol > 0 && (
                              <span className="text-xs flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                {stats.igFollowersEvol.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <p className="text-lg sm:text-2xl font-bold">{formatFollowers(stats?.igFollowers)}</p>
                          <p className="text-[10px] sm:text-xs text-white/80">Abonnés</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
                            {stats?.igEngagementEvol !== null && stats.igEngagementEvol > 0 && (
                              <span className="text-[10px] sm:text-xs flex items-center gap-1">
                                <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                {stats.igEngagementEvol.toFixed(1)}pts
                              </span>
                            )}
                          </div>
                          <p className="text-lg sm:text-2xl font-bold">{stats?.igEngagement?.toFixed(2) || "—"}%</p>
                          <p className="text-[10px] sm:text-xs text-white/80">Engagement</p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <Globe className="w-4 h-4 sm:w-5 sm:h-5 mb-1 sm:mb-2" />
                          <p className="text-lg sm:text-2xl font-bold">{stats?.igLocFrance || 0}%</p>
                          <p className="text-[10px] sm:text-xs text-white/80">France</p>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <Star className="w-4 h-4 sm:w-5 sm:h-5 mb-1 sm:mb-2" />
                          <p className="text-lg sm:text-2xl font-bold">{talent.niches.length}</p>
                          <p className="text-[10px] sm:text-xs text-white/80">Niches</p>
                        </div>
                      </div>

                      {/* Demographics */}
                      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                        {/* Gender */}
                        <div className="bg-[#F5EDE0] rounded-xl p-4 sm:p-5 border border-[#220101]/10">
                          <h3 className="font-bold text-[#220101] mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#220101]/60" />
                            Répartition par genre
                          </h3>
                          <div className="space-y-4">
                            <GenderBar label="Femmes" value={stats?.igGenreFemme || 0} color="from-pink-400 to-pink-500" emoji="👩" />
                            <GenderBar label="Hommes" value={stats?.igGenreHomme || 0} color="from-blue-400 to-blue-500" emoji="👨" />
                          </div>
                        </div>

                        {/* Age */}
                        <div className="bg-[#F5EDE0] rounded-xl p-4 sm:p-5 border border-[#220101]/10">
                          <h3 className="font-bold text-[#220101] mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#220101]/60" />
                            Tranches d'âge
                          </h3>
                          <div className="space-y-3">
                            {[
                              { label: "13-17 ans", value: stats?.igAge13_17 || 0 },
                              { label: "18-24 ans", value: stats?.igAge18_24 || 0 },
                              { label: "25-34 ans", value: stats?.igAge25_34 || 0 },
                              { label: "35-44 ans", value: stats?.igAge35_44 || 0 },
                              { label: "45+ ans", value: stats?.igAge45Plus || 0 },
                            ].map((age) => (
                              <AgeBar key={age.label} label={age.label} value={age.value} />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Social Link */}
                      {talent.instagram && (
                        <a
                          href={`https://instagram.com/${talent.instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                        >
                          <InstagramIcon className="w-5 h-5" />
                          @{talent.instagram.replace('@', '')}
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}

                  {activeTab === "tiktok" && hasTiktok && (
                    <div className="space-y-4 sm:space-y-6">
                      {/* Main Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                        <div className="bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                            {stats?.ttFollowersEvol !== null && stats.ttFollowersEvol > 0 && (
                              <span className="text-xs flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                {stats.ttFollowersEvol.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <p className="text-lg sm:text-2xl font-bold">{formatFollowers(stats?.ttFollowers)}</p>
                          <p className="text-[10px] sm:text-xs text-white/80">Abonnés</p>
                        </div>
                        <div className="bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
                            {stats?.ttEngagementEvol !== null && stats.ttEngagementEvol > 0 && (
                              <span className="text-xs flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                {stats.ttEngagementEvol.toFixed(1)}pts
                              </span>
                            )}
                          </div>
                          <p className="text-lg sm:text-2xl font-bold">{stats?.ttEngagement?.toFixed(2) || "—"}%</p>
                          <p className="text-[10px] sm:text-xs text-white/80">Engagement</p>
                        </div>
                        <div className="bg-gradient-to-br from-teal-500 to-emerald-500 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <Globe className="w-4 h-4 sm:w-5 sm:h-5 mb-1 sm:mb-2" />
                          <p className="text-lg sm:text-2xl font-bold">{stats?.ttLocFrance || 0}%</p>
                          <p className="text-[10px] sm:text-xs text-white/80">France</p>
                        </div>
                        <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg sm:rounded-xl p-3 sm:p-4 text-white">
                          <Star className="w-4 h-4 sm:w-5 sm:h-5 mb-1 sm:mb-2" />
                          <p className="text-lg sm:text-2xl font-bold">{talent.niches.length}</p>
                          <p className="text-[10px] sm:text-xs text-white/80">Niches</p>
                        </div>
                      </div>

                      {/* Demographics */}
                      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                        {/* Gender */}
                        <div className="bg-[#F5EDE0] rounded-xl p-4 sm:p-5 border border-[#220101]/10">
                          <h3 className="font-bold text-[#220101] mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#220101]/60" />
                            Répartition par genre
                          </h3>
                          <div className="space-y-4">
                            <GenderBar label="Femmes" value={stats?.ttGenreFemme || 0} color="from-pink-400 to-pink-500" emoji="👩" />
                            <GenderBar label="Hommes" value={stats?.ttGenreHomme || 0} color="from-blue-400 to-blue-500" emoji="👨" />
                          </div>
                        </div>

                        {/* Age */}
                        <div className="bg-[#F5EDE0] rounded-xl p-4 sm:p-5 border border-[#220101]/10">
                          <h3 className="font-bold text-[#220101] mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#220101]/60" />
                            Tranches d'âge
                          </h3>
                          <div className="space-y-3">
                            {[
                              { label: "13-17 ans", value: stats?.ttAge13_17 || 0 },
                              { label: "18-24 ans", value: stats?.ttAge18_24 || 0 },
                              { label: "25-34 ans", value: stats?.ttAge25_34 || 0 },
                              { label: "35-44 ans", value: stats?.ttAge35_44 || 0 },
                              { label: "45+ ans", value: stats?.ttAge45Plus || 0 },
                            ].map((age) => (
                              <AgeBar key={age.label} label={age.label} value={age.value} />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Social Link */}
                      {talent.tiktok && (
                        <a
                          href={`https://tiktok.com/@${talent.tiktok.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gray-800 to-black text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                        >
                          <TikTokIcon className="w-5 h-5" />
                          @{talent.tiktok.replace('@', '')}
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tarifs Section */}
            {tarifs && (
              <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 md:p-8 border border-[#220101]/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl">
                    <Euro className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-[#220101]">Grille tarifaire</h2>
                    <p className="text-[#220101]/60 text-sm">Tarifs indicatifs, négociables selon le projet</p>
                    {talent.tarifNegocieAvecAccord && partnerName && (
                      <p className="mt-2 text-sm font-medium text-green-700 bg-green-50 inline-block px-3 py-1.5 rounded-lg border border-green-200">
                        Tarif négocié avec accord ({partnerName})
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {/* Instagram Tarifs */}
                  {hasInstagram && (
                    <>
                      {tarifs.tarifStory && (
                        <TarifCard icon={<Camera className="w-4 h-4" />} label="Story Instagram" price={tarifs.tarifStory} color="pink" />
                      )}
                      {tarifs.tarifPost && (
                        <TarifCard icon={<Camera className="w-4 h-4" />} label="Post Instagram" price={tarifs.tarifPost} color="pink" />
                      )}
                      {tarifs.tarifReel && (
                        <TarifCard icon={<Play className="w-4 h-4" />} label="Reel Instagram" price={tarifs.tarifReel} color="purple" />
                      )}
                      {tarifs.tarifStoryConcours && (
                        <TarifCard icon={<Star className="w-4 h-4" />} label="Story Concours" price={tarifs.tarifStoryConcours} color="amber" />
                      )}
                      {tarifs.tarifPostConcours && (
                        <TarifCard icon={<Star className="w-4 h-4" />} label="Post Concours" price={tarifs.tarifPostConcours} color="amber" />
                      )}
                    </>
                  )}

                  {/* TikTok Tarifs */}
                  {hasTiktok && tarifs.tarifTiktokVideo && (
                    <TarifCard icon={<TikTokIcon className="w-4 h-4" />} label="Vidéo TikTok" price={tarifs.tarifTiktokVideo} color="gray" />
                  )}

                  {/* Other Tarifs */}
                  {tarifs.tarifEvent && (
                    <TarifCard icon={<Calendar className="w-4 h-4" />} label="Event / Apparition" price={tarifs.tarifEvent} color="blue" />
                  )}
                  {tarifs.tarifShooting && (
                    <TarifCard icon={<Camera className="w-4 h-4" />} label="Shooting photo" price={tarifs.tarifShooting} color="teal" />
                  )}
                  {tarifs.tarifAmbassadeur && (
                    <TarifCard icon={<Star className="w-4 h-4" />} label="Ambassadeur" price={tarifs.tarifAmbassadeur} color="amber" />
                  )}
                </div>
              </div>
            )}

            {/* Logo Glow Up */}
            <div className="pt-4 border-t border-[#220101]/10 flex justify-center">
              <GlowUpLogo className="w-24 md:w-32 h-auto opacity-60" color="#220101" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modale Projet
function ProjectModal({
  project,
  onClose,
  lang,
}: {
  project: Project | null;
  onClose: () => void;
  lang: Lang;
}) {
  if (!project) return null;

  const mainTalent = project.talents[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#220101]/90 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#F5EDE0] w-full max-w-4xl max-h-[90vh] sm:max-h-[95vh] rounded-xl sm:rounded-2xl md:rounded-[2rem] overflow-hidden shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[90vh] sm:max-h-[95vh] overflow-y-auto">
          {/* Header avec cover en carré + stats talent */}
          <div className="relative px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 md:px-8 md:pt-8 bg-[#220101] text-white">
            <button
              onClick={onClose}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 w-9 h-9 sm:w-10 sm:h-10 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center text-[#220101] transition-all hover:scale-110 shadow-xl font-switzer text-base sm:text-lg touch-manipulation"
            >
              ✕
            </button>

            <div className="flex flex-col md:flex-row md:items-center gap-3 sm:gap-4 md:gap-6">
              {/* Cover carré */}
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-xl sm:rounded-2xl overflow-hidden bg-[#110000] flex-shrink-0 mx-auto md:mx-0">
                {project.coverImage ? (
                  <img
                    src={project.coverImage}
                    alt={project.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
                    <span className="text-3xl md:text-4xl">🎬</span>
                  </div>
                )}
                {project.category && (
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-white/15 backdrop-blur-sm rounded-full">
                    <span className="text-[10px] md:text-xs font-switzer uppercase tracking-wider">
                      {project.category}
                    </span>
                  </div>
                )}
              </div>

              {/* Titre + meta + stats talent */}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl md:text-3xl mb-2 font-spectral-light">
                  {project.title}
                </h2>

                <div className="flex flex-wrap gap-4 text-xs md:text-sm text-white/80 mb-3">
                  {project.date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {new Date(project.date).toLocaleDateString("fr-FR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  )}
                  {project.location && (
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      {project.location}
                    </div>
                  )}
                </div>

                {mainTalent && (
                  <div className="flex items-center justify-between gap-4 mt-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-[#B06F70]">
                        {mainTalent.photo ? (
                          <img
                            src={mainTalent.photo}
                            alt={`${mainTalent.prenom} ${mainTalent.nom}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                            {mainTalent.prenom.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm md:text-base font-switzer">
                          {mainTalent.prenom} {mainTalent.nom}
                        </p>
                        {mainTalent.role && (
                          <p className="text-xs text-white/70">{mainTalent.role}</p>
                        )}
                      </div>
                    </div>

                    {mainTalent.stats && (
                      <div className="flex flex-col items-end gap-1 text-xs md:text-sm font-switzer">
                        {typeof mainTalent.stats.igFollowers === "number" &&
                          mainTalent.stats.igFollowers > 0 && (
                            <p>
                              <span className="font-semibold">
                                {mainTalent.stats.igFollowers.toLocaleString("fr-FR")}
                              </span>{" "}
                              IG
                            </p>
                          )}
                        {typeof mainTalent.stats.ttFollowers === "number" &&
                          mainTalent.stats.ttFollowers > 0 && (
                            <p>
                              <span className="font-semibold">
                                {mainTalent.stats.ttFollowers.toLocaleString("fr-FR")}
                              </span>{" "}
                              TT
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 md:p-8 space-y-6">
            {/* Meta Info */}
            <div className="flex flex-wrap gap-4 text-sm text-[#220101]/60">
              {project.date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {new Date(project.date).toLocaleDateString("fr-FR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              )}
              {project.location && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  {project.location}
                </div>
              )}
            </div>

            {/* Description */}
            {project.description && (
              <div>
                <p className="text-xs text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-switzer">
                  Description
                </p>
                <div
                  className="text-[#220101] leading-relaxed font-spectral-light space-y-2 text-sm"
                  dangerouslySetInnerHTML={{ __html: decodeHtmlEntities(project.description) }}
                />
              </div>
            )}

            {/* Talents */}
            {project.talents.length > 0 && (
              <div>
                <p className="text-xs text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-switzer">
                  Talents
                </p>
                <div className="flex flex-wrap gap-3">
                  {project.talents.map((talent) => (
                    <div
                      key={talent.id}
                      className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-[#220101]/10"
                    >
                      {talent.photo ? (
                        <img
                          src={talent.photo}
                          alt={`${talent.prenom} ${talent.nom}`}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#B06F70] flex items-center justify-center text-white text-xs font-bold">
                          {talent.prenom.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-[#220101]">
                          {talent.prenom} {talent.nom}
                        </p>
                        {talent.role && (
                          <p className="text-xs text-[#220101]/60">{talent.role}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Images Gallery */}
            {project.images && project.images.length > 0 && (
              <div>
                <p className="text-xs text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-switzer">
                  Galerie
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {project.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="w-full h-32 md:h-40 rounded-lg border border-[#220101]/10 bg-[#F7F2F0] flex items-center justify-center overflow-hidden"
                    >
                      <img
                        src={img}
                        alt={`${project.title} - Image ${idx + 1}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video */}
            {project.videoUrl && (
              <div>
                <p className="text-xs text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-switzer">
                  Vidéo
                </p>
                <div className="aspect-video rounded-lg overflow-hidden bg-[#220101]">
                  <iframe
                    src={project.videoUrl}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {/* Liens */}
            {project.links && project.links.length > 0 && (
              <div>
                <p className="text-xs text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-switzer">
                  Liens
                </p>
                <div className="flex flex-wrap gap-2">
                  {project.links.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#220101]/20 hover:bg-[#220101]/5 text-[#220101]"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      <span>{link.label || link.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Barre de sélection flottante — deux boutons : Envoyer par mail | Télécharger ma sélection
function SelectionBar({
  favorites,
  talents,
  onRemove,
  onClear,
  onDownloadPdf,
  downloadingPdf,
  lang,
  partner,
}: {
  favorites: string[];
  talents: Talent[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onDownloadPdf: () => void;
  downloadingPdf: boolean;
  lang: Lang;
  partner: { name: string; slug: string } | null;
}) {
  const selectedTalents = talents.filter((t) => favorites.includes(t.id));
  const t = translations[lang];

  if (favorites.length === 0) return null;

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const partnerName = partner?.name || "Glow Up";
  const subject = `${t.selectionSubject} - ${partnerName}`;
  const bodyLines = [
    lang === "fr" ? "Salut Leyna," : "Hi Leyna,",
    "",
    lang === "fr"
      ? `Voici ma sélection de talents depuis le catalogue ${partnerName} :`
      : `Here is my talent selection from the ${partnerName} catalogue:`,
    "",
    ...selectedTalents.map((talent) => {
      const handles = [talent.instagram, talent.tiktok].filter(Boolean).map((h) => (h || "").replace(/^@/, ""));
      const handleStr = handles.length ? ` (${handles.map((h) => `@${h}`).join(" / ")})` : "";
      return `• ${talent.prenom} ${talent.nom}${handleStr}`;
    }),
    "",
    lang === "fr" ? "Lien vers le catalogue :" : "Link to the catalogue:",
    pageUrl,
  ];
  const contactEmail = "Leyna@glowupagence.fr";
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-2 sm:px-3 pb-2 sm:pb-3 md:px-4 md:pb-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl sm:rounded-2xl shadow-[0_-4px_24px_rgba(34,1,1,0.15),0_8px_32px_rgba(0,0,0,0.12)] border border-[#220101]/10 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 md:p-5">
          {/* Avatars + compteur */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="flex -space-x-2 flex-shrink-0">
              {selectedTalents.slice(0, 5).map((talent) => (
                <div key={talent.id} className="relative group">
                  {talent.photo ? (
                    <img
                      src={talent.photo}
                      alt={talent.prenom}
                      className="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full border-2 border-white object-cover shadow-md"
                    />
                  ) : (
                    <div className="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full border-2 border-white bg-[#B06F70] flex items-center justify-center text-white font-bold text-xs shadow-md">
                      {getInitials(talent.prenom, talent.nom)}
                    </div>
                  )}
                  <button
                    onClick={() => onRemove(talent.id)}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 bg-[#220101] text-white rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow hover:bg-[#3a1a1a] touch-manipulation"
                    aria-label={lang === "fr" ? "Retirer de la sélection" : "Remove from selection"}
                  >
                    ×
                  </button>
                </div>
              ))}
              {favorites.length > 5 && (
                <div className="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full border-2 border-white bg-[#F5EDE0] text-[#220101] flex items-center justify-center font-bold text-[10px] sm:text-xs shadow-md">
                  +{favorites.length - 5}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-switzer font-semibold text-[#220101] text-xs sm:text-sm md:text-base">
                {favorites.length} {favorites.length > 1 ? t.talentsPlural : t.talent} {favorites.length > 1 ? t.selectedPlural : t.selected}
              </p>
              <p className="text-[10px] sm:text-xs text-[#220101]/60 font-switzer mt-0.5 hidden sm:block">
                {lang === "fr" ? "Envoyer par mail ou télécharger en PDF" : "Send by email or download PDF"}
              </p>
            </div>
          </div>

          {/* Actions : Tout effacer + Envoyer par mail + Télécharger ma sélection */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={onClear}
              className="px-3 sm:px-4 py-2 sm:py-2.5 text-[#220101]/60 hover:text-[#220101] hover:bg-[#F5EDE0]/80 rounded-lg sm:rounded-xl font-switzer text-xs sm:text-sm transition-colors touch-manipulation"
            >
              {t.clearAll}
            </button>
            <a
              href={mailto}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#220101] hover:bg-[#3a1a1a] text-white rounded-lg sm:rounded-xl font-switzer font-semibold text-xs sm:text-sm shadow-lg hover:shadow-xl transition-all touch-manipulation"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span className="hidden sm:inline">{lang === "fr" ? "Envoyer par mail" : "Send by email"}</span>
              <span className="sm:hidden">{lang === "fr" ? "Mail" : "Email"}</span>
            </a>
            <button
              onClick={onDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#B06F70] hover:bg-[#9d5f60] text-white rounded-lg sm:rounded-xl font-switzer font-semibold text-xs sm:text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-50 touch-manipulation"
            >
              {downloadingPdf ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {lang === "fr" ? "Génération…" : "Generating…"}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {lang === "fr" ? "Télécharger ma sélection" : "Download my selection"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Page principale
export default function PartnerTalentBookPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  
  const [partner, setPartner] = useState<Partner | null>(null);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"talents" | "projets">("talents");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedNiche, setSelectedNiche] = useState("all");
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [selectedTalent, setSelectedTalent] = useState<Talent | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [lang, setLang] = useState<Lang>("fr");
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [translatedPresentations, setTranslatedPresentations] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingSelectionPdf, setDownloadingSelectionPdf] = useState(false);

  const landingTimeRef = useRef<number | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const sessionEndSentRef = useRef(false);
  const favoritesRef = useRef<string[]>(favorites);
  const slugRef = useRef(slug);
  favoritesRef.current = favorites;
  slugRef.current = slug ?? undefined;

  const t = translations[lang];

  async function translatePresentation(talentId: string, text: string) {
    if (!text || translatedPresentations[talentId]) return;
    
    setTranslatingId(talentId);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang: "en" }),
      });
      
      if (res.ok) {
        const { translation } = await res.json();
        setTranslatedPresentations(prev => ({
          ...prev,
          [talentId]: translation,
        }));
      }
    } catch (error) {
      console.error("Erreur traduction:", error);
    } finally {
      setTranslatingId(null);
    }
  }

  useEffect(() => {
    if (lang === "en" && selectedTalent?.presentation) {
      translatePresentation(selectedTalent.id, selectedTalent.presentation);
    }
  }, [lang, selectedTalent]);

  useEffect(() => {
    const savedFavorites = localStorage.getItem(`partner-${slug}-favorites`);
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        console.error("Erreur parsing favoris:", e);
      }
    }
    
    const savedLang = localStorage.getItem(`partner-${slug}-lang`) as Lang;
    if (savedLang && (savedLang === "fr" || savedLang === "en")) {
      setLang(savedLang);
    }
    
    setFavoritesLoaded(true);
  }, [slug]);

  useEffect(() => {
    async function fetchPartnerData() {
      try {
        const res = await fetch(`/api/partners/${slug}/public`);
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          console.log("[Partner Page] Données reçues:", {
            partner: data.partner?.name,
            talentsCount: data.talents?.length || 0,
            projectsCount: data.projects?.length || 0,
          });
          setPartner(data.partner);
          setTalents(data.talents || []);
          setProjects(data.projects || []);
          // 1 vue = 1 entrée sur le site (une fois par session)
          if (data.partner?.id) {
            const pid = data.partner.id;
            const storageKey = `partner_view_${pid}`;
            if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(storageKey)) {
              trackEvent(pid, "view");
              sessionStorage.setItem(storageKey, "1");
            }
            partnerIdRef.current = pid;
            landingTimeRef.current = Date.now();
          }
        }
      } catch (error) {
        console.error("Erreur chargement partenaire:", error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (slug) {
      fetchPartnerData();
    }
  }, [slug]);

  useEffect(() => {
    if (favoritesLoaded && slug) {
      localStorage.setItem(`partner-${slug}-favorites`, JSON.stringify(favorites));
    }
  }, [favorites, favoritesLoaded, slug]);

  useEffect(() => {
    if (slug) {
      localStorage.setItem(`partner-${slug}-lang`, lang);
    }
  }, [lang, slug]);

  // Envoyer la durée de visite (session_end) à la sortie / fermeture
  useEffect(() => {
    function sendSessionEnd() {
      if (sessionEndSentRef.current) return;
      const pid = partnerIdRef.current;
      const start = landingTimeRef.current;
      if (!pid || start == null) return;
      sessionEndSentRef.current = true;
      const durationSeconds = Math.round((Date.now() - start) / 1000);
      if (durationSeconds > 0) trackEvent(pid, "session_end", undefined, undefined, durationSeconds);
    }
    const onEnd = () => {
      // Persister la sélection au moment de quitter (au cas où le dernier effet n'a pas eu le temps)
      const s = slugRef.current;
      if (s) {
        try {
          localStorage.setItem(`partner-${s}-favorites`, JSON.stringify(favoritesRef.current));
        } catch (_) {}
      }
      sendSessionEnd();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendSessionEnd();
    };
    window.addEventListener("beforeunload", onEnd);
    window.addEventListener("pagehide", onEnd);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onEnd);
      window.removeEventListener("pagehide", onEnd);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function toggleFavorite(talentId: string) {
    setFavorites(prev => 
      prev.includes(talentId) 
        ? prev.filter(id => id !== talentId)
        : [...prev, talentId]
    );
  }

  function toggleNetwork(network: string) {
    setSelectedNetworks((prev) =>
      prev.includes(network)
        ? prev.filter((n) => n !== network)
        : [...prev, network]
    );
  }

  function sortTalents(talentsToSort: Talent[]): Talent[] {
    const sorted = [...talentsToSort];
    
    switch (sortBy) {
      case "ig-followers":
        return sorted.sort((a, b) => (b.stats?.igFollowers || 0) - (a.stats?.igFollowers || 0));
      case "tt-followers":
        return sorted.sort((a, b) => (b.stats?.ttFollowers || 0) - (a.stats?.ttFollowers || 0));
      case "yt-followers":
        return sorted.sort((a, b) => (b.stats?.ytAbonnes || 0) - (a.stats?.ytAbonnes || 0));
      case "name":
        return sorted.sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`));
      default:
        return sorted;
    }
  }

  const filteredTalents = sortTalents(talents.filter((t) => {
    const nicheMatch =
      selectedNiche === "all" ||
      t.niches.some((n) => n.toLowerCase().includes(selectedNiche.toLowerCase()));

    const networkMatch =
      selectedNetworks.length === 0 ||
      selectedNetworks.some((network) => {
        if (network === "instagram") return t.stats?.igFollowers;
        if (network === "tiktok") return t.stats?.ttFollowers;
        if (network === "youtube") return t.stats?.ytAbonnes;
        return false;
      });

    return nicheMatch && networkMatch;
  }));

  const sortLabels: Record<SortOption, string> = {
    default: t.sortDefault,
    "ig-followers": t.sortIgFollowers,
    "tt-followers": t.sortTtFollowers,
    "yt-followers": t.sortYtFollowers,
    name: t.sortName,
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedTalent(null);
        setSelectedProject(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleExcelDownload() {
    if (!partner) return;
    setDownloadingExcel(true);
    try {
      const res = await fetch(`/api/partners/${slug}/export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `GlowUp_Talents_${partner.name.replace(/[^a-z0-9]/gi, "_")}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        trackEvent(partner.id, "excel_download");
      }
    } catch (error) {
      console.error("Erreur téléchargement Excel:", error);
    } finally {
      setDownloadingExcel(false);
    }
  }

  async function handleDownloadSelectionPdf() {
    if (favorites.length === 0) return;
    setDownloadingSelectionPdf(true);
    try {
      const res = await fetch("/api/selection/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentIds: favorites, lang }),
      });
      if (!res.ok) throw new Error("Erreur génération PDF");
      const { html } = await res.json();
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const container = document.createElement("div");
      container.innerHTML = html;
      container.style.position = "fixed";
      container.style.left = "0";
      container.style.top = "0";
      container.style.width = "210mm";
      container.style.background = "white";
      container.style.zIndex = "-9999";
      container.style.opacity = "0";
      document.body.appendChild(container);
      const images = container.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map((img) =>
          img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 5000); })
        )
      );
      await new Promise((r) => setTimeout(r, 500));
      const pages = container.querySelectorAll(".page");
      const pdf = new jsPDF("p", "mm", "a4");
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#F5EDE0",
          width: 794,
          height: 1123,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
      }
      const name = partner?.name?.replace(/[^a-z0-9]/gi, "_") || "partenaire";
      pdf.save(`GlowUp_Selection_${name}_${new Date().toISOString().split("T")[0]}.pdf`);
      document.body.removeChild(container);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la génération du PDF");
    } finally {
      setDownloadingSelectionPdf(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        @font-face {
          font-family: 'Spectral-MediumItalic';
          src: url('/fonts/Spectral-MediumItalic.ttf') format('truetype');
          font-weight: 500;
          font-style: italic;
          font-display: swap;
        }
        
        @font-face {
          font-family: 'Spectral-Light';
          src: url('/fonts/Spectral-Light.ttf') format('truetype');
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }
        
        @font-face {
          font-family: 'Spectral-LightItalic';
          src: url('/fonts/Spectral-LightItalic.ttf') format('truetype');
          font-weight: 300;
          font-style: italic;
          font-display: swap;
        }
        
        @font-face {
          font-family: 'Switzer';
          src: url('/fonts/Switzer-Light.ttf') format('truetype');
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }
        
        .font-spectral-medium-italic {
          font-family: 'Spectral-MediumItalic', Georgia, serif;
        }
        
        .font-spectral-light {
          font-family: 'Spectral-Light', Georgia, serif;
        }
        
        .font-spectral-light-italic {
          font-family: 'Spectral-LightItalic', Georgia, serif;
        }
        
        .font-switzer {
          font-family: 'Switzer', system-ui, sans-serif;
        }
      `}</style>

      {notFound ? (
        <div className="min-h-screen bg-[#F5EDE0] flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-4xl font-spectral-light text-[#220101] mb-4">404</h1>
            <p className="text-lg text-[#220101]/60 font-switzer">
              Partenaire introuvable ou inactif
            </p>
          </div>
        </div>
      ) : (
        <div className={`min-h-screen bg-[#F5EDE0] ${favorites.length > 0 ? 'pb-28 sm:pb-24' : ''}`}>
          {/* Header */}
          <header className="bg-[#220101] py-8 sm:py-12 md:py-16 px-3 sm:px-4 relative">
            {/* Toggle Langue + Bouton Excel */}
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 md:top-6 md:right-6 flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
              <button
                onClick={handleExcelDownload}
                disabled={downloadingExcel}
                className="group flex items-center gap-2 sm:gap-3 pl-1 pr-3 py-2 sm:pl-2 sm:pr-4 md:pr-5 md:py-2.5 bg-white/10 hover:bg-white/20 border border-white/30 hover:border-white/50 rounded-xl text-white font-switzer font-medium text-xs sm:text-sm md:text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-lg backdrop-blur-sm touch-manipulation"
                title="Télécharger le catalogue en tableau Excel (.xlsx)"
              >
                {downloadingExcel ? (
                  <>
                    <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white/10 shrink-0">
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    </div>
                    <span className="hidden sm:inline">Téléchargement…</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-lg bg-emerald-600/90 group-hover:bg-emerald-500 shadow-md shrink-0">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M8 13h2" /><path d="M8 17h2" /><path d="M14 13h2" /><path d="M14 17h2" />
                      </svg>
                    </div>
                    <div className="text-left min-w-0 hidden sm:block">
                      <span className="block font-semibold tracking-tight text-sm sm:text-base">Télécharger en tableau Excel</span>
                      <span className="hidden md:block text-xs text-white/70 font-normal">Catalogue talents · .xlsx</span>
                    </div>
                    <span className="sm:hidden font-semibold">Excel</span>
                  </>
                )}
              </button>
              <div className="flex items-center bg-[#F5EDE0]/10 rounded-full p-1 shrink-0">
                <button
                  onClick={() => setLang("fr")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-switzer transition-all touch-manipulation ${
                    lang === "fr"
                      ? "bg-[#B06F70] text-white"
                      : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"
                  }`}
                >
                  FR
                </button>
                <button
                  onClick={() => setLang("en")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-switzer transition-all touch-manipulation ${
                    lang === "en"
                      ? "bg-[#B06F70] text-white"
                      : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            <div className="max-w-6xl mx-auto text-center px-2 sm:px-4 pt-12 sm:pt-14 md:pt-0">
              {/* Notre logo au dessus, séparateur ×, logo partenaire en dessous, centrés */}
              <div className="flex flex-col items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="h-7 sm:h-8 md:h-9 flex items-center shrink-0">
                  <GlowUpLogo className="h-full w-auto" color="#ffffff" />
                </div>
                <span className="text-[#F5EDE0]/50 text-xs sm:text-sm select-none" aria-hidden>
                  ×
                </span>
                {partner?.logo ? (
                  <div className="h-10 sm:h-11 md:h-12 flex items-center shrink-0 max-w-[180px] sm:max-w-[220px] bg-white/90 rounded-md px-4 py-2 shadow-sm">
                    <img
                      src={partner.logo}
                      alt={partner.name}
                      className="h-full w-auto object-contain object-center"
                    />
                  </div>
                ) : (
                  <span className="text-[#F5EDE0]/90 text-xs sm:text-sm font-spectral-light truncate max-w-[140px] sm:max-w-none">
                    {partner?.name}
                  </span>
                )}
              </div>
              {partner?.message && (
                <p className="text-[#F5EDE0]/80 text-xs sm:text-sm md:text-base mb-4 sm:mb-6 font-spectral-light-italic max-w-2xl mx-auto line-clamp-3 sm:line-clamp-none">
                  {partner.message}
                </p>
              )}
              <p className="text-[#F5EDE0]/60 text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em] font-spectral-light-italic">
                {t.tagline}
              </p>
              <div className="mt-6 sm:mt-10 md:mt-14">
                <h1 className="text-2xl sm:text-3xl md:text-4xl text-[#F5EDE0]">
                  <span className="font-spectral-light-italic opacity-80">{t.ourTalents}</span>{" "}
                  <span className="font-spectral-light">{t.talents}</span>
                </h1>
                <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-[#F5EDE0]/40 tracking-wide font-switzer">
                  {t.discover}
                </p>
              </div>
            </div>
          </header>

          {/* Contenu sous le header — fond couleur page */}
          <div className="bg-[#F5EDE0]">
          {/* Onglets Talents & Projets */}
          <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-5 sm:pt-8 pb-4 sm:pb-6">
            <div className="inline-flex w-full sm:w-auto rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm p-1 sm:p-1.5 border border-[#220101]/10 shadow-[0_2px_12px_rgba(34,1,1,0.06)]">
              <button
                onClick={() => setActiveTab("talents")}
                className={`flex-1 sm:flex-none min-w-0 sm:min-w-[120px] px-4 sm:px-7 py-3 sm:py-3.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold font-switzer tracking-wide uppercase transition-all duration-200 touch-manipulation ${
                  activeTab === "talents"
                    ? "bg-[#220101] text-white shadow-lg shadow-[#220101]/25"
                    : "text-[#220101]/60 hover:text-[#220101] hover:bg-[#220101]/[0.06]"
                }`}
              >
                Talents
              </button>
              <button
                onClick={() => setActiveTab("projets")}
                className={`flex-1 sm:flex-none min-w-0 sm:min-w-[120px] px-4 sm:px-7 py-3 sm:py-3.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold font-switzer tracking-wide uppercase transition-all duration-200 touch-manipulation ${
                  activeTab === "projets"
                    ? "bg-[#220101] text-white shadow-lg shadow-[#220101]/25"
                    : "text-[#220101]/60 hover:text-[#220101] hover:bg-[#220101]/[0.06]"
                }`}
              >
                Projets
              </button>
            </div>
          </div>

        {/* Filtres (uniquement pour l'onglet Talents) */}
        {activeTab === "talents" && (
        <nav className="sticky top-0 z-30 bg-[#F5EDE0]/95 backdrop-blur-md border-b border-[#220101]/10 py-3 sm:py-4">
          <div className="max-w-6xl mx-auto px-3 sm:px-4">
            {/* Filtres réseaux */}
            <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-3 sm:mb-4">
              <button
                onClick={() => toggleNetwork("instagram")}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm transition-all font-switzer touch-manipulation ${
                  selectedNetworks.includes("instagram")
                    ? "bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] text-white"
                    : "bg-white text-[#220101]/60 border border-[#220101]/20"
                }`}
              >
                <InstagramIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden sm:inline">Instagram</span>
              </button>
              <button
                onClick={() => toggleNetwork("tiktok")}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm transition-all font-switzer touch-manipulation ${
                  selectedNetworks.includes("tiktok")
                    ? "bg-black text-white"
                    : "bg-white text-[#220101]/60 border border-[#220101]/20"
                }`}
              >
                <TikTokIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden sm:inline">TikTok</span>
              </button>
              <button
                onClick={() => toggleNetwork("youtube")}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm transition-all font-switzer touch-manipulation ${
                  selectedNetworks.includes("youtube")
                    ? "bg-[#FF0000] text-white"
                    : "bg-white text-[#220101]/60 border border-[#220101]/20"
                }`}
              >
                <YouTubeIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden sm:inline">YouTube</span>
              </button>
            </div>

            {/* Filtres niches + Tri */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-3 px-3 sm:-mx-4 sm:px-4 md:mx-0 md:px-0 md:flex-wrap md:flex-1">
                {nicheCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedNiche(cat.id)}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm whitespace-nowrap transition-all font-switzer flex-shrink-0 touch-manipulation ${
                      selectedNiche === cat.id
                        ? "bg-[#220101] text-[#F5EDE0]"
                        : "bg-transparent text-[#220101]/60 border border-[#220101]/20 hover:border-[#220101]/40"
                    }`}
                  >
                    {cat.label[lang]}
                  </button>
                ))}
              </div>

              {/* Dropdown Tri */}
              <div className="relative flex-shrink-0 self-start md:self-auto">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white border border-[#220101]/20 rounded-full text-xs sm:text-sm font-switzer text-[#220101]/70 hover:border-[#220101]/40 transition-all whitespace-nowrap touch-manipulation"
                >
                  <SortIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden md:inline">{t.sortBy}:</span>
                  <span className="font-medium text-[#220101] max-w-[120px] sm:max-w-none truncate sm:truncate-none">{sortLabels[sortBy]}</span>
                  <ChevronDownIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${showSortMenu ? "rotate-180" : ""}`} />
                </button>

                {showSortMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowSortMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-[#220101]/10 py-2 min-w-[200px] z-50">
                      {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                        <button
                          key={option}
                          onClick={() => {
                            setSortBy(option);
                            setShowSortMenu(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm font-switzer transition-colors ${
                            sortBy === option
                              ? "bg-[#220101] text-[#F5EDE0]"
                              : "text-[#220101]/70 hover:bg-[#F5EDE0]"
                          }`}
                        >
                          {sortLabels[option]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </nav>
        )}

        {/* Contenu selon l'onglet */}
        {activeTab === "talents" ? (
        <main className="max-w-7xl mx-auto px-3 sm:px-5 md:px-8 py-6 sm:py-10 md:py-14">
          {loading ? (
            <div className="flex items-center justify-center py-16 sm:py-20">
              <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-[#220101]" />
            </div>
          ) : filteredTalents.length === 0 ? (
            <div className="text-center py-12 sm:py-20 px-4">
              <p className="text-4xl sm:text-5xl mb-3 sm:mb-4">🔍</p>
              <p className="text-base sm:text-lg text-[#220101]/50 font-switzer">
                {t.noTalents}
              </p>
              <button
                onClick={() => {
                  setSelectedNiche("all");
                  setSelectedNetworks([]);
                }}
                className="mt-4 px-5 py-2.5 sm:px-6 sm:py-2 bg-[#220101] text-[#F5EDE0] rounded-full text-sm font-switzer touch-manipulation"
              >
                {lang === "fr" ? "Réinitialiser les filtres" : "Reset filters"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 lg:gap-8">
              {filteredTalents.map((talent) => (
                <TalentCard
                  key={talent.id}
                  talent={talent}
                  onClick={() => {
                    setSelectedTalent(talent);
                    if (partner?.id) {
                      trackEvent(partner.id, "talent_click", talent.id, `${talent.prenom} ${talent.nom}`);
                    }
                  }}
                  isFavorite={favorites.includes(talent.id)}
                  onToggleFavorite={() => toggleFavorite(talent.id)}
                />
              ))}
            </div>
          )}
        </main>
        ) : (
        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12">
          {loading ? (
            <div className="flex items-center justify-center py-16 sm:py-20">
              <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-[#220101]" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 sm:py-20 px-4">
              <p className="text-4xl sm:text-5xl mb-3 sm:mb-4">🎬</p>
              <p className="text-base sm:text-lg text-[#220101]/50 font-switzer">
                Aucun projet disponible
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className="group bg-white rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(34,1,1,0.15)] active:scale-[0.99]"
                  style={{ boxShadow: "0 4px 24px rgba(34, 1, 1, 0.06)" }}
                >
                  {/* Cover Image (ancienne version pleine largeur) */}
                  <div className="relative h-40 sm:h-48 overflow-hidden bg-[#220101]">
                    {project.coverImage ? (
                      <img
                        src={project.coverImage}
                        alt={project.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
                        <span className="text-4xl">🎬</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#220101]/90 via-[#220101]/30 to-transparent" />
                    {project.category && (
                      <div className="absolute top-4 left-4 px-3 py-1 bg-[#F5EDE0]/90 backdrop-blur-sm rounded-full">
                        <span className="text-xs font-switzer text-[#220101] uppercase">
                          {project.category}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4 sm:p-5">
                    <h3 className="text-lg sm:text-xl font-spectral-light mb-2 text-[#220101] line-clamp-2">
                      {project.title}
                    </h3>
                    {project.location && (
                      <p className="text-sm text-[#220101]/60 font-switzer mb-3">
                        📍 {project.location}
                      </p>
                    )}
                    {project.date && (
                      <p className="text-xs text-[#220101]/50 font-switzer mb-4">
                        {new Date(project.date).toLocaleDateString("fr-FR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    )}
                    {project.talents.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {project.talents.slice(0, 3).map((talent) => (
                            <div
                              key={talent.id}
                              className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-[#B06F70]"
                            >
                              {talent.photo ? (
                                <img
                                  src={talent.photo}
                                  alt={`${talent.prenom} ${talent.nom}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                                  {talent.prenom.charAt(0)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {project.talents.length > 3 && (
                          <span className="text-xs text-[#220101]/50 font-switzer">
                            +{project.talents.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
        )}

          </div>
        {/* Footer */}
        <footer className="bg-[#220101] py-8 sm:py-12 md:py-16 px-3 sm:px-4">
          <div className="max-w-6xl mx-auto text-center">
            <div className="flex justify-center mb-6 sm:mb-8">
              <GlowUpLogo className="w-28 sm:w-40 md:w-48 h-auto" color="#ffffff" />
            </div>
            <p className="text-[#F5EDE0]/60 text-xs sm:text-sm tracking-[0.15em] sm:tracking-[0.2em] font-spectral-light-italic mb-8 sm:mb-12">
              THE RISE of IDEAS
            </p>
            <div className="mb-4 sm:mb-6">
              <p className="text-[10px] text-[#F5EDE0]/30 uppercase tracking-[0.2em] mb-1 sm:mb-2 font-switzer">
                Adresse
              </p>
              <p className="text-[#F5EDE0]/70 font-spectral-light text-xs sm:text-sm md:text-base break-words">
                1330 Avenue Guilibert de la Lauziere, 13290 Aix-en-Provence
              </p>
            </div>
            <div className="mb-4 sm:mb-6">
              <p className="text-[10px] text-[#F5EDE0]/30 uppercase tracking-[0.2em] mb-1 sm:mb-2 font-switzer">
                Contact
              </p>
              <a
                href="mailto:Leyna@glowupagence.fr"
                className="text-[#F5EDE0] hover:text-[#B06F70] transition-colors font-spectral-light text-sm sm:text-base break-all"
              >
                Leyna@glowupagence.fr
              </a>
            </div>
            <div className="mb-8 sm:mb-10">
              <p className="text-[10px] text-[#F5EDE0]/30 uppercase tracking-[0.2em] mb-2 sm:mb-3 font-switzer">
                Socials
              </p>
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 md:gap-8">
                <a
                  href="https://instagram.com/glowithup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F5EDE0]/60 hover:text-[#F5EDE0] transition-colors text-sm tracking-wider underline underline-offset-4 font-switzer"
                >
                  INSTAGRAM
                </a>
                <a
                  href="https://tiktok.com/@glowithup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F5EDE0]/60 hover:text-[#F5EDE0] transition-colors text-sm tracking-wider underline underline-offset-4 font-switzer"
                >
                  TIKTOK
                </a>
              </div>
            </div>
            <p className="text-[#F5EDE0]/20 text-xs tracking-wider font-switzer">
              ©2025 GLOWUP AGENCY
            </p>
          </div>
        </footer>

        {/* Modal Talent */}
        {selectedTalent && (
          <TalentModal
            talent={selectedTalent}
            onClose={() => setSelectedTalent(null)}
            isFavorite={favorites.includes(selectedTalent.id)}
            onToggleFavorite={() => toggleFavorite(selectedTalent.id)}
            lang={lang}
            translatedPresentation={translatedPresentations[selectedTalent.id]}
            isTranslating={translatingId === selectedTalent.id}
            partnerName={partner?.name}
          />
        )}

        {/* Modal Projet */}
        {selectedProject && (
          <ProjectModal
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
            lang={lang}
          />
        )}

        {/* Barre de sélection */}
        <SelectionBar
          favorites={favorites}
          talents={talents}
          onRemove={(id) => setFavorites((prev) => prev.filter((x) => x !== id))}
          onClear={() => setFavorites([])}
          onDownloadPdf={handleDownloadSelectionPdf}
          downloadingPdf={downloadingSelectionPdf}
          lang={lang}
          partner={partner ? { name: partner.name, slug: partner.slug } : null}
        />
        </div>
      )}
    </>
  );
}