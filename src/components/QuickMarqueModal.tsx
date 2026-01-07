"use client";

import { useState } from "react";
import { X, Loader2, Building2, Globe, Plus } from "lucide-react";

interface QuickMarqueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (marque: { id: string; nom: string }) => void;
}

const SECTEURS = [
  "Beauté", "Mode", "Food", "Tech", "Sport", "Lifestyle",
  "Luxe", "Automobile", "Finance", "Santé", "Voyage", "Entertainment",
];

export default function QuickMarqueModal({ isOpen, onClose, onCreated }: QuickMarqueModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom: "",
    secteur: "",
    siteWeb: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/marques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const marque = await res.json();
        onCreated(marque);
        setFormData({ nom: "", secteur: "", siteWeb: "" });
        onClose();
      } else {
        alert("Erreur lors de la création");
      }
    } catch (error) {
      alert("Erreur lors de la création");
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
              Nouvelle marque
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nom de la marque *
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              placeholder="Ex: L'Oréal, Nike, Apple..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-green focus:ring-2 focus:ring-glowup-green/20"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Secteur
            </label>
            <select
              value={formData.secteur}
              onChange={(e) => setFormData({ ...formData, secteur: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-green appearance-none bg-white"
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
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-green focus:ring-2 focus:ring-glowup-green/20"
            />
          </div>

          <p className="text-xs text-gray-500">
            💡 Vous pourrez compléter les informations de la marque plus tard (contacts, facturation, etc.)
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
              disabled={loading || !formData.nom.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-glowup-green text-glowup-licorice font-medium rounded-xl hover:bg-glowup-green/80 transition-colors disabled:opacity-50"
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
