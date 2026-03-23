"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

interface LigneForm {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
}

interface EntrepriseSearchResult {
  nom_entreprise: string;
  denomination?: string;
  siret?: string | null;
  siren?: string | null;
  numero_tva_intracommunautaire?: string | null;
  forme_juridique?: string;
  capital?: number | null;
  adresse?: string | null;
  complement?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
}

export default function NouvelleFactureLibrePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [clientNom, setClientNom] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAdresse, setClientAdresse] = useState("");
  const [pays, setPays] = useState<"France" | "UE" | "Hors UE">("France");
  const [objet, setObjet] = useState("");
  const [dateDocument, setDateDocument] = useState(() => new Date().toISOString().slice(0, 10));
  const [conditionsReglement, setConditionsReglement] = useState<"30" | "45" | "60" | "0" | "CUSTOM">("30");
  const [conditionsReglementLibre, setConditionsReglementLibre] = useState("");
  const [modePaiement, setModePaiement] = useState("Virement");
  const [lignes, setLignes] = useState<LigneForm[]>([
    { description: "", quantite: 1, prixUnitaire: 0, tauxTVA: 20 },
  ]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<EntrepriseSearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);

  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (!editId) return;
    setLoadingInitial(true);
    fetch(`/api/documents/${editId}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Erreur chargement facture");
        return r.json();
      })
      .then((doc) => {
        setClientNom(doc.clientNom ?? "");
        setClientEmail(doc.clientEmail ?? "");
        setClientAdresse(doc.clientAdresse ?? "");
        setObjet(doc.titre ?? "");
        if (doc.dateDocument) {
          setDateDocument(new Date(doc.dateDocument).toISOString().slice(0, 10));
        }
        setModePaiement(doc.modePaiement ?? "Virement");
        const notes: string = doc.notes ?? "";
        const paymentClause = notes.split("—").slice(1).join("—").trim();
        if (/Paiement\s+comptant/i.test(notes)) {
          setConditionsReglement("0");
        } else if (/Paiement\s+sous\s+45\s+jours/i.test(notes)) {
          setConditionsReglement("45");
        } else if (/Paiement\s+sous\s+60\s+jours/i.test(notes)) {
          setConditionsReglement("60");
        } else if (paymentClause) {
          setConditionsReglement("CUSTOM");
          setConditionsReglementLibre(paymentClause);
        } else {
          setConditionsReglement("30");
        }
        setNotes(doc.notes ?? "");
        if (Array.isArray(doc.lignes) && doc.lignes.length > 0) {
          setLignes(
            doc.lignes.map((l: any) => ({
              description: l.description || "",
              quantite: Number(l.quantite) || 1,
              prixUnitaire: Number(l.prixUnitaire) || 0,
              tauxTVA: Number(l.tauxTVA ?? 0),
            }))
          );
        }
      })
      .catch((e) => {
        console.error(e);
        setError("Impossible de charger la facture à modifier.");
      })
      .finally(() => {
        setLoadingInitial(false);
      });
  }, [editId]);

  if (status === "loading" || loadingInitial) {
    return <div className="p-6 text-sm text-gray-500">Chargement...</div>;
  }
  const searchEntreprise = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    setShowSearchResults(true);
    try {
      const res = await fetch(`/api/recherche-entreprise?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.results) setSearchResults(data.results);
      else setSearchResults([]);
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const fillFromSearchResult = (e: EntrepriseSearchResult) => {
    const adresse = [e.adresse, e.complement].filter(Boolean).join(" – ") || "";
    setClientNom(e.nom_entreprise || e.denomination || "");
    setClientAdresse(
      [
        adresse,
        [e.code_postal, e.ville].filter(Boolean).join(" "),
        e.pays || "France",
      ]
        .filter(Boolean)
        .join("\n")
    );
    // Adapter le pays et la TVA par défaut
    const paysFromApi =
      e.pays && e.pays !== "France"
        ? ("UE" as "UE") // simplification : tout non-France traité comme UE ici
        : ("France" as "France");
    setPays(paysFromApi);
    setLignes((prev) =>
      prev.map((line) => ({
        ...line,
        tauxTVA: paysFromApi === "France" ? 20 : 0,
      }))
    );
    setShowSearchResults(false);
    setSearchResults([]);
    setSearchQuery("");
  };


  if (!session?.user || !["ADMIN", "HEAD_OF_SALES"].includes(role || "")) {
    if (typeof window !== "undefined") {
      router.replace("/dashboard");
    }
    return null;
  }

  const handleChangeLigne = (index: number, field: keyof LigneForm, value: string) => {
    setLignes((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              [field]:
                field === "description"
                  ? value
                  : Number(value.replace(",", ".")) || 0,
            }
          : l
      )
    );
  };

  const handleAddLigne = () => {
    setLignes((prev) => [...prev, { description: "", quantite: 1, prixUnitaire: 0, tauxTVA: 20 }]);
  };

  const handleRemoveLigne = (index: number) => {
    setLignes((prev) => prev.filter((_, i) => i !== index));
  };

  const totalHT = lignes.reduce((sum, l) => sum + (l.quantite || 0) * (l.prixUnitaire || 0), 0);
  const totalTVA = lignes.reduce(
    (sum, l) => sum + (l.quantite || 0) * (l.prixUnitaire || 0) * ((l.tauxTVA || 0) / 100),
    0
  );
  const totalTTC = totalHT + totalTVA;

  const handleSubmit = async (finaliser: boolean) => {
    if (!clientNom.trim()) {
      setError("Le nom du client est requis");
      return;
    }
    if (!finaliser) {
      // Mode brouillon local uniquement pour l’instant
      setError("Le mode Brouillon n’est pas encore implémenté côté serveur.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        clientNom: clientNom.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAdresse: clientAdresse.trim() || undefined,
        pays,
        objet: objet.trim() || undefined,
        dateDocument,
        conditionsReglement,
        conditionsReglementLibre:
          conditionsReglement === "CUSTOM"
            ? conditionsReglementLibre.trim() || undefined
            : undefined,
        modePaiement,
        lignes,
        notes: notes.trim() || undefined,
      };

      const res = await fetch(editId ? `/api/factures/standalone/${editId}` : "/api/factures/standalone", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la création de la facture");
      }
      const data = await res.json();
      const id = data.document?.id as string | undefined;
      if (id) {
        router.replace(`/factures/${id}`);
      } else {
        router.replace("/factures?tab=invoices");
      }
    } catch (e: any) {
      setError(e.message || "Erreur lors de la création de la facture");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1110]" style={{ fontFamily: "Spectral, serif" }}>
            {editId ? "Modifier la facture" : "Nouvelle facture libre"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {editId
              ? "Modifie une facture non liée à une collaboration, avec le même format que les factures existantes."
              : "Crée une facture non liée à une collaboration, avec le même format que les factures existantes."}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-8">
        {/* Client */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[#1A1110] uppercase tracking-wide">
            Client
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Recherche d’entreprise (nom ou SIRET)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value.trim()) setShowSearchResults(false);
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), searchEntreprise())
                  }
                  placeholder="Ex : L'Oréal, Nike ou 123 456 789 00012"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                />
                <button
                  type="button"
                  onClick={searchEntreprise}
                  disabled={searching || searchQuery.trim().length < 2}
                  className="px-4 py-2 rounded-lg bg-[#1A1110] text-white text-sm font-medium hover:bg-black disabled:opacity-50"
                >
                  {searching ? "Recherche..." : "Rechercher"}
                </button>
              </div>
              {showSearchResults && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      {searching
                        ? "Recherche..."
                        : "Aucun résultat. Essayez un autre nom ou SIRET."}
                    </div>
                  ) : (
                    searchResults.map((ent, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => fillFromSearchResult(ent)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <p className="font-medium text-gray-900">
                          {ent.nom_entreprise}
                        </p>
                        {(ent.siret || ent.ville) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[
                              ent.siret,
                              [ent.code_postal, ent.ville]
                                .filter(Boolean)
                                .join(" "),
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1.5">
                Recherche via API officielle (api.gouv.fr). Tu peux aussi remplir la
                facturation à la main ci‑dessous.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nom de la société / client *
                </label>
                <input
                  type="text"
                  value={clientNom}
                  onChange={(e) => setClientNom(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                  placeholder="Glow Up Agence"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                  placeholder="contact@client.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Adresse complète
              </label>
              <textarea
                value={clientAdresse}
                onChange={(e) => setClientAdresse(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                placeholder={"Rue, code postal, ville, pays"}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pays
              </label>
              <select
                value={pays}
                onChange={(e) => {
                  const value = e.target.value as "France" | "UE" | "Hors UE";
                  setPays(value);
                  setLignes((prev) =>
                    prev.map((line) => ({
                      ...line,
                      tauxTVA: value === "France" ? 20 : 0,
                    }))
                  );
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
              >
                <option value="France">France</option>
                <option value="UE">Union Européenne</option>
                <option value="Hors UE">Hors UE</option>
              </select>
            </div>
          </div>
        </section>

        {/* Métadonnées */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[#1A1110] uppercase tracking-wide">
            Détails de la facture
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Objet
              </label>
              <input
                type="text"
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                placeholder="Prestation de services..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date de facture
              </label>
              <input
                type="date"
                value={dateDocument}
                onChange={(e) => setDateDocument(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Conditions de règlement
              </label>
              <select
                value={conditionsReglement}
                onChange={(e) => setConditionsReglement(e.target.value as "30" | "45" | "60" | "0" | "CUSTOM")}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
              >
                <option value="30">30 jours fin de mois</option>
                <option value="45">45 jours fin de mois</option>
                <option value="60">60 jours fin de mois</option>
                <option value="0">Comptant</option>
                <option value="CUSTOM">Texte libre</option>
              </select>
              {conditionsReglement === "CUSTOM" && (
                <textarea
                  value={conditionsReglementLibre}
                  onChange={(e) => setConditionsReglementLibre(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                  placeholder="Ex : Paiement en 2 fois : 50% à la commande puis solde à 30 jours."
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Mode de paiement
              </label>
              <input
                type="text"
                value={modePaiement}
                onChange={(e) => setModePaiement(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
              />
            </div>
          </div>
        </section>

        {/* Lignes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1A1110] uppercase tracking-wide">
              Lignes de facturation
            </h2>
            <button
              type="button"
              onClick={handleAddLigne}
              className="text-xs font-medium text-[#C08B8B] hover:text-[#a36a6a]"
            >
              + Ajouter une ligne
            </button>
          </div>
          <div className="space-y-3">
            {lignes.map((ligne, index) => {
              const ligneTotalHT = (ligne.quantite || 0) * (ligne.prixUnitaire || 0);
              return (
                <div
                  key={index}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start border border-gray-100 rounded-xl p-3"
                >
                  <div className="md:col-span-5">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Désignation
                    </label>
                    <input
                      type="text"
                      value={ligne.description}
                      onChange={(e) =>
                        handleChangeLigne(index, "description", e.target.value)
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                      placeholder="Description de la prestation"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Quantité
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={ligne.quantite}
                      onChange={(e) => handleChangeLigne(index, "quantite", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      PU HT
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={ligne.prixUnitaire}
                      onChange={(e) =>
                        handleChangeLigne(index, "prixUnitaire", e.target.value)
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      TVA
                    </label>
                    <select
                      value={ligne.tauxTVA}
                      onChange={(e) => handleChangeLigne(index, "tauxTVA", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
                    >
                      <option value={20}>20 %</option>
                      <option value={10}>10 %</option>
                      <option value={0}>0 % – TVA non applicable (259-1 CGI)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Total HT
                    </label>
                    <div className="text-sm font-medium text-[#1A1110] mt-2">
                      {ligneTotalHT.toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="md:col-span-12 flex justify-end">
                    {lignes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLigne(index)}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        Supprimer la ligne
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Totaux + notes */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notes (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C08B8B]"
              placeholder="Informations complémentaires, mentions légales, etc."
            />
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total HT</span>
              <span className="font-semibold text-[#1A1110]">
                {totalHT.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total TVA</span>
              <span className="font-semibold text-[#1A1110]">
                {totalTVA.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="border-t border-gray-200 my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total TTC</span>
              <span className="font-semibold text-[#1A1110]">
                {totalTTC.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            disabled={submitting}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            disabled={submitting}
          >
            Brouillon
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            className="px-5 py-2 text-sm rounded-lg bg-[#1A1110] text-white font-medium hover:bg-black disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Création..." : "Finaliser la facture"}
          </button>
        </div>
      </div>
    </div>
  );
}

