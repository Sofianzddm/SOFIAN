"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { toast } from "sonner";
import Modal from "./Modal";

async function blobFromCrop(imageSrc: string, area: Area, quality = 0.92): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Impossible de charger l’image"));
  });

  const sx = Math.round(area.x);
  const sy = Math.round(area.y);
  const sw = Math.round(area.width);
  const sh = Math.round(area.height);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non supporté");

  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export image impossible"))), "image/jpeg", quality);
  });
}

export default function CoiffeurProfilePhotoSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cloudinaryReady, setCloudinaryReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const closeCropModal = useCallback(() => {
    setCropModalOpen(false);
    setCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cannes/coiffeur/profile-photo", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        photoUrl?: string | null;
        cloudinaryReady?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error(j.error || "Impossible de charger la photo");
        return;
      }
      setPhotoUrl(typeof j.photoUrl === "string" && j.photoUrl ? j.photoUrl : null);
      setCloudinaryReady(j.cloudinaryReady !== false);
    } catch {
      toast.error("Impossible de charger la photo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCropComplete = useCallback((_a: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisis une image");
      return;
    }
    setCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropModalOpen(true);
  };

  const applyCropAndUpload = async () => {
    if (!cropSrc || !croppedAreaPixels) {
      toast.error("Ajuste le cadrage avant d’envoyer");
      return;
    }
    const srcAtApply = cropSrc;
    const pixelsAtApply = croppedAreaPixels;
    setUploading(true);
    try {
      const blob = await blobFromCrop(srcAtApply, pixelsAtApply);
      closeCropModal();

      const fd = new FormData();
      fd.append("file", blob, "profile.jpg");
      const res = await fetch("/api/cannes/coiffeur/profile-photo", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { photoUrl?: string | null; error?: string };
      if (!res.ok) {
        toast.error(j.error || "Upload impossible");
        return;
      }
      setPhotoUrl(typeof j.photoUrl === "string" && j.photoUrl ? j.photoUrl : null);
      toast.success("Photo mise à jour — visible sur le lien public avec ta clé.");
    } catch {
      toast.error("Recadrage ou envoi impossible — réessaie avec une autre image");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (!confirm("Retirer la photo enregistrée sur le serveur ?")) return;
    setUploading(true);
    try {
      const res = await fetch("/api/cannes/coiffeur/profile-photo", { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error || "Suppression impossible");
        return;
      }
      setPhotoUrl(null);
      toast.success("Photo retirée");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
      <h2 className="font-[Spectral] text-2xl text-[#1A1110]">Photo coiffeur (page publique)</h2>

      {!cloudinaryReady && (
        <p className="mt-3 text-sm text-amber-900/80 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          Cloudinary n&apos;est pas configuré sur ce déploiement ({`CLOUDINARY_*`}). Configure les clés pour activer
          l&apos;upload ; en attendant, utilise uniquement la variable{' '}
          <code className="text-xs">NEXT_PUBLIC_CANNES_COIFFEUR_PROFILE_IMAGE_URL</code>.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-start gap-6">
        <div className="shrink-0">
          {loading ? (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-[#E5E0D8] bg-[#FDFBF8] text-xs text-[#1A1110]/45">
              …
            </div>
          ) : photoUrl ? (
            <img
              src={photoUrl}
              alt="Aperçu portrait coiffeur"
              className="h-28 w-28 rounded-2xl border border-[#E5E0D8] object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-dashed border-[#C08B8B]/40 bg-[#FDF8F6] text-2xl text-[#1A1110]/35">
              ✂
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!cloudinaryReady || uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-[#1A1110] px-4 py-2.5 text-sm font-medium text-[#F5EBE0] hover:bg-[#C08B8B] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading && !cropModalOpen ? "Envoi…" : "Choisir une image"}
            </button>
            <button
              type="button"
              disabled={!photoUrl || uploading}
              onClick={() => void removePhoto()}
              className="rounded-lg border border-[#E5E0D8] px-4 py-2.5 text-sm text-[#7A3535] hover:bg-[#FFF3F3] disabled:opacity-40"
            >
              Retirer la photo serveur
            </button>
          </div>
          <p className="text-xs text-[#1A1110]/50">
            Après le choix du fichier, un recadrage carré (comme sur la page publique) : zoom et position, puis envoi au
            serveur.
          </p>
        </div>
      </div>

      <Modal open={cropModalOpen} title="Recadrer la photo" onClose={() => closeCropModal()}>
        <div className="space-y-4">
          <p className="text-xs text-[#1A1110]/55">
            Format carré recommandé pour l&apos;encart portrait. Déplace l&apos;image et utilise le zoom pour cadrer.
          </p>
          {cropSrc && (
            <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl bg-[#1A1110]">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs text-[#1A1110]/60">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[#C08B8B]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => closeCropModal()}
              className="rounded-lg border border-[#E5E0D8] px-4 py-2 text-sm text-[#1A1110]"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={uploading || !croppedAreaPixels}
              onClick={() => void applyCropAndUpload()}
              className="rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-[#F5EBE0] hover:bg-[#C08B8B] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Envoi…" : "Valider et envoyer"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
