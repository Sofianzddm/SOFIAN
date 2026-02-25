"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatPercent } from "@/lib/format";

// Types
interface TalentStats {
  igFollowers: number | null;
  igEngagement: number | null;
  ttFollowers: number | null;
  ttEngagement: number | null;
  ytAbonnes: number | null;
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

interface Partner {
  id: string;
  name: string;
  slug: string;
}

const translations = {
  fr: {
    mySelection: "Ma",
    selection: "sélection",
    talentSelected: "talent sélectionné",
    talentsSelected: "talents sélectionnés",
    backToCatalog: "Retour au catalogue",
    emptySelection: "Votre sélection est vide",
    browseAndAdd: "Parcourez le catalogue et ajoutez vos talents favoris",
    discoverTalents: "Découvrir les talents",
    clearAll: "Tout effacer",
    downloadPdf: "Télécharger en PDF",
    generating: "Génération...",
    interestedBy: "Intéressé par",
    thisSelection: "cette sélection ?",
    downloadThePdf: "Télécharger le PDF",
    sendByEmail: "Envoyer par mail",
  },
  en: {
    mySelection: "My",
    selection: "selection",
    talentSelected: "talent selected",
    talentsSelected: "talents selected",
    backToCatalog: "Back to catalog",
    emptySelection: "Your selection is empty",
    browseAndAdd: "Browse the catalog and add your favorite talents",
    discoverTalents: "Discover talents",
    clearAll: "Clear all",
    downloadPdf: "Download PDF",
    generating: "Generating...",
    interestedBy: "Interested in",
    thisSelection: "this selection?",
    downloadThePdf: "Download PDF",
    sendByEmail: "Send by email",
  },
};

type Lang = "fr" | "en";

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

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
    </svg>
  );
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function SelectionCard({
  talent,
  onRemove,
  lang,
}: {
  talent: Talent;
  onRemove: () => void;
  lang: Lang;
}) {
  const hasPhoto = talent.photo && talent.photo.trim() !== "";
  const displayPresentation = talent.presentation;

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-[#220101]/10">
      <div className="grid md:grid-cols-[1fr_1.5fr]">
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
          <button
            onClick={onRemove}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 hover:bg-red-500 hover:text-white rounded-full flex items-center justify-center transition-all shadow-lg group"
          >
            <TrashIcon className="w-5 h-5 text-[#220101] group-hover:text-white" />
          </button>
        </div>
        <div className="p-6 md:p-8 flex flex-col justify-between">
          <div>
            <h3 className="text-2xl md:text-3xl mb-2 text-[#220101] font-spectral-light">
              <span className="font-medium italic">{talent.prenom}</span>{" "}
              <span className="uppercase">{talent.nom}</span>
            </h3>
            <p className="text-xs text-[#220101] uppercase tracking-[0.15em] mb-4 font-switzer font-bold">
              {talent.niches?.length > 0 ? talent.niches.join(" / ") : "CRÉATEUR DE CONTENU"}
            </p>
            {displayPresentation && (
              <p className="text-[#220101]/70 text-sm leading-relaxed font-spectral-light line-clamp-3">
                {displayPresentation}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {talent.stats?.igFollowers != null && (
              <span className="flex items-center gap-2 px-4 py-2 bg-[#F5EDE0] rounded-xl font-switzer text-sm text-[#220101]">
                IG {formatFollowers(talent.stats.igFollowers)}
                {talent.stats.igEngagement != null &&
                  ` • ${formatPercent(talent.stats.igEngagement, 1)}%`}
              </span>
            )}
            {talent.stats?.ttFollowers != null && (
              <span className="flex items-center gap-2 px-4 py-2 bg-[#F5EDE0] rounded-xl font-switzer text-sm text-[#220101]">
                TT {formatFollowers(talent.stats.ttFollowers)}
                {talent.stats.ttEngagement != null &&
                  ` • ${formatPercent(talent.stats.ttEngagement, 1)}%`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PartnerSelectionPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug as string;

  const [partner, setPartner] = useState<Partner | null>(null);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [lang, setLang] = useState<Lang>("fr");
  const [notFound, setNotFound] = useState(false);

  const t = translations[lang];

  useEffect(() => {
    const saved = localStorage.getItem(`partner-${slug}-favorites`);
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (_) {}
    }
    const savedLang = localStorage.getItem(`partner-${slug}-lang`) as Lang;
    if (savedLang === "fr" || savedLang === "en") setLang(savedLang);

    async function fetchData() {
      if (!slug) return;
      try {
        const res = await fetch(`/api/partners/${slug}/public`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setPartner(data.partner);
          setTalents(data.talents || []);
        }
      } catch (e) {
        console.error(e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  useEffect(() => {
    if (slug) localStorage.setItem(`partner-${slug}-favorites`, JSON.stringify(favorites));
  }, [favorites, slug]);

  useEffect(() => {
    if (slug) localStorage.setItem(`partner-${slug}-lang`, lang);
  }, [lang, slug]);

  const selectedTalents = talents.filter((t) => favorites.includes(t.id));

  function removeFavorite(id: string) {
    setFavorites((prev) => prev.filter((x) => x !== id));
  }

  function clearAll() {
    setFavorites([]);
  }

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
      pdf.save(`GlowUp_Selection_${partner?.name?.replace(/[^a-z0-9]/gi, "_") || "partenaire"}_${new Date().toISOString().split("T")[0]}.pdf`);
      document.body.removeChild(container);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la génération du PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  const contactEmail = "Leyna@glowupagence.fr";
  const partnerName = partner?.name || "Glow Up";
  const subject = `${lang === "fr" ? "Ma sélection de talents" : "My talent selection"} - ${partnerName}`;
  const bodyLines = [
    lang === "fr" ? "Salut Leyna," : "Hi Leyna,",
    "",
    lang === "fr"
      ? `Voici ma sélection de talents depuis le catalogue ${partnerName} :`
      : `Here is my talent selection from the ${partnerName} catalogue:`,
    "",
    ...selectedTalents.map((t) => {
      const handles = [t.instagram, t.tiktok].filter(Boolean).map((h) => (h || "").replace(/^@/, ""));
      const handleStr = handles.length ? ` (${handles.map((h) => `@${h}`).join(" / ")})` : "";
      return `• ${t.prenom} ${t.nom}${handleStr}`;
    }),
    "",
    lang === "fr" ? "Lien vers le catalogue :" : "Link to the catalogue:",
    typeof window !== "undefined" ? `${window.location.origin}/partners/${slug}` : "",
  ];
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;

  if (notFound || !slug) {
    return (
      <div className="min-h-screen bg-[#F5EDE0] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-[#220101] font-switzer mb-4">Catalogue introuvable</p>
          <Link href="/" className="text-[#B06F70] font-switzer underline">Retour à l&apos;accueil</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5EDE0]">
      <header className="bg-[#220101] py-8 md:py-12 px-4 relative">
        <div className="absolute top-4 right-4 md:top-6 md:right-6">
          <div className="flex items-center bg-[#F5EDE0]/10 rounded-full p-1">
            <button
              onClick={() => setLang("fr")}
              className={`px-2 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-switzer transition-all ${lang === "fr" ? "bg-[#B06F70] text-white" : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"}`}
            >
              FR
            </button>
            <button
              onClick={() => setLang("en")}
              className={`px-2 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-switzer transition-all ${lang === "en" ? "bg-[#B06F70] text-white" : "text-[#F5EDE0]/60 hover:text-[#F5EDE0]"}`}
            >
              EN
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/partners/${slug}`}
            className="inline-flex items-center gap-2 text-[#F5EDE0]/70 hover:text-[#F5EDE0] transition-colors mb-6 md:mb-8 font-switzer text-sm md:text-base"
          >
            <ArrowLeftIcon className="w-4 h-4 md:w-5 md:h-5" />
            {t.backToCatalog}
          </Link>
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl lg:text-4xl text-[#F5EDE0] mb-2 font-spectral-light">
              <span className="opacity-80">{t.mySelection}</span> {t.selection}
            </h1>
            <p className="text-xs md:text-sm text-[#F5EDE0]/40 tracking-wide font-switzer">
              {selectedTalents.length} {selectedTalents.length > 1 ? t.talentsSelected : t.talentSelected}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#220101]" />
          </div>
        ) : selectedTalents.length === 0 ? (
          <div className="text-center py-12 md:py-20">
            <p className="text-5xl md:text-6xl mb-4 md:mb-6">💔</p>
            <h2 className="text-xl md:text-2xl text-[#220101] mb-2 font-spectral-light">{t.emptySelection}</h2>
            <p className="text-sm md:text-base text-[#220101]/50 mb-6 md:mb-8 font-switzer">{t.browseAndAdd}</p>
            <Link
              href={`/partners/${slug}`}
              className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 bg-[#220101] text-[#F5EDE0] rounded-full font-switzer text-sm md:text-base hover:bg-[#220101]/90 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4 md:w-5 md:h-5" />
              {t.discoverTalents}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
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
              <div className="flex items-center gap-3">
                <a
                  href={mailto}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#B06F70] hover:bg-[#9d5f60] text-white rounded-full font-switzer text-sm font-medium transition-colors"
                >
                  {t.sendByEmail}
                </a>
                <button
                  onClick={clearAll}
                  className="flex items-center gap-2 text-[#220101]/50 hover:text-red-500 transition-colors font-switzer text-sm"
                >
                  <TrashIcon className="w-4 h-4" />
                  {t.clearAll}
                </button>
              </div>
            </div>

            <div className="space-y-6 mb-12">
              {selectedTalents.map((talent) => (
                <SelectionCard
                  key={talent.id}
                  talent={talent}
                  onRemove={() => removeFavorite(talent.id)}
                  lang={lang}
                />
              ))}
            </div>

            <div className="bg-[#220101] rounded-3xl p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-3xl text-[#F5EDE0] mb-4 font-spectral-light">
                {t.interestedBy} {t.thisSelection}
              </h2>
              <p className="text-[#F5EDE0]/60 mb-8 font-switzer max-w-md mx-auto text-sm md:text-base">
                {lang === "fr" ? "Téléchargez le PDF et envoyez-le nous pour un devis personnalisé." : "Download the PDF and send it to us for a personalized quote."}
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

      <footer className="bg-[#220101] py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#F5EDE0]/30 text-xs tracking-wider font-switzer">©2025 GLOWUP AGENCY</p>
        </div>
      </footer>
    </div>
  );
}
