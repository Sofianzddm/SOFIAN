"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  MapPin,
  Play,
  Search,
  Settings2,
  Tag,
  Trash2,
  X,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface TalentLite {
  id: string;
  prenom: string;
  nom: string;
}

interface TalentOption extends TalentLite {
  photo: string | null;
}

interface GalleryPhoto {
  id: string;
  imageUrl: string;
  source: string;
  talentIds: string[];
  talents: TalentLite[];
}

interface EventGalleryData {
  event: {
    id: string;
    nom: string;
    date: string | null;
    lieu: string | null;
    logoUrl: string | null;
  };
  totalPhotos: number;
  photos: GalleryPhoto[];
  talentOptions: TalentOption[];
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

function isVideo(url: string): boolean {
  return (
    url.includes("/video/upload/") ||
    /\.(mp4|mov|webm|m4v|avi|mkv|ogv)(\?|$)/i.test(url)
  );
}

// Vignette d'aperçu (poster) générée par Cloudinary pour une vidéo.
function videoPoster(url: string): string {
  let out = url;
  if (out.includes("/video/upload/")) {
    out = out.replace("/video/upload/", "/video/upload/so_0/");
  }
  return out.replace(/\.(mp4|mov|webm|m4v|avi|mkv|ogv)(\?|$)/i, ".jpg$2");
}

// Source de lecture web-compatible : on demande du mp4 pour les formats
// non lisibles partout (ex. .mov ne se lit pas dans Chrome).
function videoPlaybackUrl(url: string): string {
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return url;
  if (url.includes("/video/upload/")) {
    return url.replace(/\.(mov|m4v|avi|mkv|ogv)(\?|$)/i, ".mp4$2");
  }
  return url;
}

function toDownloadUrl(url: string): string {
  if (url.includes("/image/upload/")) {
    return url.replace("/image/upload/", "/image/upload/fl_attachment/");
  }
  if (url.includes("/video/upload/")) {
    return url.replace("/video/upload/", "/video/upload/fl_attachment/");
  }
  return url;
}

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
  if (m) return m[1].toLowerCase();
  return isVideo(url) ? "mp4" : "jpg";
}

async function buildAndDownloadZip(
  photos: GalleryPhoto[],
  fileName: string,
  onProgress?: (pct: number) => void
) {
  if (photos.length === 0) return;
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let done = 0;
  let n = 0;
  for (const p of photos) {
    try {
      const res = await fetch(p.imageUrl, { mode: "cors" });
      const blob = await res.blob();
      n += 1;
      zip.file(`${String(n).padStart(2, "0")}.${guessExt(p.imageUrl)}`, blob);
    } catch (err) {
      console.error("Téléchargement photo échoué:", err);
    } finally {
      done += 1;
      onProgress?.(Math.round((done / photos.length) * 100));
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
export default function EventGalleryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;

  const [data, setData] = useState<EventGalleryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Mode gestion (upload + identification + suppression)
  const [manage, setManage] = useState(false);
  const [uploadingTotal, setUploadingTotal] = useState(0);
  const [uploadCount, setUploadCount] = useState(0);
  const [taggingPhotoId, setTaggingPhotoId] = useState<string | null>(null);
  // Photos tout juste uploadées, à identifier directement
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  // Sélection multiple dans le panneau « à identifier » (identification groupée)
  const [selectedReview, setSelectedReview] = useState<string[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const photos = data?.photos ?? [];
  const talentOptions = data?.talentOptions ?? [];

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
      const res = await fetch(`/api/photos/event/${slug}?_t=${Date.now()}`, {
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
        setLightboxIndex((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) =>
          i === null ? i : (i - 1 + photos.length) % photos.length
        );
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxIndex, photos.length]);

  const showPrev = useCallback(() => {
    setLightboxIndex((i) =>
      i === null ? i : (i - 1 + photos.length) % photos.length
    );
  }, [photos.length]);

  const showNext = useCallback(() => {
    setLightboxIndex((i) => (i === null ? i : (i + 1) % photos.length));
  }, [photos.length]);

  // Navigation par balayage tactile (mobile) dans la visionneuse.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || photos.length < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 45) {
      if (dx < 0) showNext();
      else showPrev();
    }
    touchStartX.current = null;
  };

  const downloadAll = useCallback(async () => {
    if (downloadingAll || photos.length === 0 || !data) return;
    setDownloadingAll(true);
    setDownloadProgress(0);
    try {
      await buildAndDownloadZip(
        photos,
        `glowup-${sanitize(data.event.nom) || "evenement"}.zip`,
        setDownloadProgress
      );
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingAll(false);
      setDownloadProgress(0);
    }
  }, [downloadingAll, photos, data]);

  // ----- Upload de photos (mode gestion) -----
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !slug) return;
      const medias = Array.from(files).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      );
      if (medias.length === 0) return;

      setUploadingTotal(medias.length);
      setUploadCount(0);

      const newIds: string[] = [];

      for (const file of medias) {
        try {
          const sigRes = await fetch(
            `/api/photos/event/${slug}/upload-signature`,
            { method: "POST" }
          );
          if (!sigRes.ok) throw new Error("Signature refusée");
          const sig = await sigRes.json();

          const form = new FormData();
          form.append("file", file);
          form.append("api_key", sig.apiKey);
          form.append("timestamp", String(sig.timestamp));
          form.append("signature", sig.signature);
          form.append("folder", sig.folder);
          form.append("public_id", sig.publicId);

          const resourceType = file.type.startsWith("video/")
            ? "video"
            : "image";
          const upRes = await fetch(
            `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`,
            { method: "POST", body: form }
          );
          if (!upRes.ok) throw new Error("Upload Cloudinary échoué");
          const uploaded = await upRes.json();

          const createRes = await fetch(`/api/photos/event/${slug}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: uploaded.secure_url,
              source: "INDIVIDUEL",
              talentIds: [],
            }),
          });
          const created = await createRes.json().catch(() => null);
          if (created?.photo?.id) newIds.push(created.photo.id as string);
        } catch (e) {
          console.error(e);
        } finally {
          setUploadCount((c) => c + 1);
        }
      }

      setUploadingTotal(0);
      setUploadCount(0);
      await load();
      // On affiche les photos uploadées dans le panneau « à identifier ».
      setReviewIds(newIds);
      setSelectedReview([]);
    },
    [slug, load]
  );

  // ----- Mise à jour des tags d'une photo -----
  const updateTags = useCallback(
    async (photoId: string, talentIds: string[]) => {
      // Optimiste
      setData((prev) =>
        prev
          ? {
              ...prev,
              photos: prev.photos.map((p) =>
                p.id === photoId
                  ? {
                      ...p,
                      talentIds,
                      talents: talentIds
                        .map((id) =>
                          prev.talentOptions.find((o) => o.id === id)
                        )
                        .filter((o): o is TalentOption => Boolean(o))
                        .map((o) => ({
                          id: o.id,
                          prenom: o.prenom,
                          nom: o.nom,
                        })),
                    }
                  : p
              ),
            }
          : prev
      );
      try {
        await fetch(`/api/photos/event/${slug}/photos/${photoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talentIds }),
        });
      } catch (e) {
        console.error(e);
      }
    },
    [slug]
  );

  // ----- Suppression d'une photo -----
  const deletePhoto = useCallback(
    async (photoId: string) => {
      if (!window.confirm("Supprimer cette photo ?")) return;
      setData((prev) =>
        prev
          ? {
              ...prev,
              photos: prev.photos.filter((p) => p.id !== photoId),
              totalPhotos: Math.max(0, prev.totalPhotos - 1),
            }
          : prev
      );
      try {
        await fetch(`/api/photos/event/${slug}/photos/${photoId}`, {
          method: "DELETE",
        });
      } catch (e) {
        console.error(e);
      }
    },
    [slug]
  );

  const taggingPhoto = photos.find((p) => p.id === taggingPhotoId) || null;

  // Photos tout juste uploadées (dans l'ordre d'ajout), à identifier.
  const reviewPhotos = reviewIds
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is GalleryPhoto => Boolean(p));

  const batchPhotos = selectedReview
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is GalleryPhoto => Boolean(p));

  const toggleReview = (id: string) =>
    setSelectedReview((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );

  // Applique des talents à toutes les photos sélectionnées (fusion, sans écraser).
  const applyBatchTags = useCallback(
    (ids: string[]) => {
      batchPhotos.forEach((p) => {
        const union = Array.from(new Set([...p.talentIds, ...ids]));
        updateTags(p.id, union);
      });
      setBatchOpen(false);
      setSelectedReview([]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batchPhotos]
  );

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

            {data.event.logoUrl && (
              <div
                className="mt-5 flex justify-center glow-fade-up"
                style={{ animationDelay: "0.08s" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.event.logoUrl}
                  alt={data.event.nom}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain bg-white/90 p-2 shadow-lg"
                />
              </div>
            )}

            <h1
              className="mt-3 sm:mt-4 text-center font-spectral-medium-italic leading-[0.95] glow-fade-up break-words [text-wrap:balance]"
              style={{
                fontSize: "clamp(34px, 9vw, 92px)",
                animationDelay: "0.1s",
              }}
            >
              {data.event.nom}
            </h1>

            {(data.event.date || data.event.lieu) && (
              <p
                className="mt-4 sm:mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center font-switzer text-[11px] sm:text-xs uppercase tracking-[0.2em] opacity-80 glow-fade-up"
                style={{ animationDelay: "0.15s" }}
              >
                {data.event.date && <span>{formatDate(data.event.date)}</span>}
                {data.event.lieu && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {data.event.lieu}
                  </span>
                )}
              </p>
            )}

            {/* Compteur */}
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
            </div>

            {/* Actions */}
            <div
              className="mt-6 sm:mt-7 flex flex-wrap items-center justify-center gap-3 glow-fade-up px-4"
              style={{ animationDelay: "0.25s" }}
            >
              {photos.length > 0 && (
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
                      Tout télécharger ({photos.length})
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setManage((m) => !m)}
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-[13px] sm:text-sm font-switzer font-medium tracking-wide border transition-colors"
                style={{
                  borderColor: "rgba(245,237,224,0.4)",
                  backgroundColor: manage ? "rgba(245,237,224,0.16)" : "transparent",
                  color: "#F5EDE0",
                }}
              >
                <Settings2 className="w-4 h-4" />
                {manage ? "Quitter la gestion" : "Ajouter / identifier"}
              </button>
            </div>
          </div>

          {/* Vague crème en bas du hero */}
          <svg
            className="block w-full"
            viewBox="0 0 1440 60"
            preserveAspectRatio="none"
            style={{ height: 40 }}
          >
            <path d="M0,40 C360,0 1080,0 1440,40 L1440,60 L0,60 Z" fill={C.cream} />
          </svg>
        </header>

        {/* ============ CORPS ============ */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16 sm:pb-20">
          {/* Zone d'upload (mode gestion) */}
          {manage && (
            <div className="mb-6 rounded-2xl border border-[#E0D6BE] bg-white/50 p-4 sm:p-5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingTotal > 0}
                className="w-full rounded-2xl border-2 border-dashed py-7 flex flex-col items-center justify-center transition-colors disabled:opacity-70 bg-white/60 hover:bg-white"
                style={{ borderColor: C.limeBar, color: C.burgundy }}
              >
                {uploadingTotal > 0 ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin mb-2" />
                    <span className="text-sm font-switzer font-medium">
                      Upload {uploadCount}/{uploadingTotal}…
                    </span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-6 h-6 mb-2" />
                    <span className="text-sm font-switzer font-semibold">
                      Ajouter des photos ou vidéos (sélection multiple)
                    </span>
                    <span className="text-xs font-switzer opacity-60 mt-0.5">
                      Tu identifieras les talents juste après l&apos;upload
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Panneau « Photos à identifier » (juste après l'upload) */}
          {manage && reviewPhotos.length > 0 && (
            <div
              className="mb-6 rounded-2xl border-2 p-4 sm:p-5"
              style={{ borderColor: C.limeBar, backgroundColor: "rgba(201,215,122,0.14)" }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="font-switzer font-semibold text-sm" style={{ color: C.ink }}>
                    Photos ajoutées — identifie les talents
                  </p>
                  <p className="text-xs font-switzer text-[#220101]/55">
                    {reviewPhotos.length} photo{reviewPhotos.length > 1 ? "s" : ""}
                    {" · "}Sélectionne plusieurs photos pour identifier en une fois
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReviewIds([]);
                    setSelectedReview([]);
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-switzer font-semibold"
                  style={{ backgroundColor: C.ink, color: C.lime }}
                >
                  <Check className="w-4 h-4" />
                  Terminé
                </button>
              </div>

              {/* Barre d'actions de sélection groupée */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedReview((s) =>
                      s.length === reviewPhotos.length
                        ? []
                        : reviewPhotos.map((p) => p.id)
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-switzer font-medium border transition-colors"
                  style={{
                    borderColor: "rgba(34,1,1,0.2)",
                    backgroundColor: "transparent",
                    color: C.burgundy,
                  }}
                >
                  {selectedReview.length === reviewPhotos.length
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </button>
                <button
                  type="button"
                  disabled={selectedReview.length === 0}
                  onClick={() => setBatchOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-switzer font-semibold transition-colors disabled:opacity-40"
                  style={{ backgroundColor: C.limeBar, color: C.ink }}
                >
                  <Tag className="w-3.5 h-3.5" />
                  Identifier la sélection ({selectedReview.length})
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
                {reviewPhotos.map((p) => {
                  const sel = selectedReview.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl overflow-hidden bg-white/70 border-2 transition-colors"
                      style={{ borderColor: sel ? C.ink : "#E0D6BE" }}
                    >
                      <div
                        className="relative aspect-[4/5] cursor-pointer"
                        style={{ backgroundColor: C.placeholder }}
                        onClick={() => toggleReview(p.id)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={isVideo(p.imageUrl) ? videoPoster(p.imageUrl) : p.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {isVideo(p.imageUrl) && (
                          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
                              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                            </span>
                          </span>
                        )}
                        {/* Case de sélection */}
                        <span
                          className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors"
                          style={
                            sel
                              ? { backgroundColor: C.ink, borderColor: C.ink }
                              : {
                                  backgroundColor: "rgba(255,255,255,0.85)",
                                  borderColor: "rgba(255,255,255,0.95)",
                                }
                          }
                        >
                          {sel && <Check className="w-3.5 h-3.5" style={{ color: C.lime }} />}
                        </span>
                        {p.talents.length > 0 && (
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-1">
                            {p.talents.slice(0, 3).map((t) => (
                              <span
                                key={t.id}
                                className="px-1.5 py-0.5 rounded-full text-[9px] font-switzer font-medium"
                                style={{ backgroundColor: "rgba(217,229,143,0.95)", color: C.ink }}
                              >
                                {t.prenom}
                              </span>
                            ))}
                            {p.talents.length > 3 && (
                              <span
                                className="px-1.5 py-0.5 rounded-full text-[9px] font-switzer font-medium"
                                style={{ backgroundColor: "rgba(255,255,255,0.9)", color: C.ink }}
                              >
                                +{p.talents.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setTaggingPhotoId(p.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs sm:text-sm font-switzer font-semibold transition-colors"
                        style={{
                          backgroundColor: p.talents.length > 0 ? "transparent" : C.limeBar,
                          color: C.ink,
                        }}
                      >
                        <Tag className="w-3.5 h-3.5" />
                        {p.talents.length > 0 ? "Modifier" : "Identifier"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {photos.length === 0 ? (
            <div className="text-center py-24">
              <p
                className="font-spectral-light-italic text-2xl"
                style={{ color: C.burgundy }}
              >
                Aucune photo pour le moment.
              </p>
              <p className="mt-2 font-switzer text-sm text-[#220101]/50">
                {manage
                  ? "Ajoute tes premières photos ci-dessus."
                  : "Revenez bientôt, les clichés arrivent !"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
              {photos.map((p, i) => (
                <PhotoTile
                  key={p.id}
                  photo={p}
                  index={i}
                  manage={manage}
                  onOpen={() => setLightboxIndex(i)}
                  onTag={() => setTaggingPhotoId(p.id)}
                  onDelete={() => deletePhoto(p.id)}
                />
              ))}
            </div>
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
      {lightboxIndex !== null && photos[lightboxIndex] && (
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

          <div className="absolute top-4 sm:top-5 left-1/2 -translate-x-1/2 text-white/70 text-[11px] sm:text-xs font-switzer tracking-[0.2em]">
            {lightboxIndex + 1} / {photos.length}
          </div>

          {photos.length > 1 && (
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

          {isVideo(photos[lightboxIndex].imageUrl) ? (
            <video
              src={videoPlaybackUrl(photos[lightboxIndex].imageUrl)}
              controls
              autoPlay
              playsInline
              className="max-w-[calc(100%-4.5rem)] sm:max-w-[calc(100%-8rem)] max-h-[72vh] sm:max-h-[82vh] object-contain rounded-lg sm:rounded-xl shadow-2xl select-none bg-black"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photos[lightboxIndex].imageUrl}
              alt=""
              className="max-w-[calc(100%-4.5rem)] sm:max-w-[calc(100%-8rem)] max-h-[72vh] sm:max-h-[82vh] object-contain rounded-lg sm:rounded-xl shadow-2xl select-none"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {photos.length > 1 && (
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
            href={toDownloadUrl(photos[lightboxIndex].imageUrl)}
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

      {/* ============ MODAL D'IDENTIFICATION (1 photo) ============ */}
      {taggingPhoto && (
        <TagModal
          images={[taggingPhoto.imageUrl]}
          initialSelected={taggingPhoto.talentIds}
          talentOptions={talentOptions}
          onClose={() => setTaggingPhotoId(null)}
          onSave={(ids) => {
            updateTags(taggingPhoto.id, ids);
            setTaggingPhotoId(null);
          }}
        />
      )}

      {/* ============ MODAL D'IDENTIFICATION GROUPÉE ============ */}
      {batchOpen && batchPhotos.length > 0 && (
        <TagModal
          images={batchPhotos.map((p) => p.imageUrl)}
          initialSelected={[]}
          title="Qui est sur ces photos ?"
          subtitle={`Ajouté à ${batchPhotos.length} photo${
            batchPhotos.length > 1 ? "s" : ""
          }`}
          talentOptions={talentOptions}
          onClose={() => setBatchOpen(false)}
          onSave={applyBatchTags}
        />
      )}
    </>
  );
}

// ============================================
// TUILE PHOTO
// ============================================
function PhotoTile({
  photo,
  index,
  manage,
  onOpen,
  onTag,
  onDelete,
}: {
  photo: GalleryPhoto;
  index: number;
  manage: boolean;
  onOpen: () => void;
  onTag: () => void;
  onDelete: () => void;
}) {
  const delay = `${Math.min(index, 8) * 0.05}s`;
  const video = isVideo(photo.imageUrl);
  return (
    <div
      className="group relative aspect-[4/5] rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 glow-fade-up"
      style={{ backgroundColor: C.placeholder, animationDelay: delay }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={video ? videoPoster(photo.imageUrl) : photo.imageUrl}
        alt=""
        onClick={onOpen}
        className="w-full h-full object-cover cursor-zoom-in transition-transform duration-500 ease-out group-hover:scale-110"
      />
      {video && (
        <span
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          onClick={onOpen}
        >
          <span className="w-12 h-12 rounded-full bg-black/55 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </span>
        </span>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Badge type de contenu */}
      <span
        className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-switzer font-semibold uppercase tracking-wide backdrop-blur-sm"
        style={
          photo.source === "INDIVIDUEL"
            ? { backgroundColor: "rgba(255,255,255,0.88)", color: C.burgundy }
            : { backgroundColor: "rgba(34,1,1,0.78)", color: C.lime }
        }
      >
        {photo.source === "INDIVIDUEL" ? "Personnel" : "Officielle"}
      </span>

      {/* Chips talents identifiés */}
      {photo.talents.length > 0 && (
        <div className="absolute bottom-2 left-2 right-12 flex flex-wrap gap-1">
          {photo.talents.slice(0, 3).map((t) => (
            <span
              key={t.id}
              className="px-2 py-0.5 rounded-full text-[10px] font-switzer font-medium backdrop-blur-sm"
              style={{ backgroundColor: "rgba(217,229,143,0.92)", color: C.ink }}
            >
              {t.prenom}
            </span>
          ))}
          {photo.talents.length > 3 && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-switzer font-medium backdrop-blur-sm"
              style={{ backgroundColor: "rgba(255,255,255,0.85)", color: C.ink }}
            >
              +{photo.talents.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Télécharger (hors gestion) */}
      {!manage && (
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
      )}

      {/* Actions gestion */}
      {manage && (
        <>
          <button
            type="button"
            onClick={onTag}
            className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center shadow transition-transform hover:scale-110"
            style={{ backgroundColor: C.lime, color: C.ink }}
            title="Identifier des talents"
          >
            <Tag className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 text-red-600 shadow flex items-center justify-center transition-transform hover:scale-110"
            title="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

// ============================================
// MODAL D'IDENTIFICATION (multi-talents)
// ============================================
function TagModal({
  images,
  initialSelected,
  title = "Qui est sur la photo ?",
  subtitle,
  talentOptions,
  onClose,
  onSave,
}: {
  images: string[];
  initialSelected: string[];
  title?: string;
  subtitle?: string;
  talentOptions: TalentOption[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [search, setSearch] = useState("");

  const filtered = talentOptions.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${o.prenom} ${o.nom}`.toLowerCase().includes(q);
  });

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 glow-fade-up"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Entête */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <div className="relative w-12 h-12 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={isVideo(images[0]) ? videoPoster(images[0]) : images[0]}
              alt=""
              className="w-12 h-12 rounded-xl object-cover"
            />
            {images.length > 1 && (
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-switzer font-semibold bg-[#220101] text-[#D9E58F]">
                ×{images.length}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-switzer font-semibold text-gray-900 text-sm">
              {title}
            </p>
            <p className="text-xs text-gray-400 font-switzer">
              {subtitle
                ? subtitle
                : `${selected.length} sélectionné${
                    selected.length > 1 ? "s" : ""
                  }`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recherche */}
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un talent…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-300 text-sm font-switzer focus:outline-none focus:border-[#C9D77A]"
            />
          </div>
        </div>

        {/* Liste */}
        <div className="overflow-y-auto p-2 flex-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8 font-switzer">
              Aucun talent trouvé.
            </p>
          ) : (
            filtered.map((o) => {
              const checked = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left"
                >
                  {o.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={o.photo}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-semibold text-gray-500 shrink-0">
                      {o.prenom.charAt(0)}
                      {o.nom.charAt(0)}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate text-sm font-switzer text-gray-800">
                    {o.prenom} {o.nom}
                  </span>
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                      checked
                        ? "bg-[#C9D77A] border-[#C9D77A]"
                        : "border-gray-300"
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5 text-[#220101]" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Pied */}
        <div className="p-3 border-t border-gray-100 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-switzer font-medium text-gray-600 hover:bg-gray-100"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSave(selected)}
            className="flex-1 py-2.5 rounded-xl text-sm font-switzer font-semibold"
            style={{ backgroundColor: C.limeBar, color: C.ink }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
