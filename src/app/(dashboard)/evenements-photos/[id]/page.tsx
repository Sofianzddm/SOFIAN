"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { talentSlug } from "@/lib/talent-slug";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  ImageIcon,
  ImagePlus,
  Link2,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";

interface TalentOption {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
}

interface Photo {
  id: string;
  imageUrl: string;
  position: number;
  talentIds: string[];
  talents: { id: string; prenom: string; nom: string }[];
}

interface EventDetail {
  id: string;
  nom: string;
  slug: string | null;
  date: string | null;
  lieu: string | null;
  logoUrl: string | null;
  photos: Photo[];
}

interface TalentLink {
  talentId: string;
  prenom: string;
  nom: string;
  slug: string;
  path: string;
  photoCount: number;
}

export default function EvenementPhotosDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id as string;
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadingTotal, setUploadingTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [links, setLinks] = useState<TalentLink[] | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  // Liens ajoutés manuellement (talents pas encore tagués sur une photo)
  const [manualLinkIds, setManualLinkIds] = useState<string[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  // Talents récemment identifiés (les plus récents en tête) + dernière sélection
  // appliquée, pour gagner du temps quand les mêmes personnes reviennent.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [lastSelection, setLastSelection] = useState<string[]>([]);
  // Édition des infos de l'événement
  const [editing, setEditing] = useState(false);
  const [editNom, setEditNom] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editLieu, setEditLieu] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Filtre d'affichage : toutes les photos ou seulement les non identifiées
  const [filterUntagged, setFilterUntagged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/photo-events/${eventId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setEvent(data.event);
      setTalentOptions(data.talentOptions || []);

      // Initialise "récents" depuis les photos déjà taguées (plus récentes d'abord)
      const photos: Photo[] = data.event?.photos || [];
      const recent: string[] = [];
      for (let i = photos.length - 1; i >= 0; i--) {
        for (const id of photos[i].talentIds) {
          if (!recent.includes(id)) recent.push(id);
        }
      }
      setRecentIds(recent);
      const lastTagged = [...photos]
        .reverse()
        .find((p) => p.talentIds.length > 0);
      setLastSelection(lastTagged ? lastTagged.talentIds : []);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger l'événement");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (role === "ADMIN" && eventId) load();
    else if (status !== "loading") setLoading(false);
  }, [role, status, eventId, load]);

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await fetch(`/api/photo-events/${eventId}/talent-links`);
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setLinks(data.links || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLinks(false);
    }
  }, [eventId]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const images = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (images.length === 0) return;

      setError(null);
      setUploadingTotal(images.length);
      setUploadCount(0);

      for (const file of images) {
        try {
          const sigRes = await fetch("/api/photo-events/upload-signature", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId }),
          });
          if (!sigRes.ok) throw new Error("signature");
          const { signature, timestamp, folder, publicId, cloudName, apiKey } =
            await sigRes.json();

          const fd = new FormData();
          fd.append("file", file);
          fd.append("signature", signature);
          fd.append("timestamp", String(timestamp));
          fd.append("folder", folder);
          fd.append("public_id", publicId);
          fd.append("api_key", apiKey);

          const cloudRes = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            { method: "POST", body: fd }
          );
          if (!cloudRes.ok) throw new Error("cloudinary");
          const { secure_url } = await cloudRes.json();

          const addRes = await fetch(
            `/api/photo-events/${eventId}/photos`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrl: secure_url }),
            }
          );
          if (!addRes.ok) throw new Error("add");
          const { photo } = await addRes.json();
          setEvent((prev) =>
            prev ? { ...prev, photos: [...prev.photos, photo] } : prev
          );
        } catch (e) {
          console.error("Upload échoué:", e);
          setError("Une ou plusieurs photos n'ont pas pu être ajoutées.");
        } finally {
          setUploadCount((c) => c + 1);
        }
      }

      setUploadingTotal(0);
      setUploadCount(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Les liens peuvent avoir changé
      if (links) loadLinks();
    },
    [eventId, links, loadLinks]
  );

  const updateTags = useCallback(
    async (photoId: string, talentIds: string[]) => {
      // Mémorise les récents (plus récents en tête) + la dernière sélection
      if (talentIds.length > 0) {
        setRecentIds((prev) =>
          Array.from(new Set([...talentIds, ...prev]))
        );
        setLastSelection(talentIds);
      }
      // Optimiste
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              photos: prev.photos.map((p) =>
                p.id === photoId
                  ? {
                      ...p,
                      talentIds,
                      talents: talentIds.map((id) => {
                        const t = talentOptions.find((o) => o.id === id);
                        return {
                          id,
                          prenom: t?.prenom || "",
                          nom: t?.nom || "",
                        };
                      }),
                    }
                  : p
              ),
            }
          : prev
      );
      try {
        await fetch(`/api/photo-events/${eventId}/photos/${photoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talentIds }),
        });
        if (links) loadLinks();
      } catch (e) {
        console.error(e);
      }
    },
    [eventId, talentOptions, links, loadLinks]
  );

  const startEditing = useCallback(() => {
    if (!event) return;
    setEditNom(event.nom);
    setEditDate(event.date ? event.date.slice(0, 10) : "");
    setEditLieu(event.lieu || "");
    setEditLogoUrl(event.logoUrl);
    setEditing(true);
  }, [event]);

  const uploadLogo = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      setLogoUploading(true);
      setError(null);
      try {
        const sigRes = await fetch("/api/photo-events/upload-signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
        if (!sigRes.ok) throw new Error("signature");
        const { signature, timestamp, folder, publicId, cloudName, apiKey } =
          await sigRes.json();
        const fd = new FormData();
        fd.append("file", file);
        fd.append("signature", signature);
        fd.append("timestamp", String(timestamp));
        fd.append("folder", folder);
        fd.append("public_id", publicId);
        fd.append("api_key", apiKey);
        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: "POST", body: fd }
        );
        if (!cloudRes.ok) throw new Error("cloudinary");
        const { secure_url } = await cloudRes.json();
        setEditLogoUrl(secure_url);
      } catch (e) {
        console.error(e);
        setError("Échec de l'upload du logo.");
      } finally {
        setLogoUploading(false);
      }
    },
    [eventId]
  );

  const saveEdit = useCallback(async () => {
    if (!editNom.trim() || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/photo-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: editNom.trim(),
          date: editDate || null,
          lieu: editLieu.trim() || null,
          logoUrl: editLogoUrl || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erreur");
      }
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              nom: editNom.trim(),
              date: editDate ? new Date(editDate).toISOString() : null,
              lieu: editLieu.trim() || null,
              logoUrl: editLogoUrl || null,
            }
          : prev
      );
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingEdit(false);
    }
  }, [eventId, editNom, editDate, editLieu, editLogoUrl, savingEdit]);

  const deletePhoto = useCallback(
    async (photoId: string) => {
      if (!window.confirm("Supprimer cette photo ?")) return;
      setEvent((prev) =>
        prev
          ? { ...prev, photos: prev.photos.filter((p) => p.id !== photoId) }
          : prev
      );
      try {
        await fetch(`/api/photo-events/${eventId}/photos/${photoId}`, {
          method: "DELETE",
        });
        if (links) loadLinks();
      } catch (e) {
        console.error(e);
      }
    },
    [eventId, links, loadLinks]
  );

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (role !== "ADMIN") {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Accès réservé</h1>
        <p className="text-gray-500 mt-2">
          Ce module est réservé aux administrateurs.
        </p>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          Événement introuvable
        </h1>
        <Link
          href="/evenements-photos"
          className="text-glowup-rose hover:underline mt-3 inline-block"
        >
          ← Retour aux événements
        </Link>
      </div>
    );
  }

  const recentTalents = recentIds
    .map((id) => talentOptions.find((o) => o.id === id))
    .filter((o): o is TalentOption => Boolean(o))
    .slice(0, 10);

  const untaggedCount = event.photos.filter(
    (p) => p.talentIds.length === 0
  ).length;
  const displayedPhotos = filterUntagged
    ? event.photos.filter((p) => p.talentIds.length === 0)
    : event.photos;

  // Liens affichés = talents tagués (API) + ajouts manuels (sans doublon)
  const apiLinkIds = new Set((links ?? []).map((l) => l.talentId));
  const manualLinks: TalentLink[] = manualLinkIds
    .filter((id) => !apiLinkIds.has(id))
    .map((id) => {
      const t = talentOptions.find((o) => o.id === id);
      if (!t) return null;
      const slug = talentSlug(t.prenom, t.nom);
      return {
        talentId: t.id,
        prenom: t.prenom,
        nom: t.nom,
        slug,
        path: `/photos/${slug}`,
        photoCount: 0,
      };
    })
    .filter((l): l is TalentLink => Boolean(l));
  const combinedLinks = [...(links ?? []), ...manualLinks].sort((a, b) =>
    `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr")
  );
  const shownTalentIds = new Set(combinedLinks.map((l) => l.talentId));
  const addableTalents = talentOptions
    .filter((o) => !shownTalentIds.has(o.id))
    .filter((o) => {
      const q = linkSearch.trim().toLowerCase();
      if (!q) return false;
      return `${o.prenom} ${o.nom}`.toLowerCase().includes(q);
    })
    .slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <Link
        href="/evenements-photos"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Tous les événements
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        {editing ? (
          <div className="w-full bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Nom de l&apos;événement *
              </label>
              <input
                type="text"
                value={editNom}
                onChange={(e) => setEditNom(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose outline-none text-sm"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Lieu
                </label>
                <input
                  type="text"
                  value={editLieu}
                  onChange={(e) => setEditLieu(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:border-glowup-rose focus:ring-1 focus:ring-glowup-rose outline-none text-sm"
                />
              </div>
            </div>

            {/* Logo de l'événement */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Logo de l&apos;événement
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                  {logoUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  ) : editLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editLogoUrl}
                      alt="logo"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-gray-300" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-glowup-rose cursor-pointer w-fit">
                    <ImagePlus className="w-4 h-4" />
                    {editLogoUrl ? "Changer le logo" : "Ajouter un logo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadLogo(e.target.files?.[0])}
                    />
                  </label>
                  {editLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setEditLogoUrl(null)}
                      className="text-xs text-red-500 hover:underline w-fit"
                    >
                      Retirer le logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingEdit || !editNom.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-glowup-rose text-white text-sm font-semibold disabled:opacity-50"
              >
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex items-center gap-4">
              {event.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.logoUrl}
                  alt={event.nom}
                  className="w-14 h-14 rounded-xl object-contain bg-white border border-gray-200 shrink-0"
                />
              )}
              <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 truncate">
                  {event.nom}
                </h1>
                <button
                  type="button"
                  onClick={startEditing}
                  className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 text-gray-500 hover:text-glowup-rose hover:border-glowup-rose"
                  title="Modifier l'événement"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {event.date &&
                  new Date(event.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                {event.date && event.lieu && " · "}
                {event.lieu}
              </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!links) loadLinks();
                const el = document.getElementById("links-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-glowup-licorice text-white text-sm font-semibold hover:opacity-90"
            >
              <Link2 className="w-4 h-4" />
              Liens des talents
            </button>
          </>
        )}
      </div>

      {/* Lien privé de l'événement (toutes les photos) */}
      {event.slug && <EventLinkBanner slug={event.slug} count={event.photos.length} />}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Zone d'upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadingTotal > 0}
        className="w-full mb-6 rounded-2xl border-2 border-dashed border-gray-300 hover:border-glowup-rose bg-white py-8 flex flex-col items-center justify-center text-gray-500 hover:text-glowup-rose transition-colors disabled:opacity-60"
      >
        {uploadingTotal > 0 ? (
          <>
            <Loader2 className="w-7 h-7 animate-spin mb-2" />
            <span className="text-sm font-medium">
              Upload {uploadCount}/{uploadingTotal}…
            </span>
          </>
        ) : (
          <>
            <ImagePlus className="w-7 h-7 mb-2" />
            <span className="text-sm font-medium">
              Ajouter des photos (sélection multiple possible)
            </span>
          </>
        )}
      </button>

      {/* Barre de filtre */}
      {event.photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setFilterUntagged(false)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !filterUntagged
                ? "bg-glowup-rose text-white"
                : "bg-white border border-gray-300 text-gray-600 hover:border-glowup-rose"
            }`}
          >
            Toutes ({event.photos.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterUntagged(true)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterUntagged
                ? "bg-amber-500 text-white"
                : "bg-white border border-gray-300 text-gray-600 hover:border-amber-500"
            }`}
          >
            {untaggedCount > 0 && !filterUntagged && (
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
            )}
            Non identifiées ({untaggedCount})
          </button>
        </div>
      )}

      {/* Grille de photos */}
      {event.photos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          Aucune photo pour le moment.
        </div>
      ) : displayedPhotos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-emerald-300 p-12 text-center text-emerald-600">
          Toutes les photos sont identifiées 🎉
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayedPhotos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              talentOptions={talentOptions}
              recentTalents={recentTalents}
              lastSelection={lastSelection}
              isPickerOpen={openPickerId === photo.id}
              onTogglePicker={() =>
                setOpenPickerId((id) => (id === photo.id ? null : photo.id))
              }
              onClosePicker={() => setOpenPickerId(null)}
              onChangeTags={(ids) => updateTags(photo.id, ids)}
              onDelete={() => deletePhoto(photo.id)}
            />
          ))}
        </div>
      )}

      {/* Liens personnels des talents */}
      <section id="links-section" className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-glowup-rose" />
            Liens personnels des talents
          </h2>
          <button
            type="button"
            onClick={loadLinks}
            className="text-sm text-glowup-rose hover:underline"
          >
            {links ? "Rafraîchir" : "Afficher"}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Chaque lien est privé (non indexé). Le talent y retrouve toutes les
          photos d&apos;événements où il est tagué. Tu peux aussi ajouter un
          talent pour partager son lien avant même d&apos;avoir ses photos.
        </p>

        {/* Ajouter un talent manuellement (même sans photo) */}
        <div className="relative mb-4 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Ajouter un talent (rechercher par nom)…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-glowup-rose"
            />
          </div>
          {addableTalents.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
              {addableTalents.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setManualLinkIds((ids) =>
                      ids.includes(o.id) ? ids : [...ids, o.id]
                    );
                    setLinkSearch("");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-glowup-lace/40"
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-glowup-lace text-glowup-licorice text-[11px] font-semibold shrink-0">
                    {o.prenom.charAt(0)}
                    {o.nom.charAt(0)}
                  </span>
                  <span className="truncate">
                    {o.prenom} {o.nom}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {loadingLinks ? (
          <div className="flex items-center gap-2 text-gray-400 py-6">
            <Loader2 className="w-5 h-5 animate-spin" /> Chargement…
          </div>
        ) : combinedLinks.length === 0 ? (
          <p className="text-sm text-gray-400">
            {links === null
              ? "Clique sur « Afficher » ou ajoute un talent ci-dessus."
              : "Aucun talent pour le moment — ajoute-en un ci-dessus."}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {combinedLinks.map((l) => (
              <TalentLinkRow
                key={l.talentId}
                link={l}
                onRemove={
                  manualLinkIds.includes(l.talentId)
                    ? () =>
                        setManualLinkIds((ids) =>
                          ids.filter((id) => id !== l.talentId)
                        )
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PhotoCard({
  photo,
  talentOptions,
  recentTalents,
  lastSelection,
  isPickerOpen,
  onTogglePicker,
  onClosePicker,
  onChangeTags,
  onDelete,
}: {
  photo: Photo;
  talentOptions: TalentOption[];
  recentTalents: TalentOption[];
  lastSelection: string[];
  isPickerOpen: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onChangeTags: (ids: string[]) => void;
  onDelete: () => void;
}) {
  // Aperçu lisible des noms de la dernière sélection (pour le bouton rapide)
  const lastNames = lastSelection
    .map((id) => {
      const t = talentOptions.find((o) => o.id === id);
      return t ? t.prenom : null;
    })
    .filter(Boolean)
    .join(", ");
  const showApplyLast =
    photo.talentIds.length === 0 && lastSelection.length > 0;

  return (
    <div className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden group">
      <div className="relative aspect-square bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.imageUrl}
          alt=""
          className="w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 text-red-600 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
          title="Supprimer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[26px]">
          {photo.talents.length === 0 ? (
            <span className="text-xs text-gray-400">Aucun talent tagué</span>
          ) : (
            photo.talents.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-glowup-lace text-glowup-licorice text-xs font-medium"
              >
                {t.prenom} {t.nom}
              </span>
            ))
          )}
        </div>

        {showApplyLast && (
          <button
            type="button"
            onClick={() => onChangeTags(lastSelection)}
            className="w-full mb-1.5 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-glowup-lace text-glowup-licorice text-xs font-semibold hover:opacity-90"
            title={`Identifier : ${lastNames}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="truncate">Reprendre&nbsp;: {lastNames}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onTogglePicker}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:border-glowup-rose hover:text-glowup-rose"
        >
          <Tag className="w-3.5 h-3.5" />
          Taguer des talents
        </button>
      </div>

      {isPickerOpen && (
        <TalentPicker
          options={talentOptions}
          recentTalents={recentTalents}
          selectedIds={photo.talentIds}
          onChange={onChangeTags}
          onClose={onClosePicker}
        />
      )}
    </div>
  );
}

function TalentPicker({
  options,
  recentTalents,
  selectedIds,
  onChange,
  onClose,
}: {
  options: TalentOption[];
  recentTalents: TalentOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.prenom} ${o.nom}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="absolute inset-x-2 bottom-2 top-2 z-20 bg-white rounded-xl border border-gray-200 shadow-xl flex flex-col">
      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="flex-1 min-w-0 text-sm outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Accès rapide : derniers talents identifiés sur cet événement */}
      {recentTalents.length > 0 && (
        <div className="px-2 pt-2 pb-1 border-b border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Récemment identifiés
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recentTalents.map((o) => {
              const checked = selectedIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                    checked
                      ? "bg-glowup-rose border-glowup-rose text-white"
                      : "bg-white border-gray-300 text-gray-700 hover:border-glowup-rose"
                  }`}
                >
                  {checked && <Check className="w-3 h-3" />}
                  {o.prenom} {o.nom}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Aucun talent
          </p>
        ) : (
          filtered.map((o) => {
            const checked = selectedIds.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm ${
                  checked
                    ? "bg-glowup-lace text-glowup-licorice"
                    : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    checked
                      ? "bg-glowup-rose border-glowup-rose"
                      : "border-gray-300"
                  }`}
                >
                  {checked && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="truncate">
                  {o.prenom} {o.nom}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function EventLinkBanner({ slug, count }: { slug: string; count: number }) {
  const [copied, setCopied] = useState(false);
  const path = `/photos/event/${slug}`;
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-glowup-lace bg-glowup-lace/30 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-glowup-licorice">
            <Link2 className="w-4 h-4 text-glowup-rose shrink-0" />
            Lien de l&apos;événement
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Lien privé (non indexé) regroupant les {count} photo
            {count > 1 ? "s" : ""} de l&apos;événement.
          </p>
          <p className="mt-1.5 text-xs font-mono text-gray-600 truncate">
            {fullUrl}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-glowup-rose text-white text-xs font-semibold hover:opacity-90"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" /> Copié
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copier le lien
              </>
            )}
          </button>
          <a
            href={path}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 text-gray-500 hover:text-glowup-rose hover:border-glowup-rose bg-white"
            title="Ouvrir"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

function TalentLinkRow({
  link,
  onRemove,
}: {
  link: TalentLink;
  onRemove?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fullUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${link.path}`
      : link.path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 truncate">
          {link.prenom} {link.nom}
        </p>
        <p className="text-xs text-gray-400">
          {link.photoCount > 0
            ? `${link.photoCount} photo${link.photoCount > 1 ? "s" : ""} sur cet événement`
            : "Lien prêt à partager"}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 text-gray-400 hover:text-red-600 hover:border-red-300"
            title="Retirer de la liste"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glowup-rose text-white text-xs font-semibold hover:opacity-90"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copié
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copier le lien
            </>
          )}
        </button>
        <a
          href={link.path}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 text-gray-500 hover:text-glowup-rose hover:border-glowup-rose"
          title="Ouvrir"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
