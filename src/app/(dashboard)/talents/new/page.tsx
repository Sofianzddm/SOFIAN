"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  User,
  BarChart3,
  Euro,
  Instagram,
  Music2,
  Youtube,
  MapPin,
  Mail,
  Phone,
  AtSign,
  Sparkles,
  Save,
  Loader2,
  Camera,
  Building2,
  Landmark,
  AlertCircle,
} from "lucide-react";
import { LISTE_PAYS } from "@/lib/pays";

interface Manager {
  id: string;
  prenom: string;
  nom: string;
}

const STEPS = [
  { id: 1, name: "Profil", icon: User },
  { id: 2, name: "Adresse & Légal", icon: Building2 },
  { id: 3, name: "Réseaux", icon: Instagram },
  { id: 4, name: "Statistiques", icon: BarChart3 },
  { id: 5, name: "Tarifs", icon: Euro },
];

const NICHES_OPTIONS = [
  { value: "Fashion", emoji: "👗" },
  { value: "Beauty", emoji: "💄" },
  { value: "Lifestyle", emoji: "✨" },
  { value: "Travel", emoji: "✈️" },
  { value: "Food", emoji: "🍕" },
  { value: "Fitness", emoji: "💪" },
  { value: "Tech", emoji: "📱" },
  { value: "Gaming", emoji: "🎮" },
  { value: "Music", emoji: "🎵" },
  { value: "Art", emoji: "🎨" },
  { value: "Comedy", emoji: "😂" },
  { value: "Family", emoji: "👨‍👩‍👧" },
];

const FORMES_JURIDIQUES = ["Auto-entrepreneur", "SASU", "EURL", "SARL", "SAS", "Autre"];
const numToString = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export default function NewTalentPage() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const talentId = params?.id;
  const isEditMode = Boolean(talentId);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);

  const [formData, setFormData] = useState({
    // Step 1 - Profil
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    telephoneSecondaire: "",
    dateNaissance: "",
    nationalite: "Française",
    presentation: "",
    niches: [] as string[],
    selectedClients: "",
    managerId: "",
    commissionInbound: "20",
    commissionOutbound: "30",
    photo: "",
    
    // Contact urgence
    contactUrgenceNom: "",
    contactUrgenceTel: "",
    contactUrgenceLien: "",

    // Step 2 - Adresse & Légal
    adresseRue: "",
    adresseComplement: "",
    codePostal: "",
    ville: "",
    pays: "France",
    
    // Légal
    siret: "",
    numeroTVA: "",
    raisonSociale: "",
    formeJuridique: "",
    
    // Banque
    nomBanque: "",
    titulaireCompte: "",
    iban: "",
    bic: "",
    
    // Notes
    notesInternes: "",

    // Step 3 - Réseaux
    instagram: "",
    tiktok: "",
    youtube: "",

    // Step 4 - Stats
    igFollowers: "",
    igFollowersEvol: "",
    igEngagement: "",
    igEngagementEvol: "",
    igGenreFemme: "",
    igGenreHomme: "",
    igAge13_17: "",
    igAge18_24: "",
    igAge25_34: "",
    igAge35_44: "",
    igAge45Plus: "",
    igLocFrance: "",
    ttFollowers: "",
    ttFollowersEvol: "",
    ttEngagement: "",
    ttEngagementEvol: "",
    ttGenreFemme: "",
    ttGenreHomme: "",
    ttAge13_17: "",
    ttAge18_24: "",
    ttAge25_34: "",
    ttAge35_44: "",
    ttAge45Plus: "",
    ttLocFrance: "",
    ytAbonnes: "",
    ytAbonnesEvol: "",

    // Step 5 - Tarifs
    tarifStory: "",
    tarifStoryConcours: "",
    tarifPost: "",
    tarifPostConcours: "",
    tarifPostCommun: "",
    tarifPostCrosspost: "",
    tarifReel: "",
    tarifReelCrosspost: "",
    tarifReelConcours: "",
    tarifTiktokVideo: "",
    tarifTiktokConcours: "",
    tarifYoutubeVideo: "",
    tarifYoutubeShort: "",
    tarifSnapchatStory: "",
    tarifSnapchatSpotlight: "",
    tarifEvent: "",
    tarifShooting: "",
    tarifAmbassadeur: "",
  });

  useEffect(() => {
    const load = async () => {
      setInitialLoading(true);
      try {
        const usersRes = await fetch("/api/users?role=TM");
        const users = await usersRes.json();
        setManagers(users);

        if (isEditMode && talentId) {
          const talentRes = await fetch(`/api/talents/${talentId}`);
          if (!talentRes.ok) throw new Error("Talent introuvable");
          const talent = await talentRes.json();
          const stats = talent.stats || {};
          const tarifs = talent.tarifs || {};
          const adresseParts = typeof talent.adresse === "string" ? talent.adresse.split(" – ") : [];

          setFormData((prev) => ({
            ...prev,
            prenom: talent.prenom || "",
            nom: talent.nom || "",
            email: talent.email || "",
            telephone: talent.telephone || "",
            telephoneSecondaire: talent.telephoneSecondaire || "",
            dateNaissance: talent.dateNaissance ? String(talent.dateNaissance).slice(0, 10) : "",
            nationalite: talent.nationalite || "Française",
            presentation: talent.presentation || "",
            niches: Array.isArray(talent.niches) ? talent.niches : [],
            selectedClients: Array.isArray(talent.selectedClients) ? talent.selectedClients.join(", ") : "",
            managerId: talent.managerId || "",
            commissionInbound: numToString(talent.commissionInbound) || "20",
            commissionOutbound: numToString(talent.commissionOutbound) || "30",
            photo: talent.photo || "",
            contactUrgenceNom: talent.contactUrgenceNom || "",
            contactUrgenceTel: talent.contactUrgenceTel || "",
            contactUrgenceLien: talent.contactUrgenceLien || "",
            adresseRue: adresseParts[0] || "",
            adresseComplement: adresseParts[1] || "",
            codePostal: talent.codePostal || "",
            ville: talent.ville || "",
            pays: talent.pays || "France",
            siret: talent.siret || "",
            numeroTVA: talent.numeroTVA || "",
            raisonSociale: talent.raisonSociale || "",
            formeJuridique: talent.formeJuridique || "",
            nomBanque: talent.nomBanque || "",
            titulaireCompte: talent.titulaireCompte || "",
            iban: talent.iban || "",
            bic: talent.bic || "",
            notesInternes: talent.notesInternes || "",
            instagram: talent.instagram || "",
            tiktok: talent.tiktok || "",
            youtube: talent.youtube || "",
            igFollowers: numToString(stats.igFollowers),
            igFollowersEvol: numToString(stats.igFollowersEvol),
            igEngagement: numToString(stats.igEngagement),
            igEngagementEvol: numToString(stats.igEngagementEvol),
            igGenreFemme: numToString(stats.igGenreFemme),
            igGenreHomme: numToString(stats.igGenreHomme),
            igAge13_17: numToString(stats.igAge13_17),
            igAge18_24: numToString(stats.igAge18_24),
            igAge25_34: numToString(stats.igAge25_34),
            igAge35_44: numToString(stats.igAge35_44),
            igAge45Plus: numToString(stats.igAge45Plus),
            igLocFrance: numToString(stats.igLocFrance),
            ttFollowers: numToString(stats.ttFollowers),
            ttFollowersEvol: numToString(stats.ttFollowersEvol),
            ttEngagement: numToString(stats.ttEngagement),
            ttEngagementEvol: numToString(stats.ttEngagementEvol),
            ttGenreFemme: numToString(stats.ttGenreFemme),
            ttGenreHomme: numToString(stats.ttGenreHomme),
            ttAge13_17: numToString(stats.ttAge13_17),
            ttAge18_24: numToString(stats.ttAge18_24),
            ttAge25_34: numToString(stats.ttAge25_34),
            ttAge35_44: numToString(stats.ttAge35_44),
            ttAge45Plus: numToString(stats.ttAge45Plus),
            ttLocFrance: numToString(stats.ttLocFrance),
            ytAbonnes: numToString(stats.ytAbonnes),
            ytAbonnesEvol: numToString(stats.ytAbonnesEvol),
            tarifStory: numToString(tarifs.tarifStory),
            tarifStoryConcours: numToString(tarifs.tarifStoryConcours),
            tarifPost: numToString(tarifs.tarifPost),
            tarifPostConcours: numToString(tarifs.tarifPostConcours),
            tarifPostCommun: numToString(tarifs.tarifPostCommun),
            tarifPostCrosspost: numToString(tarifs.tarifPostCrosspost),
            tarifReel: numToString(tarifs.tarifReel),
            tarifReelCrosspost: numToString(tarifs.tarifReelCrosspost),
            tarifReelConcours: numToString(tarifs.tarifReelConcours),
            tarifTiktokVideo: numToString(tarifs.tarifTiktokVideo),
            tarifTiktokConcours: numToString(tarifs.tarifTiktokConcours),
            tarifYoutubeVideo: numToString(tarifs.tarifYoutubeVideo),
            tarifYoutubeShort: numToString(tarifs.tarifYoutubeShort),
            tarifSnapchatStory: numToString(tarifs.tarifSnapchatStory),
            tarifSnapchatSpotlight: numToString(tarifs.tarifSnapchatSpotlight),
            tarifEvent: numToString(tarifs.tarifEvent),
            tarifShooting: numToString(tarifs.tarifShooting),
            tarifAmbassadeur: numToString(tarifs.tarifAmbassadeur),
          }));
        }
      } catch (error) {
        console.error("Erreur:", error);
        if (isEditMode) {
          alert("Erreur lors du chargement du talent");
          router.push("/talents");
        }
      } finally {
        setInitialLoading(false);
      }
    };

    load();
  }, [isEditMode, router, talentId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNicheToggle = (niche: string) => {
    setFormData((prev) => ({
      ...prev,
      niches: prev.niches.includes(niche)
        ? prev.niches.filter((n) => n !== niche)
        : [...prev.niches, niche],
    }));
  };

  const nextStep = () => {
    if (currentStep < 5) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const adresse = [formData.adresseRue, formData.adresseComplement].filter(Boolean).join(" – ") || null;
      const endpoint = isEditMode && talentId ? `/api/talents/${talentId}` : "/api/talents";
      const method = isEditMode ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          adresse,
          codePostal: formData.codePostal || null,
          ville: formData.ville || null,
          pays: formData.pays || null,
          siret: formData.siret?.trim() || null,
          iban: formData.iban?.trim() || null,
          bic: formData.bic?.trim() || null,
          selectedClients: formData.selectedClients.split(",").map((s) => s.trim()).filter(Boolean),
          dateNaissance: formData.dateNaissance || null,
        }),
      });

      if (res.ok) {
        const talent = await res.json().catch(() => null);
        const targetId = talent?.id || talentId;
        router.push(targetId ? `/talents/${targetId}` : "/talents");
      } else {
        const error = await res.json();
        alert(error.message || error.error || "Erreur lors de l'enregistrement");
      }
    } catch (error) {
      alert("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const formatFollowers = (count: string) => {
    const num = parseInt(count);
    if (!num) return "";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return count;
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/talents"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-glowup-licorice">
                  {isEditMode ? "Modifier le talent" : "Nouveau talent"}
                </h1>
                <p className="text-sm text-gray-500">
                  Étape {currentStep} sur 5
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Profil */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-fade-in">
                {/* Photo + Infos de base */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-glowup-rose/10 rounded-lg">
                      <User className="w-5 h-5 text-glowup-rose" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Informations générales
                    </h2>
                  </div>

                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Photo */}
                    <div className="flex-shrink-0">
                      <div className="w-32 h-32 rounded-2xl bg-glowup-lace border-2 border-dashed border-glowup-rose/30 flex items-center justify-center cursor-pointer hover:border-glowup-rose transition-colors group">
                        {formData.photo ? (
                          <img
                            src={formData.photo}
                            alt="Photo"
                            className="w-full h-full object-cover rounded-2xl"
                          />
                        ) : (
                          <div className="text-center">
                            <Camera className="w-8 h-8 text-glowup-rose/50 mx-auto group-hover:text-glowup-rose transition-colors" />
                            <span className="text-xs text-gray-500 mt-1 block">
                              Ajouter
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Infos */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Prénom *
                        </label>
                        <input
                          type="text"
                          name="prenom"
                          value={formData.prenom}
                          onChange={handleChange}
                          placeholder="Eline"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Nom *
                        </label>
                        <input
                          type="text"
                          name="nom"
                          value={formData.nom}
                          onChange={handleChange}
                          placeholder="Collange"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          <Mail className="w-4 h-4 inline mr-1 text-gray-400" />
                          Email *
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="eline@glowupagence.fr"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          <Phone className="w-4 h-4 inline mr-1 text-gray-400" />
                          Téléphone
                        </label>
                        <input
                          type="tel"
                          name="telephone"
                          value={formData.telephone}
                          onChange={handleChange}
                          placeholder="06 12 34 56 78"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Téléphone secondaire
                        </label>
                        <input
                          type="tel"
                          name="telephoneSecondaire"
                          value={formData.telephoneSecondaire}
                          onChange={handleChange}
                          placeholder="06 98 76 54 32"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Date de naissance
                        </label>
                        <input
                          type="date"
                          name="dateNaissance"
                          value={formData.dateNaissance}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Nationalité
                        </label>
                        <input
                          type="text"
                          name="nationalite"
                          value={formData.nationalite}
                          onChange={handleChange}
                          placeholder="Française"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Talent Manager *
                        </label>
                        <select
                          name="managerId"
                          value={formData.managerId}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                        >
                          <option value="">Sélectionner</option>
                          {managers.map((tm) => (
                            <option key={tm.id} value={tm.id}>
                              {tm.prenom} {tm.nom}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Niches */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <Sparkles className="w-5 h-5 text-purple-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Niches & Catégories
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {NICHES_OPTIONS.map((niche) => (
                      <button
                        key={niche.value}
                        type="button"
                        onClick={() => handleNicheToggle(niche.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          formData.niches.includes(niche.value)
                            ? "bg-glowup-rose text-white shadow-md scale-105"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {niche.emoji} {niche.value}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Présentation */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <AtSign className="w-5 h-5 text-amber-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Présentation
                    </h2>
                  </div>
                  <textarea
                    name="presentation"
                    value={formData.presentation}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Joviale et pleine d'entrain, elle partage quotidiennement ses looks à sa communauté..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all resize-none"
                  />
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Clients précédents
                    </label>
                    <input
                      type="text"
                      name="selectedClients"
                      value={formData.selectedClients}
                      onChange={handleChange}
                      placeholder="L'Oréal, Nike, Dior, Typology..."
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                    />
                  </div>
                </div>

                {/* Contact Urgence */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-50 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Contact d'urgence
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Nom du contact
                      </label>
                      <input
                        type="text"
                        name="contactUrgenceNom"
                        value={formData.contactUrgenceNom}
                        onChange={handleChange}
                        placeholder="Marie Dupont"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Téléphone
                      </label>
                      <input
                        type="tel"
                        name="contactUrgenceTel"
                        value={formData.contactUrgenceTel}
                        onChange={handleChange}
                        placeholder="06 00 00 00 00"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Lien de parenté
                      </label>
                      <select
                        name="contactUrgenceLien"
                        value={formData.contactUrgenceLien}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white"
                      >
                        <option value="">Sélectionner</option>
                        <option value="Mère">Mère</option>
                        <option value="Père">Père</option>
                        <option value="Conjoint(e)">Conjoint(e)</option>
                        <option value="Frère/Sœur">Frère/Sœur</option>
                        <option value="Ami(e)">Ami(e)</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Commission */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <Euro className="w-5 h-5 text-emerald-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Commissions
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Commission Inbound
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="commissionInbound"
                          value={formData.commissionInbound}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Mail entrant</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Commission Outbound
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="commissionOutbound"
                          value={formData.commissionOutbound}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">On démarche</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Adresse & Légal */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fade-in">
                {/* Adresse */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <MapPin className="w-5 h-5 text-blue-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Adresse personnelle
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Adresse (rue)
                      </label>
                      <input
                        type="text"
                        name="adresseRue"
                        value={formData.adresseRue}
                        onChange={handleChange}
                        placeholder="123 rue de la Paix"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Complément d'adresse
                      </label>
                      <input
                        type="text"
                        name="adresseComplement"
                        value={formData.adresseComplement}
                        onChange={handleChange}
                        placeholder="Bâtiment A, Appartement 12..."
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <select
                          name="pays"
                          value={formData.pays}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all bg-white"
                        >
                          {LISTE_PAYS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Infos légales */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <Building2 className="w-5 h-5 text-purple-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Informations légales
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        {FORMES_JURIDIQUES.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Raison sociale
                      </label>
                      <input
                        type="text"
                        name="raisonSociale"
                        value={formData.raisonSociale}
                        onChange={handleChange}
                        placeholder="Nom de l'entreprise"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
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
                        Numéro TVA
                      </label>
                      <input
                        type="text"
                        name="numeroTVA"
                        value={formData.numeroTVA}
                        onChange={handleChange}
                        placeholder="FR12345678901"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Coordonnées bancaires */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <Landmark className="w-5 h-5 text-emerald-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Coordonnées bancaires
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Banque
                      </label>
                      <input
                        type="text"
                        name="nomBanque"
                        value={formData.nomBanque}
                        onChange={handleChange}
                        placeholder="BNP Paribas"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Titulaire du compte
                      </label>
                      <input
                        type="text"
                        name="titulaireCompte"
                        value={formData.titulaireCompte}
                        onChange={handleChange}
                        placeholder="Nom du titulaire"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        BIC
                      </label>
                      <input
                        type="text"
                        name="bic"
                        value={formData.bic}
                        onChange={handleChange}
                        placeholder="BNPAFRPP"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        IBAN
                      </label>
                      <input
                        type="text"
                        name="iban"
                        value={formData.iban}
                        onChange={handleChange}
                        placeholder="FR76 1234 5678 9012 3456 7890 123"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes internes */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <AtSign className="w-5 h-5 text-gray-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Notes internes
                    </h2>
                    <span className="text-xs text-gray-400 ml-auto">Visible uniquement par l'équipe</span>
                  </div>
                  <textarea
                    name="notesInternes"
                    value={formData.notesInternes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Notes privées concernant ce talent..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all resize-none"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Réseaux */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fade-in">
                {/* Instagram */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                      <Instagram className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Instagram
                    </h2>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nom d'utilisateur
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        @
                      </span>
                      <input
                        type="text"
                        name="instagram"
                        value={formData.instagram}
                        onChange={handleChange}
                        placeholder="elinecollange"
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* TikTok */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-black rounded-lg">
                      <Music2 className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      TikTok
                    </h2>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nom d'utilisateur
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        @
                      </span>
                      <input
                        type="text"
                        name="tiktok"
                        value={formData.tiktok}
                        onChange={handleChange}
                        placeholder="elinecollange"
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-gray-800 focus:ring-2 focus:ring-gray-800/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* YouTube */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-500 rounded-lg">
                      <Youtube className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      YouTube
                    </h2>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      URL de la chaîne
                    </label>
                    <input
                      type="url"
                      name="youtube"
                      value={formData.youtube}
                      onChange={handleChange}
                      placeholder="https://youtube.com/@elinecollange"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                    />
                  </div>
                </div>

                {!formData.instagram && !formData.tiktok && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      Renseignez au moins un réseau social (Instagram ou TikTok) pour créer le talent.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Stats */}
            {currentStep === 4 && (
              <div className="space-y-6 animate-fade-in">
                {/* Instagram Stats */}
                {formData.instagram && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                        <Instagram className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-lg font-semibold text-glowup-licorice">
                        Statistiques Instagram
                      </h2>
                    </div>

                    {/* Followers & Engagement */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Followers *
                        </label>
                        <input
                          type="number"
                          name="igFollowers"
                          value={formData.igFollowers}
                          onChange={handleChange}
                          placeholder="102000"
                          className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none"
                        />
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Évolution
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            name="igFollowersEvol"
                            value={formData.igFollowersEvol}
                            onChange={handleChange}
                            step="0.01"
                            placeholder="0.68"
                            className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none"
                          />
                          <span className="text-emerald-500">%</span>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Engagement *
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            name="igEngagement"
                            value={formData.igEngagement}
                            onChange={handleChange}
                            step="0.01"
                            placeholder="6.12"
                            className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none"
                          />
                          <span className="text-gray-400">%</span>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Évol. engagement
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            name="igEngagementEvol"
                            value={formData.igEngagementEvol}
                            onChange={handleChange}
                            step="0.01"
                            placeholder="1.92"
                            className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none"
                          />
                          <span className="text-emerald-500">pts</span>
                        </div>
                      </div>
                    </div>

                    {/* Démographie */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">
                          👩 Femmes (%)
                        </label>
                        <input
                          type="number"
                          name="igGenreFemme"
                          value={formData.igGenreFemme}
                          onChange={handleChange}
                          placeholder="78"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-pink-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">
                          👨 Hommes (%)
                        </label>
                        <input
                          type="number"
                          name="igGenreHomme"
                          value={formData.igGenreHomme}
                          onChange={handleChange}
                          placeholder="21"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-pink-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">
                          🇫🇷 France (%)
                        </label>
                        <input
                          type="number"
                          name="igLocFrance"
                          value={formData.igLocFrance}
                          onChange={handleChange}
                          placeholder="84"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-pink-500"
                        />
                      </div>
                    </div>

                    {/* Âges */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Tranches d'âge
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { name: "igAge13_17", label: "13-17" },
                          { name: "igAge18_24", label: "18-24" },
                          { name: "igAge25_34", label: "25-34" },
                          { name: "igAge35_44", label: "35-44" },
                          { name: "igAge45Plus", label: "45+" },
                        ].map((age) => (
                          <div key={age.name} className="text-center">
                            <label className="block text-xs text-gray-500 mb-1">
                              {age.label}
                            </label>
                            <input
                              type="number"
                              name={age.name}
                              value={(formData as any)[age.name]}
                              onChange={handleChange}
                              placeholder="%"
                              className="w-full px-2 py-2 text-center rounded-lg border border-gray-200 focus:outline-none focus:border-pink-500 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TikTok Stats */}
                {formData.tiktok && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-black rounded-lg">
                        <Music2 className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-lg font-semibold text-glowup-licorice">
                        Statistiques TikTok
                      </h2>
                    </div>

                    {/* Followers & Engagement */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Followers *
                        </label>
                        <input
                          type="number"
                          name="ttFollowers"
                          value={formData.ttFollowers}
                          onChange={handleChange}
                          placeholder="363000"
                          className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none"
                        />
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Évolution
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            name="ttFollowersEvol"
                            value={formData.ttFollowersEvol}
                            onChange={handleChange}
                            step="0.01"
                            placeholder="0.8"
                            className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none"
                          />
                          <span className="text-emerald-500">%</span>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Engagement *
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            name="ttEngagement"
                            value={formData.ttEngagement}
                            onChange={handleChange}
                            step="0.01"
                            placeholder="4.91"
                            className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none"
                          />
                          <span className="text-gray-400">%</span>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <label className="block text-xs text-gray-500 mb-1">
                          Évol. engagement
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            name="ttEngagementEvol"
                            value={formData.ttEngagementEvol}
                            onChange={handleChange}
                            step="0.01"
                            placeholder="2.12"
                            className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none"
                          />
                          <span className="text-emerald-500">pts</span>
                        </div>
                      </div>
                    </div>

                    {/* Démographie TikTok */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">
                          👩 Femmes (%)
                        </label>
                        <input
                          type="number"
                          name="ttGenreFemme"
                          value={formData.ttGenreFemme}
                          onChange={handleChange}
                          placeholder="74"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">
                          👨 Hommes (%)
                        </label>
                        <input
                          type="number"
                          name="ttGenreHomme"
                          value={formData.ttGenreHomme}
                          onChange={handleChange}
                          placeholder="25"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">
                          🇫🇷 France (%)
                        </label>
                        <input
                          type="number"
                          name="ttLocFrance"
                          value={formData.ttLocFrance}
                          onChange={handleChange}
                          placeholder="82"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-gray-800"
                        />
                      </div>
                    </div>

                    {/* Âges TikTok */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Tranches d'âge
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { name: "ttAge13_17", label: "13-17" },
                          { name: "ttAge18_24", label: "18-24" },
                          { name: "ttAge25_34", label: "25-34" },
                          { name: "ttAge35_44", label: "35-44" },
                          { name: "ttAge45Plus", label: "45+" },
                        ].map((age) => (
                          <div key={age.name} className="text-center">
                            <label className="block text-xs text-gray-500 mb-1">
                              {age.label}
                            </label>
                            <input
                              type="number"
                              name={age.name}
                              value={(formData as any)[age.name]}
                              onChange={handleChange}
                              placeholder="%"
                              className="w-full px-2 py-2 text-center rounded-lg border border-gray-200 focus:outline-none focus:border-gray-800 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* YouTube Stats */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-500 rounded-lg">
                      <Youtube className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Statistiques YouTube
                    </h2>
                    <span className="text-xs text-gray-400 ml-auto">Optionnel</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <label className="block text-xs text-gray-500 mb-1">
                        Abonnés
                      </label>
                      <input
                        type="number"
                        name="ytAbonnes"
                        value={formData.ytAbonnes}
                        onChange={handleChange}
                        placeholder="50000"
                        className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none"
                      />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <label className="block text-xs text-gray-500 mb-1">
                        Évolution
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          name="ytAbonnesEvol"
                          value={formData.ytAbonnesEvol}
                          onChange={handleChange}
                          step="0.01"
                          placeholder="1.5"
                          className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none"
                        />
                        <span className="text-emerald-500">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Tarifs */}
            {currentStep === 5 && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <Euro className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Tous les tarifs sont en € HT
                    </p>
                    <p className="text-xs text-amber-600">
                      Les tarifs marqués * sont obligatoires
                    </p>
                  </div>
                </div>

                {/* Instagram Tarifs */}
                {formData.instagram && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                        <Instagram className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-lg font-semibold text-glowup-licorice">
                        Tarifs Instagram
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {[
                        { name: "tarifStory", label: "Story *", required: true },
                        { name: "tarifStoryConcours", label: "Story Concours" },
                        { name: "tarifPost", label: "Post *", required: true },
                        { name: "tarifPostConcours", label: "Post Concours" },
                        { name: "tarifPostCommun", label: "Post Commun" },
                        { name: "tarifPostCrosspost", label: "Post Crosspost" },
                        { name: "tarifReel", label: "Reel *", required: true },
                        { name: "tarifReelCrosspost", label: "Réel Crosspost" },
                        { name: "tarifReelConcours", label: "Réel Jeu Concours" },
                      ].map((tarif) => (
                        <div key={tarif.name}>
                          <label className="block text-sm text-gray-600 mb-1.5">
                            {tarif.label}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              name={tarif.name}
                              value={(formData as any)[tarif.name]}
                              onChange={handleChange}
                              placeholder="0"
                              className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none pr-10 ${
                                tarif.required
                                  ? "border-pink-200 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                                  : "border-gray-200 focus:border-gray-400"
                              }`}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                              €
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TikTok Tarifs */}
                {formData.tiktok && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-black rounded-lg">
                        <Music2 className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-lg font-semibold text-glowup-licorice">
                        Tarifs TikTok
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">Vidéo TikTok *</label>
                        <div className="relative">
                          <input type="number" name="tarifTiktokVideo" value={formData.tarifTiktokVideo} onChange={handleChange} placeholder="0" className="w-full px-4 py-2.5 rounded-xl border border-gray-800/20 focus:outline-none focus:border-gray-800 focus:ring-2 focus:ring-gray-800/20 pr-10" />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1.5">TikTok Jeu Concours</label>
                        <div className="relative">
                          <input type="number" name="tarifTiktokConcours" value={formData.tarifTiktokConcours} onChange={handleChange} placeholder="0" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-gray-400 pr-10" />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tarifs internes (Snapchat) - non affichés sur le book */}
                <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6">
                  <p className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded w-fit mb-4">Interne uniquement</p>
                  <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Snapchat (non affichés sur le book)</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1.5">Snapchat Story</label>
                      <div className="relative">
                        <input type="number" name="tarifSnapchatStory" value={formData.tarifSnapchatStory} onChange={handleChange} placeholder="0" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-gray-400 pr-10" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1.5">Snapchat Spotlight</label>
                      <div className="relative">
                        <input type="number" name="tarifSnapchatSpotlight" value={formData.tarifSnapchatSpotlight} onChange={handleChange} placeholder="0" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-gray-400 pr-10" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* YouTube Tarifs */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-500 rounded-lg">
                      <Youtube className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Tarifs YouTube
                    </h2>
                    <span className="text-xs text-gray-400 ml-auto">Optionnel</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1.5">
                        Vidéo YouTube
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="tarifYoutubeVideo"
                          value={formData.tarifYoutubeVideo}
                          onChange={handleChange}
                          placeholder="0"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-red-500 pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          €
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1.5">
                        YouTube Short
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="tarifYoutubeShort"
                          value={formData.tarifYoutubeShort}
                          onChange={handleChange}
                          placeholder="0"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-red-500 pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          €
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Autres */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Euro className="w-5 h-5 text-orange-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">
                      Autres prestations
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1.5">
                        Event
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="tarifEvent"
                          value={formData.tarifEvent}
                          onChange={handleChange}
                          placeholder="0"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-orange-500 pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          €
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1.5">
                        Shooting
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="tarifShooting"
                          value={formData.tarifShooting}
                          onChange={handleChange}
                          placeholder="0"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-orange-500 pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          €
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1.5">
                        Ambassadeur (base)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="tarifAmbassadeur"
                          value={formData.tarifAmbassadeur}
                          onChange={handleChange}
                          placeholder="0"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-orange-500 pr-10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          €
                        </span>
                      </div>
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

              {currentStep < 5 ? (
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
                  {isEditMode ? "Enregistrer les modifications" : "Créer le talent"}
                </button>
              )}
            </div>
          </div>

          {/* Preview Card */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Cover */}
                <div className="h-24 bg-gradient-to-br from-glowup-rose to-glowup-licorice" />

                {/* Avatar */}
                <div className="px-6 -mt-12">
                  <div className="w-24 h-24 rounded-2xl bg-glowup-lace border-4 border-white flex items-center justify-center overflow-hidden shadow-lg">
                    {formData.photo ? (
                      <img
                        src={formData.photo}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-glowup-rose">
                        {formData.prenom?.charAt(0) || "?"}
                        {formData.nom?.charAt(0) || ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="p-6 pt-4">
                  <h3 className="text-xl font-bold text-glowup-licorice">
                    {formData.prenom || "Prénom"} {formData.nom || "Nom"}
                  </h3>
                  {(formData.ville || formData.pays) && (
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {formData.ville}
                      {formData.ville && formData.pays && ", "}
                      {formData.pays}
                    </p>
                  )}

                  {/* Niches */}
                  {formData.niches.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {formData.niches.map((niche) => (
                        <span
                          key={niche}
                          className="px-2 py-0.5 text-xs rounded-full bg-glowup-lace text-glowup-licorice"
                        >
                          {niche}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats preview */}
                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
                    {formData.igFollowers && (
                      <div className="flex items-center gap-2">
                        <Instagram className="w-4 h-4 text-pink-500" />
                        <span className="text-sm font-medium">
                          {formatFollowers(formData.igFollowers)}
                        </span>
                      </div>
                    )}
                    {formData.ttFollowers && (
                      <div className="flex items-center gap-2">
                        <Music2 className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {formatFollowers(formData.ttFollowers)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Commission */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">Commission</p>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">
                        In: {formData.commissionInbound}%
                      </span>
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs">
                        Out: {formData.commissionOutbound}%
                      </span>
                    </div>
                  </div>

                  {/* Légal preview */}
                  {(formData.siret || formData.iban) && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">Infos légales</p>
                      <div className="space-y-1 text-xs">
                        {formData.siret && (
                          <p className="text-gray-600">SIRET: {formData.siret}</p>
                        )}
                        {formData.iban && (
                          <p className="text-gray-600">IBAN: ****{formData.iban.slice(-4)}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tips */}
              <div className="mt-4 p-4 bg-glowup-lace/50 rounded-xl">
                <p className="text-xs text-gray-600">
                  💡 <strong>Astuce :</strong> Les champs marqués * sont
                  obligatoires. Vous pourrez modifier ces informations plus tard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}