"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Eye, Pencil, Copy, Trash2, Building2, Loader2 } from "lucide-react";

interface Partner {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  isActive: boolean;
  talentsCount: number;
  totalViews: number;
  lastVisit: string | null;
  createdAt: string;
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPartners();
  }, []);

  async function fetchPartners() {
    try {
      const res = await fetch("/api/partners");
      if (res.ok) {
        const data = await res.json();
        setPartners(data);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/partners/${slug}`;
    navigator.clipboard.writeText(url);
    alert("Lien copié !");
  }

  async function deletePartner(id: string) {
    if (!confirm("Supprimer ce partenaire ?")) return;
    try {
      const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPartners((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Jamais";
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">🏢 Partenaires</h1>
          <p className="text-gray-600">Gérez les Talent Books pour vos agences partenaires</p>
        </div>
        <Link
          href="/partners/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Nouveau partenaire
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : partners.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Aucun partenaire créé</p>
          <Link
            href="/partners/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Créer le premier partenaire
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="md:hidden space-y-3 p-4">
            {partners.map((partner) => (
              <div key={partner.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  {partner.logo ? (
                    <div className="w-11 h-11 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={partner.logo} alt={partner.name} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{partner.name}</p>
                    <p className="text-xs text-gray-500">/{partner.slug}</p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${
                      partner.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {partner.isActive ? "Actif" : "Inactif"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
                  <div><span className="block font-semibold text-gray-900">{partner.talentsCount}</span>talents</div>
                  <div><span className="block font-semibold text-gray-900">{partner.totalViews}</span>vues</div>
                  <div><span className="block font-semibold text-gray-900 truncate">{formatDate(partner.lastVisit)}</span>visite</div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                  <Link
                    href={`/partners/manage/${partner.id}`}
                    className="flex-1 text-center py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg"
                  >
                    Voir
                  </Link>
                  <Link
                    href={`/partners/manage/${partner.id}/edit`}
                    className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                    title="Éditer"
                  >
                    <Pencil className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => copyLink(partner.slug)}
                    className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                    title="Copier le lien"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deletePartner(partner.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partenaire</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Talents</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vues</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dernière visite</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {partners.map((partner) => (
                <tr key={partner.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {partner.logo ? (
                        <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                          <img src={partner.logo} alt={partner.name} className="max-w-full max-h-full object-contain" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                          <Building2 className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{partner.name}</p>
                        <p className="text-xs text-gray-500">/{partner.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{partner.talentsCount}</td>
                  <td className="px-6 py-4 text-sm">{partner.totalViews}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(partner.lastVisit)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        partner.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {partner.isActive ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/partners/manage/${partner.id}`}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Voir stats"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link
                        href={`/partners/manage/${partner.id}/edit`}
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                        title="Éditer"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => copyLink(partner.slug)}
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                        title="Copier le lien"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deletePartner(partner.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
