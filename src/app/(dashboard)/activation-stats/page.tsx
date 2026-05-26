"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  Link2,
  Copy,
  Trash2,
  Users,
  ImageIcon,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface ReportRow {
  id: string;
  name: string;
  clientAccessToken: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; prenom: string; nom: string } | null;
  talentsCount: number;
  screenshotsCount: number;
  talents: { id: string; talentId: string; prenom: string; nom: string; photo: string | null }[];
}

export default function ActivationStatsListPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/activation-stats");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setReports(data.reports || []);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function copyLink(token: string) {
    const link = `${window.location.origin}/r/activations/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Lien copié");
  }

  async function deleteReport(id: string) {
    if (!confirm("Supprimer ce rapport ? Cette action est definitive.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/activation-stats/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Rapport supprimé");
      setReports((r) => r.filter((x) => x.id !== id));
    } catch {
      toast.error("Impossible de supprimer");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-glowup-licorice">Rapports stats activations</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Envoie a un client les stats screenshotees des talents d'une activation, via un lien protege par mot de passe.
          </p>
        </div>
        <Link
          href="/activation-stats/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-glowup-rose text-white hover:bg-glowup-rose/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau rapport
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-glowup-rose" />
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-glowup-licorice mb-1">
            Aucun rapport pour l'instant
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Cree un rapport pour partager des stats avec un client.
          </p>
          <Link
            href="/activation-stats/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-glowup-rose text-white hover:bg-glowup-rose/90"
          >
            <Plus className="w-4 h-4" />
            Creer le premier rapport
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <button
                  onClick={() => router.push(`/activation-stats/${r.id}`)}
                  className="flex-1 text-left"
                >
                  <h3 className="text-lg font-semibold text-glowup-licorice">{r.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Cree le {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                    {r.createdBy && ` · par ${r.createdBy.prenom} ${r.createdBy.nom}`}
                  </p>

                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-gray-400" />
                      {r.talentsCount} talent{r.talentsCount > 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-gray-400" />
                      {r.screenshotsCount} stat{r.screenshotsCount > 1 ? "s" : ""}
                    </span>
                  </div>

                  {r.talents.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                      {r.talents.slice(0, 6).map((t) => (
                        <div
                          key={t.id}
                          className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 overflow-hidden ring-1 ring-gray-100"
                          title={`${t.prenom} ${t.nom}`}
                        >
                          {t.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.photo}
                              alt={t.prenom}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-gray-500">
                              {t.prenom[0]}
                              {t.nom[0]}
                            </div>
                          )}
                        </div>
                      ))}
                      {r.talents.length > 6 && (
                        <span className="text-xs text-gray-400 ml-1">
                          +{r.talents.length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyLink(r.clientAccessToken)}
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    title="Copier le lien client"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <a
                    href={`/r/activations/${r.clientAccessToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    title="Ouvrir l'apercu client"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => deleteReport(r.id)}
                    disabled={deletingId === r.id}
                    className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    title="Supprimer"
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
