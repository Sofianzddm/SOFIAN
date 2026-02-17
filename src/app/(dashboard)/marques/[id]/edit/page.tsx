"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  Building2,
  MapPin,
  Landmark,
  Globe,
  FileText,
  User,
  Plus,
  Trash2,
  AlertCircle,
  Mail,
  Phone,
  CreditCard,
  Clock,
  Sparkles,
  Search,
} from "lucide-react";

const SECTEURS = [
  "Mode",
  "Beauté",
  "Food & Beverage",
  "Sport",
  "Tech",
  "Lifestyle",
  "Santé & Bien-être",
  "Maison & Déco",
  "Voyage",
  "Automobile",
  "Finance",
  "Autre",
];

const FORMES_JURIDIQUES = ["SAS", "SARL", "SA", "EURL", "SASU", "Auto-entrepreneur", "Autre"];

interface Contact {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  poste: string;
  principal: boolean;
}

export default function EditMarquePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Si ?complete=true, commencer au step 2 (Adresse & Légal)
  const shouldComplete = searchParams.get("complete") === "true";
  const [activeStep, setActiveStep] = useState(shouldComplete ? 2 : 1);
  
  // Recherche API Recherche d'entreprises
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);

  const [formData, setFormData] = useState({
    nom: "",
    secteur: "",
    siteWeb: "",
    notes: "",
    adresseRue: "",
    adresseComplement: "",
    codePostal: "",
    ville: "",
    pays: "France",
    raisonSociale: "",
    formeJuridique: "",
    siret: "",
    numeroTVA: "",
    delaiPaiement: "30",
    modePaiement: "Virement",
    devise: "EUR",
    contacts: [] as Contact[],
  });

  useEffect(() => {
    fetchMarque();
  }, [params.id]);

  const fetchMarque = async () => {
    try {
      const res = await fetch(`/api/marques/${params.id}`);
      if (res.ok) {
        const marque = await res.json();
        setFormData({
          nom: marque.nom || "",
          secteur: marque.secteur || "",
          siteWeb: marque.siteWeb || "",
          notes: marque.notes || "",
          adresseRue: marque.adresseRue || "",
          adresseComplement: marque.adresseComplement || "",
          codePostal: marque.codePostal || "",
          ville: marque.ville || "",
          pays: marque.pays || "France",
          raisonSociale: marque.raisonSociale || "",
          formeJuridique: marque.formeJuridique || "",
          siret: marque.siret || "",
          numeroTVA: marque.numeroTVA || "",
          delaiPaiement: marque.delaiPaiement?.toString() || "30",
          modePaiement: marque.modePaiement || "Virement",
          devise: marque.devise || "EUR",
          contacts: marque.contacts || [],
        });
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const addContact = () => {
    setFormData({
      ...formData,
      contacts: [
        ...formData.contacts,
        {
          id: `new-${Date.now()}`,
          nom: "",
          email: "",
          telephone: "",
          poste: "",
          principal: formData.contacts.length === 0,
        },
      ],
    });
  };

  const updateContact = (id: string, field: keyof Contact, value: any) => {
    setFormData({
      ...formData,
      contacts: formData.contacts.map((c) =>
        c.id === id
          ? {
              ...c,
              [field]: field === "principal" ? value : value,
              ...(field === "principal" && value ? {} : {}),
            }
          : field === "principal" && value
          ? { ...c, principal: false }
          : c
      ),
    });
  };

  const removeContact = (id: string) => {
    const updatedContacts = formData.contacts.filter((c) => c.id !== id);
    if (updatedContacts.length > 0 && !updatedContacts.some((c) => c.principal)) {
      updatedContacts[0].principal = true;
    }
    setFormData({
      ...formData,
      contacts: updatedContacts,
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Recherche via API Recherche d'entreprises
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setShowResults(false);
    
    try {
      const res = await fetch(`/api/recherche-entreprise?query=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setShowResults(true);
      } else {
        alert("Erreur lors de la recherche");
      }
    } catch (error) {
      alert("Erreur de connexion");
    } finally {
      setSearching(false);
    }
  };

  // Auto-remplir depuis les résultats
  const fillFromPappers = (entreprise: any) => {
    setFormData({
      ...formData,
      raisonSociale: entreprise.nom_entreprise || entreprise.denomination || formData.nom,
      formeJuridique: entreprise.forme_juridique || "",
      siret: entreprise.siret || "",
      numeroTVA: entreprise.numero_tva_intracommunautaire || "",
      adresseRue: entreprise.adresse || "",
      adresseComplement: entreprise.complement || "",
      codePostal: entreprise.code_postal || "",
      ville: entreprise.ville || "",
      pays: entreprise.pays || "France",
    });
    
    setShowResults(false);
    setSearchQuery("");
    alert("✅ Informations importées !");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/marques/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        router.push(`/marques/${params.id}`);
      } else {
        const error = await res.json();
        alert(error.message || "Erreur lors de la mise à jour");
      }
    } catch (error) {
      alert("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  const steps = [
    { id: 1, name: "Informations", icon: Building2 },
    { id: 2, name: "Adresse & Légal", icon: Landmark },
    { id: 3, name: "Contacts", icon: User },
    { id: 4, name: "Facturation", icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/marques/${params.id}`}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-glowup-licorice">Modifier la marque</h1>
            <p className="text-gray-500 text-sm">
              {formData.nom} • Étape {activeStep} sur {steps.length}
            </p>
          </div>
        </div>
      </div>

      {/* 🔍 Recherche entreprise via API Recherche d'entreprises */}
      {activeStep === 2 && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-purple-900 text-lg">
                🔍 Auto-complétion via API Recherche d'entreprises
              </h3>
              <p className="text-sm text-purple-700 mt-1">
                Recherchez l'entreprise par nom ou SIRET pour importer automatiquement ses données légales
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              placeholder={`Rechercher "${formData.nom}" ou entrer un SIRET...`}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-purple-200 focus:outline-none focus:border-purple-500 bg-white"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-6 py-3 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {searching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recherche...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Rechercher
                </>
              )}
            </button>
          </div>

          {/* Résultats */}
          {showResults && (
            <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="bg-white rounded-xl p-4 text-center text-gray-500">
                  Aucun résultat trouvé
                </div>
              ) : (
                searchResults.map((entreprise, index) => (
                  <button
                    key={index}
                    onClick={() => fillFromPappers(entreprise)}
                    className="w-full bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-purple-400 hover:shadow-lg transition-all text-left group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-bold text-glowup-licorice group-hover:text-purple-600 transition-colors">
                          {entreprise.nom_entreprise}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {entreprise.forme_juridique} • SIRET: {entreprise.siret}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {entreprise.adresse}, {entreprise.code_postal} {entreprise.ville}
                        </p>
                        {entreprise.numero_tva_intracommunautaire && (
                          <p className="text-xs text-gray-500 mt-1">
                            TVA: {entreprise.numero_tva_intracommunautaire}
                          </p>
                        )}
                      </div>
                      <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">
                        Importer →
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Steps */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => setActiveStep(step.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeStep === step.id
                ? "bg-glowup-licorice text-white"
                : activeStep > step.id
                ? "bg-glowup-green/20 text-glowup-licorice"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <step.icon className="w-4 h-4" />
            {step.name}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Informations */}
        {activeStep === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-glowup-rose/10 rounded-lg">
                  <Building2 className="w-5 h-5 text-glowup-rose" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Informations générales</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Nom de la marque *</label>
                  <input
                    type="text"
                    name="nom"
                    value={formData.nom}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Secteur</label>
                  <select name="secteur" value={formData.secteur} onChange={handleChange} className={inputClass}>
                    <option value="">Sélectionner...</option>
                    {SECTEURS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Site web</label>
                  <input
                    type="url"
                    name="siteWeb"
                    value={formData.siteWeb}
                    onChange={handleChange}
                    placeholder="https://www.marque.com"
                    className={inputClass}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Notes internes sur la marque..."
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Adresse & Légal */}
        {activeStep === 2 && (
          <div className="space-y-6">
            {/* Adresse */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Adresse</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Adresse (rue)</label>
                  <input
                    type="text"
                    name="adresseRue"
                    value={formData.adresseRue}
                    onChange={handleChange}
                    placeholder="123 rue de la Paix"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Complément</label>
                  <input
                    type="text"
                    name="adresseComplement"
                    value={formData.adresseComplement}
                    onChange={handleChange}
                    placeholder="Bâtiment A, Étage 3..."
                    className={inputClass}
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Code postal</label>
                    <input
                      type="text"
                      name="codePostal"
                      value={formData.codePostal}
                      onChange={handleChange}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Ville</label>
                    <input
                      type="text"
                      name="ville"
                      value={formData.ville}
                      onChange={handleChange}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Pays</label>
                    <input
                      type="text"
                      name="pays"
                      value={formData.pays}
                      onChange={handleChange}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Légal */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Landmark className="w-5 h-5 text-purple-600" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Informations légales</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Raison sociale</label>
                  <input
                    type="text"
                    name="raisonSociale"
                    value={formData.raisonSociale}
                    onChange={handleChange}
                    placeholder="Entreprise SAS"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Forme juridique</label>
                  <select
                    name="formeJuridique"
                    value={formData.formeJuridique}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="">Sélectionner...</option>
                    {FORMES_JURIDIQUES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>SIRET</label>
                  <input
                    type="text"
                    name="siret"
                    value={formData.siret}
                    onChange={handleChange}
                    placeholder="123 456 789 00012"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Numéro TVA</label>
                  <input
                    type="text"
                    name="numeroTVA"
                    value={formData.numeroTVA}
                    onChange={handleChange}
                    placeholder="FR12345678901"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Contacts */}
        {activeStep === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <User className="w-5 h-5 text-amber-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-glowup-licorice">Contacts</h2>
                </div>
                <button
                  type="button"
                  onClick={addContact}
                  className="flex items-center gap-2 px-4 py-2 bg-glowup-licorice text-white rounded-xl hover:bg-glowup-licorice/90 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter
                </button>
              </div>

              {formData.contacts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <User className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun contact. Cliquez sur "Ajouter" pour commencer.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.contacts.map((contact, index) => (
                    <div key={contact.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start gap-4">
                        <span className="w-8 h-8 bg-glowup-lace rounded-full flex items-center justify-center text-sm font-bold text-glowup-licorice flex-shrink-0">
                          {index + 1}
                        </span>
                        <div className="flex-1 space-y-3">
                          <div className="grid md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Nom *</label>
                              <input
                                type="text"
                                value={contact.nom}
                                onChange={(e) => updateContact(contact.id, "nom", e.target.value)}
                                required
                                placeholder="Prénom Nom"
                                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Poste</label>
                              <input
                                type="text"
                                value={contact.poste}
                                onChange={(e) => updateContact(contact.id, "poste", e.target.value)}
                                placeholder="Marketing Manager"
                                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose"
                              />
                            </div>
                          </div>
                          <div className="grid md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Email</label>
                              <input
                                type="email"
                                value={contact.email}
                                onChange={(e) => updateContact(contact.id, "email", e.target.value)}
                                placeholder="contact@marque.com"
                                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                              <input
                                type="tel"
                                value={contact.telephone}
                                onChange={(e) =>
                                  updateContact(contact.id, "telephone", e.target.value)
                                }
                                placeholder="+33 6 12 34 56 78"
                                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-rose"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`principal-${contact.id}`}
                              checked={contact.principal}
                              onChange={(e) =>
                                updateContact(contact.id, "principal", e.target.checked)
                              }
                              className="w-4 h-4 text-glowup-rose border-gray-300 rounded focus:ring-glowup-rose"
                            />
                            <label
                              htmlFor={`principal-${contact.id}`}
                              className="text-xs text-gray-700"
                            >
                              Contact principal
                            </label>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeContact(contact.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Facturation */}
        {activeStep === 4 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Paramètres de facturation</h2>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Délai de paiement (jours)</label>
                  <input
                    type="number"
                    name="delaiPaiement"
                    value={formData.delaiPaiement}
                    onChange={handleChange}
                    placeholder="30"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Mode de paiement</label>
                  <select
                    name="modePaiement"
                    value={formData.modePaiement}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="Virement">Virement</option>
                    <option value="Chèque">Chèque</option>
                    <option value="Carte bancaire">Carte bancaire</option>
                    <option value="Prélèvement">Prélèvement</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Devise</label>
                  <select
                    name="devise"
                    value={formData.devise}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 text-sm">💡 Information</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Ces paramètres seront utilisés par défaut lors de la génération de documents (devis, factures) pour cette marque.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          {activeStep > 1 ? (
            <button
              type="button"
              onClick={() => setActiveStep(activeStep - 1)}
              className="px-6 py-2.5 text-gray-500 hover:text-glowup-licorice"
            >
              Précédent
            </button>
          ) : (
            <div />
          )}

          {activeStep < steps.length ? (
            <button
              type="button"
              onClick={() => setActiveStep(activeStep + 1)}
              className="px-6 py-2.5 bg-glowup-licorice text-white rounded-xl hover:bg-glowup-licorice/90 transition-colors"
            >
              Suivant
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
