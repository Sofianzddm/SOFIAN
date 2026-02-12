"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Types
type Lang = "fr" | "en";

// Traductions
const translations = {
  fr: {
    yourSelection: "Notre sélection pour",
    personalizedSelection: "Sélection personnalisée",
    creatorsSelected: "créateurs sélectionnés spécialement pour votre marque",
    discoverAllTalents: "Découvrir tous nos talents",
    exploreRoster: "Explorez l'ensemble de notre roster de créateurs de contenu",
    searchTalent: "Rechercher un talent...",
    all: "Tous",
    noTalents: "Aucun talent trouvé",
    resetFilters: "Réinitialiser les filtres",
    contentCreator: "Créateur de contenu",
    presentation: "PRÉSENTATION",
    community: "COMMUNAUTÉ",
    engagementRate: "TX D'ENGAGEMENT",
    talentsSelected: "talents sélectionnés",
    talentSelected: "talent sélectionné",
    clearAll: "Tout effacer",
    viewSelection: "Voir ma sélection",
    view: "Voir",
    readyLaunch: "Prêt à lancer votre campagne ?",
    planCall: "Planifions un appel pour discuter de votre projet",
    scheduleCall: "Planifier un appel",
    bookCreated: "Ce book a été créé spécialement pour",
  },
  en: {
    yourSelection: "Our selection for",
    personalizedSelection: "Personalized selection",
    creatorsSelected: "creators specially selected for your brand",
    discoverAllTalents: "Discover all our talents",
    exploreRoster: "Explore our entire roster of content creators",
    searchTalent: "Search for a talent...",
    all: "All",
    noTalents: "No talents found",
    resetFilters: "Reset filters",
    contentCreator: "Content Creator",
    presentation: "ABOUT",
    community: "COMMUNITY",
    engagementRate: "ENGAGEMENT RATE",
    talentsSelected: "talents selected",
    talentSelected: "talent selected",
    clearAll: "Clear all",
    viewSelection: "View selection",
    view: "View",
    readyLaunch: "Ready to launch your campaign?",
    planCall: "Let's schedule a call to discuss your project",
    scheduleCall: "Schedule a call",
    bookCreated: "This book was specially created for",
  },
};

// Traduction des niches
const nicheTranslations: Record<string, { fr: string; en: string }> = {
  "Beauty": { fr: "Beauty", en: "Beauty" },
  "Fashion": { fr: "Fashion", en: "Fashion" },
  "Lifestyle": { fr: "Lifestyle", en: "Lifestyle" },
  "Family": { fr: "Family", en: "Family" },
  "Sport": { fr: "Sport", en: "Sport" },
  "Voyage": { fr: "Voyage", en: "Travel" },
  "Travel": { fr: "Voyage", en: "Travel" },
  "Food": { fr: "Food", en: "Food" },
  "Creative": { fr: "Creative", en: "Creative" },
  "Animaux": { fr: "Animaux", en: "Pets" },
  "Pets": { fr: "Animaux", en: "Pets" },
};

// Fonction pour traduire une niche
function translateNiche(niche: string, lang: Lang): string {
  const translation = nicheTranslations[niche];
  if (translation) {
    return translation[lang];
  }
  return niche; // Si pas de traduction, retourner la niche telle quelle
}

interface TalentData {
  id: string;
  name: string;
  prenom: string;
  nom: string;
  handle: string;
  photo: string | null;
  presentation: string | null;
  presentationEn: string | null;
  niche: string[];
  ville: string | null;
  platforms: string[];
  followers: number;
  igFollowersEvol: number | null;
  ttFollowers: number;
  ttFollowersEvol: number | null;
  ttEngagement: number;
  ttEngagementEvol: number | null;
  engagementRate: number;
  igEngagementEvol: number | null;
  frAudience: number;
  ytAbonnes: number;
  ytAbonnesEvol: number | null;
  pitch: string;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
}

interface BrandData {
  name: string;
  niche: string;
  logo?: string | null;
  talents?: TalentData[];
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

// Logo Glow Up SVG
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

// Instagram Icon
function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

// TikTok Icon
function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  );
}

// YouTube Icon
function YouTubeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

// Heart Icon
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

// Format followers
function formatFollowers(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(".", ",") + "M";
  if (num >= 1000) {
    const k = num / 1000;
    if (k >= 100) return Math.round(k) + "K";
    return k.toFixed(1).replace(".", ",") + "K";
  }
  return num.toString();
}

// Get initials
function getInitials(name: string): string {
  const parts = name.split(' ');
  return parts.map(p => p.charAt(0)).join('').toUpperCase();
}

// Fonction pour garantir un bon contraste de couleur sur fond crème (#F5EBE0)
// Essaie primaryColor, puis secondaryColor si noir/blanc, puis fallback marron Glow Up
function adjustBrandColor(primaryColor: string | null, secondaryColor: string | null = null): string {
  const FALLBACK_COLOR = '#5C2A30'; // Marron Glow Up
  
  // Fonction pour vérifier et corriger une couleur
  function processColor(hex: string | null): string | null {
    if (!hex) return null;
    
    const cleanHex = hex.replace('#', '').trim();
    if (cleanHex.length !== 6) return null;
    
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    
    // Calculer la luminosité
    const luminosity = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Noir/blanc pur → ignorer cette couleur
    if (
      hex === '#000000' || hex === '#000' ||
      hex === '#ffffff' || hex === '#fff' ||
      hex === '#0f0f0f'
    ) {
      return null;
    }
    
    // Couleur trop sombre → ignorer
    if (luminosity < 30) {
      return null;
    }
    
    // Couleur trop claire → assombrir de 40%
    if (luminosity > 180) {
      const darken = (c: number) => Math.max(0, Math.round(c * 0.6));
      const darkR = darken(r).toString(16).padStart(2, '0');
      const darkG = darken(g).toString(16).padStart(2, '0');
      const darkB = darken(b).toString(16).padStart(2, '0');
      return `#${darkR}${darkG}${darkB}`;
    }
    
    // Couleur correcte
    return `#${cleanHex}`;
  }
  
  // Essayer primaryColor d'abord
  const correctedPrimary = processColor(primaryColor);
  if (correctedPrimary) return correctedPrimary;
  
  // Si primaryColor est noir/blanc, essayer secondaryColor
  const correctedSecondary = processColor(secondaryColor);
  if (correctedSecondary) return correctedSecondary;
  
  // Fallback final
  return FALLBACK_COLOR;
}

// Interface pour les talents du Talent Book complet
interface FullTalent {
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
  stats: {
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
  } | null;
}

export default function PressKitPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const [brandData, setBrandData] = useState<BrandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [brandColor, setBrandColor] = useState('#B06F70');
  const [logoError, setLogoError] = useState(false); // Gérer les erreurs de chargement du logo
  const [selectedTalent, setSelectedTalent] = useState<TalentData | null>(null);
  const [lang, setLang] = useState<Lang>("fr");
  
  // États pour le Talent Book complet
  const [allTalents, setAllTalents] = useState<FullTalent[]>([]);
  const [loadingAllTalents, setLoadingAllTalents] = useState(false);
  const [selectedNiche, setSelectedNiche] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedFullTalent, setSelectedFullTalent] = useState<FullTalent | null>(null);

  const t = translations[lang];

  // Ajouter meta robots noindex nofollow
  useEffect(() => {
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'noindex, nofollow';
    document.head.appendChild(metaRobots);

    return () => {
      // Nettoyer au démontage
      if (metaRobots.parentNode) {
        metaRobots.parentNode.removeChild(metaRobots);
      }
    };
  }, []);

  useEffect(() => {
    // Fetch brand data
    fetch(`/api/presskit/${slug}`)
      .then(res => res.json())
      .then(data => {
        console.log('\n🎨 Press Kit Frontend - Données reçues:');
        console.log('   Brand:', data.name);
        console.log('   Primary Color:', data.primaryColor);
        console.log('   Talents:', data.talents?.length || 0);
        
        setBrandData(data);
        // Ajuster la couleur avec essai sur primaryColor puis secondaryColor
        const adjustedColor = adjustBrandColor(data.primaryColor, data.secondaryColor);
        setBrandColor(adjustedColor);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading press kit:', err);
        setLoading(false);
      });
  }, [slug]);

  // Charger tous les talents pour le Talent Book complet
  useEffect(() => {
    async function fetchAllTalents() {
      setLoadingAllTalents(true);
      try {
        const res = await fetch("/api/public/talents");
        if (res.ok) {
          const data = await res.json();
          setAllTalents(data);
        }
      } catch (error) {
        console.error("Erreur chargement talents:", error);
      } finally {
        setLoadingAllTalents(false);
      }
    }
    fetchAllTalents();

    // Charger les favoris depuis localStorage (même clé que /talentbook)
    const savedFavorites = localStorage.getItem("talentbook-favorites");
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  // Sauvegarder les favoris dans localStorage (même clé que /talentbook)
  useEffect(() => {
    localStorage.setItem("talentbook-favorites", JSON.stringify(favorites));
  }, [favorites]);

  // Fonction pour toggle favoris
  function toggleFavorite(talentId: string) {
    setFavorites(prev => 
      prev.includes(talentId) 
        ? prev.filter(id => id !== talentId)
        : [...prev, talentId]
    );
  }

  // Filtrer les talents selon niche et recherche
  const filteredAllTalents = allTalents.filter((talent) => {
    // Exclure les talents déjà dans la sélection personnalisée
    const isInSelection = brandData?.talents?.some(t => t.id === talent.id);
    
    const nicheMatch =
      selectedNiche === "all" ||
      talent.niches.some((n) => n.toLowerCase().includes(selectedNiche.toLowerCase()));

    const searchMatch =
      searchQuery === "" ||
      `${talent.prenom} ${talent.nom}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      talent.niches.some(n => n.toLowerCase().includes(searchQuery.toLowerCase()));

    return !isInSelection && nicheMatch && searchMatch;
  });

  // Obtenir toutes les niches uniques
  const allNiches = Array.from(
    new Set(allTalents.flatMap(t => t.niches))
  ).sort();

  // Tracking
  useEffect(() => {
    if (!brandData) return;

    // Générer un ID de session unique et le stocker
    const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('presskit-session-id', sessionId);
    
    // Récupérer le hubspotContactId depuis l'URL (?cid=...)
    const urlParams = new URLSearchParams(window.location.search);
    const hubspotContactId = urlParams.get('cid');

    // Temps de début
    const startTime = Date.now();
    let maxScrollDepth = 0;
    const talentsViewed = new Set<string>();

    // Event "view" au chargement
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'view',
        slug,
        sessionId,
        hubspotContactId,
      }),
    });

    // Tracker le scroll depth
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);
      maxScrollDepth = Math.max(maxScrollDepth, scrollPercent);
    };

    window.addEventListener('scroll', handleScroll);

    // Intersection Observer pour tracker les talents vus
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          if (entry.isIntersecting && target.dataset.talentId) {
            talentsViewed.add(target.dataset.talentId);
          }
        });
      },
      { threshold: 0.5 }
    );

    // Observer toutes les cards talents
    setTimeout(() => {
      document.querySelectorAll('[data-talent-id]').forEach((el) => {
        observer.observe(el);
      });
    }, 500);

    // Event "session_end" au beforeunload
    const handleBeforeUnload = () => {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      
      // sendBeacon pour garantir l'envoi même si la page se ferme
      const data = JSON.stringify({
        event: 'session_end',
        slug,
        sessionId,
        hubspotContactId,
        data: {
          durationSeconds,
          scrollDepthPercent: maxScrollDepth,
          talentsViewed: Array.from(talentsViewed),
        },
      });

      navigator.sendBeacon('/api/track', new Blob([data], { type: 'application/json' }));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      observer.disconnect();
    };
  }, [brandData, slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5EDE0] flex items-center justify-center">
        <div className="text-[#220101] text-xl">Chargement...</div>
      </div>
    );
  }

  if (!brandData) {
    return (
      <div className="min-h-screen bg-[#F5EDE0] flex items-center justify-center">
        <div className="text-[#220101] text-xl">Press kit introuvable</div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        /* Fonts personnalisées désactivées temporairement - fichiers manquants */
        .font-spectral-medium-italic {
          font-family: Georgia, serif;
          font-style: italic;
        }
        
        .font-spectral-light {
          font-family: Georgia, serif;
          font-weight: 300;
        }
        
        .font-spectral-light-italic {
          font-family: Georgia, serif;
          font-weight: 300;
          font-style: italic;
        }
        
        .font-switzer {
          font-family: system-ui, sans-serif;
        }
      `}</style>

      <div className="min-h-screen bg-[#F5EDE0]">
        {/* Header */}
      <header className="border-b border-[#220101]/10 relative">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col items-center justify-center text-center">
            <GlowUpLogo className="h-10 md:h-12 mb-2" color="#220101" />
            <p className="text-[#220101]/60 text-xs md:text-sm tracking-[0.2em] uppercase">
              THE RISE of IDEAS
            </p>
          </div>

          {/* Toggle Langue */}
          <div className="absolute top-4 right-4 md:top-6 md:right-6">
            <div className="flex items-center bg-[#220101]/5 rounded-full p-1">
              <button
                onClick={() => setLang("fr")}
                className={`px-3 py-1.5 rounded-full text-sm font-switzer transition-all ${
                  lang === "fr"
                    ? "bg-[#220101] text-[#F5EDE0]"
                    : "text-[#220101]/60 hover:text-[#220101]"
                }`}
              >
                FR
              </button>
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1.5 rounded-full text-sm font-switzer transition-all ${
                  lang === "en"
                    ? "bg-[#220101] text-[#F5EDE0]"
                    : "text-[#220101]/60 hover:text-[#220101]"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-[#220101]/10 py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[#220101]/50 text-sm md:text-base uppercase tracking-[0.15em] mb-4">
            {t.personalizedSelection}
          </p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl mb-6">
            <span className="font-spectral-light text-[#220101]">{t.yourSelection} </span>
            <span className="font-spectral-medium-italic" style={{ color: brandColor }}>
              {brandData.name}
            </span>
          </h1>
          
          {/* Ligne décorative avec couleur marque */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="h-[1px] w-24 bg-[#220101]/20"></div>
            <div className="h-[2px] w-16" style={{ backgroundColor: brandColor }}></div>
            <div className="h-[1px] w-24 bg-[#220101]/20"></div>
          </div>

          <p className="text-[#220101]/70 text-lg md:text-xl max-w-3xl mx-auto leading-relaxed">
            {brandData.talents?.length || 0} {t.creatorsSelected}
          </p>
        </div>
      </section>

      {/* Talents Grid */}
      <section className="py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {(brandData.talents || []).map((talent) => {
              const hasPhoto = talent.photo && talent.photo.trim() !== "";
              
              return (
                <article
                  key={talent.id}
                  data-talent-id={talent.id}
                  className="group bg-white rounded-3xl overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(34,1,1,0.15)] cursor-pointer"
                  style={{ boxShadow: "0 4px 24px rgba(34, 1, 1, 0.06)" }}
                  onClick={() => setSelectedTalent(talent)}
                >
                  {/* Photo */}
                  <div className="relative h-[340px] overflow-hidden bg-[#F5EDE0]">
                    {hasPhoto ? (
                      <img
                        src={talent.photo!}
                        alt={talent.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
                        <span className="text-8xl text-[#F5EDE0]/60 tracking-widest font-spectral-light">
                          {getInitials(talent.name)}
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
                      {talent.handle && (
                        <p className="text-[#F5EDE0]/50 text-sm font-switzer mt-1">
                          @{talent.handle}
                        </p>
                      )}
                    </div>

                    {/* Social Icons */}
                    <div className="absolute top-4 right-4 flex gap-2">
                      {talent.instagram && talent.followers > 0 && (
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
                      {talent.tiktok && talent.ttFollowers > 0 && (
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
                      {talent.youtube && talent.ytAbonnes > 0 && (
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

                  {/* Content */}
                  <div className="p-5">
                    {/* Niches */}
                    <p className="text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-spectral-light">
                      {talent.niche.length > 0 ? talent.niche.slice(0, 3).map(n => translateNiche(n, lang)).join(" · ") : t.contentCreator}
                    </p>

                    {/* Stats */}
                    <div className="space-y-2">
                      {talent.followers > 0 && (
                        <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
                          <div className="flex items-center gap-2.5">
                            <InstagramIcon className="w-4 h-4 text-[#220101]/60" />
                            <span className="font-switzer text-[#220101]">
                              {formatFollowers(talent.followers)}
                            </span>
                            {talent.igFollowersEvol !== null && talent.igFollowersEvol > 0 && (
                              <span className="text-[11px] font-switzer text-[#4a5d23] bg-[#E5F2B5] px-2 py-0.5 rounded">
                                ▲ {talent.igFollowersEvol.toFixed(2).replace(".", ",")}%
                              </span>
                            )}
                          </div>
                          <span className="font-switzer text-[#220101]">
                            {typeof talent.engagementRate === 'number' && talent.engagementRate > 0
                              ? talent.engagementRate.toFixed(2).replace(".", ",") + "%"
                              : ""}
                          </span>
                        </div>
                      )}

                      {talent.ttFollowers && talent.ttFollowers > 0 && (
                        <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
                          <div className="flex items-center gap-2.5">
                            <TikTokIcon className="w-4 h-4 text-[#220101]/60" />
                            <span className="font-switzer text-[#220101]">
                              {formatFollowers(talent.ttFollowers)}
                            </span>
                            {talent.ttFollowersEvol !== null && talent.ttFollowersEvol > 0 && (
                              <span className="text-[11px] font-switzer text-[#4a5d23] bg-[#E5F2B5] px-2 py-0.5 rounded">
                                ▲ {talent.ttFollowersEvol.toFixed(2).replace(".", ",")}%
                              </span>
                            )}
                          </div>
                          <span className="font-switzer text-[#220101]">
                            {typeof talent.ttEngagement === 'number' && talent.ttEngagement > 0
                              ? talent.ttEngagement.toFixed(2).replace(".", ",") + "%"
                              : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section Découvrir tous nos talents - HEADER */}
      <section className="mt-16 py-12 border-t border-[#220101]/10 text-center bg-[#F5EDE0]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-spectral-light text-[#220101] mb-4">
            {t.discoverAllTalents}
          </h2>
          <p className="text-[#220101]/60 text-base md:text-lg font-spectral-light">
            {t.exploreRoster}
          </p>
        </div>
      </section>

      {/* Talent Book complet */}
      <section className="bg-[#F5EDE0] py-8 md:py-12">
        <div className="max-w-6xl mx-auto px-4">
          {/* Filtres et recherche */}
          <div className="mb-8 space-y-4">
            {/* Barre de recherche */}
            <div className="max-w-md mx-auto">
              <input
                type="text"
                placeholder={t.searchTalent}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 border border-[#220101]/20 rounded-full text-sm font-switzer focus:outline-none focus:border-[#220101]/40 bg-white"
              />
            </div>

            {/* Filtres par niche */}
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => setSelectedNiche("all")}
                className={`px-4 py-2 rounded-full text-sm font-switzer transition-all ${
                  selectedNiche === "all"
                    ? "bg-[#220101] text-[#F5EDE0]"
                    : "bg-white text-[#220101]/70 hover:bg-[#220101]/5"
                }`}
              >
                {t.all} ({allTalents.length - (brandData?.talents?.length || 0)})
              </button>
              {allNiches.slice(0, 8).map((niche) => (
                <button
                  key={niche}
                  onClick={() => setSelectedNiche(niche)}
                  className={`px-4 py-2 rounded-full text-sm font-switzer transition-all ${
                    selectedNiche === niche
                      ? "bg-[#220101] text-[#F5EDE0]"
                      : "bg-white text-[#220101]/70 hover:bg-[#220101]/5"
                  }`}
                >
                  {translateNiche(niche, lang)}
                </button>
              ))}
            </div>
          </div>

          {/* Grille de talents */}
          {loadingAllTalents ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#220101]" />
            </div>
          ) : filteredAllTalents.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-lg text-[#220101]/50 font-switzer">
                {t.noTalents}
              </p>
              <button
                onClick={() => {
                  setSelectedNiche("all");
                  setSearchQuery("");
                }}
                className="mt-4 px-6 py-2 bg-[#220101] text-[#F5EDE0] rounded-full text-sm font-switzer"
              >
                {t.resetFilters}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredAllTalents.map((talent) => {
                const hasPhoto = talent.photo && talent.photo.trim() !== "";
                const isFavorite = favorites.includes(talent.id);
                
                return (
                  <article
                    key={talent.id}
                    onClick={() => setSelectedFullTalent(talent)}
                    className="group bg-white rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(34,1,1,0.15)]"
                    style={{ boxShadow: "0 4px 24px rgba(34, 1, 1, 0.06)" }}
                  >
                    {/* Photo */}
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
                            {talent.prenom.charAt(0)}{talent.nom.charAt(0)}
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

                      {/* Bouton favori */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(talent.id);
                        }}
                        className={`absolute top-4 left-4 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${
                          isFavorite 
                            ? "bg-[#B06F70] text-white scale-110" 
                            : "bg-white/90 text-[#220101]/40 hover:text-[#B06F70] hover:scale-110"
                        }`}
                      >
                        <HeartIcon filled={isFavorite} className="w-5 h-5" />
                      </button>

                      {/* Icônes plateformes */}
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

                    {/* Content */}
                    <div className="p-5">
                      <p className="text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-spectral-light">
                        {talent.niches.length > 0 ? talent.niches.slice(0, 3).map(n => translateNiche(n, lang)).join(" · ") : t.contentCreator}
                      </p>

                      <div className="space-y-2">
                        {talent.stats?.igFollowers && (
                          <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
                            <div className="flex items-center gap-2.5">
                              <InstagramIcon className="w-4 h-4 text-[#220101]/60" />
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
                              {talent.stats.igEngagement ? talent.stats.igEngagement.toFixed(2).replace(".", ",") + "%" : ""}
                            </span>
                          </div>
                        )}

                        {talent.stats?.ttFollowers && talent.stats.ttFollowers > 0 && (
                          <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
                            <div className="flex items-center gap-2.5">
                              <TikTokIcon className="w-4 h-4 text-[#220101]/60" />
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
                              {talent.stats.ttEngagement ? talent.stats.ttEngagement.toFixed(2).replace(".", ",") + "%" : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Barre de favoris flottante */}
          {favorites.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#220101] shadow-[0_-4px_30px_rgba(34,1,1,0.3)]">
              <div className="max-w-6xl mx-auto px-3 md:px-4 py-3 md:py-4">
                <div className="flex items-center justify-between gap-2 md:gap-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="text-[#F5EDE0]">
                      <p className="font-switzer text-xs md:text-sm">
                        <span className="font-bold">{favorites.length}</span>{" "}
                        {favorites.length > 1 ? t.talentsSelected : t.talentSelected}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <button
                      onClick={() => setFavorites([])}
                      className="px-3 py-2 text-[#F5EDE0]/60 hover:text-[#F5EDE0] transition-colors font-switzer text-xs md:text-sm"
                    >
                      {t.clearAll}
                    </button>
                    <a
                      href="/talentbook/selection"
                      className="px-4 md:px-6 py-2.5 md:py-3 bg-[#B06F70] hover:bg-[#9d5f60] text-white rounded-full font-switzer font-medium transition-all hover:scale-105 flex items-center gap-2 text-sm"
                    >
                      <HeartIcon filled className="w-4 h-4 md:w-5 md:h-5" />
                      <span className="hidden sm:inline">{t.viewSelection}</span>
                      <span className="sm:hidden">{t.view}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#220101]/10 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-[#220101]/50 text-sm">
          {t.bookCreated}{" "}
          <span style={{ color: brandColor, fontWeight: 600 }}>{brandData.name}</span>
          <br />
          © 2026 Glow Up Agence — THE RISE of IDEAS
        </div>
      </footer>

      {/* Modale Talent */}
      {selectedTalent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-[#220101]/90 backdrop-blur-md"
          onClick={() => setSelectedTalent(null)}
        >
          <div
            className="bg-[#F5EDE0] w-full max-w-5xl max-h-[95vh] rounded-2xl md:rounded-[2rem] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-h-[95vh] overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[1.2fr_1fr]">
              {/* Photo */}
              <div className="relative h-[300px] md:h-auto md:min-h-[700px] bg-[#220101]">
                {selectedTalent.photo ? (
                  <>
                    <img
                      src={selectedTalent.photo}
                      alt={selectedTalent.name}
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#220101]/40 to-transparent" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
                    <span className="text-[80px] md:text-[140px] text-[#F5EDE0]/50 tracking-widest font-spectral-light">
                      {getInitials(selectedTalent.name)}
                    </span>
                  </div>
                )}
                
                {/* Bouton fermer */}
                <button
                  onClick={() => setSelectedTalent(null)}
                  className="absolute top-4 right-4 md:top-5 md:right-5 w-10 h-10 md:w-11 md:h-11 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center text-[#220101] transition-all hover:scale-110 shadow-xl font-switzer text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="p-5 md:p-8 lg:p-10 md:overflow-y-auto md:max-h-[92vh] bg-[#F5EDE0] flex flex-col">
                {/* Nom */}
                <h2 className="text-2xl md:text-3xl lg:text-[2.5rem] mb-1 md:mb-2 text-[#220101] leading-tight">
                  <span className="font-spectral-medium-italic">{selectedTalent.prenom}</span>{" "}
                  <span className="font-spectral-light">{selectedTalent.nom.toUpperCase()}</span>
                </h2>

                {/* @ Handle */}
                {selectedTalent.handle && (
                  <p className="text-[#B06F70] text-sm md:text-base font-switzer mb-2">
                    @{selectedTalent.handle}
                  </p>
                )}

                {/* Niches */}
                <p className="text-xs md:text-sm text-[#220101] uppercase tracking-[0.15em] mb-2 font-spectral-light font-bold">
                  {selectedTalent.niche.length > 0 ? selectedTalent.niche.map(n => translateNiche(n, lang)).join(" / ") : t.contentCreator.toUpperCase()}
                </p>

                {/* Rôle */}
                <p className="text-[#220101]/70 text-sm md:text-lg mb-4 md:mb-6 font-spectral-light-italic">
                  {t.contentCreator}
                </p>

                {/* Présentation */}
                {(selectedTalent.presentation || selectedTalent.presentationEn) && (
                  <div className="mb-5 md:mb-8 pb-4 md:pb-6 border-b border-[#220101]/15">
                    <p className="text-[10px] md:text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-2 md:mb-4 font-switzer">
                      {t.presentation}
                    </p>
                    <p className="text-[#220101] leading-relaxed text-sm md:text-base font-spectral-light">
                      {lang === "en" 
                        ? (selectedTalent.presentationEn || selectedTalent.presentation) 
                        : selectedTalent.presentation}
                    </p>
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
                    {selectedTalent.followers > 0 && (
                      <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://instagram.com/${selectedTalent.instagram?.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:scale-110 transition-transform"
                          >
                            <InstagramIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-[#E1306C]" />
                          </a>
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {formatFollowers(selectedTalent.followers)}
                          </span>
                          {selectedTalent.igFollowersEvol !== null && selectedTalent.igFollowersEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedTalent.igFollowersEvol.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {typeof selectedTalent.engagementRate === 'number' && selectedTalent.engagementRate > 0
                              ? selectedTalent.engagementRate.toFixed(2).replace(".", ",") + "%"
                              : "—"}
                          </span>
                          {selectedTalent.igEngagementEvol !== null && selectedTalent.igEngagementEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedTalent.igEngagementEvol.toFixed(1)}PT
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TikTok */}
                    {selectedTalent.ttFollowers && selectedTalent.ttFollowers > 0 && (
                      <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://tiktok.com/@${selectedTalent.tiktok?.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:scale-110 transition-transform"
                          >
                            <TikTokIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-black" />
                          </a>
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {formatFollowers(selectedTalent.ttFollowers)}
                          </span>
                          {selectedTalent.ttFollowersEvol !== null && selectedTalent.ttFollowersEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedTalent.ttFollowersEvol.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {typeof selectedTalent.ttEngagement === 'number' && selectedTalent.ttEngagement > 0
                              ? selectedTalent.ttEngagement.toFixed(2).replace(".", ",") + "%"
                              : "—"}
                          </span>
                          {selectedTalent.ttEngagementEvol !== null && selectedTalent.ttEngagementEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedTalent.ttEngagementEvol.toFixed(1)}PT
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* YouTube */}
                    {selectedTalent.ytAbonnes && selectedTalent.ytAbonnes > 0 && (
                      <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://youtube.com/@${selectedTalent.youtube?.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:scale-110 transition-transform"
                          >
                            <YouTubeIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-[#FF0000]" />
                          </a>
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {formatFollowers(selectedTalent.ytAbonnes)}
                          </span>
                          {selectedTalent.ytAbonnesEvol !== null && selectedTalent.ytAbonnesEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedTalent.ytAbonnesEvol.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Logo Glow Up */}
                <div className="pt-4 md:pt-6 border-t border-[#220101]/10 flex justify-center">
                  <GlowUpLogo className="w-24 md:w-32 h-auto opacity-60" color="#220101" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale Talent du Talent Book complet */}
      {selectedFullTalent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-[#220101]/90 backdrop-blur-md"
          onClick={() => setSelectedFullTalent(null)}
        >
          <div
            className="bg-[#F5EDE0] w-full max-w-5xl max-h-[95vh] rounded-2xl md:rounded-[2rem] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-h-[95vh] overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[1.2fr_1fr]">
              {/* Photo */}
              <div className="relative h-[300px] md:h-auto md:min-h-[700px] bg-[#220101]">
                {selectedFullTalent.photo ? (
                  <>
                    <img
                      src={selectedFullTalent.photo}
                      alt={`${selectedFullTalent.prenom} ${selectedFullTalent.nom}`}
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#220101]/40 to-transparent" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
                    <span className="text-[80px] md:text-[140px] text-[#F5EDE0]/50 tracking-widest font-spectral-light">
                      {selectedFullTalent.prenom.charAt(0)}{selectedFullTalent.nom.charAt(0)}
                    </span>
                  </div>
                )}
                
                {/* Bouton fermer */}
                <button
                  onClick={() => setSelectedFullTalent(null)}
                  className="absolute top-4 right-4 md:top-5 md:right-5 w-10 h-10 md:w-11 md:h-11 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center text-[#220101] transition-all hover:scale-110 shadow-xl font-switzer text-lg"
                >
                  ✕
                </button>

                {/* Bouton Favori */}
                <button
                  onClick={() => toggleFavorite(selectedFullTalent.id)}
                  className={`absolute top-4 left-4 md:top-5 md:left-5 w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all shadow-xl ${
                    favorites.includes(selectedFullTalent.id)
                      ? "bg-[#B06F70] text-white" 
                      : "bg-white/95 backdrop-blur-sm text-[#220101]/40 hover:text-[#B06F70]"
                  }`}
                >
                  <HeartIcon filled={favorites.includes(selectedFullTalent.id)} className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 md:p-8 lg:p-10 md:overflow-y-auto md:max-h-[92vh] bg-[#F5EDE0] flex flex-col">
                {/* Nom */}
                <h2 className="text-2xl md:text-3xl lg:text-[2.5rem] mb-1 md:mb-2 text-[#220101] leading-tight">
                  <span className="font-spectral-medium-italic">{selectedFullTalent.prenom}</span>{" "}
                  <span className="font-spectral-light">{selectedFullTalent.nom.toUpperCase()}</span>
                </h2>

                {/* @ Handle */}
                {(selectedFullTalent.instagram || selectedFullTalent.tiktok) && (
                  <p className="text-[#B06F70] text-sm md:text-base font-switzer mb-2">
                    @{selectedFullTalent.instagram?.replace('@', '') || selectedFullTalent.tiktok?.replace('@', '')}
                  </p>
                )}

                {/* Niches */}
                <p className="text-xs md:text-sm text-[#220101] uppercase tracking-[0.15em] mb-2 font-spectral-light font-bold">
                  {selectedFullTalent.niches.length > 0 ? selectedFullTalent.niches.map(n => translateNiche(n, lang)).join(" / ") : t.contentCreator.toUpperCase()}
                </p>

                {/* Rôle */}
                <p className="text-[#220101]/70 text-sm md:text-lg mb-4 md:mb-6 font-spectral-light-italic">
                  {t.contentCreator}
                </p>

                {/* Présentation */}
                {(selectedFullTalent.presentation || selectedFullTalent.presentationEn) && (
                  <div className="mb-5 md:mb-8 pb-4 md:pb-6 border-b border-[#220101]/15">
                    <p className="text-[10px] md:text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-2 md:mb-4 font-switzer">
                      {t.presentation}
                    </p>
                    <p className="text-[#220101] leading-relaxed text-sm md:text-base font-spectral-light">
                      {lang === "en" 
                        ? (selectedFullTalent.presentationEn || selectedFullTalent.presentation) 
                        : selectedFullTalent.presentation}
                    </p>
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
                    {selectedFullTalent.stats?.igFollowers && (
                      <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://instagram.com/${selectedFullTalent.instagram?.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:scale-110 transition-transform"
                          >
                            <InstagramIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-[#E1306C]" />
                          </a>
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {formatFollowers(selectedFullTalent.stats.igFollowers)}
                          </span>
                          {selectedFullTalent.stats.igFollowersEvol !== null && selectedFullTalent.stats.igFollowersEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedFullTalent.stats.igFollowersEvol.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {selectedFullTalent.stats.igEngagement?.toFixed(2).replace(".", ",") || "—"}%
                          </span>
                          {selectedFullTalent.stats.igEngagementEvol !== null && selectedFullTalent.stats.igEngagementEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedFullTalent.stats.igEngagementEvol.toFixed(1)}PT
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TikTok */}
                    {selectedFullTalent.stats?.ttFollowers && selectedFullTalent.stats.ttFollowers > 0 && (
                      <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://tiktok.com/@${selectedFullTalent.tiktok?.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:scale-110 transition-transform"
                          >
                            <TikTokIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-black" />
                          </a>
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {formatFollowers(selectedFullTalent.stats.ttFollowers)}
                          </span>
                          {selectedFullTalent.stats.ttFollowersEvol !== null && selectedFullTalent.stats.ttFollowersEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedFullTalent.stats.ttFollowersEvol.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {selectedFullTalent.stats.ttEngagement?.toFixed(2).replace(".", ",") || "—"}%
                          </span>
                          {selectedFullTalent.stats.ttEngagementEvol !== null && selectedFullTalent.stats.ttEngagementEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedFullTalent.stats.ttEngagementEvol.toFixed(1)}PT
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* YouTube */}
                    {selectedFullTalent.stats?.ytAbonnes && selectedFullTalent.stats.ytAbonnes > 0 && (
                      <div className="grid grid-cols-2 gap-2 md:gap-4 py-3 md:py-4 border-t border-[#220101]/15">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`https://youtube.com/@${selectedFullTalent.youtube?.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:scale-110 transition-transform"
                          >
                            <YouTubeIcon className="w-4 h-4 md:w-5 md:h-5 text-[#220101] hover:text-[#FF0000]" />
                          </a>
                          <span className="text-sm md:text-xl text-[#220101] font-switzer">
                            {formatFollowers(selectedFullTalent.stats.ytAbonnes)}
                          </span>
                          {selectedFullTalent.stats.ytAbonnesEvol !== null && selectedFullTalent.stats.ytAbonnesEvol > 0 && (
                            <span className="text-[10px] md:text-xs text-[#4a5d23] bg-[#E5F2B5] px-1.5 py-0.5 rounded font-switzer">
                              ▲ {selectedFullTalent.stats.ytAbonnesEvol.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Logo Glow Up */}
                <div className="pt-4 md:pt-6 border-t border-[#220101]/10 flex justify-center">
                  <GlowUpLogo className="w-24 md:w-32 h-auto opacity-60" color="#220101" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
