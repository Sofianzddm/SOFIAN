"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Plus,
  MoreHorizontal,
  UserCircle2,
  Snowflake,
  MessageCircle,
  CalendarClock,
} from "lucide-react";

type FichierProspection = {
  id: string;
  titre: string;
  mois: number;
  annee: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
  _count: {
    contacts: number;
  };
  contactsGagnes: number;
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
  if (percent < 50) return "bg-[#C08B8B]"; // Old Rose
  if (percent < 100) return "bg-orange-400";
  return "bg-[#C8F285]"; // Tea Green
}

export default function ProspectionListPage() {
  const { data: session } = useSession();
  const [fichiers, setFichiers] = useState<FichierProspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [titre, setTitre] = useState("");
  const [error, setError] = useState<string | null>(null);

  const role = (session?.user as any)?.role as string | undefined;
  const isAdminOrHeadOfInfluence =
    role === "ADMIN" || role === "HEAD_OF_INFLUENCE";

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/prospection");
        if (!res.ok) {
          throw new Error("Erreur de chargement");
        }
        const data = await res.json();
        setFichiers(data.fichiers || []);
      } catch (e) {
        setError("Impossible de charger les fichiers de prospection.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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

  const openModal = () => {
    setTitre(defaultTitre);
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
          user: fichier.user,
          _count: { contacts: 0 },
          contactsGagnes: 0,
        },
        ...prev,
      ]);
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
      setMenuOpenId(null);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      const now = new Date();
      const mois = now.getMonth() + 1;
      const annee = now.getFullYear();
      const res = await fetch("/api/prospection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: titre.trim() || undefined,
          mois,
          annee,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la création");
      }
      const created = await res.json();
      setFichiers((prev) => [
        {
          id: created.id,
          titre: created.titre,
          mois: created.mois,
          annee: created.annee,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          user: {
            id: (session?.user as any)?.id || "",
            name: session?.user?.name || "",
            image: null,
          },
          _count: { contacts: 0 },
          contactsGagnes: 0,
        },
        ...prev,
      ]);
      setModalOpen(false);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1110] font-['Spectral',serif]">
            Fichiers de prospection
          </h1>
          <p className="text-sm text-gray-500">
            Suivez vos leads mois par mois, simplement.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          {isAdminOrHeadOfInfluence && (
            <span className="hidden sm:inline-flex text-xs text-gray-500">
              Vue globale de l&apos;équipe
            </span>
          )}
          <button
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#C8F285] text-[#1A1110] text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
          >
            <Plus className="w-4 h-4" />
            Nouveau fichier de prospection
          </button>
        </div>
      </div>

      {/* Grille fichiers */}
      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Chargement des fichiers de prospection...
        </div>
      ) : fichiers.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-gray-200 rounded-2xl bg-white">
          <p className="text-sm text-gray-600 mb-2">
            Aucun fichier de prospection pour le moment.
          </p>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#C8F285] text-[#1A1110] text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
          >
            <Plus className="w-4 h-4" />
            Créer mon premier fichier
          </button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {fichiers.map((fichier) => {
            const total = fichier._count.contacts;
            const gagnes = fichier.contactsGagnes;
            const ratio = total > 0 ? Math.round((gagnes / total) * 100) : 0;
            const barColor = getProgressColor(ratio);

            return (
              <Link
                key={fichier.id}
                href={`/prospection/${fichier.id}`}
                className="group relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#F5EBE0] flex items-center justify-center text-[#1A1110]">
                      <UserCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1A1110] line-clamp-2">
                        {fichier.titre}
                      </p>
                      <p className="text-xs text-gray-500">
                        {fichier.user.name || "Talent Manager"}
                      </p>
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpenId((current) =>
                          current === fichier.id ? null : fichier.id
                        );
                      }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuOpenId === fichier.id && (
                      <div
                        className="absolute right-0 mt-1 w-44 rounded-xl border border-gray-100 bg-white shadow-lg z-10"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleDuplicate(fichier)}
                          disabled={duplicatingId === fichier.id || deletingId === fichier.id}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-t-xl disabled:opacity-60"
                        >
                          <span>Dupliquer ce fichier</span>
                          {duplicatingId === fichier.id && (
                            <span className="h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(fichier)}
                          disabled={deletingId === fichier.id || duplicatingId === fichier.id}
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

      {/* Modale création */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#1A1110] mb-2 font-['Spectral',serif]">
              Nouveau fichier de prospection
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Créez un fichier mensuel pour suivre vos prises de contact.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">
                Titre du fichier
              </label>
              <input
                type="text"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285] focus:border-transparent"
                placeholder={defaultTitre}
              />
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-500">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  if (!creating) setModalOpen(false);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
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
    </div>
  );
}

