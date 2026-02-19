"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

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
  action: "view" | "talent_click" | "cta_click" | "filter",
  talentId?: string,
  talentName?: string
) {
  if (typeof window === "undefined") return;

  const payload = {
    partnerId,
    action,
    visitorId: getVisitorId(),
    talentClicked: talentId,
    talentName,
  };

  fetch("/api/partners/tracking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // best-effort, ne casse jamais l'UX
  });
}

// Types
interface TalentStats {
  igFollowers: number | null;
  igFollowersEvol: number | null;
  igEngagement: number | null;
  igEngagementEvol: number | null;
  ttFollowers: number | null;
  ttFollowersEvol: number | null;
  ttEngagement: number | null;
  ttEngagementEvol: number | null;
  ytAbonnes: number | null;
  ytAbonnesEvol: number | null;
}

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  presentation: string | null;
  presentationEn: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  niches: string[];
  ville: string | null;
  stats: TalentStats | null;
}

interface Partner {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  description: string | null;
  message: string | null;
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
    viewSelection: "Voir ma sélection",
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
    viewSelection: "View selection",
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
function GlowUpLogo({ className = "", color = "#220101" }: { className?: string; color?: string }) {
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
      className="group bg-white rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(34,1,1,0.15)]"
      style={{ boxShadow: "0 4px 24px rgba(34, 1, 1, 0.06)" }}
    >
      <div className="relative h-[340px] overflow-hidden bg-[#F5EDE0]">
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
        
        <div className="absolute bottom-5 left-5 right-5">
          <p className="text-[#F5EDE0]/70 text-base font-spectral-medium-italic">
            {talent.prenom}
          </p>
          <p className="text-[#F5EDE0] text-2xl tracking-wide font-spectral-light">
            {talent.nom.toUpperCase()}
          </p>
          {(talent.instagram || talent.tiktok) && (
            <p className="text-[#F5EDE0]/50 text-sm font-switzer mt-1">
              @{talent.instagram?.replace('@', '') || talent.tiktok?.replace('@', '')}
            </p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`absolute top-4 left-4 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isFavorite 
              ? "bg-[#B06F70] text-white scale-110" 
              : "bg-white/90 text-[#220101]/40 hover:text-[#B06F70] hover:scale-110"
          }`}
        >
          <HeartIcon filled={isFavorite} className="w-5 h-5" />
        </button>

        <div className="absolute top-4 right-4 flex gap-2">
          {talent.instagram && talent.stats?.igFollowers && (
            <a
              href={`https://instagram.com/${talent.instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm"
            >
              <InstagramIcon className="w-4 h-4 text-[#220101]" />
            </a>
          )}
          {talent.tiktok && talent.stats?.ttFollowers && (
            <a
              href={`https://tiktok.com/@${talent.tiktok.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm"
            >
              <TikTokIcon className="w-4 h-4 text-[#220101]" />
            </a>
          )}
          {talent.youtube && talent.stats?.ytAbonnes && (
            <a
              href={`https://youtube.com/@${talent.youtube.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm"
            >
              <YouTubeIcon className="w-4 h-4 text-[#220101]" />
            </a>
          )}
        </div>
      </div>

      <div className="p-5">
        <p className="text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-spectral-light">
          {talent.niches.length > 0 ? talent.niches.slice(0, 3).join(" · ") : "Créateur de contenu"}
        </p>

        <div className="space-y-2">
          {talent.stats?.igFollowers && (
            <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
              <div className="flex items-center gap-2.5">
                <a
                  href={`https://instagram.com/${talent.instagram?.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:scale-125 transition-transform"
                >
                  <InstagramIcon className="w-4 h-4 text-[#220101]/60 hover:text-[#E1306C]" />
                </a>
                <span className="font-switzer text-[#220101]">
                  {formatFollowers(talent.stats.igFollowers)}
                </span>
                {talent.stats.igFollowersEvol !== null && talent.stats.igFollowersEvol > 0 && (
                  <span className="text-[11px] font-switzer text-[#4a5d23] bg-[#E5F2B5] px-2 py-0.5 rounded">
                    ▲ {talent.stats.igFollowersEvol.toFixed(2).replace(".", ",")}%
                  </span>
                )}
              </div>
              <span className="font-switzer text-[#220101]">
                {talent.stats.igEngagement?.toFixed(2).replace(".", ",") || "—"}%
              </span>
            </div>
          )}

          {talent.stats?.ttFollowers && (
            <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
              <div className="flex items-center gap-2.5">
                <a
                  href={`https://tiktok.com/@${talent.tiktok?.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:scale-125 transition-transform"
                >
                  <TikTokIcon className="w-4 h-4 text-[#220101]/60 hover:text-black" />
                </a>
                <span className="font-switzer text-[#220101]">
                  {formatFollowers(talent.stats.ttFollowers)}
                </span>
                {talent.stats.ttFollowersEvol !== null && talent.stats.ttFollowersEvol > 0 && (
                  <span className="text-[11px] font-switzer text-[#4a5d23] bg-[#E5F2B5] px-2 py-0.5 rounded">
                    ▲ {talent.stats.ttFollowersEvol.toFixed(2).replace(".", ",")}%
                  </span>
                )}
              </div>
              <span className="font-switzer text-[#220101]">
                {talent.stats.ttEngagement?.toFixed(2).replace(".", ",") || "—"}%
              </span>
            </div>
          )}

          {talent.stats?.ytAbonnes && (
            <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
              <div className="flex items-center gap-2.5">
                <a
                  href={`https://youtube.com/@${talent.youtube?.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:scale-125 transition-transform"
                >
                  <YouTubeIcon className="w-4 h-4 text-[#220101]/60 hover:text-[#FF0000]" />
                </a>
                <span className="font-switzer text-[#220101]">
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

// Composant Modal - RESPONSIVE AVEC LOGO ET POURCENTAGES
function TalentModal({ 
  talent, 
  onClose,
  isFavorite,
  onToggleFavorite,
  lang,
  translatedPresentation,
  isTranslating,
}: { 
  talent: Talent | null; 
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  lang: Lang;
  translatedPresentation?: string;
  isTranslating?: boolean;
}) {
  if (!talent) return null;

  const hasPhoto = talent.photo && talent.photo.trim() !== "";
  const t = translations[lang];
  
  const displayPresentation = lang === "en" 
    ? (translatedPresentation || talent.presentationEn || talent.presentation)
    : talent.presentation;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-[#220101]/90 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-[#F5EDE0] w-full max-w-5xl max-h-[95vh] rounded-2xl md:rounded-[2rem] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[95vh] overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[1.2fr_1fr]">
          {/* Photo */}
          <div className="relative h-[300px] md:h-auto md:min-h-[700px] bg-[#220101]">
            {hasPhoto ? (
              <>
                <img
                  src={talent.photo!}
                  alt={`${talent.prenom} ${talent.nom}`}
                  className="w-full h-full object-cover object-top"
                />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#220101]/40 to-transparent" />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
                <span className="text-[80px] md:text-[140px] text-[#F5EDE0]/50 tracking-widest font-spectral-light">
                  {getInitials(talent.prenom, talent.nom)}
                </span>
              </div>
            )}
            
            {/* Bouton fermer */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 md:top-5 md:right-5 w-10 h-10 md:w-11 md:h-11 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center text-[#220101] transition-all hover:scale-110 shadow-xl font-switzer text-lg"
            >
              ✕
            </button>

            {/* Bouton Favori */}
            <button
              onClick={onToggleFavorite}
              className={`absolute top-4 left-4 md:top-5 md:left-5 w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all shadow-xl ${
                isFavorite 
                  ? "bg-[#B06F70] text-white" 
                  : "bg-white/95 backdrop-blur-sm text-[#220101]/40 hover:text-[#B06F70]"
              }`}
            >
              <HeartIcon filled={isFavorite} className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 md:p-8 lg:p-10 md:overflow-y-auto md:max-h-[92vh] bg-[#F5EDE0] flex flex-col">
            {/* Nom */}
            <h2 className="text-2xl md:text-3xl lg:text-[2.5rem] mb-1 md:mb-2 text-[#220101] leading-tight">
              <span className="font-spectral-medium-italic">{talent.prenom}</span>{" "}
              <span className="font-spectral-light">{talent.nom.toUpperCase()}</span>
            </h2>

            {/* @ Handle */}
            {(talent.instagram || talent.tiktok) && (
              <p className="text-[#B06F70] text-sm md:text-base font-switzer mb-2">
                @{talent.instagram?.replace('@', '') || talent.tiktok?.replace('@', '')}
              </p>
            )}

            {/* Niches */}
            <p className="text-xs md:text-sm text-[#220101] uppercase tracking-[0.15em] mb-2 font-spectral-light font-bold">
              {talent.niches.length > 0 ? talent.niches.join(" / ") : "CRÉATEUR DE CONTENU"}
            </p>

            {/* Rôle */}
            <p className="text-[#220101]/70 text-sm md:text-lg mb-4 md:mb-6 font-spectral-light-italic">
              {lang === "fr" ? "Créatrice de contenu" : "Content Creator"}
            </p>

            {/* Présentation */}
            {(talent.presentation || displayPresentation) && (
              <div className="mb-5 md:mb-8 pb-4 md:pb-6 border-b border-[#220101]/15">
                <p className="text-[10px] md:text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-2 md:mb-4 font-switzer">
                  {t.presentation}
                </p>
                {isTranslating ? (
                  <div className="flex items-center gap-2 text-[#220101]/50">
                    <div className="w-4 h-4 border-2 border-[#220101]/20 border-t-[#220101] rounded-full animate-spin" />
                    <span className="font-switzer text-sm">Translating...</span>
                  </div>
                ) : (
                  <p className="text-[#220101] leading-relaxed text-sm md:text-base font-spectral-light">
                    {displayPresentation}
                  </p>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="mb-5 md:mb-8 flex-1">
              {/* Header */}
              <div className="grid grid-cols-2 gap-4 mb-2 pb-2">
                <p className="text-[10px] md:text-[11px] text-[#220101]/50 uppercase tracking-[0.1em] font-switzer">
                  {t.community}
                </p>
                <p className="text-[10px] md:text-[11px] text-[#220101]/50 uppercase tracking-[0.1em] text-right font-switzer">
                  {t.engagementRate}
                </p>
              </div>

              {/* Lignes */}
              <div>
                {/* Instagram */}
                {talent.stats?.igFollowers && (
                  <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`https://instagram.com/${talent.instagram?.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:scale-110 transition-transform"
                      >
                        <InstagramIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-[#E1306C]" />
                      </a>
                      <span className="text-sm md:text-xl text-[#220101] font-switzer">
                        {formatFollowers(talent.stats.igFollowers)}
                      </span>
                      {talent.stats.igFollowersEvol !== null && (
                        <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                          ▲ {talent.stats.igFollowersEvol.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <span className="text-sm md:text-xl text-[#220101] font-switzer">
                        {talent.stats.igEngagement?.toFixed(2).replace(".", ",") || "—"}%
                      </span>
                      {talent.stats.igEngagementEvol !== null && (
                        <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                          ▲ {talent.stats.igEngagementEvol.toFixed(1)}PT
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* TikTok */}
                {talent.stats?.ttFollowers && (
                  <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`https://tiktok.com/@${talent.tiktok?.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:scale-110 transition-transform"
                      >
                        <TikTokIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-black" />
                      </a>
                      <span className="text-sm md:text-xl text-[#220101] font-switzer">
                        {formatFollowers(talent.stats.ttFollowers)}
                      </span>
                      {talent.stats.ttFollowersEvol !== null && (
                        <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                          ▲ {talent.stats.ttFollowersEvol.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <span className="text-sm md:text-xl text-[#220101] font-switzer">
                        {talent.stats.ttEngagement?.toFixed(2).replace(".", ",") || "—"}%
                      </span>
                      {talent.stats.ttEngagementEvol !== null && (
                        <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                          ▲ {talent.stats.ttEngagementEvol.toFixed(1)}PT
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* YouTube */}
                {talent.stats?.ytAbonnes && (
                  <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`https://youtube.com/@${talent.youtube?.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:scale-110 transition-transform"
                      >
                        <YouTubeIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-[#FF0000]" />
                      </a>
                      <span className="text-sm md:text-xl text-[#220101] font-switzer">
                        {formatFollowers(talent.stats.ytAbonnes)}
                      </span>
                      {talent.stats.ytAbonnesEvol !== null && (
                        <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                          ▲ {talent.stats.ytAbonnesEvol.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div></div>
                  </div>
                )}
              </div>
            </div>

            {/* Logo Glow Up - VISIBLE SUR MOBILE ET DESKTOP */}
            <div className="pt-4 md:pt-6 border-t border-[#220101]/10 flex justify-center">
              <GlowUpLogo className="w-24 md:w-32 h-auto opacity-60" color="#220101" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Barre de sélection flottante
function SelectionBar({ 
  favorites, 
  talents,
  onRemove,
  onClear,
  lang,
}: { 
  favorites: string[];
  talents: Talent[];
  onRemove: (id: string) => void;
  onClear: () => void;
  lang: Lang;
}) {
  const selectedTalents = talents.filter(t => favorites.includes(t.id));
  const t = translations[lang];
  
  if (favorites.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#220101] shadow-[0_-4px_30px_rgba(34,1,1,0.3)]">
      <div className="max-w-6xl mx-auto px-3 md:px-4 py-3 md:py-4">
        <div className="flex items-center justify-between gap-2 md:gap-4">
          {/* Avatars des sélectionnés */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="flex -space-x-2 md:-space-x-3 flex-shrink-0">
              {selectedTalents.slice(0, 4).map((talent) => (
                <div key={talent.id} className="relative group">
                  {talent.photo ? (
                    <img
                      src={talent.photo}
                      alt={talent.prenom}
                      className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-[#220101] object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-[#220101] bg-[#B06F70] flex items-center justify-center text-white font-bold text-xs md:text-sm">
                      {getInitials(talent.prenom, talent.nom)}
                    </div>
                  )}
                  <button
                    onClick={() => onRemove(talent.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full text-[#220101] text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {favorites.length > 4 && (
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-[#220101] bg-[#B06F70] flex items-center justify-center text-white font-bold text-xs md:text-sm">
                  +{favorites.length - 4}
                </div>
              )}
            </div>
            <div className="text-[#F5EDE0]">
              <p className="font-switzer text-xs md:text-sm">
                <span className="font-bold">{favorites.length}</span>{" "}
                <span className="hidden sm:inline">{favorites.length > 1 ? t.talentsPlural : t.talent} {favorites.length > 1 ? t.selectedPlural : t.selected}</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={onClear}
              className="px-3 py-2 text-[#F5EDE0]/60 hover:text-[#F5EDE0] transition-colors font-switzer text-xs md:text-sm hidden sm:block"
            >
              {t.clearAll}
            </button>
            <button
              onClick={() => {
                // Afficher les favoris dans une alerte ou modal simple
                const selectedNames = selectedTalents.map(t => `${t.prenom} ${t.nom}`).join(', ');
                alert(`${favorites.length} talent(s) sélectionné(s): ${selectedNames}`);
              }}
              className="px-4 md:px-6 py-2.5 md:py-3 bg-[#B06F70] hover:bg-[#9d5f60] text-white rounded-full font-switzer font-medium transition-all hover:scale-105 flex items-center gap-2 text-sm"
            >
              <HeartIcon filled className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden sm:inline">{t.viewSelection}</span>
              <span className="sm:hidden">Voir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Page principale
export default function PartnerTalentBookPage() {
  const params = useParams<{ id: string }>();
  const slug = params.id; // Le paramètre 'id' est utilisé comme slug
  
  const [partner, setPartner] = useState<Partner | null>(null);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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
          setPartner(data.partner);
          setTalents(data.talents);
          // Track page view
          if (data.partner?.id) {
            trackEvent(data.partner.id, "view");
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
      if (e.key === "Escape") setSelectedTalent(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        <div className={`min-h-screen bg-[#F5EDE0] ${favorites.length > 0 ? 'pb-24' : ''}`}>
          {/* Header */}
          <header className="bg-[#220101] py-12 md:py-16 px-4 relative">
            {/* Toggle Langue */}
            <div className="absolute top-4 right-4 md:top-6 md:right-6">
              <div className="flex items-center bg-[#F5EDE0]/10 rounded-full p-1">
                <button
                  onClick={() => setLang("fr")}
                  className={`px-3 py-1.5 rounded-full text-sm font-switzer transition-all ${
                    lang === "fr"
                      ? "bg-[#B06F70] text-white"
                      : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"
                  }`}
                >
                  FR
                </button>
                <button
                  onClick={() => setLang("en")}
                  className={`px-3 py-1.5 rounded-full text-sm font-switzer transition-all ${
                    lang === "en"
                      ? "bg-[#B06F70] text-white"
                      : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            <div className="max-w-6xl mx-auto text-center px-4">
              <div className="flex justify-center mb-6">
                {partner?.logo ? (
                  <img src={partner.logo} alt={partner.name} className="max-h-32 md:max-h-40 h-auto" />
                ) : (
                  <GlowUpLogo className="w-56 md:w-64 lg:w-80 h-auto" color="#B06F70" />
                )}
              </div>
              {partner?.message && (
                <p className="text-[#F5EDE0]/80 text-sm md:text-base mb-6 font-spectral-light-italic max-w-2xl mx-auto">
                  {partner.message}
                </p>
              )}
              <p className="text-[#F5EDE0]/60 text-sm tracking-[0.3em] font-spectral-light-italic">
                {t.tagline}
              </p>
              <div className="mt-10 md:mt-14">
                <h1 className="text-3xl md:text-4xl text-[#F5EDE0]">
                  <span className="font-spectral-light-italic opacity-80">{t.ourTalents}</span>{" "}
                  <span className="font-spectral-light">{t.talents}</span>
                </h1>
                <p className="mt-3 text-sm text-[#F5EDE0]/40 tracking-wide font-switzer">
                  {t.discover}
                </p>
              </div>
            </div>
          </header>

        {/* Filtres */}
        <nav className="sticky top-0 z-30 bg-[#F5EDE0]/95 backdrop-blur-md border-b border-[#220101]/10 py-4">
          <div className="max-w-6xl mx-auto px-4">
            {/* Filtres réseaux */}
            <div className="flex justify-center gap-2 md:gap-3 mb-4">
              <button
                onClick={() => toggleNetwork("instagram")}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-sm transition-all font-switzer ${
                  selectedNetworks.includes("instagram")
                    ? "bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] text-white"
                    : "bg-white text-[#220101]/60 border border-[#220101]/20"
                }`}
              >
                <InstagramIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Instagram</span>
              </button>
              <button
                onClick={() => toggleNetwork("tiktok")}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-sm transition-all font-switzer ${
                  selectedNetworks.includes("tiktok")
                    ? "bg-black text-white"
                    : "bg-white text-[#220101]/60 border border-[#220101]/20"
                }`}
              >
                <TikTokIcon className="w-4 h-4" />
                <span className="hidden sm:inline">TikTok</span>
              </button>
              <button
                onClick={() => toggleNetwork("youtube")}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-sm transition-all font-switzer ${
                  selectedNetworks.includes("youtube")
                    ? "bg-[#FF0000] text-white"
                    : "bg-white text-[#220101]/60 border border-[#220101]/20"
                }`}
              >
                <YouTubeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">YouTube</span>
              </button>
            </div>

            {/* Filtres niches + Tri */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:flex-1">
                {nicheCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedNiche(cat.id)}
                    className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all font-switzer flex-shrink-0 ${
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
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#220101]/20 rounded-full text-sm font-switzer text-[#220101]/70 hover:border-[#220101]/40 transition-all whitespace-nowrap"
                >
                  <SortIcon className="w-4 h-4" />
                  <span className="hidden md:inline">{t.sortBy}:</span>
                  <span className="font-medium text-[#220101]">{sortLabels[sortBy]}</span>
                  <ChevronDownIcon className={`w-4 h-4 transition-transform ${showSortMenu ? "rotate-180" : ""}`} />
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

        {/* Grille */}
        <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#220101]" />
            </div>
          ) : filteredTalents.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-lg text-[#220101]/50 font-switzer">
                {t.noTalents}
              </p>
              <button
                onClick={() => {
                  setSelectedNiche("all");
                  setSelectedNetworks([]);
                }}
                className="mt-4 px-6 py-2 bg-[#220101] text-[#F5EDE0] rounded-full text-sm font-switzer"
              >
                {lang === "fr" ? "Réinitialiser les filtres" : "Reset filters"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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

        {/* Footer */}
        <footer className="bg-[#220101] py-12 md:py-16 px-4">
          <div className="max-w-6xl mx-auto text-center">
            <div className="flex justify-center mb-8">
              <GlowUpLogo className="w-40 md:w-48 h-auto" color="#B06F70" />
            </div>
            <p className="text-[#F5EDE0]/60 text-sm tracking-[0.2em] font-spectral-light-italic mb-12">
              THE RISE of IDEAS
            </p>
            <div className="mb-6">
              <p className="text-[10px] text-[#F5EDE0]/30 uppercase tracking-[0.2em] mb-2 font-switzer">
                Adresse
              </p>
              <p className="text-[#F5EDE0]/70 font-spectral-light text-sm md:text-base">
                1330 Avenue Guilibert de la Lauziere, 13290 Aix-en-Provence
              </p>
            </div>
            <div className="mb-6">
              <p className="text-[10px] text-[#F5EDE0]/30 uppercase tracking-[0.2em] mb-2 font-switzer">
                Contact
              </p>
              <a
                href="mailto:contact@glowupagence.fr"
                className="text-[#F5EDE0] hover:text-[#B06F70] transition-colors font-spectral-light"
              >
                contact@glowupagence.fr
              </a>
            </div>
            <div className="mb-10">
              <p className="text-[10px] text-[#F5EDE0]/30 uppercase tracking-[0.2em] mb-3 font-switzer">
                Socials
              </p>
              <div className="flex justify-center gap-6 md:gap-8">
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

        {/* Modal */}
        {selectedTalent && (
          <TalentModal
            talent={selectedTalent}
            onClose={() => setSelectedTalent(null)}
            isFavorite={favorites.includes(selectedTalent.id)}
            onToggleFavorite={() => toggleFavorite(selectedTalent.id)}
            lang={lang}
            translatedPresentation={translatedPresentations[selectedTalent.id]}
            isTranslating={translatingId === selectedTalent.id}
          />
        )}

        {/* Barre de sélection */}
        <SelectionBar 
          favorites={favorites}
          talents={talents}
          onRemove={(id) => toggleFavorite(id)}
          onClear={() => setFavorites([])}
          lang={lang}
        />
        </div>
      )}
    </>
  );
}