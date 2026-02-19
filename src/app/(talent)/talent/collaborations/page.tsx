"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Calendar,
  Building2,
  Loader2,
  ExternalLink,
  Upload,
  Package,
  FileText,
  ChevronRight,
  X,
  SlidersHorizontal,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  STORY: "Story",
  STORY_CONCOURS: "Story Concours",
  POST: "Post",
  POST_CONCOURS: "Post Concours",
  POST_COMMUN: "Post Commun",
  REEL: "Reel",
  TIKTOK_VIDEO: "Vidéo TikTok",
  YOUTUBE_VIDEO: "Vidéo YouTube",
  YOUTUBE_SHORT: "YouTube Short",
  EVENT: "Event",
  SHOOTING: "Shooting",
  AMBASSADEUR: "Ambassadeur",
};

const STATUS_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "EN_COURS", label: "En cours" },
  { value: "PUBLIE", label: "Publié" },
  { value: "FACTURE_RECUE", label: "Facture reçue" },
  { value: "PAYE", label: "Payé" },
];

export default function TalentCollaborationsPage() {
  const [collaborations, setCollaborations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "montant">("date");
  const [expandedCollab, setExpandedCollab] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [uploadingCollabId, setUploadingCollabId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    fetchCollaborations();
  }, []);

  async function fetchCollaborations() {
    try {
      const res = await fetch("/api/talents/me/collaborations");
      if (res.ok) setCollaborations(await res.json());
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  async function uploadFacture() {
    if (!selectedFile || !uploadingCollabId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch(`/api/collaborations/${uploadingCollabId}/upload-facture-talent`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setUploadingCollabId(null);
        setSelectedFile(null);
        fetchCollaborations();
      } else {
        const error = await res.json();
        alert(`❌ ${error.error || "Erreur lors de l'upload"}`);
      }
    } catch (error) {
      console.error("Erreur upload:", error);
      alert("❌ Erreur lors de l'upload de la facture");
    } finally {
      setUploading(false);
    }
  }

  const filteredCollabs = collaborations.filter((collab) => {
    const matchSearch =
      collab.marque?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collab.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === "all" || collab.statut === statusFilter;
    return matchSearch && matchStatus;
  });

  const sortedCollabs = [...filteredCollabs].sort((a, b) => {
    if (sortBy === "date") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return b.montant - a.montant;
  });

  const getStatusConfig = (statut: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      EN_COURS: { label: "En cours", className: "bg-slate-100 text-slate-600" },
      PUBLIE: { label: "Publié", className: "bg-indigo-500/10 text-indigo-600" },
      FACTURE_RECUE: { label: "Facture reçue", className: "bg-amber-500/10 text-amber-600" },
      PAYE: { label: "Payé", className: "bg-emerald-500/10 text-emerald-600" },
      NEGO: { label: "Négociation", className: "bg-amber-500/10 text-amber-600" },
    };
    return configs[statut] || { label: statut, className: "bg-slate-100 text-slate-600" };
  };

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(pdf|jpg|jpeg|png)$/i.test(file.name)) setSelectedFile(file);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header minimal */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Collaborations
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {collaborations.length} collaboration{collaborations.length > 1 ? "s" : ""} au total
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border-0 bg-slate-50 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
              showFilters ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtres
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "montant")}
            className="h-10 rounded-lg border-0 bg-slate-50 px-4 text-sm text-slate-700 focus:ring-2 focus:ring-slate-200"
          >
            <option value="date">Plus récent</option>
            <option value="montant">Montant</option>
          </select>
        </div>
      </div>

      {/* Filtres dépliables */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                statusFilter === opt.value
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-slate-100/80 p-6">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="h-12 w-12 rounded-lg bg-slate-200" />
                  <div className="space-y-2">
                    <div className="h-5 w-40 rounded bg-slate-200" />
                    <div className="h-4 w-24 rounded bg-slate-200" />
                  </div>
                </div>
                <div className="h-6 w-20 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedCollabs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-24">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Package className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-base font-medium text-slate-900">Aucune collaboration</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-slate-500">
            Tes collaborations apparaîtront ici dès leur création par ton Talent Manager.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedCollabs.map((collab) => {
            const status = getStatusConfig(collab.statut);
            const needsInvoice = collab.statut === "PUBLIE" && !collab.factureTalentUrl;
            const isExpanded = expandedCollab === collab.id;

            return (
              <div
                key={collab.id}
                className={`group overflow-hidden rounded-xl bg-white ring-1 ring-slate-200/60 transition-all duration-200 hover:ring-slate-300 ${
                  needsInvoice ? "ring-amber-200" : ""
                }`}
              >
                <div
                  className="flex cursor-pointer flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setExpandedCollab(isExpanded ? null : collab.id)}
                >
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-slate-100">
                      <Building2 className="h-5 w-5 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{collab.marque}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                        {collab.datePublication && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(collab.datePublication).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" />
                          {collab.livrables?.length || 0} livrable{(collab.livrables?.length || 0) > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-4">
                    <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900">
                      {formatMoney(collab.montant)}
                    </span>
                    <ChevronRight
                      className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Section dépliée */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap gap-3">
                        {collab.lienPublication && (
                          <a
                            href={collab.lienPublication}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Voir la publication
                          </a>
                        )}
                      </div>
                    </div>

                    {collab.livrables?.length > 0 && (
                      <div className="mt-4">
                        <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                          Livrables
                        </h4>
                        <div className="space-y-2">
                          {collab.livrables.map((livrable: any, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200/60"
                            >
                              <span className="font-medium text-slate-900">
                                {livrable.quantite}x {TYPE_LABELS[livrable.typeContenu] || livrable.typeContenu}
                              </span>
                              {livrable.description && (
                                <span className="text-sm text-slate-500">{livrable.description}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action facture */}
                    {needsInvoice && (
                      <div
                        className="mt-4 flex flex-col gap-4 rounded-lg bg-amber-50/80 p-4 ring-1 ring-amber-200/60 sm:flex-row sm:items-center sm:justify-between"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                            <Upload className="h-4 w-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-medium text-amber-900">Facture requise</p>
                            <p className="text-sm text-amber-700">Envoie ta facture pour être payé</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setUploadingCollabId(collab.id)}
                          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                        >
                          Envoyer ma facture
                        </button>
                      </div>
                    )}

                    {collab.factureTalentUrl && (
                      <div
                        className="mt-4 flex items-center justify-between rounded-lg bg-emerald-50/80 p-4 ring-1 ring-emerald-200/60"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                            <FileText className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-medium text-emerald-900">Facture envoyée</p>
                            <p className="text-sm text-emerald-700">
                              {collab.factureValidee ? "Validation en cours" : "En attente"}
                            </p>
                          </div>
                        </div>
                        <a
                          href={collab.factureTalentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          Voir →
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal upload */}
      {uploadingCollabId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Envoyer ta facture</h3>
                <button
                  onClick={() => {
                    setUploadingCollabId(null);
                    setSelectedFile(null);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="mb-4 text-sm text-slate-500">PDF, JPG ou PNG — max 10 Mo</p>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all ${
                  dragOver ? "border-slate-400 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2 p-8">
                    <FileText className="h-10 w-10 text-emerald-500" />
                    <p className="truncate max-w-full px-2 text-sm font-medium text-slate-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500">Cliquer pour changer</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 p-8">
                    <Upload className="h-10 w-10 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">Glisser ou cliquer</p>
                    <p className="text-xs text-slate-500">pour sélectionner un fichier</p>
                  </div>
                )}
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => {
                    setUploadingCollabId(null);
                    setSelectedFile(null);
                  }}
                  disabled={uploading}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={uploadFacture}
                  disabled={!selectedFile || uploading}
                  className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    "Envoyer"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
