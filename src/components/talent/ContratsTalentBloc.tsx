"use client";

// Bloc "Contrats" de la fiche talent : glisser-déposer un PDF, placer les champs
// dans le builder DocuSeal embarqué, envoyer au talent en signature électronique
// (email personnalisé "Votre contrat Glow Up"), suivre les statuts.

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileSignature,
  Upload,
  Loader2,
  Trash2,
  Send,
  Download,
  Bell,
  Clock,
  CheckCircle2,
  PenLine,
  X,
} from "lucide-react";

type Contrat = {
  id: string;
  titre: string;
  statut: "BROUILLON" | "EN_ATTENTE_TALENT" | "EN_ATTENTE_AGENCE" | "SIGNE";
  fichierUrl: string;
  signedDocumentUrl: string | null;
  avecSignatureAgence: boolean;
  envoyeAt: string | null;
  talentSigneAt: string | null;
  signeAt: string | null;
  createdAt: string;
  createdBy?: { prenom: string; nom: string } | null;
};

const STATUT_UI: Record<
  Contrat["statut"],
  { label: string; className: string; icon: React.ReactNode }
> = {
  BROUILLON: {
    label: "Brouillon",
    className: "bg-gray-100 text-gray-600",
    icon: <PenLine className="w-3.5 h-3.5" />,
  },
  EN_ATTENTE_TALENT: {
    label: "En attente talent",
    className: "bg-amber-100 text-amber-700",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  EN_ATTENTE_AGENCE: {
    label: "En attente agence",
    className: "bg-blue-100 text-blue-700",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  SIGNE: {
    label: "Signé",
    className: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ContratsTalentBloc({
  talentId,
  talentEmail = "",
}: {
  talentId: string;
  talentEmail?: string;
}) {
  const router = useRouter();
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [titre, setTitre] = useState("");
  const [avecSignatureAgence, setAvecSignatureAgence] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Actions par contrat
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Relance : édition email avant renvoi
  const [relanceContratId, setRelanceContratId] = useState<string | null>(null);
  const [relanceEmail, setRelanceEmail] = useState("");

  const loadContrats = useCallback(async () => {
    try {
      const res = await fetch(`/api/talents/${talentId}/contrats`);
      const data = await res.json();
      if (res.ok) {
        setContrats(data.contrats ?? []);
      } else {
        setError(data.error || "Erreur de chargement");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [talentId]);

  useEffect(() => {
    loadContrats();
  }, [loadContrats]);

  // Polling léger tant qu'un contrat est en attente de signature
  useEffect(() => {
    const enAttente = contrats.some((c) =>
      ["EN_ATTENTE_TALENT", "EN_ATTENTE_AGENCE"].includes(c.statut)
    );
    if (!enAttente) return;
    const interval = setInterval(loadContrats, 30000);
    return () => clearInterval(interval);
  }, [contrats, loadContrats]);

  const selectFile = (file: File | null | undefined) => {
    setError(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Seuls les fichiers PDF sont acceptés");
      return;
    }
    setPendingFile(file);
    setTitre(file.name.replace(/\.pdf$/i, ""));
  };

  const handleUpload = async () => {
    if (!pendingFile || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("titre", titre.trim() || pendingFile.name.replace(/\.pdf$/i, ""));
      formData.append("avecSignatureAgence", String(avecSignatureAgence));
      const res = await fetch(`/api/talents/${talentId}/contrats`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        // Direction le builder pour placer les champs
        router.push(`/talents/${talentId}/contrats/${data.contrat.id}/builder`);
      } else {
        setError(data.error || "Erreur lors de l'upload");
        setUploading(false);
      }
    } catch {
      setError("Erreur réseau");
      setUploading(false);
    }
  };

  const handleDelete = async (contratId: string) => {
    if (!confirm("Supprimer ce brouillon de contrat ?")) return;
    setActionId(contratId);
    try {
      const res = await fetch(`/api/talents/${talentId}/contrats/${contratId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setContrats((prev) => prev.filter((c) => c.id !== contratId));
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors de la suppression");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setActionId(null);
    }
  };

  const openRelance = (contrat: Contrat) => {
    setError(null);
    setFeedback(null);
    // En attente agence : renvoi direct (pas d'édition d'email talent)
    if (contrat.statut === "EN_ATTENTE_AGENCE") {
      void handleRelancer(contrat.id);
      return;
    }
    setRelanceContratId(contrat.id);
    setRelanceEmail(talentEmail || "");
  };

  const handleRelancer = async (contratId?: string) => {
    const id = contratId ?? relanceContratId;
    if (!id) return;
    const email = relanceEmail.trim();
    // Formulaire ouvert = email requis ; renvoi agence = sans email
    if (!contratId) {
      if (!email) {
        setError("Indiquez l'adresse email");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Adresse email invalide");
        return;
      }
    }
    setActionId(id);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch(`/api/talents/${talentId}/contrats/${id}/relancer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(!contratId && email ? { email } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback(`Relance envoyée à ${data.relanceEmail}`);
        setRelanceContratId(null);
      } else {
        setError(data.error || "Erreur lors de la relance");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-xl">
          <FileSignature className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-glowup-licorice">Contrats</h2>
          <p className="text-sm text-gray-500">
            Envoyez un PDF en signature électronique au talent (contrat de management,
            avenant...)
          </p>
        </div>
      </div>

      {/* Zone glisser-déposer */}
      {!pendingFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            selectFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-colors mb-6 ${
            dragOver
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50"
          }`}
        >
          <Upload className="w-8 h-8 text-indigo-500" />
          <p className="font-medium text-glowup-licorice">
            Glissez un PDF ici, ou cliquez pour choisir
          </p>
          <p className="text-sm text-gray-500">
            Vous placerez ensuite les champs (nom, texte, signature...) sur le document
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              selectFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 mb-6 space-y-4">
          <div className="flex items-center gap-3">
            <FileSignature className="w-5 h-5 text-indigo-600 shrink-0" />
            <span className="font-medium text-glowup-licorice truncate">
              {pendingFile.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setPendingFile(null);
                setTitre("");
              }}
              disabled={uploading}
              className="ml-auto text-sm text-gray-500 hover:text-gray-800"
            >
              Annuler
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titre du contrat
            </label>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Contrat de management 2026"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={avecSignatureAgence}
              onChange={(e) => setAvecSignatureAgence(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Ajouter la signature de l'agence (après celle du talent)
          </label>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Préparation du document...
              </>
            ) : (
              <>
                <PenLine className="w-5 h-5" /> Continuer : placer les champs
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}
      {feedback && (
        <p className="text-sm text-emerald-700 mb-4">{feedback}</p>
      )}

      {/* Liste des contrats */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : contrats.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-2">
          Aucun contrat pour ce talent pour le moment.
        </p>
      ) : (
        <div className="space-y-3">
          {contrats.map((contrat) => {
            const ui = STATUT_UI[contrat.statut];
            const busy = actionId === contrat.id;
            const showRelanceForm = relanceContratId === contrat.id;
            return (
              <div
                key={contrat.id}
                className="p-4 rounded-2xl border border-gray-100 bg-gray-50 space-y-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-glowup-licorice truncate">
                      {contrat.titre}
                    </p>
                    <p className="text-xs text-gray-500">
                      {contrat.statut === "SIGNE" && contrat.signeAt
                        ? `Signé le ${formatDate(contrat.signeAt)}`
                        : contrat.envoyeAt
                          ? `Envoyé le ${formatDate(contrat.envoyeAt)}`
                          : `Créé le ${formatDate(contrat.createdAt)}`}
                      {contrat.createdBy
                        ? ` · par ${contrat.createdBy.prenom} ${contrat.createdBy.nom}`
                        : ""}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${ui.className}`}
                  >
                    {ui.icon}
                    {ui.label}
                  </span>

                  <div className="flex items-center gap-2">
                    {contrat.statut === "BROUILLON" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/talents/${talentId}/contrats/${contrat.id}/builder`
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" /> Placer les champs
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(contrat.id)}
                          disabled={busy}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Supprimer le brouillon"
                        >
                          {busy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}

                    {["EN_ATTENTE_TALENT", "EN_ATTENTE_AGENCE"].includes(
                      contrat.statut
                    ) &&
                      !showRelanceForm && (
                        <button
                          type="button"
                          onClick={() => openRelance(contrat)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-60"
                          title={
                            contrat.statut === "EN_ATTENTE_TALENT"
                              ? "Modifier l'email et renvoyer le lien"
                              : "Renvoyer le lien de signature"
                          }
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Bell className="w-3.5 h-3.5" />
                          )}
                          Relancer
                        </button>
                      )}

                    {contrat.statut === "SIGNE" && contrat.signedDocumentUrl && (
                      <a
                        href={contrat.signedDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF signé
                      </a>
                    )}

                    <a
                      href={contrat.fichierUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2"
                      title="Voir le PDF d'origine"
                    >
                      Original
                    </a>
                  </div>
                </div>

                {showRelanceForm && (
                  <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-gray-200/80">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Email de relance
                      </label>
                      <input
                        type="email"
                        value={relanceEmail}
                        onChange={(e) => setRelanceEmail(e.target.value)}
                        disabled={busy}
                        placeholder="email@exemple.com"
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none disabled:opacity-60"
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRelancer()}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Renvoyer
                    </button>
                    <button
                      type="button"
                      onClick={() => setRelanceContratId(null)}
                      disabled={busy}
                      className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      title="Annuler"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
