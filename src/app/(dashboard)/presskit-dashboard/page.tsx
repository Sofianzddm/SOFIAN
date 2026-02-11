"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface BatchData {
  id: string;
  name: string;
  status: string;
  totalBrands: number;
  completed: number;
  failed: number;
  createdAt: string;
}

interface BrandEngagement {
  id: string;
  name: string;
  slug: string;
  niche: string;
  presskitUrl: string;
  totalViews: number;
  lastVisit: string | null;
  avgDuration: number;
  maxScrollDepth: number;
  ctaClicked: boolean;
  status: 'not_opened' | 'quick_view' | 'engaged' | 'hot';
  uniqueVisitors: number;
}

export default function PressKitDashboard() {
  const [batches, setBatches] = useState<BatchData[]>([]);
  const [brands, setBrands] = useState<BrandEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [batchesRes, brandsRes] = await Promise.all([
        fetch('/api/presskit/batches'),
        fetch('/api/presskit/analytics'),
      ]);

      const batchesData = await batchesRes.json();
      const brandsData = await brandsRes.json();

      setBatches(batchesData);
      setBrands(brandsData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'not_opened':
        return '🔴';
      case 'quick_view':
        return '🟡';
      case 'engaged':
        return '🟢';
      case 'hot':
        return '🔥';
      default:
        return '⚪';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'not_opened':
        return 'Pas ouvert';
      case 'quick_view':
        return 'Vue rapide (<30s)';
      case 'engaged':
        return 'Engagé (>30s)';
      case 'hot':
        return 'Très intéressé';
      default:
        return 'Inconnu';
    }
  };

  const filteredBrands = brands.filter(b => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'priority') return ['hot', 'engaged'].includes(b.status);
    return b.status === statusFilter;
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Press Kit Dashboard</h1>
        <p className="text-gray-600">Suivi des press kits personnalisés et engagement des marques</p>
      </div>

      {/* Batches */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Batches générés</h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map(batch => (
            <div
              key={batch.id}
              className={`bg-white rounded-lg shadow p-6 border-2 cursor-pointer transition-all ${
                selectedBatch === batch.id
                  ? 'border-glowup-rose'
                  : 'border-transparent hover:border-gray-200'
              }`}
              onClick={() => setSelectedBatch(selectedBatch === batch.id ? null : batch.id)}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-gray-900">{batch.name}</h3>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  batch.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : batch.status === 'processing'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {batch.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total</span>
                  <span className="font-medium">{batch.totalBrands}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Complétés</span>
                  <span className="font-medium text-green-600">{batch.completed}</span>
                </div>
                {batch.failed > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Échecs</span>
                    <span className="font-medium text-red-600">{batch.failed}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-gray-500 pt-2 border-t">
                  <span>Créé le</span>
                  <span>{new Date(batch.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {batches.length === 0 && (
          <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
            Aucun batch créé pour le moment
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="mb-6 flex items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Engagement des marques</h2>
        
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-glowup-rose text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setStatusFilter('priority')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'priority'
                ? 'bg-glowup-rose text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border'
            }`}
          >
            🔥 Priorités
          </button>
          <button
            onClick={() => setStatusFilter('hot')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'hot'
                ? 'bg-glowup-rose text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border'
            }`}
          >
            🔥 Très intéressé
          </button>
          <button
            onClick={() => setStatusFilter('engaged')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'engaged'
                ? 'bg-glowup-rose text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border'
            }`}
          >
            🟢 Engagé
          </button>
        </div>
      </div>

      {/* Brands Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marque</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Niche</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Vues</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Durée moy.</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Scroll</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">CTA</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredBrands.map(brand => (
              <tr key={brand.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getStatusIcon(brand.status)}</span>
                    <span className="text-xs text-gray-600">{getStatusLabel(brand.status)}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{brand.name}</div>
                  <div className="text-sm text-gray-500">
                    {brand.lastVisit ? `Dernière visite: ${new Date(brand.lastVisit).toLocaleDateString('fr-FR')}` : 'Jamais visité'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                    {brand.niche}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="font-medium">{brand.totalViews}</span>
                  <span className="text-xs text-gray-500 ml-1">({brand.uniqueVisitors} uniques)</span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="font-medium">{brand.avgDuration}s</span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="font-medium">{brand.maxScrollDepth}%</span>
                </td>
                <td className="px-6 py-4 text-center">
                  {brand.ctaClicked ? (
                    <span className="text-green-600 font-medium">✓ Oui</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={brand.presskitUrl}
                    target="_blank"
                    className="text-glowup-rose hover:text-glowup-rose/80 text-sm font-medium"
                  >
                    Voir le press kit →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredBrands.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            Aucune marque trouvée avec ces filtres
          </div>
        )}
      </div>
    </div>
  );
}
