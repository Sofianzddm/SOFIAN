"use client";

import { useState, useEffect } from "react";
import { Loader2, ChevronRight, ChevronLeft, Search, Check, X, Eye, AlertCircle } from "lucide-react";

// ============================================
// TYPES
// ============================================

interface HubSpotList {
  id: string;
  name: string;
  contactCount: number | null;
}

interface HubSpotContact {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  companyName: string;
  domain: string;
}

interface Talent {
  id: string;
  name: string;
  photo: string | null;
  instagram: string | null;
  tiktok: string | null;
  niches: string[];
  igFollowers: number;
  igEngagement: number;
}

interface BrandData {
  companyName: string;
  domain: string;
  description: string | null;
  contacts: Array<{ hubspotContactId: string; email: string }>;
}

interface CategorizedBrand extends BrandData {
  category: string;
  talentIds: string[];
}

type Step = 1 | 2 | 3 | 4 | 5;

// Catégories disponibles avec leurs émojis
const CATEGORIES = [
  { key: "MODE", label: "Mode", emoji: "👗" },
  { key: "BEAUTÉ", label: "Beauté", emoji: "💄" },
  { key: "SPORT", label: "Sport", emoji: "🏃" },
  { key: "FOOD", label: "Food", emoji: "🍽️" },
  { key: "TECH", label: "Tech", emoji: "💻" },
  { key: "LIFESTYLE", label: "Lifestyle", emoji: "✨" },
  { key: "SANTÉ", label: "Santé", emoji: "🏥" },
  { key: "FINANCE", label: "Finance", emoji: "💰" },
  { key: "AUTRE", label: "Autre", emoji: "❓" },
];

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export default function PressKitDashboardV5() {
  // États pour les 5 étapes
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // ÉTAPE 1 : Sélection du segment HubSpot
  const [lists, setLists] = useState<HubSpotList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [searchList, setSearchList] = useState("");

  // ÉTAPE 2 : Catégorisation automatique
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedListName, setSelectedListName] = useState<string>("");
  const [contacts, setContacts] = useState<HubSpotContact[]>([]);
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [categorizedBrands, setCategorizedBrands] = useState<CategorizedBrand[]>([]);
  const [loadingCategorization, setLoadingCategorization] = useState(false);

  // ÉTAPE 3 : Sélection des talents par catégorie
  const [talents, setTalents] = useState<Talent[]>([]);
  const [categoryTalents, setCategoryTalents] = useState<Record<string, string[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [tempSelectedTalents, setTempSelectedTalents] = useState<string[]>([]);

  // ÉTAPE 4 : Récap + ajustements
  const [searchRecap, setSearchRecap] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("Toutes");

  // ÉTAPE 5 : Génération
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  
  // Preview
  const [previewingBrand, setPreviewingBrand] = useState<string | null>(null);

  // ============================================
  // ÉTAPE 1 : Charger les listes HubSpot
  // ============================================
  useEffect(() => {
    if (currentStep === 1) {
      loadLists();
    }
  }, [currentStep]);

  async function loadLists() {
    setLoadingLists(true);
    try {
      const res = await fetch("/api/hubspot/lists");
      const data = await res.json();
      setLists(data.lists || []);
    } catch (error) {
      console.error("Erreur chargement listes:", error);
    } finally {
      setLoadingLists(false);
    }
  }

  const filteredLists = lists.filter((list) =>
    list.name.toLowerCase().includes(searchList.toLowerCase())
  );

  async function selectList(listId: string, listName: string) {
    setSelectedListId(listId);
    setSelectedListName(listName);

    // Charger les contacts de cette liste
    try {
      const res = await fetch(`/api/hubspot/lists/${listId}/contacts`);
      const data = await res.json();
      setContacts(data.contacts || []);

      // Fonction pour normaliser le nom de marque
      const normalizeBrandName = (name: string): string => {
        return name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // Supprimer les accents
          .replace(/[^a-z0-9]+/g, "") // Supprimer tirets, espaces, etc.
          .trim();
      };

      // Fonction pour déterminer la priorité d'un domaine
      const getDomainPriority = (domain: string): number => {
        if (domain.endsWith('.com')) return 1;
        if (domain.endsWith('.fr')) return 2;
        return 3;
      };

      // Regrouper par nom de marque normalisé
      const brandMap = new Map<string, {
        companyName: string;
        domains: Map<string, { domain: string; contacts: { hubspotContactId: string; email: string }[] }>;
      }>();

      data.contacts.forEach((contact: HubSpotContact) => {
        if (!contact.domain || !contact.companyName) return;

        const normalizedName = normalizeBrandName(contact.companyName);
        if (!normalizedName) return;

        // Créer l'entrée pour ce nom normalisé si elle n'existe pas
        if (!brandMap.has(normalizedName)) {
          brandMap.set(normalizedName, {
            companyName: contact.companyName,
            domains: new Map(),
          });
        }

        const brand = brandMap.get(normalizedName)!;

        // Ajouter le domaine s'il n'existe pas
        if (!brand.domains.has(contact.domain)) {
          brand.domains.set(contact.domain, {
            domain: contact.domain,
            contacts: [],
          });
        }

        // Ajouter le contact à ce domaine
        brand.domains.get(contact.domain)!.contacts.push({
          hubspotContactId: contact.id,
          email: contact.email,
        });
      });

      // Fusionner les marques : garder le meilleur domaine (.com > .fr > autres)
      const uniqueBrands: BrandData[] = Array.from(brandMap.values()).map((brand) => {
        const domains = Array.from(brand.domains.values());
        
        // Trier par priorité de domaine
        domains.sort((a, b) => getDomainPriority(a.domain) - getDomainPriority(b.domain));
        
        // Prendre le meilleur domaine
        const bestDomain = domains[0];
        
        // Fusionner tous les contacts de tous les domaines
        const allContacts = domains.flatMap(d => d.contacts);

        return {
          companyName: brand.companyName,
          domain: bestDomain.domain,
          description: null,
          contacts: allContacts,
        };
      });
      setBrands(uniqueBrands);

      // Passer à l'étape 2
      setCurrentStep(2);

      // Charger les données Brandfetch + catégoriser
      categorizeBrands(uniqueBrands);
    } catch (error) {
      console.error("Erreur chargement contacts:", error);
    }
  }

  // ============================================
  // ÉTAPE 2 : Catégorisation automatique
  // ============================================
  async function categorizeBrands(brandsToCateg: BrandData[]) {
    setLoadingCategorization(true);

    try {
      // Catégoriser avec Claude (sans descriptions Brandfetch pour simplifier)
      const categRes = await fetch("/api/presskit/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brands: brandsToCateg.map((b) => ({
            name: b.companyName,
            description: null, // Brandfetch sera appelé côté serveur lors de la génération
          })),
        }),
      });

      const categData = await categRes.json();
      const categories = categData.categories as Record<string, number[]>;

      // Associer chaque marque à sa catégorie
      const categorized: CategorizedBrand[] = brandsToCateg.map((brand, index) => {
        const category =
          Object.keys(categories).find((cat) => categories[cat].includes(index + 1)) || "AUTRE";

        return {
          ...brand,
          category,
          talentIds: [], // Sera rempli à l'étape 3
        };
      });

      setCategorizedBrands(categorized);
    } catch (error) {
      console.error("Erreur catégorisation:", error);
    } finally {
      setLoadingCategorization(false);
    }
  }

  // ============================================
  // ÉTAPE 3 : Charger les talents + sélectionner par catégorie
  // ============================================
  useEffect(() => {
    if (currentStep === 3 && talents.length === 0) {
      loadTalents();
    }
  }, [currentStep, talents.length]);

  async function loadTalents() {
    try {
      const res = await fetch("/api/talents?presskit=true");
      const data = await res.json();
      setTalents(data.talents || []);
    } catch (error) {
      console.error("Erreur chargement talents:", error);
    }
  }

  function openCategorySelector(category: string) {
    setSelectedCategory(category);
    setTempSelectedTalents(categoryTalents[category] || []);
  }

  function toggleTalentSelection(talentId: string) {
    setTempSelectedTalents((prev) =>
      prev.includes(talentId) ? prev.filter((id) => id !== talentId) : [...prev, talentId]
    );
  }

  function saveCategoryTalents() {
    if (!selectedCategory) return;
    setCategoryTalents((prev) => ({ ...prev, [selectedCategory]: tempSelectedTalents }));

    // Appliquer aux marques de cette catégorie
    setCategorizedBrands((prev) =>
      prev.map((brand) =>
        brand.category === selectedCategory ? { ...brand, talentIds: tempSelectedTalents } : brand
      )
    );

    setSelectedCategory(null);
  }

  const categoryCounts = CATEGORIES.map((cat) => ({
    ...cat,
    count: categorizedBrands.filter((b) => b.category === cat.key).length,
  })).filter((cat) => cat.count > 0);

  // ============================================
  // ÉTAPE 4 : Récap + ajustements
  // ============================================
  const filteredRecap = categorizedBrands.filter((brand) => {
    const matchSearch =
      searchRecap === "" || brand.companyName.toLowerCase().includes(searchRecap.toLowerCase());
    const matchCategory = filterCategory === "Toutes" || brand.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const [editingBrand, setEditingBrand] = useState<CategorizedBrand | null>(null);

  function openBrandEditor(brand: CategorizedBrand) {
    setEditingBrand(brand);
    setTempSelectedTalents(brand.talentIds);
  }

  function saveBrandEdit() {
    if (!editingBrand) return;

    // Mettre à jour les talents de cette marque spécifique
    setCategorizedBrands((prev) =>
      prev.map((b) =>
        b.domain === editingBrand.domain ? { ...b, talentIds: tempSelectedTalents } : b
      )
    );

    setEditingBrand(null);
  }

  async function previewBrand(brand: CategorizedBrand) {
    if (brand.talentIds.length === 0) {
      alert("Sélectionnez au moins un talent avant de prévisualiser");
      return;
    }

    setPreviewingBrand(brand.domain);

    try {
      const res = await fetch("/api/presskit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: brand.companyName,
          domain: brand.domain,
          talentIds: brand.talentIds,
          contacts: brand.contacts,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Ouvrir dans un nouvel onglet avec timestamp pour forcer le refresh (pas de cache)
        const timestamp = Date.now();
        window.open(`/book/${data.slug}?t=${timestamp}`, "_blank");
      } else {
        alert("Erreur lors de la génération du preview");
      }
    } catch (error) {
      console.error("Erreur preview:", error);
      alert("Erreur lors de la génération du preview");
    } finally {
      setPreviewingBrand(null);
    }
  }

  // ============================================
  // ÉTAPE 5 : Génération
  // ============================================
  async function startGeneration() {
    const brandsReady = categorizedBrands.filter((b) => b.talentIds.length > 0);
    if (brandsReady.length === 0) {
      alert("Aucune marque prête (il faut au moins 1 talent par marque)");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: brandsReady.length });

    try {
      const res = await fetch("/api/presskit/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchName: `${selectedListName} - ${new Date().toLocaleDateString("fr-FR")}`,
          brands: brandsReady.map((brand) => ({
            contacts: brand.contacts,
            companyName: brand.companyName,
            domain: brand.domain,
            talentIds: brand.talentIds,
          })),
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`✅ ${brandsReady.length} press kits générés et envoyés !`);
        // Reset
        setCurrentStep(1);
        setCategorizedBrands([]);
        setCategoryTalents({});
      } else {
        alert("❌ Erreur lors de la génération");
      }
    } catch (error) {
      console.error("Erreur génération:", error);
      alert("❌ Erreur lors de la génération");
    } finally {
      setIsGenerating(false);
    }
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header + Stepper */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Press Kit System v5</h1>
        <p className="text-gray-600 mb-6">Génération automatisée de landing pages personnalisées</p>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step === currentStep
                    ? "bg-blue-600 text-white"
                    : step < currentStep
                    ? "bg-green-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {step < currentStep ? <Check className="w-5 h-5" /> : step}
              </div>
              {step < 5 && (
                <ChevronRight
                  className={`w-6 h-6 mx-2 ${step < currentStep ? "text-green-600" : "text-gray-300"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Titre de l'étape */}
        <h2 className="text-xl font-semibold">
          {currentStep === 1 && "Étape 1 — Sélection du segment HubSpot"}
          {currentStep === 2 && "Étape 2 — Catégorisation automatique"}
          {currentStep === 3 && "Étape 3 — Sélection des talents par catégorie"}
          {currentStep === 4 && "Étape 4 — Récapitulatif et ajustements"}
          {currentStep === 5 && "Étape 5 — Séquence + Génération + Envoi"}
        </h2>
      </div>

      {/* ============================================ */}
      {/* ÉTAPE 1 : SÉLECTION DU SEGMENT HUBSPOT */}
      {/* ============================================ */}
      {currentStep === 1 && (
        <div className="bg-white rounded-lg border p-6">
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un segment..."
                value={searchList}
                onChange={(e) => setSearchList(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <button
              onClick={loadLists}
              disabled={loadingLists}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loadingLists ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Rafraîchir
            </button>
          </div>

          {loadingLists ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => selectList(list.id, list.name)}
                  className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium">{list.name}</p>
                    <p className="text-sm text-gray-500">{list.contactCount || 0} contacts</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* ÉTAPE 2 : CATÉGORISATION AUTOMATIQUE */}
      {/* ============================================ */}
      {currentStep === 2 && (
        <div className="bg-white rounded-lg border p-6">
          <div className="mb-4">
            <p className="text-gray-600">
              {contacts.length} contacts — {brands.length} marques uniques
            </p>
          </div>

          {loadingCategorization ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
              <p className="text-gray-600">Catégorisation en cours avec Claude...</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {categoryCounts.map((cat) => (
                  <div key={cat.key} className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-2">
                      {cat.emoji} {cat.label} ({cat.count} marques)
                    </h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      {categorizedBrands
                        .filter((b) => b.category === cat.key)
                        .slice(0, 8)
                        .map((b, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="font-medium">{b.companyName}</span>
                            <span className="text-xs text-gray-400">
                              ({b.contacts.length} contact{b.contacts.length > 1 ? 's' : ''})
                            </span>
                          </div>
                        ))}
                      {categorizedBrands.filter((b) => b.category === cat.key).length > 8 && (
                        <p className="text-xs text-gray-500 mt-2">
                          ... et {categorizedBrands.filter((b) => b.category === cat.key).length - 8} autres
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-6 py-2 border rounded-lg hover:bg-gray-50"
                >
                  ← Retour
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Suivant →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* ÉTAPE 3 : SÉLECTION DES TALENTS PAR CATÉGORIE */}
      {/* ============================================ */}
      {currentStep === 3 && (
        <div className="bg-white rounded-lg border p-6">
          <div className="space-y-3">
            {categoryCounts.map((cat) => {
              const assigned = categoryTalents[cat.key]?.length || 0;
              const brandCount = categorizedBrands.filter((b) => b.category === cat.key).length;

              return (
                <div
                  key={cat.key}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div>
                    <h3 className="font-semibold">
                      {cat.emoji} {cat.label} ({brandCount} marques)
                    </h3>
                    <p className="text-sm text-gray-600">
                      {assigned > 0 ? `${assigned} talents sélectionnés` : "Aucun talent sélectionné"}
                    </p>
                  </div>
                  <button
                    onClick={() => openCategorySelector(cat.key)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Choisir ▾
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={() => setCurrentStep(2)} className="px-6 py-2 border rounded-lg hover:bg-gray-50">
              ← Retour
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ÉTAPE 4 : RÉCAPITULATIF */}
      {/* ============================================ */}
      {currentStep === 4 && (
        <div className="bg-white rounded-lg border p-6">
          <div className="mb-4 flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher une marque..."
                value={searchRecap}
                onChange={(e) => setSearchRecap(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="Toutes">Toutes les catégories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.emoji} {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-gray-600">
                  <th className="pb-2">Marque</th>
                  <th className="pb-2">Domaine</th>
                  <th className="pb-2">Contacts</th>
                  <th className="pb-2">Catégorie</th>
                  <th className="pb-2">Talents</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecap.map((brand) => {
                  const categoryInfo = CATEGORIES.find((c) => c.key === brand.category);
                  const talentsInfo = talents.filter((t) => brand.talentIds.includes(t.id));

                  return (
                    <tr key={brand.domain} className="border-b hover:bg-gray-50">
                      <td className="py-3 font-medium">{brand.companyName}</td>
                      <td className="py-3 text-sm text-gray-600">{brand.domain || '—'}</td>
                      <td className="py-3 text-sm">
                        {brand.contacts.length > 0 ? (
                          <span className="text-gray-600">
                            {brand.contacts.length} contact{brand.contacts.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3">
                        {categoryInfo?.emoji} {categoryInfo?.label}
                      </td>
                      <td className="py-3">
                        {talentsInfo.length > 0
                          ? talentsInfo.map((t) => t.name.split(" ")[0]).join(", ")
                          : "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {brand.talentIds.length > 0 && (
                            <button
                              onClick={() => previewBrand(brand)}
                              disabled={previewingBrand === brand.domain}
                              className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
                            >
                              {previewingBrand === brand.domain ? (
                                <>⏳ Génération...</>
                              ) : (
                                <>👁 Preview</>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => openBrandEditor(brand)}
                            className="text-blue-600 hover:underline"
                            title="Éditer la sélection de talents"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm">
              <strong>{categorizedBrands.filter((b) => b.talentIds.length > 0).length}</strong> /{" "}
              {categorizedBrands.length} marques prêtes (
              {categorizedBrands.filter((b) => b.talentIds.length === 0).length} sans talents)
            </p>
          </div>

          <div className="flex justify-between mt-6">
            <button onClick={() => setCurrentStep(3)} className="px-6 py-2 border rounded-lg hover:bg-gray-50">
              ← Retour
            </button>
            <button
              onClick={() => setCurrentStep(5)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ÉTAPE 5 : GÉNÉRATION */}
      {/* ============================================ */}
      {currentStep === 5 && (
        <div className="bg-white rounded-lg border p-6">
          <div className="p-4 bg-gray-50 rounded-lg mb-6">
            <p className="font-semibold mb-2">Résumé :</p>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>• {categorizedBrands.filter((b) => b.talentIds.length > 0).length} marques avec talents sélectionnés</li>
              <li>• {contacts.length} contacts HubSpot seront mis à jour</li>
              <li>
                • Le champ <code className="bg-white px-1 rounded">press_kit_url</code> sera mis à jour sur chaque contact
              </li>
              <li className="text-blue-600 font-medium mt-2">
                💡 Vous pourrez ensuite enrouler les contacts dans une séquence depuis HubSpot
              </li>
            </ul>
          </div>

          {isGenerating && (
            <div className="mb-6 p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Génération en cours...</span>
                <span className="text-sm text-gray-600">
                  {generationProgress.current} / {generationProgress.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCurrentStep(4)}
              disabled={isGenerating}
              className="px-6 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              ← Retour
            </button>
            <button
              onClick={startGeneration}
              disabled={isGenerating}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                  Génération...
                </>
              ) : (
                "🚀 Générer les press kits"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* MODAL : SÉLECTION DES TALENTS */}
      {/* ============================================ */}
      {(selectedCategory || editingBrand) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              {editingBrand ? (
                <>
                  <h3 className="text-xl font-bold">
                    Modifier la sélection pour {editingBrand.companyName}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {editingBrand.domain} • {editingBrand.contacts.length} contact{editingBrand.contacts.length > 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold">
                    {CATEGORIES.find((c) => c.key === selectedCategory)?.emoji}{" "}
                    Talents pour les marques {CATEGORIES.find((c) => c.key === selectedCategory)?.label}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {categorizedBrands.filter((b) => b.category === selectedCategory).length} marques
                  </p>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                {talents.map((talent) => {
                  const isSelected = tempSelectedTalents.includes(talent.id);

                  return (
                    <button
                      key={talent.id}
                      onClick={() => toggleTalentSelection(talent.id)}
                      className={`flex items-center gap-4 p-4 border rounded-lg text-left transition-colors ${
                        isSelected ? "border-blue-600 bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-5 h-5 pointer-events-none"
                      />
                      <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                        {talent.photo ? (
                          <img
                            src={talent.photo}
                            alt={talent.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            👤
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{talent.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {talent.niches.slice(0, 2).join(" · ")}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {((talent.igFollowers || 0) / 1000).toFixed(0)}K · {typeof talent.igEngagement === 'number' ? talent.igEngagement.toFixed(1) : Number(talent.igEngagement || 0).toFixed(1)}%
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t flex justify-between items-center">
              <p className="text-sm text-gray-600">{tempSelectedTalents.length} talents sélectionnés</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setEditingBrand(null);
                  }}
                  className="px-6 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={editingBrand ? saveBrandEdit : saveCategoryTalents}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Valider ✅
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
