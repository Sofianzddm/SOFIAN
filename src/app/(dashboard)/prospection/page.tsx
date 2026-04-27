"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Plus,
  MoreHorizontal,
  UserCircle2,
  Snowflake,
  MessageCircle,
  CalendarClock,
  FolderPlus,
  FolderOpen,
  Trash2,
} from "lucide-react";

type DossierProspection = {
  id: string;
  nom: string;
  fichierCount: number;
};

type FichierProspection = {
  id: string;
  titre: string;
  mois: number;
  annee: number;
  createdAt: string;
  updatedAt: string;
  dossierId: string | null;
  dossier: { id: string; nom: string } | null;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
  _count: {
    contacts: number;
  };
  contactsGagnes: number;
  statusCounts?: {
    gagne: number;
    enCours: number;
    perdu: number;
  };
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProgressColor(percent: number) {
  if (percent <= 0) return "bg-gray-200";
  if (percent < 50) return "bg-[#C08B8B]";
  if (percent < 100) return "bg-orange-400";
  return "bg-[#C8F285]";
}

type FilterKey = "all" | "none" | string;

export default function ProspectionListPage() {
  const { data: session, status } = useSession();
  const [fichiers, setFichiers] = useState<FichierProspection[]>([]);
  const [dossiers, setDossiers] = useState<DossierProspection[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dossierModalOpen, setDossierModalOpen] = useState(false);
  const [nouveauDossierNom, setNouveauDossierNom] = useState("");
  const [creatingDossier, setCreatingDossier] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingDossierId, setDeletingDossierId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const [titre, setTitre] = useState("");
  const [createDossierId, setCreateDossierId] = useState<string | "">("");
  const [error, setError] = useState<string | null>(null);

  const role = (session?.user as any)?.role as string | undefined;
  const isAdminOrHeadOfInfluence =
    role === "ADMIN" || role === "HEAD_OF_INFLUENCE";

  const loadData = useCallback(async () => {
    const res = await fetch("/api/prospection", {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof data.error === "string" && data.error
          ? data.error
          : `Erreur ${res.status}`;
      throw new Error(msg);
    }
    setFichiers(Array.isArray(data.fichiers) ? data.fichiers : []);
    setDossiers(Array.isArray(data.dossiers) ? data.dossiers : []);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setLoading(false);
      setFichiers([]);
      setDossiers([]);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadData();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Impossible de charger les fichiers de prospection."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [status, loadData]);

  const defaultTitre = useMemo(() => {
    const now = new Date();
    const moisLabel = now
      .toLocaleDateString("fr-FR", { month: "long" })
      .replace(/^\p{Letter}/u, (c) => c.toUpperCase());
    const prenom =
      (session?.user as any)?.prenom ||
      (session?.user?.name || "").split(" ")[0] ||
      "Moi";
    return `${prenom} - ${moisLabel} ${now.getFullYear()}`;
  }, [session]);

  const fichiersVisibles = useMemo(() => {
    if (!isAdminOrHeadOfInfluence) return fichiers;
    if (filter === "all") return fichiers;
    if (filter === "none") return fichiers.filter((f) => !f.dossierId);
    return fichiers.filter((f) => f.dossierId === filter);
  }, [fichiers, filter, isAdminOrHeadOfInfluence]);

  const openModal = () => {
    setTitre(defaultTitre);
    setCreateDossierId("");
    setError(null);
    setModalOpen(true);
  };

  const handleDuplicate = async (fichier: FichierProspection) => {
    try {
      setDuplicatingId(fichier.id);
      setError(null);
      const res = await fetch(`/api/prospection/${fichier.id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "Erreur lors de la duplication du fichier"
        );
      }
      const duplicated = await res.json();
      setFichiers((prev) => [
        {
          id: duplicated.id,
          titre: duplicated.titre,
          mois: duplicated.mois,
          annee: duplicated.annee,
          createdAt: duplicated.createdAt,
          updatedAt: duplicated.updatedAt,
          dossierId: fichier.dossierId,
          dossier: fichier.dossier,
          user: fichier.user,
          _count: { contacts: 0 },
          contactsGagnes: 0,
        },
        ...prev,
      ]);
      await loadData();
      setMenuOpenId(null);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la duplication");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (fichier: FichierProspection) => {
    const confirmed = window.confirm(
      `Supprimer le fichier "${fichier.titre}" et toutes ses opportunités ?`
    );
    if (!confirmed) return;

    try {
      setDeletingId(fichier.id);
      setError(null);
      const res = await fetch(`/api/prospection/${fichier.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "Erreur lors de la suppression du fichier"
        );
      }
      setFichiers((prev) => prev.filter((f) => f.id !== fichier.id));
      await loadData();
      setMenuOpenId(null);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMoveFichier = async (
    fichier: FichierProspection,
    dossierId: string | null
  ) => {
    try {
      setError(null);
      const res = await fetch(`/api/prospection/${fichier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Impossible de déplacer le fichier");
      }
      await loadData();
      setMenuOpenId(null);
      setMoveMenuId(null);
    } catch (e: any) {
      setError(e.message || "Erreur lors du déplacement");
    }
  };

  const handleCreateDossier = async () => {
    const nom = nouveauDossierNom.trim();
    if (!nom) {
      setError("Indiquez un nom de dossier");
      return;
    }
    try {
      setCreatingDossier(true);
      setError(null);
      const res = await fetch("/api/prospection/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Création impossible"
        );
      }
      setDossiers((prev) => [
        ...prev,
        {
          id: data.id,
          nom: data.nom,
          fichierCount: data.fichierCount ?? 0,
        },
      ]);
      setNouveauDossierNom("");
      setDossierModalOpen(false);
      setFilter(data.id);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la création du dossier");
    } finally {
      setCreatingDossier(false);
    }
  };

  const handleDeleteDossier = async (d: DossierProspection) => {
    const ok = window.confirm(
      `Supprimer le dossier « ${d.nom} » ? Les fichiers resteront accessibles (hors dossier).`
    );
    if (!ok) return;
    try {
      setDeletingDossierId(d.id);
      setError(null);
      const res = await fetch(`/api/prospection/dossiers/${d.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Suppression impossible");
      }
      if (filter === d.id) setFilter("all");
      await loadData();
    } catch (e: any) {
      setError(e.message || "Erreur lors de la suppression du dossier");
    } finally {
      setDeletingDossierId(null);
    }
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      const now = new Date();
      const mois = now.getMonth() + 1;
      const annee = now.getFullYear();
      const body: Record<string, unknown> = {
        titre: titre.trim() || undefined,
        mois,
        annee,
      };
      if (createDossierId) {
        body.dossierId = createDossierId;
      }
      const res = await fetch("/api/prospection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la création");
      }
      await loadData();
      setModalOpen(false);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1110] font-['Spectral',serif]">
            Fichiers de prospection
          </h1>
          <p className="text-sm text-gray-500">
            {isAdminOrHeadOfInfluence
              ? "Classez vos fichiers par dossiers et suivez vos leads mois par mois."
              : "Suivez vos prises de contact et vos leads mois par mois."}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          {isAdminOrHeadOfInfluence && (
            <span className="hidden sm:inline-flex text-xs text-gray-500">
              Vue globale de l&apos;équipe
            </span>
          )}
          {isAdminOrHeadOfInfluence && (
            <button
              type="button"
              onClick={() => {
                setNouveauDossierNom("");
                setError(null);
                setDossierModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white text-[#1A1110] text-sm font-medium shadow-sm hover:bg-gray-50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              Nouveau dossier
            </button>
          )}
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#C8F285] text-[#1A1110] text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
          >
            <Plus className="w-4 h-4" />
            Nouveau fichier
          </button>
        </div>
      </div>

      {!loading && isAdminOrHeadOfInfluence && fichiers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-[#1A1110] text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Tous ({fichiers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("none")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === "none"
                ? "bg-[#1A1110] text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Sans dossier (
            {fichiers.filter((f) => !f.dossierId).length})
          </button>
          {dossiers.map((d) => (
            <div key={d.id} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilter(d.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === d.id
                    ? "bg-[#C8F285] text-[#1A1110] border border-[#1A1110]/10"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 opacity-70" />
                {d.nom} ({d.fichierCount})
              </button>
              <button
                type="button"
                title="Supprimer le dossier"
                disabled={deletingDossierId === d.id}
                onClick={() => handleDeleteDossier(d)}
                className="p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deletingDossierId === d.id ? (
                  <span className="h-3.5 w-3.5 block rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Chargement des fichiers de prospection...
        </div>
      ) : fichiersVisibles.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-gray-200 rounded-2xl bg-white">
          <p className="text-sm text-gray-600 mb-2">
            {fichiers.length === 0
              ? "Aucun fichier de prospection pour le moment."
              : "Aucun fichier dans cette vue."}
          </p>
          {fichiers.length === 0 ? (
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#C8F285] text-[#1A1110] text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
            >
              <Plus className="w-4 h-4" />
              Créer mon premier fichier
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-sm text-[#1A1110] underline"
            >
              Voir tous les fichiers
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {fichiersVisibles.map((fichier) => {
            const total = fichier._count.contacts;
            const gagnes = fichier.statusCounts?.gagne ?? fichier.contactsGagnes;
            const enCours = fichier.statusCounts?.enCours ?? Math.max(total - gagnes, 0);
            const perdus = fichier.statusCounts?.perdu ?? 0;
            const ratio = total > 0 ? Math.round((gagnes / total) * 100) : 0;
            const barColor = getProgressColor(ratio);

            return (
              <Link
                key={fichier.id}
                href={`/prospection/${fichier.id}`}
                className="group relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#F5EBE0] flex items-center justify-center text-[#1A1110] shrink-0">
                      <UserCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1A1110] line-clamp-2">
                        {fichier.titre}
                      </p>
                      <p className="text-xs text-gray-500">
                        {fichier.user.name || "Talent Manager"}
                      </p>
                      {isAdminOrHeadOfInfluence && fichier.dossier && (
                        <p className="text-[11px] text-[#1A1110]/70 mt-0.5 inline-flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" />
                          {fichier.dossier.nom}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpenId((current) =>
                          current === fichier.id ? null : fichier.id
                        );
                        setMoveMenuId(null);
                      }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuOpenId === fichier.id && (
                      <div
                        className="absolute right-0 mt-1 w-52 rounded-xl border border-gray-100 bg-white shadow-lg z-20"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleDuplicate(fichier)}
                          disabled={
                            duplicatingId === fichier.id ||
                            deletingId === fichier.id
                          }
                          className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-t-xl disabled:opacity-60"
                        >
                          <span>Dupliquer ce fichier</span>
                          {duplicatingId === fichier.id && (
                            <span className="h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                          )}
                        </button>
                        {isAdminOrHeadOfInfluence && (
                          <div className="border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() =>
                                setMoveMenuId((m) =>
                                  m === fichier.id ? null : fichier.id
                                )
                              }
                              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                            >
                              <span>Déplacer vers…</span>
                              <span className="text-gray-400">▸</span>
                            </button>
                            {moveMenuId === fichier.id && (
                              <div className="bg-gray-50 px-2 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveFichier(fichier, null)
                                  }
                                  className="w-full text-left px-2 py-1.5 text-[11px] rounded-lg hover:bg-white text-gray-700"
                                >
                                  Sans dossier
                                </button>
                                {dossiers.map((d) => (
                                  <button
                                    key={d.id}
                                    type="button"
                                    onClick={() =>
                                      handleMoveFichier(fichier, d.id)
                                    }
                                    className="w-full text-left px-2 py-1.5 text-[11px] rounded-lg hover:bg-white text-gray-700"
                                  >
                                    {d.nom}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(fichier)}
                          disabled={
                            deletingId === fichier.id ||
                            duplicatingId === fichier.id
                          }
                          className="w-full flex items-center justify-between px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-b-xl disabled:opacity-60"
                        >
                          <span>Supprimer ce fichier</span>
                          {deletingId === fichier.id && (
                            <span className="h-3 w-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <Snowflake className="w-3 h-3 text-sky-400" />
                      <span>
                        {gagnes}/{total || 0}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="w-3 h-3 text-[#C08B8B]" />
                      <span>{total}</span>
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    {formatDate(fichier.updatedAt)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-[#C8F285]/30 px-2 py-0.5 text-[11px] text-[#1A1110]">
                    Gagné {gagnes}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                    En cours {enCours}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-600">
                    Perdu {perdus}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-gray-500">
                    <span>Taux de succès</span>
                    <span>{ratio}%</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#1A1110] mb-2 font-['Spectral',serif]">
              Nouveau fichier de prospection
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Créez un fichier mensuel pour suivre vos prises de contact.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">
                  Titre du fichier
                </label>
                <input
                  type="text"
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285] focus:border-transparent"
                  placeholder={defaultTitre}
                />
              </div>
              {isAdminOrHeadOfInfluence && dossiers.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-700">
                    Dossier (optionnel)
                  </label>
                  <select
                    value={createDossierId}
                    onChange={(e) => setCreateDossierId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285] focus:border-transparent bg-white"
                  >
                    <option value="">Aucun</option>
                    {dossiers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {error && modalOpen && (
              <p className="mt-2 text-xs text-red-500">{error}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!creating) setModalOpen(false);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C8F285] text-[#1A1110] text-xs font-medium shadow-sm hover:shadow-md disabled:opacity-60"
              >
                {creating && (
                  <span className="h-3 w-3 rounded-full border-2 border-[#1A1110]/40 border-t-transparent animate-spin" />
                )}
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {dossierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#1A1110] mb-2 font-['Spectral',serif]">
              Nouveau dossier
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Regroupez vos fichiers de prospection (ex. par marque, par trimestre).
            </p>
            <input
              type="text"
              value={nouveauDossierNom}
              onChange={(e) => setNouveauDossierNom(e.target.value)}
              placeholder="Nom du dossier"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285] focus:border-transparent"
              autoFocus
            />
            {error && dossierModalOpen && (
              <p className="mt-2 text-xs text-red-500">{error}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!creatingDossier) setDossierModalOpen(false);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateDossier}
                disabled={creatingDossier}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C8F285] text-[#1A1110] text-xs font-medium shadow-sm hover:shadow-md disabled:opacity-60"
              >
                {creatingDossier && (
                  <span className="h-3 w-3 rounded-full border-2 border-[#1A1110]/40 border-t-transparent animate-spin" />
                )}
                Créer le dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
