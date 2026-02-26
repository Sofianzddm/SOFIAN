"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, ChevronRight, ChevronLeft, Search, Check, X, Eye, AlertCircle, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { formatBlocTalents, BLOC_EMOJIS, formatFollowers, type BlocFormat } from "@/lib/presskit-bloc";

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
  customName?: string; // Nom personnalisé modifiable par l'utilisateur
}

type Step = 1 | 2 | 3 | 4 | 5;

function pressKitSlugFromCompanyName(companyName: string): string {
  return companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
  const [mode, setMode] = useState<"hubspot" | "manual">("hubspot");

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

  // ÉTAPE 3 : Sélection des talents (catégorie / marque)
  const [talents, setTalents] = useState<Talent[]>([]);
  const [categoryTalents, setCategoryTalents] = useState<Record<string, string[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [tempSelectedTalents, setTempSelectedTalents] = useState<string[]>([]);
  const [step3Tab, setStep3Tab] = useState<"category" | "brand">("category");

  // ÉTAPE 4 : Récap + ajustements
  const [searchRecap, setSearchRecap] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("Toutes");
  const [isGeneratingAllBlocks, setIsGeneratingAllBlocks] = useState(false);
  const [generateBlocksProgress, setGenerateBlocksProgress] = useState({
    current: 0,
    total: 0,
  });

  // Panel slide "Bloc email" (étape 4)
  const [blocPanelSlug, setBlocPanelSlug] = useState<string | null>(null);

  // ÉTAPE 5 : Génération
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  
  // Preview
  const [previewingBrand, setPreviewingBrand] = useState<string | null>(null);

  // Mode manuel (sélection pour une seule marque)
  const [manualBrandName, setManualBrandName] = useState("");
  const [manualDomain, setManualDomain] = useState("");
  const [manualSelectedTalents, setManualSelectedTalents] = useState<string[]>([]);
  const [manualSearch, setManualSearch] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

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

  // Charger les talents aussi quand on passe en mode manuel seul
  useEffect(() => {
    if (mode === "manual" && talents.length === 0) {
      loadTalents();
    }
  }, [mode, talents.length]);

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

  function toggleManualTalent(talentId: string) {
    setManualSelectedTalents((prev) =>
      prev.includes(talentId) ? prev.filter((id) => id !== talentId) : [...prev, talentId]
    );
  }

  async function generateManualPresskit() {
    if (!manualBrandName.trim()) {
      setManualError("Merci d'indiquer un nom de marque.");
      return;
    }
    if (manualSelectedTalents.length === 0) {
      setManualError("Sélectionne au moins un talent.");
      return;
    }

    setManualLoading(true);
    setManualError(null);
    setManualUrl(null);

    try {
      const res = await fetch("/api/presskit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: manualBrandName.trim(),
          domain: manualDomain.trim() || null,
          talentIds: manualSelectedTalents,
          contacts: [],
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setManualError(data.message || "Erreur lors de la génération du lien.");
        return;
      }

      const base =
        typeof window !== "undefined" ? window.location.origin : "https://app.glowupagence.fr";
      setManualUrl(`${base}${data.url}`);
    } catch (error) {
      console.error("Erreur génération manuelle:", error);
      setManualError("Erreur lors de la génération du lien.");
    } finally {
      setManualLoading(false);
    }
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
          companyName: brand.customName || brand.companyName, // Utiliser le nom personnalisé si défini
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

  // Générer tous les blocs email (pitches) pour toutes les marques prêtes
  async function generateAllBlocks() {
    const brandsReady = categorizedBrands.filter((b) => b.talentIds.length > 0);
    if (brandsReady.length === 0) {
      alert("Aucune marque avec talents sélectionnés pour générer les blocs.");
      return;
    }

    setIsGeneratingAllBlocks(true);
    setGenerateBlocksProgress({ current: 0, total: brandsReady.length });

    const failed: string[] = [];
    let current = 0;

    for (const brand of brandsReady) {
      const label = brand.customName || brand.companyName;
      try {
        // 1. S'assurer que le press kit et les PressKitTalent existent et sont synchro
        const previewRes = await fetch("/api/presskit/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: label,
            domain: brand.domain,
            talentIds: brand.talentIds,
            contacts: brand.contacts,
          }),
        });

        if (!previewRes.ok) {
          failed.push(label);
        } else {
          const previewData = await previewRes.json();
          const slug =
            previewData.slug ||
            pressKitSlugFromCompanyName(label);

          // 2. Récupérer l'id de la marque depuis l'API presskit
          const presskitRes = await fetch(`/api/presskit/${slug}`);
          if (!presskitRes.ok) {
            failed.push(label);
          } else {
            const presskitJson = await presskitRes.json();
            const brandId = presskitJson.brandId as string | undefined;
            if (!brandId) {
              failed.push(label);
            } else {
              // 3. Générer tous les pitches pour cette marque
              const pitchesRes = await fetch("/api/presskit/generate-all-pitches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ brandId }),
              });
              if (!pitchesRes.ok) {
                failed.push(label);
              }
            }
          }
        }
      } catch (error) {
        console.error("Erreur génération bloc email pour la marque:", label, error);
        failed.push(label);
      } finally {
        current += 1;
        setGenerateBlocksProgress({ current, total: brandsReady.length });
      }
    }

    setIsGeneratingAllBlocks(false);

    if (failed.length > 0) {
      alert(
        `✅ Blocs générés pour ${brandsReady.length - failed.length} marque(s).\n` +
          `❌ Erreur pour :\n- ${failed.join(
            "\n- "
          )}\n\nTu peux relancer plus tard pour celles qui ont échoué.`
      );
    } else {
      alert(`✅ Blocs générés pour ${brandsReady.length} marques !`);
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
            companyName: brand.customName || brand.companyName, // Utiliser le nom personnalisé si défini
            domain: brand.domain,
            talentIds: brand.talentIds,
          })),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const completed = data.completed ?? brandsReady.length;
        const failed = data.failed ?? 0;
        const failedBrands: string[] = data.failedBrands ?? [];

        if (failed > 0) {
          alert(
            `✅ ${completed} press kits générés.\n❌ ${failed} marque(s) en erreur :\n- ${failedBrands.join(
              "\n- "
            )}\n\nTu peux relancer plus tard pour celles qui ont échoué.`
          );
        } else {
          alert(`✅ ${completed} press kits générés et envoyés !`);
        }

        setGenerationProgress({ current: completed, total: data.total ?? brandsReady.length });
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
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Press Kit System v5</h1>
            <p className="text-gray-600">
              Génération de landing pages personnalisées pour la prospection.
            </p>
          </div>
          <div className="inline-flex rounded-full border bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setMode("hubspot")}
              className={`px-4 py-1.5 text-sm rounded-full ${
                mode === "hubspot"
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Mode HubSpot
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`px-4 py-1.5 text-sm rounded-full ${
                mode === "manual"
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Sélection manuelle
            </button>
          </div>
        </div>

        {mode === "hubspot" && (
          <>
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
                      className={`w-6 h-6 mx-2 ${
                        step < currentStep ? "text-green-600" : "text-gray-300"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Titre de l'étape */}
            <h2 className="text-xl font-semibold">
              {currentStep === 1 && "Étape 1 — Sélection du segment HubSpot"}
              {currentStep === 2 && "Étape 2 — Catégorisation automatique"}
              {currentStep === 3 && "Étape 3 — Sélection des talents par catégorie / marque"}
              {currentStep === 4 && "Étape 4 — Récapitulatif et ajustements"}
              {currentStep === 5 && "Étape 5 — Séquence + Génération + Envoi"}
            </h2>
          </>
        )}

        {mode === "manual" && (
          <h2 className="text-xl font-semibold mt-4">
            Sélection manuelle — Faire un press kit pour une marque
          </h2>
        )}
      </div>

      {mode === "hubspot" && (
        <>
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
              <p className="text-gray-600">Catégorisation en cours...</p>
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
      {/* ÉTAPE 3 : SÉLECTION DES TALENTS PAR CATÉGORIE / PAR MARQUE */}
      {/* ============================================ */}
      {currentStep === 3 && (
        <div className="bg-white rounded-lg border p-6">
          {/* Onglets mode de sélection */}
          <div className="mb-4 inline-flex rounded-full border bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setStep3Tab("category")}
              className={`px-4 py-1.5 text-sm rounded-full ${
                step3Tab === "category"
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Par catégorie
            </button>
            <button
              type="button"
              onClick={() => setStep3Tab("brand")}
              className={`px-4 py-1.5 text-sm rounded-full ${
                step3Tab === "brand"
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Par marque (optionnel)
            </button>
          </div>

          {/* Vue par catégorie (comme avant) */}
          {step3Tab === "category" && (
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
          )}

          {/* Vue par marque : affiner la sélection marque par marque */}
          {step3Tab === "brand" && (
            <div className="space-y-3 mt-2">
              {categorizedBrands.map((brand) => {
                const catMeta = CATEGORIES.find((c) => c.key === brand.category);
                const talentsCount = brand.talentIds.length;
                return (
                  <div
                    key={brand.domain}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {brand.customName || brand.companyName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{brand.domain}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {catMeta && (
                          <>
                            {catMeta.emoji} {catMeta.label} •{" "}
                          </>
                        )}
                        {talentsCount > 0
                          ? `${talentsCount} talents sélectionnés`
                          : "Aucun talent sélectionné"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openBrandEditor(brand)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      Sélectionner les talents
                    </button>
                  </div>
                );
              })}
              {categorizedBrands.length === 0 && (
                <div className="text-sm text-gray-500">
                  Aucune marque pour le moment. Revenez ici après la catégorisation.
                </div>
              )}
            </div>
          )}

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
          <div className="mb-4 flex gap-4 items-center">
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
            <button
              type="button"
              onClick={generateAllBlocks}
              disabled={
                isGeneratingAllBlocks ||
                !categorizedBrands.some((b) => b.talentIds.length > 0)
              }
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {isGeneratingAllBlocks ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Génération blocs...
                  {generateBlocksProgress.total > 0 && (
                    <span className="text-xs">
                      {generateBlocksProgress.current}/{generateBlocksProgress.total}
                    </span>
                  )}
                </>
              ) : (
                <>Générer tous les blocs</>
              )}
            </button>
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
                  const brandSlug = pressKitSlugFromCompanyName(brand.customName || brand.companyName);
                  const isPanelActive = blocPanelSlug === brandSlug;

                  return (
                    <tr
                      key={brand.domain}
                      className={`border-b hover:bg-gray-50 cursor-pointer ${isPanelActive ? "bg-blue-50" : ""}`}
                      onClick={(e) => {
                        if (
                          brand.talentIds.length > 0 &&
                          !(e.target as HTMLElement).closest("button") &&
                          !(e.target as HTMLElement).closest("input")
                        ) {
                          setBlocPanelSlug(brandSlug);
                        }
                      }}
                    >
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={brand.customName || brand.companyName}
                            onChange={(e) => {
                              const newName = e.target.value;
                              setCategorizedBrands((prev) =>
                                prev.map((b) =>
                                  b.domain === brand.domain
                                    ? { ...b, customName: newName }
                                    : b
                                )
                              );
                            }}
                            className="font-medium px-2 py-1 border border-gray-200 rounded hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                            placeholder="Nom de la marque"
                          />
                          <span className="text-xs text-gray-400">✏️</span>
                        </div>
                      </td>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {brand.talentIds.length > 0 && (
                            <>
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
                              <button
                                type="button"
                                onClick={() => setBlocPanelSlug(brandSlug)}
                                className="px-3 py-1 text-sm bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center gap-1"
                              >
                                Bloc email
                              </button>
                            </>
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
                • Génération du press kit + mise à jour des champs <code className="bg-white px-1 rounded">press_kit_url</code> et <code className="bg-white px-1 rounded">bloc_talents</code> sur chaque contact
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

        </>
      )}

      {/* ============================================ */}
      {/* MODE MANUEL : SÉLECTION POUR UNE MARQUE */}
      {/* ============================================ */}
      {mode === "manual" && (
        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Nom de la marque *
              </label>
              <input
                type="text"
                value={manualBrandName}
                onChange={(e) => setManualBrandName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="Ex: Sephora, Nike..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Domaine (optionnel)
              </label>
              <input
                type="text"
                value={manualDomain}
                onChange={(e) => setManualDomain(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="Ex: sephora.fr"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">
                Sélection des talents
              </label>
              <input
                type="text"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm"
                placeholder="Rechercher un talent..."
              />
            </div>
            <div className="border rounded-lg max-h-80 overflow-y-auto">
              {talents
                .filter((t) =>
                  t.name.toLowerCase().includes(manualSearch.toLowerCase())
                )
                .map((talent) => {
                  const selected = manualSelectedTalents.includes(talent.id);
                  return (
                    <button
                      key={talent.id}
                      type="button"
                      onClick={() => toggleManualTalent(talent.id)}
                      className={`w-full flex items-center justify-between px-4 py-2 text-sm border-b last:border-b-0 text-left ${
                        selected ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="truncate">{talent.name}</span>
                      {selected && (
                        <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              {talents.length === 0 && (
                <div className="p-4 text-sm text-gray-500">
                  Chargement des talents...
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {manualSelectedTalents.length} talent
              {manualSelectedTalents.length > 1 ? "s" : ""} sélectionné
              {manualSelectedTalents.length > 1 ? "s" : ""}.
            </p>
          </div>

          {manualError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {manualError}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={generateManualPresskit}
              disabled={manualLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {manualLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>Générer le lien press kit</>
              )}
            </button>

            {manualUrl && (
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">
                  Lien généré pour cette marque :
                </p>
                <a
                  href={manualUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  {manualUrl}
                </a>
              </div>
            )}
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
              {tempSelectedTalents.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    💡 <strong>{tempSelectedTalents.length} talent{tempSelectedTalents.length > 1 ? 's' : ''} sélectionné{tempSelectedTalents.length > 1 ? 's' : ''}</strong> pour cette catégorie
                  </p>
                </div>
              )}
              
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

      {/* Panel slide Bloc email (étape 4) */}
      {mode === "hubspot" && currentStep === 4 && blocPanelSlug && (
        <BlocEmailSlidePanel
          slug={blocPanelSlug}
          recapBrands={filteredRecap
            .filter((b) => b.talentIds.length > 0)
            .map((b) => ({
              slug: pressKitSlugFromCompanyName(b.customName || b.companyName),
              companyName: b.customName || b.companyName,
              domain: b.domain,
              talentIds: b.talentIds,
              contacts: b.contacts,
            }))}
          onClose={() => setBlocPanelSlug(null)}
          onSelectSlug={setBlocPanelSlug}
        />
      )}
    </div>
  );
}

// ============================================
// PANEL SLIDE BLOC EMAIL
// ============================================

type TalentBlocPanel = {
  id: string;
  pressKitTalentId: string;
  prenom: string;
  name: string;
  pitch: string;
  instagram: string | null;
  followers: number;
  ttFollowers: number;
  ytAbonnes?: number | null;
};

type BrandDataPanel = {
  brandId: string;
  slug: string;
  name: string;
  talents: TalentBlocPanel[];
};

function BlocEmailSlidePanel({
  slug,
  recapBrands,
  onClose,
  onSelectSlug,
}: {
  slug: string;
  recapBrands: {
    slug: string;
    companyName: string;
    domain: string;
    talentIds: string[];
    contacts: { hubspotContactId: string; email: string }[];
  }[];
  onClose: () => void;
  onSelectSlug: (slug: string) => void;
}) {
  const [data, setData] = useState<BrandDataPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPitches, setEditingPitches] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [usePlainText, setUsePlainText] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setPanelMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const fetchBrand = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const meta = recapBrands.find((b) => b.slug === s);
      if (!meta) {
        setError("Données de marque introuvables dans le récap.");
        setData(null);
        return;
      }

      // Toujours resynchroniser le presskit avec la sélection actuelle
      const previewRes = await fetch("/api/presskit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: meta.companyName,
          domain: meta.domain,
          talentIds: meta.talentIds,
          contacts: meta.contacts,
        }),
      });

      if (!previewRes.ok) {
        setError("Erreur lors de la préparation du bloc email.");
        setData(null);
        return;
      }

      const previewJson = await previewRes.json();
      const newSlug = previewJson.slug || s;

      const res = await fetch(`/api/presskit/${newSlug}`);
      if (!res.ok) {
        setError("Press kit introuvable après génération.");
        setData(null);
        return;
      }

      const json = await res.json();

      setData({
        brandId: json.brandId,
        slug: json.slug,
        name: json.name,
        talents: (json.talents || []).map((t: any) => ({
          id: t.id,
          pressKitTalentId: t.pressKitTalentId,
          prenom: t.prenom,
          name: t.name,
          pitch: t.pitch || "",
          instagram: t.instagram ?? null,
          followers: t.followers ?? 0,
          ttFollowers: t.ttFollowers ?? 0,
          ytAbonnes: t.ytAbonnes ?? 0,
        })),
      });
      setEditingPitches({});

      if (newSlug !== s) {
        onSelectSlug(newSlug);
      }
    } catch (e) {
      console.error("Erreur fetchBrand panel bloc email:", e);
      setError("Erreur réseau");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [recapBrands, onSelectSlug]);

  useEffect(() => {
    fetchBrand(slug);
  }, [slug, fetchBrand]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!data || e.target instanceof HTMLTextAreaElement) return;
      const idx = recapBrands.findIndex((b) => b.slug === slug);
      if (e.key === "ArrowLeft" || e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        onSelectSlug(recapBrands[idx - 1].slug);
      }
      if (e.key === "ArrowDown" && idx >= 0 && idx < recapBrands.length - 1) {
        e.preventDefault();
        onSelectSlug(recapBrands[idx + 1].slug);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [slug, data, recapBrands, onClose, onSelectSlug]);

  const handlePitchBlur = async (pressKitTalentId: string, value: string) => {
    const current = data?.talents.find((t) => t.pressKitTalentId === pressKitTalentId)?.pitch ?? "";
    if (value.trim() === current) return;
    setSavingId(pressKitTalentId);
    try {
      const res = await fetch("/api/presskit/update-pitch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pressKitTalentId, pitch: value.trim() }),
      });
      if (res.ok && data) {
        setData({
          ...data,
          talents: data.talents.map((t) =>
            t.pressKitTalentId === pressKitTalentId ? { ...t, pitch: value.trim() } : t
          ),
        });
        setEditingPitches((p) => {
          const next = { ...p };
          delete next[pressKitTalentId];
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingId(null);
    }
  };

  const saveDebounceRef = useRef<Record<string, any>>({});

  const schedulePitchSave = (pressKitTalentId: string, value: string) => {
    // Met à jour l'état local immédiatement pour la preview
    setEditingPitches((p) => ({ ...p, [pressKitTalentId]: value }));

    // Debounce la sauvegarde pour éviter de spam l'API
    const timers = saveDebounceRef.current;
    if (timers[pressKitTalentId]) {
      clearTimeout(timers[pressKitTalentId]);
    }
    timers[pressKitTalentId] = setTimeout(() => {
      handlePitchBlur(pressKitTalentId, value);
    }, 500);
  };

  const handleRegenerateOne = async (talentId: string) => {
    if (!data) return;
    setRegeneratingId(talentId);
    try {
      const res = await fetch("/api/presskit/generate-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: data.brandId, talentId }),
      });
      const json = await res.json();
      if (res.ok && json.pitch) {
        setData({
          ...data,
          talents: data.talents.map((t) =>
            t.id === talentId ? { ...t, pitch: json.pitch } : t
          ),
        });
        setEditingPitches((p) => {
          const next = { ...p };
          const pkId = data.talents.find((t) => t.id === talentId)?.pressKitTalentId;
          if (pkId) delete next[pkId];
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRegenerateAll = async () => {
    if (!data) return;
    setRegeneratingAll(true);
    try {
      const res = await fetch("/api/presskit/generate-all-pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: data.brandId }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.pitches)) {
        setData({
          ...data,
          talents: data.talents.map((t, i) => {
            const next = json.pitches[i];
            // Si l'API n'a pas renvoyé de pitch ou une chaîne vide, on garde l'ancien
            if (typeof next !== "string" || next.trim() === "") {
              return { ...t };
            }
            return { ...t, pitch: next };
          }),
        });
        setEditingPitches({});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRegeneratingAll(false);
    }
  };

  const moveTalent = async (index: number, direction: -1 | 1) => {
    if (!data) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= data.talents.length) return;

    const newTalents = [...data.talents];
    const [moved] = newTalents.splice(index, 1);
    newTalents.splice(newIndex, 0, moved);

    setData({ ...data, talents: newTalents });

    try {
      await fetch("/api/presskit/reorder-talents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: data.brandId,
          talentIds: newTalents.map((t) => t.id),
        }),
      });
    } catch (e) {
      console.error("Erreur reorder talents:", e);
    }
  };
  const currentIndex = recapBrands.findIndex((b) => b.slug === slug);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < recapBrands.length - 1;
  const blocFormat: BlocFormat = usePlainText ? "plain" : "html";
  const previewText = data
    ? formatBlocTalents(
        data.talents.map((t) => ({
          prenom: t.prenom,
          pitch: editingPitches[t.pressKitTalentId] ?? t.pitch,
          instagramHandle: t.instagram?.replace(/^@/, "").trim() || null,
          igFollowers: t.followers,
          ttFollowers: t.ttFollowers,
          ytAbonnes: t.ytAbonnes,
        })),
        blocFormat
      )
    : "";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex"
        aria-modal
        role="dialog"
      >
        <div
          className="flex-1 bg-black/30 transition-opacity"
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={panelRef}
          className={`w-full max-w-[55%] min-w-[320px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            panelMounted ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}
        >
          {/* Header */}
            <div className="flex items-center justify-between gap-4 p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => hasPrev && onSelectSlug(recapBrands[currentIndex - 1].slug)}
                disabled={!hasPrev}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none text-gray-600"
                aria-label="Marque précédente"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => hasNext && onSelectSlug(recapBrands[currentIndex + 1].slug)}
                disabled={!hasNext}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none text-gray-600"
                aria-label="Marque suivante"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-500">
                {currentIndex >= 0 ? `${currentIndex + 1} / ${recapBrands.length}` : "—"}
              </span>
            </div>
            <h2 className="text-lg font-semibold truncate flex-1 text-center">
              {data?.name ?? slug}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRegenerateAll}
                disabled={regeneratingAll || !data}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {regeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Régénérer tout
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            )}
            {error && (
              <div className="py-4 text-amber-700 bg-amber-50 rounded-lg px-4">
                {error}
              </div>
            )}
            {!loading && data && (
              <>
                <label className="flex items-center gap-2 cursor-pointer mb-4">
                  <input
                    type="checkbox"
                    checked={usePlainText}
                    onChange={(e) => setUsePlainText(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Format texte brut</span>
                </label>

                <section className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Bloc Email (éditable)</h3>
                  <div className="space-y-3">
                    {data.talents.map((talent, index) => {
                      const emoji = BLOC_EMOJIS[index % BLOC_EMOJIS.length];
                      const pitchValue = editingPitches[talent.pressKitTalentId] ?? talent.pitch;
                      const parts: string[] = [];
                      if (talent.followers > 0) parts.push(`${formatFollowers(talent.followers)} sur Instagram`);
                      if (talent.ttFollowers > 0) parts.push(`${formatFollowers(talent.ttFollowers)} sur TikTok`);
                      if (Number(talent.ytAbonnes ?? 0) > 0) parts.push(`${formatFollowers(Number(talent.ytAbonnes))} sur YouTube`);
                      const statsStr = parts.join(" · ");
                      return (
                        <div key={talent.id} className="border rounded-lg p-3 bg-gray-50/50">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col mr-1">
                                <button
                                  type="button"
                                  onClick={() => moveTalent(index, -1)}
                                  disabled={index === 0}
                                  className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                                >
                                  <ChevronUp className="w-3 h-3 text-gray-500" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveTalent(index, 1)}
                                  disabled={index === data.talents.length - 1}
                                  className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                                >
                                  <ChevronDown className="w-3 h-3 text-gray-500" />
                                </button>
                              </div>
                              <span className="text-sm font-medium text-gray-700">
                                {talent.prenom} — {statsStr || "—"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRegenerateOne(talent.id)}
                              disabled={regeneratingId === talent.id}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                              {regeneratingId === talent.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Régénérer
                            </button>
                          </div>
                          <textarea
                            value={pitchValue}
                            onChange={(e) => schedulePitchSave(talent.pressKitTalentId, e.target.value)}
                            className="w-full px-2 py-1.5 border rounded text-sm min-h-[52px]"
                            placeholder="Pitch..."
                          />
                          {savingId === talent.pressKitTalentId && (
                            <p className="text-xs text-gray-500 mt-1">Enregistrement…</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Aperçu</h3>
                  {blocFormat === "html" ? (
                    <div
                      className="bg-gray-50 border rounded-lg p-3 text-sm prose prose-sm max-w-none [&_a]:text-[#E1306C] [&_a]:underline [&_a]:font-bold"
                      dangerouslySetInnerHTML={{
                        __html: previewText
                          ? previewText.split("\n\n").map((line) => `<p class="mb-1 last:mb-0">${line}</p>`).join("")
                          : "<p class='text-gray-500'>(Aucun pitch)</p>",
                      }}
                    />
                  ) : (
                    <pre className="bg-gray-50 border rounded-lg p-3 text-xs whitespace-pre-wrap font-sans">
                      {previewText || "(Aucun pitch)"}
                    </pre>
                  )}
                </section>

                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <span>HubSpot :</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    En attente
                  </span>
                  <span className="text-xs">(poussé à l’étape 5)</span>
                </p>
              </>
            )}
          </div>

          {/* Footer nav */}
          {!loading && data && recapBrands.length > 1 && (
            <div className="p-4 border-t flex justify-between items-center bg-gray-50/50">
              <button
                type="button"
                onClick={() => hasPrev && onSelectSlug(recapBrands[currentIndex - 1].slug)}
                disabled={!hasPrev}
                className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                ← Précédent
              </button>
              <button
                type="button"
                onClick={() => hasNext && onSelectSlug(recapBrands[currentIndex + 1].slug)}
                disabled={!hasNext}
                className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
