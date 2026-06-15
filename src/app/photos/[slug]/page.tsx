"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MapPin,
  X,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface GalleryPhoto {
  id: string;
  imageUrl: string;
}

interface GalleryEvent {
  id: string;
  nom: string;
  date: string | null;
  lieu: string | null;
  logoUrl: string | null;
  photos: GalleryPhoto[];
}

interface GalleryData {
  talent: { prenom: string; nom: string };
  totalPhotos: number;
  events: GalleryEvent[];
}

// ============================================
// COULEURS GLOW UP (alignées sur le Kit Media)
// ============================================
const C = {
  cream: "#F2E8D5",
  ink: "#220101",
  burgundy: "#5C2A30",
  lime: "#D9E58F",
  limeBar: "#C9D77A",
  placeholder: "#E5DCC9",
} as const;

// ============================================
// HELPERS
// ============================================
function formatDate(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

// Force le téléchargement via le flag Cloudinary fl_attachment.
function toDownloadUrl(url: string): string {
  if (url.includes("/image/upload/")) {
    return url.replace("/image/upload/", "/image/upload/fl_attachment/");
  }
  return url;
}

// Nom de dossier/fichier sûr pour le zip.
function sanitize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function guessExt(url: string): string {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{3,4})$/);
  return m ? m[1].toLowerCase() : "jpg";
}

// Construit un .zip (1 dossier par événement) et déclenche le téléchargement.
// onProgress reçoit un pourcentage 0..100.
async function buildAndDownloadZip(
  events: GalleryEvent[],
  fileName: string,
  onProgress?: (pct: number) => void
) {
  const total = events.reduce((acc, e) => acc + e.photos.length, 0);
  if (total === 0) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let done = 0;

  for (const ev of events) {
    const folderName = sanitize(ev.nom) || "evenement";
    // Si un seul événement, on met les photos à la racine du zip.
    const folder = events.length > 1 ? zip.folder(folderName) || zip : zip;
    let n = 0;
    for (const p of ev.photos) {
      try {
        const res = await fetch(p.imageUrl, { mode: "cors" });
        const blob = await res.blob();
        n += 1;
        folder.file(`${String(n).padStart(2, "0")}.${guessExt(p.imageUrl)}`, blob);
      } catch (err) {
        console.error("Téléchargement photo échoué:", err);
      } finally {
        done += 1;
        onProgress?.(Math.round((done / total) * 100));
      }
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ============================================
// LOGO GLOW UP
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

// ============================================
// PAGE
// ============================================
export default function TalentGalleryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;

  const [data, setData] = useState<GalleryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Liste à plat de toutes les photos (dans l'ordre d'affichage) pour la
  // navigation dans la visionneuse + l'index de départ de chaque événement.
  const { allPhotos, eventStartIndex } = useMemo(() => {
    const flat: { imageUrl: string; eventNom: string }[] = [];
    const starts: number[] = [];
    (data?.events || []).forEach((ev) => {
      starts.push(flat.length);
      ev.photos.forEach((p) =>
        flat.push({ imageUrl: p.imageUrl, eventNom: ev.nom })
      );
    });
    return { allPhotos: flat, eventStartIndex: starts };
  }, [data]);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      if (meta.parentNode) meta.parentNode.removeChild(meta);
    };
  }, []);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/photos/${slug}?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Erreur");
      setData(await res.json());
    } catch (e) {
      console.error(e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Lock scroll + navigation clavier quand la visionneuse est ouverte
  useEffect(() => {
    if (lightboxIndex === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) =>
          i === null ? i : (i + 1) % allPhotos.length
        );
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) =>
          i === null ? i : (i - 1 + allPhotos.length) % allPhotos.length
        );
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxIndex, allPhotos.length]);

  const showPrev = useCallback(() => {
    setLightboxIndex((i) =>
      i === null ? i : (i - 1 + allPhotos.length) % allPhotos.length
    );
  }, [allPhotos.length]);

  const showNext = useCallback(() => {
    setLightboxIndex((i) => (i === null ? i : (i + 1) % allPhotos.length));
  }, [allPhotos.length]);

  // Navigation par balayage tactile (mobile) dans la visionneuse.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || allPhotos.length < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 45) {
      if (dx < 0) showNext();
      else showPrev();
    }
    touchStartX.current = null;
  };

  // Télécharge toutes les photos dans un .zip (organisé par événement).
  const downloadAll = useCallback(async () => {
    if (downloadingAll || allPhotos.length === 0 || !data) return;
    setDownloadingAll(true);
    setDownloadProgress(0);
    try {
      await buildAndDownloadZip(
        data.events,
        `glowup-${sanitize(`${data.talent.prenom}-${data.talent.nom}`)}.zip`,
        setDownloadProgress
      );
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingAll(false);
      setDownloadProgress(0);
    }
  }, [downloadingAll, allPhotos.length, data]);

  const fonts = (
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
        font-family: "Spectral-MediumItalic", "Cormorant Garamond", Georgia, serif;
      }
      .font-spectral-light {
        font-family: "Spectral-Light", "Cormorant Garamond", Georgia, serif;
      }
      .font-spectral-light-italic {
        font-family: "Spectral-LightItalic", "Cormorant Garamond", Georgia, serif;
        font-style: italic;
      }
      .font-switzer {
        font-family: "Switzer", "Inter", system-ui, sans-serif;
      }
      @keyframes glowupFadeUp {
        from {
          opacity: 0;
          transform: translateY(14px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .glow-fade-up {
        animation: glowupFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
    `}</style>
  );

  if (loading) {
    return (
      <>
        {fonts}
        <div className="min-h-screen bg-[#1a0808] flex items-center justify-center">
          <GlowUpLogo className="h-7 animate-pulse" color="#F5EDE0" />
        </div>
      </>
    );
  }

  if (notFound || !data) {
    return (
      <>
        {fonts}
        <div className="min-h-screen bg-[#1a0808] flex flex-col items-center justify-center px-6 text-center text-[#F5EDE0]">
          <GlowUpLogo className="h-8 mb-6" color="#F5EDE0" />
          <h1 className="text-3xl font-spectral-light mb-3">
            Galerie introuvable
          </h1>
          <p className="opacity-60 font-spectral-light">
            Ce lien n&apos;est plus valide.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {fonts}
      <main className="min-h-screen" style={{ backgroundColor: C.cream }}>
        {/* ============ HERO ============ */}
        <header
          className="relative overflow-hidden text-[#F5EDE0]"
          style={{
            background:
              "linear-gradient(180deg, #A75858 0%, #843A3A 24%, #5E2424 52%, #341212 78%, #1A0808 100%)",
          }}
        >
          {/* Halo décoratif */}
          <div
            className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-20 blur-3xl"
            style={{ backgroundColor: C.lime }}
          />
          <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-10 pb-14 sm:pt-16 sm:pb-20">
            <div className="flex justify-center mb-8 sm:mb-10 glow-fade-up">
              <GlowUpLogo className="h-3.5 sm:h-[15px]" color="#F5EDE0" />
            </div>

            <p
              className="text-center text-[10px] sm:text-[11px] uppercase tracking-[0.35em] sm:tracking-[0.45em] opacity-70 font-switzer glow-fade-up"
              style={{ animationDelay: "0.05s" }}
            >
              Galerie privée
            </p>

            <h1
              className="mt-3 sm:mt-4 text-center font-spectral-medium-italic leading-[0.95] glow-fade-up break-words [text-wrap:balance]"
              style={{
                fontSize: "clamp(34px, 9vw, 92px)",
                animationDelay: "0.1s",
              }}
            >
              {data.talent.prenom} {data.talent.nom}
            </h1>

            <p
              className="mt-4 sm:mt-6 text-center font-spectral-light-italic text-sm sm:text-lg opacity-90 glow-fade-up px-4"
              style={{ animationDelay: "0.15s" }}
            >
              Vos souvenirs, capturés par Glow Up
            </p>

            {/* Compteurs ludiques */}
            <div
              className="mt-7 sm:mt-9 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 glow-fade-up"
              style={{ animationDelay: "0.2s" }}
            >
              <span
                className="rounded-full px-3.5 sm:px-4 py-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.25em] font-switzer"
                style={{ backgroundColor: "rgba(217,229,143,0.18)", color: C.lime }}
              >
                {data.totalPhotos} photo{data.totalPhotos > 1 ? "s" : ""}
              </span>
              <span className="text-[#F5EDE0]/30 hidden sm:inline">·</span>
              <span
                className="rounded-full px-3.5 sm:px-4 py-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.25em] font-switzer"
                style={{ backgroundColor: "rgba(245,237,224,0.12)" }}
              >
                {data.events.length} événement{data.events.length > 1 ? "s" : ""}
              </span>
            </div>

            {/* Tout télécharger */}
            {allPhotos.length > 0 && (
              <div
                className="mt-6 sm:mt-7 flex justify-center glow-fade-up px-4"
                style={{ animationDelay: "0.25s" }}
              >
                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={downloadingAll}
                  className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-[13px] sm:text-sm font-switzer font-medium tracking-wide transition-transform hover:scale-105 active:scale-95 disabled:opacity-80 disabled:hover:scale-100"
                  style={{ backgroundColor: C.lime, color: C.ink }}
                >
                  {downloadingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Préparation… {downloadProgress}%
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Tout télécharger ({allPhotos.length})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Vague crème en bas du hero */}
          <svg
            className="block w-full"
            viewBox="0 0 1440 60"
            preserveAspectRatio="none"
            style={{ height: 40 }}
          >
            <path
              d="M0,40 C360,0 1080,0 1440,40 L1440,60 L0,60 Z"
              fill={C.cream}
            />
          </svg>
        </header>

        {/* ============ CORPS ============ */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16 sm:pb-20 space-y-12 sm:space-y-16">
          {data.events.length === 0 ? (
            <div className="text-center py-24">
              <p
                className="font-spectral-light-italic text-2xl"
                style={{ color: C.burgundy }}
              >
                Aucune photo pour le moment.
              </p>
              <p className="mt-2 font-switzer text-sm text-[#220101]/50">
                Revenez bientôt, vos clichés arrivent !
              </p>
            </div>
          ) : (
            data.events.map((ev, idx) => (
              <EventSection
                key={ev.id}
                event={ev}
                index={idx}
                startIndex={eventStartIndex[idx] ?? 0}
                onOpen={setLightboxIndex}
              />
            ))
          )}
        </div>

        {/* ============ FOOTER ============ */}
        <footer
          className="relative text-center text-[#F5EDE0] px-6 py-14"
          style={{
            background:
              "linear-gradient(180deg, #1A0808 0%, #341212 45%, #5E2424 100%)",
          }}
        >
          <GlowUpLogo className="h-9 mx-auto mb-5" color="#F5EDE0" />
          <p
            className="font-spectral-light text-lg sm:text-xl"
            style={{ letterSpacing: "0.02em" }}
          >
            THE RISE <span className="font-spectral-medium-italic">of</span> IDEAS
          </p>
          <p className="mt-6 text-[10px] uppercase tracking-[0.35em] opacity-60 font-switzer">
            © {new Date().getFullYear()} Glow Up · Lien privé
          </p>
        </footer>
      </main>

      {/* ============ LIGHTBOX ============ */}
      {lightboxIndex !== null && allPhotos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/92 backdrop-blur-sm flex items-center justify-center px-3 sm:px-4 glow-fade-up touch-pan-y"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
            onClick={() => setLightboxIndex(null)}
            aria-label="Fermer"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Compteur */}
          <div className="absolute top-4 sm:top-5 left-1/2 -translate-x-1/2 text-white/70 text-[11px] sm:text-xs font-switzer tracking-[0.2em]">
            {lightboxIndex + 1} / {allPhotos.length}
          </div>

          {/* Flèche précédente */}
          {allPhotos.length > 1 && (
            <button
              type="button"
              className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
              onClick={(e) => {
                e.stopPropagation();
                showPrev();
              }}
              aria-label="Précédente"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={allPhotos[lightboxIndex].imageUrl}
            alt=""
            className="max-w-[calc(100%-4.5rem)] sm:max-w-[calc(100%-8rem)] max-h-[72vh] sm:max-h-[82vh] object-contain rounded-lg sm:rounded-xl shadow-2xl select-none"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Flèche suivante */}
          {allPhotos.length > 1 && (
            <button
              type="button"
              className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
              onClick={(e) => {
                e.stopPropagation();
                showNext();
              }}
              aria-label="Suivante"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}

          <a
            href={toDownloadUrl(allPhotos[lightboxIndex].imageUrl)}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-[13px] sm:text-sm font-switzer font-medium tracking-wide transition-transform hover:scale-105 active:scale-95"
            style={{ backgroundColor: C.lime, color: C.ink }}
          >
            <Download className="w-4 h-4" />
            Télécharger
          </a>
        </div>
      )}
    </>
  );
}

// ============================================
// SECTION ÉVÉNEMENT
// ============================================
function EventSection({
  event,
  index,
  startIndex,
  onOpen,
}: {
  event: GalleryEvent;
  index: number;
  startIndex: number;
  onOpen: (globalIndex: number) => void;
}) {
  const [zipping, setZipping] = useState(false);
  const [zipPct, setZipPct] = useState(0);

  const downloadEvent = async () => {
    if (zipping || event.photos.length === 0) return;
    setZipping(true);
    setZipPct(0);
    try {
      await buildAndDownloadZip(
        [event],
        `glowup-${sanitize(event.nom) || "evenement"}.zip`,
        setZipPct
      );
    } catch (e) {
      console.error(e);
    } finally {
      setZipping(false);
      setZipPct(0);
    }
  };

  return (
    <section>
      {/* Entête événement */}
      <div className="flex items-end justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1.5">
            <span
              className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-[11px] sm:text-[12px] font-switzer font-semibold shrink-0"
              style={{ backgroundColor: C.limeBar, color: C.ink }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div
              className="h-px flex-1 hidden sm:block"
              style={{ backgroundColor: "rgba(34,1,1,0.15)" }}
            />
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            {event.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.logoUrl}
                alt={event.nom}
                className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl object-contain bg-white/70 shrink-0"
              />
            )}
            <h2
              className="font-spectral-medium-italic leading-tight break-words min-w-0"
              style={{ color: C.ink, fontSize: "clamp(22px, 6vw, 40px)" }}
            >
              {event.nom}
            </h2>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 font-switzer text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[#220101]/55">
            {event.date && <span>{formatDate(event.date)}</span>}
            {event.lieu && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {event.lieu}
              </span>
            )}
            <span>
              {event.photos.length} photo{event.photos.length > 1 ? "s" : ""}
            </span>
          </p>
        </div>

        {/* Tout télécharger cet événement */}
        {event.photos.length > 0 && (
          <button
            type="button"
            onClick={downloadEvent}
            disabled={zipping}
            className="shrink-0 self-end inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-switzer font-medium whitespace-nowrap transition-transform hover:scale-105 active:scale-95 disabled:opacity-80 disabled:hover:scale-100"
            style={{ backgroundColor: C.limeBar, color: C.ink }}
          >
            {zipping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {zipPct}%
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Tout télécharger</span>
                <span className="sm:hidden">Tout</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Grille de photos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {event.photos.map((p, i) => (
          <PhotoTile
            key={p.id}
            photo={p}
            index={i}
            onOpen={() => onOpen(startIndex + i)}
          />
        ))}
      </div>
    </section>
  );
}

// ============================================
// TUILE PHOTO (effet ludique au survol)
// ============================================
function PhotoTile({
  photo,
  index,
  onOpen,
}: {
  photo: GalleryPhoto;
  index: number;
  onOpen: () => void;
}) {
  // Léger décalage d'apparition pour un effet "cascade"
  const delay = `${Math.min(index, 8) * 0.05}s`;
  return (
    <div
      className="group relative aspect-[4/5] rounded-2xl overflow-hidden cursor-zoom-in shadow-sm hover:shadow-xl transition-all duration-300 glow-fade-up"
      style={{ backgroundColor: C.placeholder, animationDelay: delay }}
      onClick={onOpen}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.imageUrl}
        alt=""
        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
      />
      {/* Voile dégradé au survol */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Bouton télécharger */}
      <a
        href={toDownloadUrl(photo.imageUrl)}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300 hover:scale-110"
        style={{ backgroundColor: C.lime, color: C.ink }}
        title="Télécharger"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
}
