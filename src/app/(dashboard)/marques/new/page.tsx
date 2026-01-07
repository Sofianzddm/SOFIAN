"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  Users,
  CreditCard,
  Globe,
  MapPin,
  Mail,
  Phone,
  User,
  Plus,
  Trash2,
  Save,
  Loader2,
  FileText,
  Banknote,
} from "lucide-react";

const STEPS = [
  { id: 1, name: "Informations", icon: Building2 },
  { id: 2, name: "Contacts", icon: Users },
  { id: 3, name: "Facturation", icon: CreditCard },
];

const SECTEURS = [
  "Beauté",
  "Mode",
  "Food",
  "Tech",
  "Sport",
  "Lifestyle",
  "Luxe",
  "Automobile",
  "Finance",
  "Santé",
  "Voyage",
  "Entertainment",
];

interface Contact {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  poste: string;
  principal: boolean;
}

export default function NewMarquePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    // Step 1 - Infos
    nom: "",
    secteur: "",
    siteWeb: "",
    notes: "",

    // Adresse
    adresseRue: "",
    adresseComplement: "",
    codePostal: "",
    ville: "",
    pays: "France",

    // Step 3 - Facturation
    raisonSociale: "",
    formeJuridique: "",
    siret: "",
    numeroTVA: "",
    delaiPaiement: "30",
    modePaiement: "Virement",
    devise: "EUR",
  });

  const [contacts, setContacts] = useState<Contact[]>([
    { id: "1", nom: "", email: "", telephone: "", poste: "", principal: true },
  ]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleContactChange = (id: string, field: string, value: string | boolean) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return { ...c, [field]: value };
        }
        if (field === "principal" && value === true) {
          return { ...c, principal: false };
        }
        return c;
      })
    );
  };

  const addContact = () => {
    setContacts((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        nom: "",
        email: "",
        telephone: "",
        poste: "",
        principal: false,
      },
    ]);
  };

  const removeContact = (id: string) => {
    if (contacts.length === 1) return;
    setContacts((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (!filtered.some((c) => c.principal)) {
        filtered[0].principal = true;
      }
      return filtered;
    });
  };

  const nextStep = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          contacts: contacts.filter((c) => c.nom),
        }),
      });

      if (res.ok) {
        const marque = await res.json();
        router.push(`/marques/${marque.id}`);
      } else {
        const error = await res.json();
        alert(error.message || "Erreur lors de la création");
      }
    } catch (error) {
      alert("Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/marques"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-glowup-licorice">
                  Nouvelle marque
                </h1>
                <p className="text-sm text-gray-500">
                  Étape {currentStep} sur 3
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="hidden md:flex items-center gap-2">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${
                      currentStep === step.id
                        ? "bg-glowup-rose text-white"
                        : currentStep > step.id
                        ? "bg-glowup-green text-glowup-licorice"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <step.icon className="w-4 h-4" />
                    )}
                    <span className="hidden lg:inline">{step.name}</span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        currentStep > step.id ? "bg-glowup-green" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Informations */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-fade-in">
                {/* Infos de base */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-glowup-rose/10 rounded-lg">
                      <Building2 className="w-5 h-5 text-glowup-rose" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Informations générales
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Nom de la marque *
                      </label>
                      <input
                        type="text"
                        name="nom"
                        value={formData.nom}
                        onChange={handleChange}
                        placeholder="L'Oréal, Nike, Apple..."
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Secteur d'activité
                      </label>
                      <select
                        name="secteur"
                        value={formData.secteur}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                      >
                        <option value="">Sélectionner un secteur</option>
                        {SECTEURS.map((secteur) => (
                          <option key={secteur} value={secteur}>
                            {secteur}
                          </option>
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
                        name="siteWeb"
                        value={formData.siteWeb}
                        onChange={handleChange}
                        placeholder="https://www.example.com"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Notes internes
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Informations supplémentaires sur la marque..."
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Adresse */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <MapPin className="w-5 h-5 text-blue-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Adresse
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Adresse
                      </label>
                      <input
                        type="text"
                        name="adresseRue"
                        value={formData.adresseRue}
                        onChange={handleChange}
                        placeholder="123 Rue de la Paix"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Complément
                      </label>
                      <input
                        type="text"
                        name="adresseComplement"
                        value={formData.adresseComplement}
                        onChange={handleChange}
                        placeholder="Bâtiment A, 2ème étage"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Code postal
                      </label>
                      <input
                        type="text"
                        name="codePostal"
                        value={formData.codePostal}
                        onChange={handleChange}
                        placeholder="75001"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Ville
                      </label>
                      <input
                        type="text"
                        name="ville"
                        value={formData.ville}
                        onChange={handleChange}
                        placeholder="Paris"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Pays
                      </label>
                      <input
                        type="text"
                        name="pays"
                        value={formData.pays}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Contacts */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-50 rounded-lg">
                        <Users className="w-5 h-5 text-purple-500" />
                      </div>
                      <h2 className="text-lg font-semibold text-glowup-licorice">
                        Contacts
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={addContact}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-glowup-rose hover:bg-glowup-lace rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter
                    </button>
                  </div>

                  <div className="space-y-6">
                    {contacts.map((contact, index) => (
                      <div
                        key={contact.id}
                        className={`p-4 rounded-xl border-2 transition-colors ${
                          contact.principal
                            ? "border-glowup-rose bg-glowup-lace/30"
                            : "border-gray-100 bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                contact.principal
                                  ? "bg-glowup-rose text-white"
                                  : "bg-gray-200 text-gray-600"
                              }`}
                            >
                              <User className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-glowup-licorice">
                              Contact {index + 1}
                            </span>
                            {contact.principal && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-glowup-rose text-white">
                                Principal
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!contact.principal && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleContactChange(contact.id, "principal", true)
                                }
                                className="text-xs text-gray-500 hover:text-glowup-rose"
                              >
                                Définir principal
                              </button>
                            )}
                            {contacts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeContact(contact.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1.5">
                              Nom complet *
                            </label>
                            <input
                              type="text"
                              value={contact.nom}
                              onChange={(e) =>
                                handleContactChange(contact.id, "nom", e.target.value)
                              }
                              placeholder="Jean Dupont"
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1.5">
                              Poste
                            </label>
                            <input
                              type="text"
                              value={contact.poste}
                              onChange={(e) =>
                                handleContactChange(contact.id, "poste", e.target.value)
                              }
                              placeholder="Responsable Marketing"
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1.5">
                              <Mail className="w-4 h-4 inline mr-1 text-gray-400" />
                              Email
                            </label>
                            <input
                              type="email"
                              value={contact.email}
                              onChange={(e) =>
                                handleContactChange(contact.id, "email", e.target.value)
                              }
                              placeholder="jean@example.com"
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1.5">
                              <Phone className="w-4 h-4 inline mr-1 text-gray-400" />
                              Téléphone
                            </label>
                            <input
                              type="tel"
                              value={contact.telephone}
                              onChange={(e) =>
                                handleContactChange(contact.id, "telephone", e.target.value)
                              }
                              placeholder="06 12 34 56 78"
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <Users className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Contact principal
                    </p>
                    <p className="text-xs text-amber-600">
                      Le contact principal sera utilisé par défaut pour les communications.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Facturation */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fade-in">
                {/* Infos légales */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <FileText className="w-5 h-5 text-emerald-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Informations légales
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Raison sociale
                      </label>
                      <input
                        type="text"
                        name="raisonSociale"
                        value={formData.raisonSociale}
                        onChange={handleChange}
                        placeholder="SOCIÉTÉ EXEMPLE SAS"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Forme juridique
                      </label>
                      <select
                        name="formeJuridique"
                        value={formData.formeJuridique}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                      >
                        <option value="">Sélectionner</option>
                        <option value="SAS">SAS</option>
                        <option value="SARL">SARL</option>
                        <option value="SA">SA</option>
                        <option value="EURL">EURL</option>
                        <option value="Auto-entrepreneur">Auto-entrepreneur</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        SIRET
                      </label>
                      <input
                        type="text"
                        name="siret"
                        value={formData.siret}
                        onChange={handleChange}
                        placeholder="123 456 789 00012"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        N° TVA Intracommunautaire
                      </label>
                      <input
                        type="text"
                        name="numeroTVA"
                        value={formData.numeroTVA}
                        onChange={handleChange}
                        placeholder="FR 12 345678901"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Conditions de paiement */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-orange-50 rounded-lg">
                      <Banknote className="w-5 h-5 text-orange-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Conditions de paiement
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Délai de paiement (jours)
                      </label>
                      <select
                        name="delaiPaiement"
                        value={formData.delaiPaiement}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                      >
                        <option value="0">À réception</option>
                        <option value="15">15 jours</option>
                        <option value="30">30 jours</option>
                        <option value="45">45 jours</option>
                        <option value="60">60 jours</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Mode de paiement
                      </label>
                      <select
                        name="modePaiement"
                        value={formData.modePaiement}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                      >
                        <option value="Virement">Virement bancaire</option>
                        <option value="Chèque">Chèque</option>
                        <option value="CB">Carte bancaire</option>
                        <option value="PayPal">PayPal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Devise
                      </label>
                      <select
                        name="devise"
                        value={formData.devise}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                      >
                        <option value="EUR">EUR (€)</option>
                        <option value="USD">USD ($)</option>
                        <option value="GBP">GBP (£)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={prevStep}
                disabled={currentStep === 1}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                  currentStep === 1
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Précédent
              </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-2.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark transition-all shadow-lg shadow-glowup-rose/25"
                >
                  Suivant
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark transition-all shadow-lg shadow-glowup-rose/25 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Créer la marque
                </button>
              )}
            </div>
          </div>

          {/* Preview Card */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Cover */}
                <div className="h-16 bg-gradient-to-br from-glowup-rose to-glowup-licorice" />

                {/* Avatar */}
                <div className="px-6 -mt-8">
                  <div className="w-16 h-16 rounded-xl bg-white border-4 border-white flex items-center justify-center shadow-lg">
                    <span className="text-xl font-bold text-glowup-rose">
                      {formData.nom?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-6 pt-3">
                  <h3 className="text-lg font-bold text-glowup-licorice">
                    {formData.nom || "Nom de la marque"}
                  </h3>
                  {formData.secteur && (
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {formData.secteur}
                    </span>
                  )}

                  {formData.siteWeb && (
                    <p className="text-sm text-gray-500 mt-3 flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      {formData.siteWeb.replace(/^https?:\/\//, "")}
                    </p>
                  )}

                  {formData.ville && (
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {formData.ville}, {formData.pays}
                    </p>
                  )}

                  {/* Contacts preview */}
                  {contacts.filter((c) => c.nom).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">Contacts</p>
                      {contacts
                        .filter((c) => c.nom)
                        .map((contact) => (
                          <div
                            key={contact.id}
                            className="flex items-center gap-2 text-sm py-1"
                          >
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                contact.principal
                                  ? "bg-glowup-rose text-white"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {contact.nom.charAt(0)}
                            </div>
                            <span>{contact.nom}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Facturation preview */}
                  {(formData.delaiPaiement || formData.modePaiement) && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">Paiement</p>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs">
                          {formData.delaiPaiement}j
                        </span>
                        <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">
                          {formData.modePaiement}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 p-4 bg-glowup-lace/50 rounded-xl">
                <p className="text-xs text-gray-600">
                  💡 <strong>Astuce :</strong> Les informations de facturation seront utilisées pour générer automatiquement les devis et factures.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
