"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  niches: string[];
  ville: string | null;
  stats: TalentStats | null;
}

// Traductions
const translations = {
  fr: {
    mySelection: "ma",
    selection: "sélection",
    talentSelected: "talent sélectionné",
    talentsSelected: "talents sélectionnés",
    backToCatalog: "Retour au catalogue",
    emptySelection: "Votre sélection est vide",
    browseAndAdd: "Parcourez notre catalogue et ajoutez vos talents favoris",
    discoverTalents: "Découvrir les talents",
    clearAll: "Tout effacer",
    downloadPdf: "Télécharger en PDF",
    generating: "Génération...",
    interestedBy: "Intéressé par",
    thisSelection: "cette sélection ?",
    downloadAndSend: "Téléchargez le PDF et envoyez-le nous pour obtenir un devis personnalisé",
    downloadThePdf: "Télécharger le PDF",
    sendByEmail: "Envoyer par email",
  },
  en: {
    mySelection: "my",
    selection: "selection",
    talentSelected: "talent selected",
    talentsSelected: "talents selected",
    backToCatalog: "Back to catalog",
    emptySelection: "Your selection is empty",
    browseAndAdd: "Browse our catalog and add your favorite talents",
    discoverTalents: "Discover talents",
    clearAll: "Clear all",
    downloadPdf: "Download PDF",
    generating: "Generating...",
    interestedBy: "Interested in",
    thisSelection: "this selection?",
    downloadAndSend: "Download the PDF and send it to us for a personalized quote",
    downloadThePdf: "Download PDF",
    sendByEmail: "Send by email",
  },
};

type Lang = "fr" | "en";

// Fonction pour formater les followers
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

// Fonction pour générer les initiales
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

// Icônes
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

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
    </svg>
  );
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  );
}

// Card talent pour la sélection
function SelectionCard({ 
  talent, 
  onRemove,
  lang,
  translatedPresentation,
  isTranslating,
}: { 
  talent: Talent; 
  onRemove: () => void;
  lang: Lang;
  translatedPresentation?: string;
  isTranslating?: boolean;
}) {
  const hasPhoto = talent.photo && talent.photo.trim() !== "";
  const t = translations[lang];
  
  // Déterminer quelle présentation afficher
  const displayPresentation = lang === "en" && translatedPresentation
    ? translatedPresentation
    : talent.presentation;

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-lg">
      <div className="grid md:grid-cols-[1fr_1.5fr]">
        {/* Photo */}
        <div className="relative h-[250px] md:h-[300px]">
          {hasPhoto ? (
            <img
              src={talent.photo!}
              alt={`${talent.prenom} ${talent.nom}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
              <span className="text-6xl text-[#F5EDE0]/60 tracking-widest font-spectral-light">
                {getInitials(talent.prenom, talent.nom)}
              </span>
            </div>
          )}
          
          {/* Bouton supprimer */}
          <button
            onClick={onRemove}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 hover:bg-red-500 hover:text-white rounded-full flex items-center justify-center transition-all shadow-lg group"
          >
            <TrashIcon className="w-5 h-5 text-[#220101] group-hover:text-white" />
          </button>
        </div>

        {/* Infos */}
        <div className="p-6 md:p-8 flex flex-col justify-between">
          <div>
            {/* Nom */}
            <h3 className="text-2xl md:text-3xl mb-2 text-[#220101]">
              <span className="font-spectral-medium-italic">{talent.prenom}</span>{" "}
              <span className="font-spectral-light">{talent.nom.toUpperCase()}</span>
            </h3>

            {/* Niches */}
            <p className="text-xs text-[#220101] uppercase tracking-[0.15em] mb-4 font-spectral-light font-bold">
              {talent.niches.length > 0 ? talent.niches.join(" / ") : (lang === "en" ? "CONTENT CREATOR" : "CRÉATEUR DE CONTENU")}
            </p>

            {/* Présentation */}
            {(talent.presentation || displayPresentation) && (
              <div className="mb-6">
                {isTranslating ? (
                  <div className="flex items-center gap-2 text-[#220101]/50">
                    <div className="w-4 h-4 border-2 border-[#220101]/20 border-t-[#220101] rounded-full animate-spin" />
                    <span className="font-switzer text-sm">{lang === "en" ? "Translating..." : "Traduction..."}</span>
                  </div>
                ) : (
                  <p className="text-[#220101]/70 text-sm leading-relaxed font-spectral-light line-clamp-3">
                    {displayPresentation}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3">
            {talent.stats?.igFollowers && (
              <a
                href={`https://instagram.com/${talent.instagram?.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-[#F5EDE0] rounded-xl hover:bg-[#220101] hover:text-[#F5EDE0] transition-colors group"
              >
                <InstagramIcon className="w-4 h-4" />
                <span className="font-switzer text-sm">
                  {formatFollowers(talent.stats.igFollowers)}
                </span>
                <span className="text-xs opacity-60">
                  • {talent.stats.igEngagement?.toFixed(1)}%
                </span>
              </a>
            )}

            {talent.stats?.ttFollowers && (
              <a
                href={`https://tiktok.com/@${talent.tiktok?.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-[#F5EDE0] rounded-xl hover:bg-[#220101] hover:text-[#F5EDE0] transition-colors group"
              >
                <TikTokIcon className="w-4 h-4" />
                <span className="font-switzer text-sm">
                  {formatFollowers(talent.stats.ttFollowers)}
                </span>
                <span className="text-xs opacity-60">
                  • {talent.stats.ttEngagement?.toFixed(1)}%
                </span>
              </a>
            )}

            {talent.stats?.ytAbonnes && (
              <a
                href={`https://youtube.com/@${talent.youtube?.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-[#F5EDE0] rounded-xl hover:bg-[#220101] hover:text-[#F5EDE0] transition-colors group"
              >
                <YouTubeIcon className="w-4 h-4" />
                <span className="font-switzer text-sm">
                  {formatFollowers(talent.stats.ytAbonnes)}
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Page principale
export default function SelectionPage() {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [lang, setLang] = useState<Lang>("fr");
  const [translatedPresentations, setTranslatedPresentations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<string[]>([]);

  const t = translations[lang];

  // Fonction de traduction
  async function translatePresentation(talentId: string, text: string) {
    if (!text || translatedPresentations[talentId] || translatingIds.includes(talentId)) return;
    
    setTranslatingIds(prev => [...prev, talentId]);
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
      setTranslatingIds(prev => prev.filter(id => id !== talentId));
    }
  }

  // Traduire toutes les présentations quand on passe en anglais
  useEffect(() => {
    if (lang === "en") {
      const selectedTalents = talents.filter(t => favorites.includes(t.id));
      selectedTalents.forEach(talent => {
        if (talent.presentation && !translatedPresentations[talent.id]) {
          translatePresentation(talent.id, talent.presentation);
        }
      });
    }
  }, [lang, talents, favorites]);

  useEffect(() => {
    // Charger les favoris
    const savedFavorites = localStorage.getItem("talentbook-favorites");
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
    
    // Charger la langue sauvegardée
    const savedLang = localStorage.getItem("talentbook-lang") as Lang;
    if (savedLang && (savedLang === "fr" || savedLang === "en")) {
      setLang(savedLang);
    }

    // Charger les talents
    async function fetchTalents() {
      try {
        const res = await fetch("/api/public/talents");
        if (res.ok) {
          const data = await res.json();
          setTalents(data);
        }
      } catch (error) {
        console.error("Erreur chargement talents:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchTalents();
  }, []);

  // Sauvegarder les favoris
  useEffect(() => {
    localStorage.setItem("talentbook-favorites", JSON.stringify(favorites));
  }, [favorites]);

  // Sauvegarder la langue
  useEffect(() => {
    localStorage.setItem("talentbook-lang", lang);
  }, [lang]);

  function removeFavorite(talentId: string) {
    setFavorites(prev => prev.filter(id => id !== talentId));
  }

  function clearAll() {
    setFavorites([]);
  }

  // Générer et télécharger le PDF
  async function generatePDF() {
    if (favorites.length === 0) return;
    
    setGeneratingPdf(true);
    
    try {
      const res = await fetch("/api/selection/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentIds: favorites, lang }),
      });
      
      if (!res.ok) throw new Error("Erreur génération PDF");
      
      // Récupérer le PDF comme blob
      const blob = await res.blob();
      
      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GlowUp_Selection_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Nettoyer
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error("Erreur PDF:", error);
      alert("Erreur lors de la génération du PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  const selectedTalents = talents.filter(t => favorites.includes(t.id));

  return (
    <>
      {/* Custom Fonts */}
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
        
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>

      <div className="min-h-screen bg-[#F5EDE0]">
        {/* Header */}
        <header className="bg-[#220101] py-8 md:py-12 px-4 relative">
          {/* Toggle Langue */}
          <div className="absolute top-4 right-4 md:top-6 md:right-6">
            <div className="flex items-center bg-[#F5EDE0]/10 rounded-full p-1">
              <button
                onClick={() => setLang("fr")}
                className={`px-2 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-switzer transition-all ${
                  lang === "fr"
                    ? "bg-[#B06F70] text-white"
                    : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"
                }`}
              >
                FR
              </button>
              <button
                onClick={() => setLang("en")}
                className={`px-2 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-switzer transition-all ${
                  lang === "en"
                    ? "bg-[#B06F70] text-white"
                    : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"
                }`}
              >
                EN
              </button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Navigation */}
            <Link 
              href="/talentbook"
              className="inline-flex items-center gap-2 text-[#F5EDE0]/70 hover:text-[#F5EDE0] transition-colors mb-6 md:mb-8 font-switzer text-sm md:text-base"
            >
              <ArrowLeftIcon className="w-4 h-4 md:w-5 md:h-5" />
              {t.backToCatalog}
            </Link>

            <div className="text-center">
              <div className="flex justify-center mb-4 md:mb-6">
                <GlowUpLogo className="w-36 md:w-48 h-auto" color="#B06F70" />
              </div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl text-[#F5EDE0] mb-2">
                <span className="font-spectral-light-italic opacity-80">{t.mySelection}</span>{" "}
                <span className="font-spectral-light">{t.selection}</span>
              </h1>
              <p className="text-xs md:text-sm text-[#F5EDE0]/40 tracking-wide font-switzer">
                {selectedTalents.length} {selectedTalents.length > 1 ? t.talentsSelected : t.talentSelected}
              </p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#220101]" />
            </div>
          ) : selectedTalents.length === 0 ? (
            <div className="text-center py-12 md:py-20">
              <p className="text-5xl md:text-6xl mb-4 md:mb-6">💔</p>
              <h2 className="text-xl md:text-2xl text-[#220101] mb-2 font-spectral-light">
                {t.emptySelection}
              </h2>
              <p className="text-sm md:text-base text-[#220101]/50 mb-6 md:mb-8 font-switzer">
                {t.browseAndAdd}
              </p>
              <Link
                href="/talentbook"
                className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 bg-[#220101] text-[#F5EDE0] rounded-full font-switzer text-sm md:text-base hover:bg-[#220101]/90 transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4 md:w-5 md:h-5" />
                {t.discoverTalents}
              </Link>
            </div>
          ) : (
            <>
              {/* Actions */}
              <div className="flex justify-between items-center mb-8">
                <button
                  onClick={generatePDF}
                  disabled={generatingPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-[#220101] text-[#F5EDE0] rounded-full font-switzer text-sm hover:bg-[#220101]/80 transition-colors disabled:opacity-50"
                >
                  {generatingPdf ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#F5EDE0]/30 border-t-[#F5EDE0] rounded-full animate-spin" />
                      {t.generating}
                    </>
                  ) : (
                    <>
                      <DownloadIcon className="w-4 h-4" />
                      {t.downloadPdf}
                    </>
                  )}
                </button>
                <button
                  onClick={clearAll}
                  className="flex items-center gap-2 text-[#220101]/50 hover:text-red-500 transition-colors font-switzer text-sm"
                >
                  <TrashIcon className="w-4 h-4" />
                  {t.clearAll}
                </button>
              </div>

              {/* Liste des talents */}
              <div className="space-y-6 mb-12">
                {selectedTalents.map((talent) => (
                  <SelectionCard
                    key={talent.id}
                    talent={talent}
                    onRemove={() => removeFavorite(talent.id)}
                    lang={lang}
                    translatedPresentation={translatedPresentations[talent.id]}
                    isTranslating={translatingIds.includes(talent.id)}
                  />
                ))}
              </div>

              {/* CTA Contact */}
              <div className="bg-[#220101] rounded-3xl p-8 md:p-12 text-center">
                <h2 className="text-2xl md:text-3xl text-[#F5EDE0] mb-4">
                  <span className="font-spectral-light-italic opacity-80">{t.interestedBy}</span>{" "}
                  <span className="font-spectral-light">{t.thisSelection}</span>
                </h2>
                <p className="text-[#F5EDE0]/60 mb-8 font-switzer max-w-md mx-auto text-sm md:text-base">
                  {lang === "fr" ? "Téléchargez le PDF de votre sélection" : "Download your selection as PDF"}
                </p>
                <button
                  onClick={generatePDF}
                  disabled={generatingPdf}
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-[#B06F70] hover:bg-[#9d5f60] text-white rounded-full font-switzer font-medium transition-all hover:scale-105 text-lg disabled:opacity-50"
                >
                  {generatingPdf ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.generating}
                    </>
                  ) : (
                    <>
                      <DownloadIcon className="w-5 h-5" />
                      {t.downloadThePdf}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-[#220101] py-12 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <GlowUpLogo className="w-32 h-auto mx-auto mb-4" color="#B06F70" />
            <p className="text-[#F5EDE0]/30 text-xs tracking-wider font-switzer">
              ©2025 GLOWUP AGENCY
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}