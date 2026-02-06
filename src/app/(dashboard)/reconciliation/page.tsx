"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Link2,
  CheckCircle2,
  AlertCircle,
  Banknote,
  RefreshCw,
  Calendar,
  Building2,
  Euro,
} from "lucide-react";

interface TransactionQonto {
  id: string;
  qontoId: string;
  montant: number;
  libelle: string;
  reference: string;
  dateTransaction: string;
  emetteur: string;
  emetteurIban: string;
  associe: boolean;
  document?: {
    id: string;
    reference: string;
    type: string;
  };
}

interface Facture {
  id: string;
  reference: string;
  montantTTC: number;
  dateEmission: string;
  dateEcheance: string;
  statut: string;
  collaboration: {
    id: string;
    reference: string;
    marque: { nom: string };
  } | null;
}

export default function ReconciliationPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionQonto[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [associating, setAssociating] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [transactionsRes, facturesRes] = await Promise.all([
        fetch("/api/qonto/transactions"),
        fetch("/api/documents?type=FACTURE&statut=ENVOYE,EN_ATTENTE"),
      ]);

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setTransactions(data.transactions || []);
      }

      if (facturesRes.ok) {
        const data = await facturesRes.json();
        setFactures(data.documents || []);
      }
    } catch (error) {
      console.error("Erreur fetch:", error);
      alert("❌ Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const syncQonto = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/qonto/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 30 }),
      });

      if (res.ok) {
        const data = await res.json();
        await fetchData();
        alert(`✅ Sync réussie ! ${data.stats.imported} nouvelles transactions`);
      } else {
        const error = await res.json();
        alert(`❌ Erreur sync: ${error.details || error.error}`);
      }
    } catch (error) {
      console.error("Erreur sync:", error);
      alert("❌ Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  };

  const associer = async (transactionId: string, factureId: string) => {
    setAssociating(transactionId);
    try {
      const res = await fetch("/api/qonto/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, documentId: factureId }),
      });

      if (res.ok) {
        await fetchData();
        alert("✅ Paiement associé avec succès !");
      } else {
        const error = await res.json();
        alert(`❌ ${error.error}`);
      }
    } catch (error) {
      console.error("Erreur association:", error);
      alert("❌ Erreur lors de l'association");
    } finally {
      setAssociating(null);
    }
  };

  const getSuggestions = (transaction: TransactionQonto): Facture[] => {
    return factures.filter((facture) => {
      const montantFacture = Number(facture.montantTTC);
      const montantTransaction = transaction.montant;
      const difference = Math.abs(montantFacture - montantTransaction);

      // Tolérance de 1€ pour les arrondis
      return difference < 1;
    });
  };

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(value);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-xl font-bold text-gray-900">Accès refusé</p>
          <p className="text-gray-600">Cette page est réservée aux administrateurs</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const transactionsNonAssociees = transactions.filter((t) => !t.associe);
  const transactionsAssociees = transactions.filter((t) => t.associe);

  return (
    <div className="min-h-screen bg-gradient-to-br from-glowup-lace via-white to-glowup-lace/30 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-glowup-licorice mb-2 flex items-center gap-3">
              🏦 Réconciliation Bancaire
              <span className="text-lg font-normal text-gray-500">Qonto</span>
            </h1>
            <p className="text-gray-600">
              Associez les paiements Qonto aux factures clients
            </p>
          </div>

          <button
            onClick={syncQonto}
            disabled={syncing}
            className="px-6 py-3 bg-gradient-to-r from-glowup-rose to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Synchronisation...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Sync Qonto
              </>
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">À réconcilier</p>
                <p className="text-3xl font-bold text-glowup-licorice">
                  {transactionsNonAssociees.length}
                </p>
                <p className="text-xs text-amber-600 font-medium mt-1">
                  {formatMoney(
                    transactionsNonAssociees.reduce((sum, t) => sum + t.montant, 0)
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Réconciliés</p>
                <p className="text-3xl font-bold text-glowup-licorice">
                  {transactionsAssociees.length}
                </p>
                <p className="text-xs text-green-600 font-medium mt-1">
                  {formatMoney(
                    transactionsAssociees.reduce((sum, t) => sum + t.montant, 0)
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Banknote className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Factures en attente</p>
                <p className="text-3xl font-bold text-glowup-licorice">
                  {factures.length}
                </p>
                <p className="text-xs text-blue-600 font-medium mt-1">
                  {formatMoney(
                    factures.reduce((sum, f) => sum + Number(f.montantTTC), 0)
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions non associées */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-glowup-licorice mb-6 flex items-center gap-2">
            💰 Transactions Qonto non associées
            <span className="text-sm font-normal text-gray-500">
              ({transactionsNonAssociees.length})
            </span>
          </h2>

          {transactionsNonAssociees.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
              <p className="text-xl font-bold text-gray-900 mb-2">
                ✅ Tout est à jour !
              </p>
              <p className="text-gray-600">
                Toutes les transactions Qonto sont réconciliées
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactionsNonAssociees.map((transaction) => {
                const suggestions = getSuggestions(transaction);

                return (
                  <div
                    key={transaction.id}
                    className="border-2 border-amber-200 bg-amber-50/30 rounded-2xl p-6 hover:shadow-md transition-all"
                  >
                    {/* Transaction Info */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-3xl font-bold text-green-600">
                            {formatMoney(transaction.montant)}
                          </span>
                          <span className="px-4 py-1.5 bg-amber-100 text-amber-800 rounded-full text-sm font-bold border border-amber-300">
                            ⏳ Non associé
                          </span>
                        </div>
                        <div className="space-y-2">
                          <p className="text-gray-900 font-semibold text-lg">
                            {transaction.libelle}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-4 h-4" />
                              {transaction.emetteur}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(transaction.dateTransaction).toLocaleDateString(
                                "fr-FR",
                                { day: "2-digit", month: "long", year: "numeric" }
                              )}
                            </span>
                          </div>
                          {transaction.reference && (
                            <p className="text-xs text-gray-500 font-mono">
                              Réf: {transaction.reference}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mt-4">
                        <p className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2">
                          <Banknote className="w-5 h-5" />
                          💡 {suggestions.length} suggestion
                          {suggestions.length > 1 ? "s" : ""} (montant correspondant)
                        </p>
                        <div className="space-y-3">
                          {suggestions.map((facture) => (
                            <div
                              key={facture.id}
                              className="flex items-center justify-between bg-white rounded-xl p-4 border border-blue-100 hover:border-blue-300 transition-all"
                            >
                              <div className="flex-1">
                                <p className="font-bold text-gray-900 mb-1">
                                  {facture.reference}
                                </p>
                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                  {facture.collaboration && (
                                    <span className="flex items-center gap-1">
                                      <Building2 className="w-3 h-3" />
                                      {facture.collaboration.marque.nom}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1 font-mono">
                                    <Euro className="w-3 h-3" />
                                    {formatMoney(Number(facture.montantTTC))}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => associer(transaction.id, facture.id)}
                                disabled={associating === transaction.id}
                                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-50"
                              >
                                {associating === transaction.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Link2 className="w-4 h-4" />
                                )}
                                Associer
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Association manuelle */}
                    <details className="mt-4 group">
                      <summary className="text-sm text-gray-600 cursor-pointer hover:text-glowup-rose font-medium flex items-center gap-2 py-2">
                        <span className="group-open:rotate-90 transition-transform">▶</span>
                        Associer manuellement à une autre facture...
                      </summary>
                      <div className="mt-3 space-y-2 max-h-80 overflow-y-auto bg-gray-50 rounded-xl p-4 border border-gray-200">
                        {factures.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            Aucune facture en attente
                          </p>
                        ) : (
                          factures.map((facture) => (
                            <div
                              key={facture.id}
                              className="flex items-center justify-between bg-white rounded-lg p-3 hover:bg-gray-50 border border-gray-100"
                            >
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900 text-sm">
                                  {facture.reference}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                                  {facture.collaboration && (
                                    <span>{facture.collaboration.marque.nom}</span>
                                  )}
                                  <span className="font-mono">
                                    {formatMoney(Number(facture.montantTTC))}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => associer(transaction.id, facture.id)}
                                disabled={associating === transaction.id}
                                className="px-4 py-1.5 bg-glowup-rose hover:bg-glowup-rose-dark text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                Associer
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transactions réconciliées (historique) */}
        {transactionsAssociees.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-xl font-bold text-glowup-licorice mb-6 flex items-center gap-2">
              ✅ Historique réconcilié
              <span className="text-sm font-normal text-gray-500">
                ({transactionsAssociees.length} dernières)
              </span>
            </h2>

            <div className="space-y-3">
              {transactionsAssociees.slice(0, 10).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-green-700">
                        {formatMoney(transaction.montant)}
                      </span>
                      <span className="text-sm text-gray-600">
                        {transaction.libelle}
                      </span>
                    </div>
                    {transaction.document && (
                      <p className="text-xs text-gray-500">
                        ✓ Associé à {transaction.document.reference}
                      </p>
                    )}
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
