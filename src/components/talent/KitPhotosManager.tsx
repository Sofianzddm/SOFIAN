"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Instagram, Loader2, Trash2, X } from "lucide-react";

interface IgPhoto {
  url: string;
  type?: string;
  caption?: string;
  timestamp?: string;
}

/**
 * Parse une réponse fetch en JSON de façon défensive.
 *
 * Les routes serverless (Vercel) peuvent renvoyer une page d'erreur en
 * texte/HTML (« A server error has occurred… », « An error occurred… »,
 * timeout, 413…) au lieu du JSON attendu. Un `res.json()` direct planterait
 * alors avec « Unexpected token 'A'… is not valid JSON ».
 * Ici on lit le corps en texte puis on tente de le parser, et on remonte un
 * message d'erreur exploitable si ce n'est pas du JSON.
 */
async function parseJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      // Réponse non-JSON (page d'erreur serveur, HTML, timeout…)
      if (!res.ok) {
        throw new Error(
          res.status === 413
            ? "Fichier trop volumineux."
            : res.status === 504
              ? "Le serveur a mis trop de temps à répondre (délai dépassé)."
              : `${fallbackError} (erreur ${res.status})`
        );
      }
      throw new Error(fallbackError);
    }
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error || `${fallbackError} (erreur ${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

/**
 * Manager des 10 photos additionnelles (`kitPhotos`) utilisées par le
 * Kit Media public (/kit/[slug]).
 *
 * Distribution :
 *   - slots 0..2  : bandeau présentation (page 02)
 *   - slots 3..5  : colonne Instagram analytics (page 03)
 *   - slots 6..8  : colonne TikTok analytics (page 04)
 *   - slot  9     : bonus (lookbook futur)
 *
 * À chaque slot vide → carré crème "+". Upload direct Cloudinary
 * via la même infra que la photo principale (`/api/upload/signature`).
 */

const SLOTS: { index: number; label: string; group: string }[] = [
  { index: 0, label: "Présentation #1", group: "Bandeau présentation (page 02)" },
  { index: 1, label: "Présentation #2", group: "Bandeau présentation (page 02)" },
  { index: 2, label: "Présentation #3", group: "Bandeau présentation (page 02)" },
  { index: 3, label: "Instagram #1", group: "Colonne Instagram (page 03)" },
  { index: 4, label: "Instagram #2", group: "Colonne Instagram (page 03)" },
  { index: 5, label: "Instagram #3", group: "Colonne Instagram (page 03)" },
  { index: 6, label: "TikTok #1", group: "Colonne TikTok (page 04)" },
  { index: 7, label: "TikTok #2", group: "Colonne TikTok (page 04)" },
  { index: 8, label: "TikTok #3", group: "Colonne TikTok (page 04)" },
  { index: 9, label: "Bonus", group: "Photo bonus" },
];

export default function KitPhotosManager({ talentId }: { talentId: string }) {
  const [photos, setPhotos] = useState<(string | null)[]>(
    Array.from({ length: 10 }, () => null)
  );
  const [loading, setLoading] = useState(true);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Galerie de sélection Instagram (remplacer un slot par une photo du feed)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [igPhotos, setIgPhotos] = useState<IgPhoto[] | null>(null);
  const [igLoading, setIgLoading] = useState(false);
  const [igError, setIgError] = useState<string | null>(null);
  const [pickingUrl, setPickingUrl] = useState<string | null>(null);

  // Chargement initial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/talents/${talentId}/kit-photos`);
        const data = await parseJsonResponse<{ kitPhotos: (string | null)[] }>(
          res,
          "Erreur chargement"
        );
        if (!cancelled) setPhotos(data.kitPhotos);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Erreur de chargement des photos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  const handleFileChange = useCallback(
    async (index: number, file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Veuillez sélectionner une image");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError("L'image ne doit pas dépasser 100MB");
        return;
      }

      setUploadingIndex(index);
      setError(null);
      try {
        // 1. Signature Cloudinary (publicId déjà unique grâce au timestamp serveur).
        const sigRes = await fetch("/api/upload/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talentId }),
        });
        const { signature, timestamp, folder, publicId, cloudName, apiKey } =
          await parseJsonResponse<{
            signature: string;
            timestamp: number;
            folder: string;
            publicId: string;
            cloudName?: string;
            apiKey?: string;
          }>(sigRes, "Erreur signature");

        if (!cloudName) {
          throw new Error("Configuration Cloudinary manquante côté serveur");
        }

        // 2. Upload Cloudinary — on respecte exactement les params signés.
        const formData = new FormData();
        formData.append("file", file);
        formData.append("signature", signature);
        formData.append("timestamp", timestamp.toString());
        formData.append("folder", folder);
        formData.append("public_id", publicId);
        formData.append("api_key", apiKey ?? "");

        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: "POST", body: formData }
        );
        const { secure_url } = await parseJsonResponse<{ secure_url: string }>(
          cloudRes,
          "Erreur upload Cloudinary"
        );

        // 3. Persiste le slot
        const patchRes = await fetch(`/api/talents/${talentId}/kit-photos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, url: secure_url }),
        });
        const data = await parseJsonResponse<{ kitPhotos: (string | null)[] }>(
          patchRes,
          "Erreur mise à jour"
        );
        setPhotos(data.kitPhotos);
      } catch (e) {
        console.error("Erreur upload kit photo:", e);
        setError(e instanceof Error ? e.message : "Erreur lors de l'upload");
      } finally {
        setUploadingIndex(null);
        const input = fileInputsRef.current[index];
        if (input) input.value = "";
      }
    },
    [talentId]
  );

  const handleInstagramImport = useCallback(
    async (overwrite: boolean) => {
      if (importing) return;
      const confirmMsg = overwrite
        ? "Remplacer TOUTES les photos par les 9 dernières publications Instagram ?"
        : "Importer les 9 dernières photos Instagram dans les slots vides ?";
      if (!window.confirm(confirmMsg)) return;

      setImporting(true);
      setError(null);
      setImportMessage(null);
      try {
        const res = await fetch(
          `/api/talents/${talentId}/instagram-import`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overwrite }),
          }
        );
        const data = await parseJsonResponse<{
          kitPhotos: (string | null)[];
          imported: number;
        }>(res, "Erreur d'import Instagram");
        setPhotos(data.kitPhotos);
        setImportMessage(
          `${data.imported} photo${data.imported > 1 ? "s" : ""} importée${
            data.imported > 1 ? "s" : ""
          } depuis Instagram`
        );
        setTimeout(() => setImportMessage(null), 4000);
      } catch (e) {
        console.error(e);
        setError(
          e instanceof Error ? e.message : "Erreur lors de l'import Instagram"
        );
      } finally {
        setImporting(false);
      }
    },
    [talentId, importing]
  );

  const handleRemove = useCallback(
    async (index: number) => {
      try {
        const res = await fetch(`/api/talents/${talentId}/kit-photos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, url: null }),
        });
        const data = await parseJsonResponse<{ kitPhotos: (string | null)[] }>(
          res,
          "Erreur suppression"
        );
        setPhotos(data.kitPhotos);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Erreur lors de la suppression");
      }
    },
    [talentId]
  );

  // Charge la galerie Instagram (mise en cache pour la session : Apify est lent/coûteux)
  const loadIgPhotos = useCallback(
    async (force = false) => {
      if (igLoading) return;
      if (igPhotos && !force) return;
      setIgLoading(true);
      setIgError(null);
      try {
        const res = await fetch(`/api/talents/${talentId}/instagram-photos`);
        const data = await parseJsonResponse<{ photos?: IgPhoto[] }>(
          res,
          "Erreur de récupération Instagram"
        );
        setIgPhotos(data.photos || []);
      } catch (e) {
        console.error(e);
        setIgError(
          e instanceof Error ? e.message : "Erreur de récupération Instagram"
        );
      } finally {
        setIgLoading(false);
      }
    },
    [talentId, igLoading, igPhotos]
  );

  const openPicker = useCallback(
    (index: number) => {
      setPickerSlot(index);
      setIgError(null);
      void loadIgPhotos(false);
    },
    [loadIgPhotos]
  );

  const closePicker = useCallback(() => {
    setPickerSlot(null);
    setPickingUrl(null);
  }, []);

  const handlePickPhoto = useCallback(
    async (imageUrl: string) => {
      if (pickerSlot === null || pickingUrl) return;
      setPickingUrl(imageUrl);
      setError(null);
      try {
        const res = await fetch(
          `/api/talents/${talentId}/kit-photos/from-instagram`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: pickerSlot, imageUrl }),
          }
        );
        const data = await parseJsonResponse<{ kitPhotos: (string | null)[] }>(
          res,
          "Erreur lors de la sélection"
        );
        setPhotos(data.kitPhotos);
        closePicker();
      } catch (e) {
        console.error(e);
        setError(
          e instanceof Error ? e.message : "Erreur lors de la sélection"
        );
      } finally {
        setPickingUrl(null);
      }
    },
    [talentId, pickerSlot, pickingUrl, closePicker]
  );

  const filled = photos.filter((p) => !!p).length;

  // Groupement visuel
  const groups: Record<string, typeof SLOTS> = SLOTS.reduce(
    (acc, slot) => {
      acc[slot.group] = acc[slot.group] || [];
      acc[slot.group].push(slot);
      return acc;
    },
    {} as Record<string, typeof SLOTS>
  );

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900">
            10 photos du kit
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Slot vide = carré crème dans le kit. Les photos sont reprises
            en direct sur la page publique.
          </p>
        </div>
        <div className="shrink-0 text-xs font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
          {filled} / 10
        </div>
      </header>

      {/* Boutons d'import Instagram */}
      <div className="mb-4 flex flex-row gap-2">
        <button
          type="button"
          onClick={() => handleInstagramImport(false)}
          disabled={importing}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] text-white text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {importing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Instagram className="w-3.5 h-3.5" />
          )}
          <span className="truncate">Importer depuis Instagram</span>
        </button>
        <button
          type="button"
          onClick={() => handleInstagramImport(true)}
          disabled={importing}
          className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-xs sm:text-sm font-medium text-gray-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          title="Remplace toutes les photos existantes par les 9 dernières d'Instagram"
        >
          Tout remplacer
        </button>
      </div>

      {importMessage && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
          ✓ {importMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-10 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Chargement…
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([groupName, slots]) => (
            <div key={groupName}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                {groupName}
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-5 gap-2">
                {slots.map((slot) => {
                  const photo = photos[slot.index];
                  const isUploading = uploadingIndex === slot.index;
                  return (
                    <div key={slot.index} className="relative group">
                      <input
                        type="file"
                        accept="image/*"
                        ref={(el) => {
                          fileInputsRef.current[slot.index] = el;
                        }}
                        className="hidden"
                        onChange={(e) =>
                          handleFileChange(slot.index, e.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() =>
                          fileInputsRef.current[slot.index]?.click()
                        }
                        className={`relative w-full aspect-[3/4] rounded-lg overflow-hidden border ${
                          photo
                            ? "border-gray-200 hover:border-gray-400"
                            : "border-dashed border-gray-300 hover:border-gray-400 bg-[#F2E8D5]"
                        } transition-colors`}
                      >
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo}
                            alt={slot.label}
                            className="w-full h-full object-cover"
                            style={{ objectPosition: "center 15%" }}
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                            <ImagePlus className="w-4 h-4 mb-1" />
                            <span className="text-[8px] uppercase tracking-wider">
                              Ajouter
                            </span>
                          </div>
                        )}

                        {isUploading && (
                          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                          </div>
                        )}
                      </button>

                      {/* Action supprimer */}
                      {photo && !isUploading && (
                        <button
                          type="button"
                          onClick={() => handleRemove(slot.index)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/95 text-red-600 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                          title="Supprimer cette photo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}

                      {/* Action : choisir / remplacer depuis Instagram */}
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => openPicker(slot.index)}
                          className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] text-white shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:brightness-110"
                          title={
                            photo
                              ? "Remplacer par une photo Instagram"
                              : "Choisir une photo Instagram"
                          }
                        >
                          <Instagram className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Galerie de sélection Instagram */}
      {pickerSlot !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closePicker}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div className="min-w-0 flex items-center gap-2">
                <Instagram className="w-4 h-4 text-[#bc1888]" />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 truncate">
                    Choisir une photo Instagram
                  </h4>
                  <p className="text-xs text-gray-500 truncate">
                    {SLOTS.find((s) => s.index === pickerSlot)?.label} — clique
                    pour remplacer
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => loadIgPhotos(true)}
                  disabled={igLoading || !!pickingUrl}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                  title="Recharger le feed Instagram"
                >
                  Actualiser
                </button>
                <button
                  type="button"
                  onClick={closePicker}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            <div className="p-5 overflow-y-auto">
              {igLoading ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-sm">Chargement du feed Instagram…</span>
                </div>
              ) : igError ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-red-600 mb-3">{igError}</p>
                  <button
                    type="button"
                    onClick={() => loadIgPhotos(true)}
                    className="text-sm font-medium text-gray-700 underline"
                  >
                    Réessayer
                  </button>
                </div>
              ) : igPhotos && igPhotos.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {igPhotos.map((p, i) => {
                    const isPicking = pickingUrl === p.url;
                    const isBusy = !!pickingUrl;
                    return (
                      <button
                        key={`${p.url}-${i}`}
                        type="button"
                        disabled={isBusy}
                        onClick={() => handlePickPhoto(p.url)}
                        className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-[#bc1888] hover:ring-2 hover:ring-[#bc1888]/30 transition-all disabled:cursor-not-allowed"
                        title="Utiliser cette photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={`Instagram ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {isPicking && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-gray-500">
                  Aucune photo Instagram trouvée.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
