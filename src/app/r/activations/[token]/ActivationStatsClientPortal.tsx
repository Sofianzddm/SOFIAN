"use client";

import { useEffect, useState } from "react";
import {
  Lock,
  Loader2,
  Sparkles,
  ImageIcon,
  ArrowLeft,
  ChevronRight,
  X,
  ChevronLeft as ChevronLeftIcon,
} from "lucide-react";

interface Screenshot {
  id: string;
  imageUrl: string;
  label: string | null;
}

interface TalentBlock {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  instagram: string | null;
  screenshots: Screenshot[];
}

interface ReportData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  talents: TalentBlock[];
}

export default function ActivationStatsClientPortal({ token }: { token: string }) {
  const [meta, setMeta] = useState<{ name: string } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);

  // Talent selectionne (null = vue d'ensemble en grille)
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);

  // Lightbox screenshot
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/pub/activation-stats/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          setMetaError("Lien invalide ou expire");
          return;
        }
        const data = await r.json();
        setMeta({ name: data.name });
      })
      .catch(() => setMetaError("Impossible de joindre le serveur"))
      .finally(() => setMetaLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pub/activation-stats/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Mot de passe incorrect");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Erreur reseau");
    } finally {
      setSubmitting(false);
    }
  }

  if (metaLoading) {
    return (
      <div className="min-h-screen bg-glowup-lace/40 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="min-h-screen bg-glowup-lace/40 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold text-glowup-licorice mb-2">
            Lien indisponible
          </h1>
          <p className="text-sm text-gray-500">{metaError}</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-glowup-lace via-white to-glowup-lace/40 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-full bg-glowup-rose/10 text-glowup-rose flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-glowup-licorice text-center mb-1">
            {meta?.name}
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Saisis le mot de passe partage par Glow Up pour acceder aux stats de l'activation.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                autoFocus
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-glowup-rose/40 focus:border-glowup-rose font-mono text-center tracking-wide"
              />
              {error && (
                <p className="text-xs text-red-600 mt-2 text-center">{error}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full py-3 rounded-xl bg-glowup-rose text-white font-medium hover:bg-glowup-rose/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Acceder aux stats
            </button>
          </form>

          <p className="text-[11px] text-gray-400 text-center mt-6">
            Acces prive · Glow Up Agence
          </p>
        </div>
      </div>
    );
  }

  // Affichage du rapport
  const selectedTalent =
    selectedTalentId != null
      ? report.talents.find((t) => t.id === selectedTalentId) ?? null
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-glowup-lace/40 via-white to-white">
      <header className="max-w-5xl mx-auto px-6 pt-12 pb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-glowup-rose font-semibold mb-2">
          Glow Up Agence · Stats activation
        </p>
        <h1 className="text-4xl md:text-5xl font-bold text-glowup-licorice mb-2">
          {report.name}
        </h1>
        <p className="text-sm text-gray-500">
          {report.talents.length} talent{report.talents.length > 1 ? "s" : ""} ·
          {" "}Mis a jour le {new Date(report.updatedAt).toLocaleDateString("fr-FR")}
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-20">
        {report.talents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Les stats seront ajoutees prochainement.
            </p>
          </div>
        ) : selectedTalent ? (
          // Vue d'un talent : ses screenshots
          <section>
            <button
              onClick={() => setSelectedTalentId(null)}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-glowup-licorice mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour aux talents
            </button>

            <div className="flex items-center gap-4 mb-8">
              <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 ring-4 ring-white shadow-sm">
                {selectedTalent.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedTalent.photo}
                    alt={selectedTalent.prenom}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-gray-500">
                    {selectedTalent.prenom[0]}
                    {selectedTalent.nom[0]}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-3xl font-bold text-glowup-licorice">
                  {selectedTalent.prenom} {selectedTalent.nom}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-sm">
                  {selectedTalent.instagram && (
                    <a
                      href={`https://instagram.com/${selectedTalent.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-glowup-rose hover:underline"
                    >
                      @{selectedTalent.instagram}
                    </a>
                  )}
                  <span className="text-gray-400">
                    {selectedTalent.screenshots.length} stat
                    {selectedTalent.screenshots.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {selectedTalent.screenshots.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setLightboxIndex(idx)}
                  className="group block text-left bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="aspect-[3/4] bg-gray-50 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.imageUrl}
                      alt={s.label || "Stat"}
                      className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
                    />
                  </div>
                  {s.label && (
                    <div className="px-3 py-2 border-t border-gray-100">
                      <p className="text-xs text-gray-600 truncate">{s.label}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        ) : (
          // Vue d'ensemble : grille de talents cliquables
          <>
            <p className="text-sm text-gray-500 mb-6">
              Selectionne un talent pour voir ses stats.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {report.talents.map((talent) => {
                const preview = talent.screenshots[0];
                return (
                  <button
                    key={talent.id}
                    onClick={() => setSelectedTalentId(talent.id)}
                    className="group text-left bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-glowup-rose/30 transition-all"
                  >
                    {/* Preview du premier screenshot en fond */}
                    <div className="relative h-44 bg-gradient-to-br from-glowup-lace via-white to-glowup-lace/40">
                      {/* Wrapper qui clippe l'image, l'avatar reste dehors */}
                      <div className="absolute inset-0 overflow-hidden">
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview.imageUrl}
                            alt=""
                            className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-gray-300" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      </div>

                      {/* Avatar talent — hors du clip pour ne pas etre coupe */}
                      <div className="absolute -bottom-6 left-5 z-10">
                        <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden ring-4 ring-white shadow-md">
                          {talent.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={talent.photo}
                              alt={talent.prenom}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-gray-500">
                              {talent.prenom[0]}
                              {talent.nom[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 pt-9 pb-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-glowup-licorice truncate">
                            {talent.prenom} {talent.nom}
                          </h3>
                          {talent.instagram && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              @{talent.instagram}
                            </p>
                          )}
                          <p className="text-xs text-glowup-rose font-medium mt-2">
                            {talent.screenshots.length} stat
                            {talent.screenshots.length > 1 ? "s" : ""} disponible
                            {talent.screenshots.length > 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-glowup-lace/60 group-hover:bg-glowup-rose group-hover:text-white text-glowup-rose flex items-center justify-center flex-shrink-0 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-gray-100 py-6 text-center">
        <p className="text-xs text-gray-400">
          Glow Up Agence · Document confidentiel
        </p>
      </footer>

      {/* Lightbox */}
      {selectedTalent && lightboxIndex !== null && (
        <Lightbox
          screenshots={selectedTalent.screenshots}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function Lightbox({
  screenshots,
  index,
  onIndexChange,
  onClose,
}: {
  screenshots: Screenshot[];
  index: number;
  onIndexChange: (i: number | null) => void;
  onClose: () => void;
}) {
  const current = screenshots[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < screenshots.length - 1)
        onIndexChange(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, screenshots.length, onIndexChange, onClose]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Fermer"
      >
        <X className="w-5 h-5" />
      </button>

      {index > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index - 1);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Precedent"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
      )}
      {index < screenshots.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index + 1);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Suivant"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      <div
        className="relative max-w-5xl max-h-full flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.imageUrl}
          alt={current.label || "Stat"}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
        {current.label && (
          <p className="text-sm text-white/80 mt-3 text-center">{current.label}</p>
        )}
        <p className="text-xs text-white/50 mt-2">
          {index + 1} / {screenshots.length}
        </p>
      </div>
    </div>
  );
}
