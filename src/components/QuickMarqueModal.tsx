"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Building2, Globe, Plus, AlertTriangle } from "lucide-react";

interface ExistingMarque {
  id: string;
  nom: string;
  raisonSociale?: string | null;
}

interface QuickMarqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (marque: {
    id: string;
    nom: string;
    market?: "FR" | "BENELUX";
    linkedMarqueId?: string | null;
  }) => void;
  /** Si la saisie matche une fiche CRM, on propose de la sélectionner plutôt que de créer. */
  onSelectExisting?: (marque: { id: string; nom: string }) => void;
  /** Catalogue CRM déjà chargé (évite un fetch). */
  existingMarques?: ExistingMarque[];
  /** Préremplit le nom (ex. marque extraite du mail inbound). */
  defaultNom?: string;
  /** CRM cible à la création. Défaut FR. */
  market?: "FR" | "BENELUX" | "BOTH";
}

const SECTEURS = [
  "Beauté", "Mode", "Food", "Tech", "Sport", "Lifestyle",
  "Luxe", "Automobile", "Finance", "Santé", "Voyage", "Entertainment",
];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export default function QuickMarqueModal({
  isOpen,
  onClose,
  onCreated,
  onSelectExisting,
  existingMarques = [],
  defaultNom = "",
  market = "FR",
}: QuickMarqueModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDuplicate, setSearchDuplicate] = useState<{
    id: string;
    nom: string;
    matchedAlias?: string | null;
  } | null>(null);
  const [formData, setFormData] = useState({
    nom: "",
    secteur: "",
    siteWeb: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSearchDuplicate(null);
    setFormData({
      nom: String(defaultNom || "").trim(),
      secteur: "",
      siteWeb: "",
    });
  }, [isOpen, defaultNom]);

  const localDuplicate = useMemo(() => {
    const q = normalize(formData.nom);
    if (!q) return null;
    return (
      existingMarques.find(
        (m) =>
          normalize(m.nom) === q ||
          (!!m.raisonSociale && normalize(m.raisonSociale) === q)
      ) || null
    );
  }, [existingMarques, formData.nom]);

  // Vérifie aussi les alias CRM (ex. « ON » → On Running)
  useEffect(() => {
    const q = formData.nom.trim();
    if (!isOpen || q.length < 2) {
      setSearchDuplicate(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/marques/search?q=${encodeURIComponent(q)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const hit = (data.marques || []).find(
          (m: { exactMatch?: boolean }) => m.exactMatch
        );
        if (!cancelled) {
          setSearchDuplicate(
            hit
              ? {
                  id: hit.id,
                  nom: hit.nom,
                  matchedAlias: hit.matchedAlias || null,
                }
              : null
          );
        }
      } catch {
        if (!cancelled) setSearchDuplicate(null);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.nom, isOpen]);

  const duplicate = localDuplicate
    ? { id: localDuplicate.id, nom: localDuplicate.nom, matchedAlias: null as string | null }
    : searchDuplicate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim()) return;

    if (duplicate) {
      setError(
        `INTERDIT : « ${duplicate.nom} » existe déjà dans le CRM. Sélectionnez la fiche existante — ne créez pas de doublon.`
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const wantsFr = market === "FR" || market === "BOTH";
      const wantsBe = market === "BENELUX" || market === "BOTH";

      let frId: string | null = null;
      let frNom = formData.nom.trim();
      let beId: string | null = null;

      if (wantsFr) {
        const res = await fetch("/api/marques", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          setError("Erreur lors de la création (CRM France)");
          return;
        }
        const marque = await res.json();
        // L'API fait un find-or-create : si la fiche existait déjà, on force
        // le parcours "sélectionner l'existant" plutôt que de faire croire à une création.
        if (marque?._resolver?.reused && onSelectExisting && marque.id) {
          onSelectExisting({ id: marque.id, nom: marque.nom || frNom });
          onClose();
          return;
        }
        frId = marque.id;
        frNom = marque.nom || frNom;
      }

      if (wantsBe) {
        const res = await fetch("/api/benelux-outreach/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            ...(frId ? { linkedMarqueId: frId } : {}),
          }),
        });
        if (!res.ok) {
          setError("Erreur lors de la création (CRM BENELUX)");
          return;
        }
        const company = await res.json();
        beId = company.id;
        if (!frNom) frNom = company.nom || frNom;
      }

      if (market === "BENELUX" && beId) {
        onCreated({
          id: beId,
          nom: frNom,
          market: "BENELUX",
          linkedMarqueId: frId,
        });
      } else if (frId) {
        onCreated({ id: frId, nom: frNom, market: "FR" });
      } else {
        setError("Erreur lors de la création");
        return;
      }

      setFormData({ nom: "", secteur: "", siteWeb: "" });
      onClose();
    } catch {
      setError("Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-glowup-green/10 rounded-lg">
              <Building2 className="w-5 h-5 text-glowup-green" />
            </div>
            <h3 className="text-lg font-semibold text-glowup-licorice">
              {market === "BENELUX"
                ? "Nouvelle marque (BENELUX)"
                : market === "BOTH"
                  ? "Nouvelle marque (FR + BE)"
                  : "Nouvelle marque"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2.5 text-red-700">
            <p className="font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Interdit de créer un doublon
            </p>
            <p className="text-xs mt-1">
              Si la marque existe déjà dans le CRM, sélectionnez-la. Ne créez jamais une seconde fiche.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nom de la marque *
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => {
                setFormData({ ...formData, nom: e.target.value });
                setError(null);
              }}
              placeholder="Ex: L'Oréal, Nike, Apple..."
              className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 ${
                duplicate
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  : "border-gray-200 focus:border-glowup-green focus:ring-glowup-green/20"
              }`}
              autoFocus
            />
          </div>

          {duplicate && (
            <div className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-bold">
                Création interdite —{" "}
                {duplicate.matchedAlias
                  ? `« ${duplicate.matchedAlias} » = fiche « ${duplicate.nom} »`
                  : `« ${duplicate.nom} »`}{" "}
                existe déjà dans le CRM.
              </p>
              {onSelectExisting && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectExisting({ id: duplicate.id, nom: duplicate.nom });
                    onClose();
                  }}
                  className="mt-1.5 font-semibold underline hover:no-underline"
                >
                  Utiliser {duplicate.nom}
                </button>
              )}
            </div>
          )}

          {error && !duplicate && (
            <div className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Secteur
            </label>
            <select
              value={formData.secteur}
              onChange={(e) => setFormData({ ...formData, secteur: e.target.value })}
              disabled={!!duplicate}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-green appearance-none bg-white disabled:opacity-50"
            >
              <option value="">Sélectionner un secteur</option>
              {SECTEURS.map((secteur) => (
                <option key={secteur} value={secteur}>{secteur}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Globe className="w-4 h-4 inline mr-1 text-gray-400" />
              Site web
            </label>
            <input
              type="url"
              value={formData.siteWeb}
              onChange={(e) => setFormData({ ...formData, siteWeb: e.target.value })}
              placeholder="https://www.example.com"
              disabled={!!duplicate}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-green focus:ring-2 focus:ring-glowup-green/20 disabled:opacity-50"
            />
          </div>

          <p className="text-xs text-gray-500">
            Vous pourrez compléter les informations de la marque plus tard (contacts, facturation, etc.)
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !formData.nom.trim() || !!duplicate}
              className="flex items-center gap-2 px-4 py-2 bg-glowup-green text-glowup-licorice font-medium rounded-xl hover:bg-glowup-green/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Créer la marque
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
