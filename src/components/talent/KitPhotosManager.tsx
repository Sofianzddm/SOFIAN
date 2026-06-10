"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Instagram, Loader2, Trash2, X } from "lucide-react";

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

  // Chargement initial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/talents/${talentId}/kit-photos`);
        if (!res.ok) throw new Error("Erreur chargement");
        const data = (await res.json()) as { kitPhotos: (string | null)[] };
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
        // 1–2. URL présignée S3 puis upload direct (bypass serveur)
        const { uploadFileViaPresignedUrl } = await import("@/lib/s3-upload-client");
        const publicUrl = await uploadFileViaPresignedUrl(
          "/api/upload/signature",
          { talentId },
          file
        );

        // 3. Persiste le slot
        const patchRes = await fetch(`/api/talents/${talentId}/kit-photos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, url: publicUrl }),
        });
        if (!patchRes.ok) throw new Error("Erreur mise à jour");
        const data = (await patchRes.json()) as { kitPhotos: (string | null)[] };
        setPhotos(data.kitPhotos);
      } catch (e) {
        console.error("Erreur upload kit photo:", e);
        setError("Erreur lors de l'upload");
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
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Erreur d'import Instagram");
        }
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
        if (!res.ok) throw new Error("Erreur suppression");
        const data = (await res.json()) as { kitPhotos: (string | null)[] };
        setPhotos(data.kitPhotos);
      } catch (e) {
        console.error(e);
        setError("Erreur lors de la suppression");
      }
    },
    [talentId]
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
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
