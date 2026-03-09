"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  Lock,
  User,
  MapPin,
  Building2,
  Landmark,
  Instagram,
  Music2,
  Youtube,
  BarChart3,
  Euro,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { LISTE_PAYS } from "@/lib/pays";

const NICHES = ["Fashion", "Beauty", "Lifestyle", "Food", "Travel", "Sport", "Gaming", "Tech", "Family", "Music", "Art", "Business"];
const FORMES_JURIDIQUES = ["Auto-entrepreneur", "SASU", "EURL", "SARL", "SAS", "Autre"];

/** Talents de référence pour l'interpolation des tarifs (base: followers Instagram) */
const REFERENCE_TALENTS = [
  { followers: 95900, reel: 2700, story: 1200, post: 2300, tiktokVideo: 3600 },
  { followers: 104000, reel: 3100, story: 1600, post: 2800, tiktokVideo: 4000 },
  { followers: 322000, reel: 4500, story: 1800, post: 3800, tiktokVideo: 5500 },
  { followers: 345000, reel: 5500, story: 2000, post: 4800, tiktokVideo: 3500 },
  { followers: 433000, reel: 7100, story: 5000, post: 6500, tiktokVideo: 7000 },
  { followers: 554000, reel: 8900, story: 4800, post: 8400, tiktokVideo: 8000 },
].sort((a, b) => a.followers - b.followers);

function roundTo100(n: number): number {
  return Math.round(n / 100) * 100;
}

function interpolate(
  followersCount: number,
  ref: typeof REFERENCE_TALENTS,
  field: "reel" | "story" | "post" | "tiktokVideo"
): number {
  if (ref.length === 0) return 0;
  if (followersCount <= ref[0].followers) return ref[0][field];
  if (followersCount >= ref[ref.length - 1].followers) return ref[ref.length - 1][field];
  let i = 0;
  while (i < ref.length - 1 && ref[i + 1].followers < followersCount) i++;
  const a = ref[i];
  const b = ref[i + 1];
  const t = (followersCount - a.followers) / (b.followers - a.followers);
  return a[field] + t * (b[field] - a[field]);
}

type UserRole = "ADMIN" | "HEAD_OF" | "HEAD_OF_INFLUENCE" | "TM";

export default function EditTalentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [managers, setManagers] = useState<{ id: string; prenom: string; nom: string }[]>([]);
  const [talentUsers, setTalentUsers] = useState<{ id: string; prenom: string; nom: string; email: string }[]>([]);
  const [storyScreensUploading, setStoryScreensUploading] = useState(false);
  const [storyScreensError, setStoryScreensError] = useState<string | null>(null);
  const [storyScreens, setStoryScreens] = useState<{
    views30d: string[];
    views7d: string[];
    linkClicks30d: string[];
  }>({
    views30d: [],
    views7d: [],
    linkClicks30d: [],
  });
  /** Champs tarifs remplis par "Suggérer les tarifs" (pour afficher le badge Suggéré) */
  const [suggestedTarifFields, setSuggestedTarifFields] = useState<Set<string>>(new Set());

  const fileInputRef30 = useRef<HTMLInputElement>(null);
  const fileInputRef7 = useRef<HTMLInputElement>(null);
  const fileInputRefClicks = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    // Infos de base
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    telephoneSecondaire: "",
    dateNaissance: "",
    nationalite: "",
    presentation: "",
    niches: [] as string[],
    selectedClients: "",
    commissionInbound: "20",
    commissionOutbound: "30",
    managerId: "",
    userId: "",
    
    // Contact urgence
    contactUrgenceNom: "",
    contactUrgenceTel: "",
    contactUrgenceLien: "",
    
    // Adresse
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
    
    // Réseaux
    instagram: "",
    tiktok: "",
    youtube: "",
    snapchat: "",
    
    // Stats Instagram
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
    
    // Stats TikTok
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

    // Stories (vues / clics / screenshots)
    storyViews30d: "",
    storyViews7d: "",
    storyLinkClicks30d: "",

    // Calculateur CPM Story / Snap
    moyenneVuesStory: "",
    moyenneVuesSnap: "",
    
    // Tarifs
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

  // Permissions par rôle
  const canEditInfos = userRole === "ADMIN";
  const canEditStats = userRole === "ADMIN" || userRole === "TM";
  const canEditTarifs = userRole === "ADMIN" || userRole === "HEAD_OF" || userRole === "HEAD_OF_INFLUENCE";

  // Steps disponibles selon le rôle
  const getAvailableSteps = () => {
    const steps = [];
    if (canEditInfos) {
      steps.push({ id: 1, name: "Profil", icon: User });
      steps.push({ id: 2, name: "Adresse & Légal", icon: Building2 });
      steps.push({ id: 3, name: "Réseaux", icon: Instagram });
    }
    if (canEditStats) steps.push({ id: 4, name: "Stats", icon: BarChart3 });
    if (canEditTarifs) steps.push({ id: 5, name: "Tarifs", icon: Euro });
    return steps;
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchTalent();
    fetchManagers();
  }, [params.id]);

  useEffect(() => {
    if (userRole === "ADMIN" || userRole === "HEAD_OF_INFLUENCE") fetchTalentUsers();
  }, [userRole]);

  useEffect(() => {
    if (userRole) {
      const steps = getAvailableSteps();
      if (steps.length > 0) {
        const stepParam = searchParams.get("step");
        if (stepParam === "stats" && steps.some((s) => s.id === 4)) {
          setActiveStep(4);
        } else {
          setActiveStep(steps[0].id);
        }
      }
    }
  }, [userRole, searchParams]);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const user = await res.json();
        setUserRole(user.role);
      }
    } catch (error) {
      console.error("Erreur auth:", error);
    }
  };

  const fetchTalent = async () => {
    try {
      const res = await fetch(`/api/talents/${params.id}`);
      if (res.ok) {
        const talent = await res.json();
        setFormData({
          prenom: talent.prenom || "",
          nom: talent.nom || "",
          email: talent.email || "",
          telephone: talent.telephone || "",
          telephoneSecondaire: talent.telephoneSecondaire || "",
          dateNaissance: talent.dateNaissance ? talent.dateNaissance.split("T")[0] : "",
          nationalite: talent.nationalite || "",
          presentation: talent.presentation || "",
          niches: talent.niches || [],
          selectedClients: talent.selectedClients?.join(", ") || "",
          commissionInbound: talent.commissionInbound?.toString() || "20",
          commissionOutbound: talent.commissionOutbound?.toString() || "30",
          managerId: talent.managerId || "",
          userId: talent.userId || talent.user?.id || "",
          contactUrgenceNom: talent.contactUrgenceNom || "",
          contactUrgenceTel: talent.contactUrgenceTel || "",
          contactUrgenceLien: talent.contactUrgenceLien || "",
          adresseRue: (() => {
            const a = talent.adresse || "";
            const sep = " – ";
            return a.includes(sep) ? a.split(sep)[0].trim() : a;
          })(),
          adresseComplement: (() => {
            const a = talent.adresse || "";
            const sep = " – ";
            return a.includes(sep) ? a.split(sep).slice(1).join(sep).trim() : "";
          })(),
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
          snapchat: (talent as { snapchat?: string | null }).snapchat || "",
          // Stats Instagram
          igFollowers: talent.stats?.igFollowers?.toString() || "",
          igFollowersEvol: talent.stats?.igFollowersEvol?.toString() || "",
          igEngagement: talent.stats?.igEngagement?.toString() || "",
          igEngagementEvol: talent.stats?.igEngagementEvol?.toString() || "",
          igGenreFemme: talent.stats?.igGenreFemme?.toString() || "",
          igGenreHomme: talent.stats?.igGenreHomme?.toString() || "",
          igAge13_17: talent.stats?.igAge13_17?.toString() || "",
          igAge18_24: talent.stats?.igAge18_24?.toString() || "",
          igAge25_34: talent.stats?.igAge25_34?.toString() || "",
          igAge35_44: talent.stats?.igAge35_44?.toString() || "",
          igAge45Plus: talent.stats?.igAge45Plus?.toString() || "",
          igLocFrance: talent.stats?.igLocFrance?.toString() || "",
          // Stats TikTok
          ttFollowers: talent.stats?.ttFollowers?.toString() || "",
          ttFollowersEvol: talent.stats?.ttFollowersEvol?.toString() || "",
          ttEngagement: talent.stats?.ttEngagement?.toString() || "",
          ttEngagementEvol: talent.stats?.ttEngagementEvol?.toString() || "",
          ttGenreFemme: talent.stats?.ttGenreFemme?.toString() || "",
          ttGenreHomme: talent.stats?.ttGenreHomme?.toString() || "",
          ttAge13_17: talent.stats?.ttAge13_17?.toString() || "",
          ttAge18_24: talent.stats?.ttAge18_24?.toString() || "",
          ttAge25_34: talent.stats?.ttAge25_34?.toString() || "",
          ttAge35_44: talent.stats?.ttAge35_44?.toString() || "",
          ttAge45Plus: talent.stats?.ttAge45Plus?.toString() || "",
          ttLocFrance: talent.stats?.ttLocFrance?.toString() || "",
          // Stories
          storyViews30d: talent.stats?.storyViews30d?.toString() || "",
          storyViews7d: talent.stats?.storyViews7d?.toString() || "",
          storyLinkClicks30d: talent.stats?.storyLinkClicks30d?.toString() || "",
          moyenneVuesStory: (talent as { moyenneVuesStory?: number | null }).moyenneVuesStory?.toString() || "",
          moyenneVuesSnap: (talent as { moyenneVuesSnap?: number | null }).moyenneVuesSnap?.toString() || "",
          // Tarifs
          tarifStory: talent.tarifs?.tarifStory?.toString() || "",
          tarifStoryConcours: talent.tarifs?.tarifStoryConcours?.toString() || "",
          tarifPost: talent.tarifs?.tarifPost?.toString() || "",
          tarifPostConcours: talent.tarifs?.tarifPostConcours?.toString() || "",
          tarifPostCommun: talent.tarifs?.tarifPostCommun?.toString() || "",
          tarifPostCrosspost: talent.tarifs?.tarifPostCrosspost?.toString() || "",
          tarifReel: talent.tarifs?.tarifReel?.toString() || "",
          tarifReelCrosspost: talent.tarifs?.tarifReelCrosspost?.toString() || "",
          tarifReelConcours: talent.tarifs?.tarifReelConcours?.toString() || "",
          tarifTiktokVideo: talent.tarifs?.tarifTiktokVideo?.toString() || "",
          tarifTiktokConcours: talent.tarifs?.tarifTiktokConcours?.toString() || "",
          tarifYoutubeVideo: talent.tarifs?.tarifYoutubeVideo?.toString() || "",
          tarifYoutubeShort: talent.tarifs?.tarifYoutubeShort?.toString() || "",
          tarifSnapchatStory: talent.tarifs?.tarifSnapchatStory?.toString() || "",
          tarifSnapchatSpotlight: talent.tarifs?.tarifSnapchatSpotlight?.toString() || "",
          tarifEvent: talent.tarifs?.tarifEvent?.toString() || "",
          tarifShooting: talent.tarifs?.tarifShooting?.toString() || "",
          tarifAmbassadeur: talent.tarifs?.tarifAmbassadeur?.toString() || "",
        });

        // Stories screenshots (pour aperçus) — tableaux complets
        const rawScreens = talent.stats?.storyScreenshots;
        let views30d: string[] = [];
        let views7d: string[] = [];
        let linkClicks30d: string[] = [];

        if (Array.isArray(rawScreens)) {
          views30d = rawScreens.filter((u: any) => typeof u === "string");
        } else if (rawScreens && typeof rawScreens === "object") {
          if (Array.isArray(rawScreens.views30d)) {
            views30d = rawScreens.views30d.filter((u: any) => typeof u === "string");
          }
          if (Array.isArray(rawScreens.views7d)) {
            views7d = rawScreens.views7d.filter((u: any) => typeof u === "string");
          }
          if (Array.isArray(rawScreens.linkClicks30d)) {
            linkClicks30d = rawScreens.linkClicks30d.filter((u: any) => typeof u === "string");
          }
        }

        setStoryScreens({ views30d, views7d, linkClicks30d });
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStoryScreensUpload = async (
    slot: "views30d" | "views7d" | "linkClicks30d",
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);

    setStoryScreensError(null);
    setStoryScreensUploading(true);

    try {
      const formData = new FormData();
      formData.append("slot", slot);

      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Seules les images sont autorisées.");
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error("Chaque image doit faire moins de 5 Mo.");
        }
        formData.append("files", file);
      }

      const res = await fetch(`/api/talents/${params.id}/story-screenshots`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err?.error || "Erreur lors de l'upload des screenshots sur le serveur"
        );
      }

      const data = await res.json();

      setStoryScreens({
        views30d: Array.isArray(data.views30d) ? data.views30d : [],
        views7d: Array.isArray(data.views7d) ? data.views7d : [],
        linkClicks30d: Array.isArray(data.linkClicks30d) ? data.linkClicks30d : [],
      });

      setStoryScreensError(null);
    } catch (error: any) {
      console.error("Erreur upload screenshots stories:", error);
      setStoryScreensError(error.message || "Erreur lors de l'upload des screenshots");
    } finally {
      setStoryScreensUploading(false);
      e.target.value = "";
    }
  };

  const handleStoryScreensRemove = async (
    slot: "views30d" | "views7d" | "linkClicks30d",
    urlToRemove: string
  ) => {
    const current = slot === "views30d" ? storyScreens.views30d : slot === "views7d" ? storyScreens.views7d : storyScreens.linkClicks30d;
    const newUrls = current.filter((u) => u !== urlToRemove);
    setStoryScreensError(null);
    try {
      const res = await fetch(`/api/talents/${params.id}/story-screenshots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, urls: newUrls }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erreur suppression");
      }
      const data = await res.json();
      setStoryScreens({
        views30d: Array.isArray(data.views30d) ? data.views30d : [],
        views7d: Array.isArray(data.views7d) ? data.views7d : [],
        linkClicks30d: Array.isArray(data.linkClicks30d) ? data.linkClicks30d : [],
      });
    } catch (error: any) {
      setStoryScreensError(error.message || "Erreur lors de la suppression");
    }
  };

  const fetchManagers = async () => {
    const res = await fetch("/api/users?role=TM");
    if (res.ok) setManagers(await res.json());
  };

  const fetchTalentUsers = async () => {
    const res = await fetch("/api/users?role=TALENT");
    if (res.ok) setTalentUsers(await res.json());
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const name = e.target.name;
    setFormData({ ...formData, [name]: e.target.value });
    if (name.startsWith("tarif")) {
      setSuggestedTarifFields((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  const suggestTarifs = () => {
    const followers = parseInt(String(formData.igFollowers || "").replace(/\s/g, ""), 10);
    if (!Number.isFinite(followers) || followers <= 0) {
      alert("Renseignez d’abord les followers Instagram du talent (étape Stats) pour pouvoir suggérer les tarifs.");
      return;
    }
    const story = roundTo100(interpolate(followers, REFERENCE_TALENTS, "story"));
    const reel = roundTo100(interpolate(followers, REFERENCE_TALENTS, "reel"));
    const post = roundTo100(interpolate(followers, REFERENCE_TALENTS, "post"));
    const tiktokVideo = roundTo100(interpolate(followers, REFERENCE_TALENTS, "tiktokVideo"));
    const tarifStoryConcours = roundTo100(story * 1.3);
    const tarifReelCrosspost = roundTo100(reel * 1.1);
    const tarifReelConcours = roundTo100(reel * 1.2);
    const tarifPostCrosspost = roundTo100(post * 1.1);
    const tarifPostConcours = roundTo100(post * 1.2);
    const tarifTiktokConcours = roundTo100(tiktokVideo * 1.1);

    const suggested: Record<string, string> = {
      tarifStory: String(story),
      tarifStoryConcours: String(tarifStoryConcours),
      tarifPost: String(post),
      tarifPostConcours: String(tarifPostConcours),
      tarifPostCrosspost: String(tarifPostCrosspost),
      tarifReel: String(reel),
      tarifReelCrosspost: String(tarifReelCrosspost),
      tarifReelConcours: String(tarifReelConcours),
      tarifTiktokVideo: String(tiktokVideo),
      tarifTiktokConcours: String(tarifTiktokConcours),
    };

    setFormData((prev) => ({ ...prev, ...suggested }));
    setSuggestedTarifFields(new Set(Object.keys(suggested)));
  };

  const toggleNiche = (niche: string) => {
    setFormData({
      ...formData,
      niches: formData.niches.includes(niche)
        ? formData.niches.filter((n) => n !== niche)
        : [...formData.niches, niche],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const adresse = [formData.adresseRue, formData.adresseComplement].filter(Boolean).join(" – ") || null;
      const res = await fetch(`/api/talents/${params.id}`, {
        method: "PUT",
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
          _userRole: userRole,
        }),
      });

      if (res.ok) {
        router.push(`/talents/${params.id}`);
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

  const availableSteps = getAvailableSteps();

  if (availableSteps.length === 0) {
    return (
      <div className="text-center py-12">
        <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Vous n'avez pas les permissions pour modifier ce talent.</p>
        <Link href={`/talents/${params.id}`} className="text-glowup-rose hover:underline mt-2 inline-block">
          Retour à la fiche
        </Link>
      </div>
    );
  }

  const getPageTitle = () => {
    if (userRole === "TM") return "Mettre à jour les statistiques";
    if (userRole === "HEAD_OF" || userRole === "HEAD_OF_INFLUENCE") return "Mettre à jour les tarifs";
    return "Modifier le talent";
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/talents/${params.id}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-glowup-licorice">{getPageTitle()}</h1>
            <p className="text-gray-500 text-sm">
              {formData.prenom} {formData.nom}
              {availableSteps.length > 1 && ` • Étape ${availableSteps.findIndex(s => s.id === activeStep) + 1} sur ${availableSteps.length}`}
            </p>
          </div>
        </div>

        {/* Badge rôle */}
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          userRole === "ADMIN" ? "bg-purple-100 text-purple-700" :
          userRole === "HEAD_OF" ? "bg-blue-100 text-blue-700" :
          userRole === "HEAD_OF_INFLUENCE" ? "bg-blue-100 text-blue-700" :
          "bg-glowup-lace text-glowup-licorice"
        }`}>
          {userRole === "ADMIN" ? "Admin" : userRole === "HEAD_OF" ? "Head Of" : userRole === "HEAD_OF_INFLUENCE" ? "Head of Influence" : "Talent Manager"}
        </span>
      </div>

      {/* Steps */}
      {availableSteps.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {availableSteps.map((step, index) => (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeStep === step.id
                  ? "bg-glowup-licorice text-white"
                  : availableSteps.findIndex(s => s.id === activeStep) > index
                  ? "bg-glowup-green/20 text-glowup-licorice"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              <step.icon className="w-4 h-4" />
              {step.name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Step 1: Profil - ADMIN only */}
        {activeStep === 1 && canEditInfos && (
          <div className="space-y-6">
            {/* Infos de base */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-glowup-rose/10 rounded-lg">
                  <User className="w-5 h-5 text-glowup-rose" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Informations générales</h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Prénom *</label>
                  <input type="text" name="prenom" value={formData.prenom} onChange={handleChange} required className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Nom *</label>
                  <input type="text" name="nom" value={formData.nom} onChange={handleChange} required className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email *</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} required className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Téléphone</label>
                  <input type="tel" name="telephone" value={formData.telephone} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Téléphone secondaire</label>
                  <input type="tel" name="telephoneSecondaire" value={formData.telephoneSecondaire} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Date de naissance</label>
                  <input type="date" name="dateNaissance" value={formData.dateNaissance} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Nationalité</label>
                  <input type="text" name="nationalite" value={formData.nationalite} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Talent Manager *</label>
                  <select name="managerId" value={formData.managerId} onChange={handleChange} required className={inputClass}>
                    <option value="">Sélectionner...</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
                    ))}
                  </select>
                </div>
                {(userRole === "ADMIN" || userRole === "HEAD_OF_INFLUENCE") && (
                  <div className="md:col-span-2">
                    <label className={labelClass}>Compte utilisateur (portail talent)</label>
                    <select name="userId" value={formData.userId} onChange={handleChange} className={inputClass}>
                      <option value="">Aucun — pas de connexion portail</option>
                      {talentUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.prenom} {u.nom} — {u.email}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Lie cette fiche Talent au compte utilisateur (rôle Talent) pour qu&apos;il accède au portail (collaborations, factures).</p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className={labelClass}>Présentation</label>
                <textarea name="presentation" value={formData.presentation} onChange={handleChange} rows={3} className={inputClass} />
              </div>

              <div className="mt-4">
                <label className={labelClass}>Niches</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {NICHES.map((niche) => (
                    <button
                      key={niche}
                      type="button"
                      onClick={() => toggleNiche(niche)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        formData.niches.includes(niche)
                          ? "bg-glowup-licorice text-white"
                          : "bg-glowup-lace text-glowup-licorice hover:bg-glowup-rose/20"
                      }`}
                    >
                      {niche}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className={labelClass}>Selected Clients</label>
                <input type="text" name="selectedClients" value={formData.selectedClients} onChange={handleChange} placeholder="L'Oréal, Nike, Dior..." className={inputClass} />
              </div>
            </div>

            {/* Contact Urgence */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-red-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Contact d'urgence</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Nom</label>
                  <input type="text" name="contactUrgenceNom" value={formData.contactUrgenceNom} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Téléphone</label>
                  <input type="tel" name="contactUrgenceTel" value={formData.contactUrgenceTel} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Lien</label>
                  <select name="contactUrgenceLien" value={formData.contactUrgenceLien} onChange={handleChange} className={inputClass}>
                    <option value="">Sélectionner...</option>
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

            {/* Commissions */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <Euro className="w-5 h-5 text-emerald-500" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Commissions</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Commission Inbound %</label>
                  <input type="number" name="commissionInbound" value={formData.commissionInbound} onChange={handleChange} className={inputClass} />
                  <p className="text-xs text-gray-500 mt-1">Mail entrant</p>
                </div>
                <div>
                  <label className={labelClass}>Commission Outbound %</label>
                  <input type="number" name="commissionOutbound" value={formData.commissionOutbound} onChange={handleChange} className={inputClass} />
                  <p className="text-xs text-gray-500 mt-1">On démarche</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Adresse & Légal - ADMIN only */}
        {activeStep === 2 && canEditInfos && (
          <div className="space-y-6">
            {/* Adresse */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <MapPin className="w-5 h-5 text-blue-500" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Adresse personnelle</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Adresse (rue)</label>
                  <input type="text" name="adresseRue" value={formData.adresseRue} onChange={handleChange} placeholder="123 rue de la Paix" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Complément</label>
                  <input type="text" name="adresseComplement" value={formData.adresseComplement} onChange={handleChange} placeholder="Bâtiment A, Apt 12..." className={inputClass} />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Code postal</label>
                    <input type="text" name="codePostal" value={formData.codePostal} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Ville</label>
                    <input type="text" name="ville" value={formData.ville} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Pays</label>
                    <select name="pays" value={formData.pays} onChange={handleChange} className={inputClass}>
                      {LISTE_PAYS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Légal */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Building2 className="w-5 h-5 text-purple-500" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Informations légales</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Forme juridique</label>
                  <select name="formeJuridique" value={formData.formeJuridique} onChange={handleChange} className={inputClass}>
                    <option value="">Sélectionner...</option>
                    {FORMES_JURIDIQUES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Raison sociale</label>
                  <input type="text" name="raisonSociale" value={formData.raisonSociale} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>SIRET</label>
                  <input type="text" name="siret" value={formData.siret} onChange={handleChange} placeholder="123 456 789 00012" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Numéro TVA</label>
                  <input type="text" name="numeroTVA" value={formData.numeroTVA} onChange={handleChange} placeholder="FR12345678901" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Banque */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <Landmark className="w-5 h-5 text-emerald-500" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Coordonnées bancaires</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Banque</label>
                  <input type="text" name="nomBanque" value={formData.nomBanque} onChange={handleChange} placeholder="BNP Paribas" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Titulaire du compte</label>
                  <input type="text" name="titulaireCompte" value={formData.titulaireCompte} onChange={handleChange} placeholder="Nom du titulaire" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>BIC</label>
                  <input type="text" name="bic" value={formData.bic} onChange={handleChange} placeholder="BNPAFRPP" className={inputClass} />
                </div>
                <div className="md:col-span-3">
                  <label className={labelClass}>IBAN</label>
                  <input type="text" name="iban" value={formData.iban} onChange={handleChange} placeholder="FR76 1234 5678 9012 3456 7890 123" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-glowup-licorice">Notes internes</h2>
                <span className="text-xs text-gray-400">Visible uniquement par l'équipe</span>
              </div>
              <textarea name="notesInternes" value={formData.notesInternes} onChange={handleChange} rows={3} placeholder="Notes privées..." className={inputClass} />
            </div>
          </div>
        )}

        {/* Step 3: Réseaux - ADMIN only */}
        {activeStep === 3 && canEditInfos && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Instagram</h2>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                <input type="text" name="instagram" value={formData.instagram} onChange={handleChange} placeholder="username" className={`${inputClass} pl-8`} />
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-black rounded-lg">
                  <Music2 className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">TikTok</h2>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                <input type="text" name="tiktok" value={formData.tiktok} onChange={handleChange} placeholder="username" className={`${inputClass} pl-8`} />
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-red-500 rounded-lg">
                  <Youtube className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">YouTube</h2>
              </div>
              <input type="url" name="youtube" value={formData.youtube} onChange={handleChange} placeholder="https://youtube.com/@channel" className={inputClass} />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-yellow-400 rounded-lg">
                  <span className="text-lg font-bold text-white">S</span>
                </div>
                <h2 className="text-lg font-semibold text-glowup-licorice">Snapchat</h2>
              </div>
              <input type="text" name="snapchat" value={formData.snapchat} onChange={handleChange} placeholder="@username ou lien" className={inputClass} />
            </div>
          </div>
        )}

        {/* Step 4: Stats - TM + ADMIN */}
        {activeStep === 4 && canEditStats && (
          <div className="space-y-6">
            {/* Mini bio éditable par le TM */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-glowup-rose/10 rounded-lg">
                    <User className="w-5 h-5 text-glowup-rose" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-glowup-licorice">Bio publique</h2>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Présentation / Bio</label>
                <textarea
                  name="presentation"
                  value={formData.presentation}
                  onChange={handleChange}
                  rows={4}
                  className={inputClass}
                  placeholder="Présente ton talent en quelques lignes : ton, thématiques, preuves sociales..."
                />
              </div>
            </div>
            {userRole === "TM" && (
              <div className="bg-glowup-lace/50 border border-glowup-licorice/10 rounded-xl p-4 flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-medium text-glowup-licorice">Mise à jour des statistiques</p>
                  <p className="text-sm text-glowup-licorice/70">
                    Mettez à jour les stats Instagram / TikTok et uploadez les vues stories + clics lien (tous les 30 jours).
                  </p>
                </div>
              </div>
            )}

            {/* Instagram Stats */}
            {formData.instagram && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg font-semibold text-glowup-licorice">Statistiques Instagram</h2>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Followers *</label>
                    <input type="number" name="igFollowers" value={formData.igFollowers} onChange={handleChange} placeholder="102000" className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none" />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Évolution %</label>
                    <input type="number" step="0.01" name="igFollowersEvol" value={formData.igFollowersEvol} onChange={handleChange} placeholder="0.68" className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none" />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Engagement % *</label>
                    <input type="number" step="0.01" name="igEngagement" value={formData.igEngagement} onChange={handleChange} placeholder="6.12" className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none" />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Évol. Eng. pts</label>
                    <input type="number" step="0.01" name="igEngagementEvol" value={formData.igEngagementEvol} onChange={handleChange} placeholder="1.92" className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none" />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>👩 Femmes %</label>
                    <input type="number" step="0.1" name="igGenreFemme" value={formData.igGenreFemme} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>👨 Hommes %</label>
                    <input type="number" step="0.1" name="igGenreHomme" value={formData.igGenreHomme} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>🇫🇷 France %</label>
                    <input type="number" step="0.1" name="igLocFrance" value={formData.igLocFrance} onChange={handleChange} className={inputClass} />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Tranches d'âge</label>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {[
                      { name: "igAge13_17", label: "13-17" },
                      { name: "igAge18_24", label: "18-24" },
                      { name: "igAge25_34", label: "25-34" },
                      { name: "igAge35_44", label: "35-44" },
                      { name: "igAge45Plus", label: "45+" },
                    ].map((age) => (
                      <div key={age.name} className="text-center">
                        <label className="block text-xs text-gray-500 mb-1">{age.label}</label>
                        <input type="number" name={age.name} value={(formData as any)[age.name]} onChange={handleChange} placeholder="%" className="w-full px-2 py-2 text-center rounded-lg border border-gray-200 focus:outline-none focus:border-pink-500 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TikTok Stats */}
            {formData.tiktok && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-black rounded-lg">
                    <Music2 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg font-semibold text-glowup-licorice">Statistiques TikTok</h2>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Followers *</label>
                    <input type="number" name="ttFollowers" value={formData.ttFollowers} onChange={handleChange} placeholder="363000" className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none" />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Évolution %</label>
                    <input type="number" step="0.01" name="ttFollowersEvol" value={formData.ttFollowersEvol} onChange={handleChange} placeholder="0.8" className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none" />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Engagement % *</label>
                    <input type="number" step="0.01" name="ttEngagement" value={formData.ttEngagement} onChange={handleChange} placeholder="4.91" className="w-full bg-transparent text-xl font-bold text-glowup-licorice focus:outline-none" />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs text-gray-500 mb-1">Évol. Eng. pts</label>
                    <input type="number" step="0.01" name="ttEngagementEvol" value={formData.ttEngagementEvol} onChange={handleChange} placeholder="2.12" className="w-full bg-transparent text-xl font-bold text-emerald-500 focus:outline-none" />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>👩 Femmes %</label>
                    <input type="number" step="0.1" name="ttGenreFemme" value={formData.ttGenreFemme} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>👨 Hommes %</label>
                    <input type="number" step="0.1" name="ttGenreHomme" value={formData.ttGenreHomme} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>🇫🇷 France %</label>
                    <input type="number" step="0.1" name="ttLocFrance" value={formData.ttLocFrance} onChange={handleChange} className={inputClass} />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Tranches d'âge</label>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {[
                      { name: "ttAge13_17", label: "13-17" },
                      { name: "ttAge18_24", label: "18-24" },
                      { name: "ttAge25_34", label: "25-34" },
                      { name: "ttAge35_44", label: "35-44" },
                      { name: "ttAge45Plus", label: "45+" },
                    ].map((age) => (
                      <div key={age.name} className="text-center">
                        <label className="block text-xs text-gray-500 mb-1">{age.label}</label>
                        <input type="number" name={age.name} value={(formData as any)[age.name]} onChange={handleChange} placeholder="%" className="w-full px-2 py-2 text-center rounded-lg border border-gray-200 focus:outline-none focus:border-gray-800 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Stories / vues & clics lien */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-glowup-licorice">Performances Stories</h2>
                  <p className="text-sm text-gray-500">
                    Renseignez les vues moyennes + clics lien, et uploadez les screenshots.
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Vues max stories (30 derniers jours)</label>
                  <input
                    type="number"
                    name="storyViews30d"
                    value={formData.storyViews30d}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Ex : 18 500"
                  />
                </div>
                <div>
                  <label className={labelClass}>Vues max stories (7 derniers jours)</label>
                  <input
                    type="number"
                    name="storyViews7d"
                    value={formData.storyViews7d}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Ex : 21 300"
                  />
                </div>
                <div>
                  <label className={labelClass}>Clics sur lien max (30 derniers jours)</label>
                  <input
                    type="number"
                    name="storyLinkClicks30d"
                    value={formData.storyLinkClicks30d}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Ex : 430"
                  />
                </div>
              </div>

              {/* Uploader screenshots – simple input, les URLs seront gérées côté backend plus tard si besoin */}
              <div>
                <label className={labelClass}>Captures d’écran des stats stories</label>
                <p className="text-xs text-gray-500 mb-2">
                  Ajoutez les screenshots des vues stories (30j / 7j) et des clics lien (30j). Ils seront visibles en interne sur la fiche talent.
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-1">Screens – Vues stories (30j)</p>
                    <input
                      ref={fileInputRef30}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleStoryScreensUpload("views30d", e)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      {storyScreens.views30d.map((url, i) => (
                        <div key={i} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-amber-100 bg-amber-50 shrink-0">
                          <img src={url} alt={`Stories 30j ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleStoryScreensRemove("views30d", url)}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            title="Supprimer"
                          >
                            <Trash2 className="w-6 h-6 text-white" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => fileInputRef30.current?.click()}
                        disabled={storyScreensUploading}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 flex items-center justify-center text-amber-600 hover:bg-amber-100 hover:border-amber-300 transition-colors shrink-0"
                        title="Ajouter des photos"
                      >
                        <Plus className="w-8 h-8" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-1">Screens – Vues stories (7j)</p>
                    <input
                      ref={fileInputRef7}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleStoryScreensUpload("views7d", e)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      {storyScreens.views7d.map((url, i) => (
                        <div key={i} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-amber-100 bg-amber-50 shrink-0">
                          <img src={url} alt={`Stories 7j ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleStoryScreensRemove("views7d", url)}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            title="Supprimer"
                          >
                            <Trash2 className="w-6 h-6 text-white" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => fileInputRef7.current?.click()}
                        disabled={storyScreensUploading}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 flex items-center justify-center text-amber-600 hover:bg-amber-100 hover:border-amber-300 transition-colors shrink-0"
                        title="Ajouter des photos"
                      >
                        <Plus className="w-8 h-8" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-1">Screens – Clics sur lien (30j)</p>
                    <input
                      ref={fileInputRefClicks}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleStoryScreensUpload("linkClicks30d", e)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      {storyScreens.linkClicks30d.map((url, i) => (
                        <div key={i} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-amber-100 bg-amber-50 shrink-0">
                          <img src={url} alt={`Clics lien 30j ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleStoryScreensRemove("linkClicks30d", url)}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            title="Supprimer"
                          >
                            <Trash2 className="w-6 h-6 text-white" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => fileInputRefClicks.current?.click()}
                        disabled={storyScreensUploading}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 flex items-center justify-center text-amber-600 hover:bg-amber-100 hover:border-amber-300 transition-colors shrink-0"
                        title="Ajouter des photos"
                      >
                        <Plus className="w-8 h-8" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Vous pouvez sélectionner plusieurs images à la fois (5 Mo max par image).
                  </p>
                </div>
                {storyScreensError && (
                  <p className="text-xs text-red-500 mt-1">{storyScreensError}</p>
                )}
                {storyScreensUploading && (
                  <p className="text-xs text-gray-500 mt-1">Upload en cours...</p>
                )}
              </div>
            </div>

            {!formData.instagram && !formData.tiktok && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p className="text-amber-700">Aucun réseau social renseigné pour ce talent.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Tarifs - HEAD_OF + ADMIN */}
        {activeStep === 5 && canEditTarifs && (
          <div className="space-y-6">
            {(userRole === "HEAD_OF" || userRole === "HEAD_OF_INFLUENCE") && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <span className="text-2xl">💰</span>
                <div>
                  <p className="font-medium text-blue-900">Mise à jour des tarifs</p>
                  <p className="text-sm text-blue-700">Définissez les tarifs pour chaque type de contenu.</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-gray-500">
                Basé sur les followers Instagram du talent (étape Stats). Vous pouvez ajuster les valeurs puis sauvegarder.
              </p>
              <button
                type="button"
                onClick={suggestTarifs}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium shadow-sm hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 transition-all"
              >
                ✨ Suggérer les tarifs
              </button>
            </div>

            {/* Calculateur CPM Story */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Calculateur CPM Story</h2>
              <p className="text-sm text-gray-500 mb-4">
                Le prix suggéré est calculé à partir des vues moyennes story. Cliquez sur « Appliquer » pour remplir le champ Story dans la grille.
              </p>
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[200px]">
                  <label className={labelClass}>Vues moyennes story</label>
                  <input
                    type="number"
                    name="moyenneVuesStory"
                    value={formData.moyenneVuesStory}
                    onChange={handleChange}
                    placeholder="45000"
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    Prix suggéré Story :{" "}
                    {(() => {
                      const vues = parseInt(String(formData.moyenneVuesStory).replace(/\s/g, ""), 10);
                      if (!Number.isFinite(vues) || vues <= 0) return "—";
                      const prix = Math.round((vues / 1000) * 52);
                      return `${prix.toLocaleString("fr-FR")} € HT`;
                    })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const vues = parseInt(String(formData.moyenneVuesStory).replace(/\s/g, ""), 10);
                      if (!Number.isFinite(vues) || vues <= 0) return;
                      const prixStory = (vues / 1000) * 52;
                      const arrondi = (val: number) => Math.round(val / 100) * 100;
                      setFormData((prev) => ({
                        ...prev,
                        tarifStory: String(arrondi(prixStory)),
                        tarifPost: String(arrondi(prixStory + 150)),
                      }));
                      setSuggestedTarifFields((prev) => {
                        const next = new Set(prev);
                        next.delete("tarifStory");
                        next.delete("tarifPost");
                        return next;
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>

            {/* Instagram Tarifs */}
            {formData.instagram && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg font-semibold text-glowup-licorice">Tarifs Instagram</h2>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { name: "tarifStory", label: "Story €" },
                    { name: "tarifStoryConcours", label: "Story Concours €" },
                    { name: "tarifPost", label: "Post €" },
                    { name: "tarifPostConcours", label: "Post Concours €" },
                    { name: "tarifPostCommun", label: "Post Commun €" },
                    { name: "tarifPostCrosspost", label: "Post Crosspost €" },
                    { name: "tarifReel", label: "Reel €" },
                    { name: "tarifReelCrosspost", label: "Réel Crosspost €" },
                    { name: "tarifReelConcours", label: "Réel Jeu Concours €" },
                  ].map((tarif) => (
                    <div key={tarif.name}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className={labelClass}>{tarif.label}</label>
                        {suggestedTarifFields.has(tarif.name) && (
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Suggéré</span>
                        )}
                      </div>
                      <div className="relative">
                        <input type="number" name={tarif.name} value={(formData as any)[tarif.name]} onChange={handleChange} className={`${inputClass} pr-10`} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
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
                  <h2 className="text-lg font-semibold text-glowup-licorice">Tarifs TikTok</h2>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className={labelClass}>Vidéo TikTok €</label>
                      {suggestedTarifFields.has("tarifTiktokVideo") && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Suggéré</span>
                      )}
                    </div>
                    <div className="relative">
                      <input type="number" name="tarifTiktokVideo" value={formData.tarifTiktokVideo} onChange={handleChange} className={`${inputClass} pr-10`} />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className={labelClass}>TikTok Jeu Concours €</label>
                      {suggestedTarifFields.has("tarifTiktokConcours") && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Suggéré</span>
                      )}
                    </div>
                    <div className="relative">
                      <input type="number" name="tarifTiktokConcours" value={formData.tarifTiktokConcours} onChange={handleChange} className={`${inputClass} pr-10`} />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Calculateur CPM Snap Vidéo — affiché seulement si le talent a Snapchat */}
            {formData.snapchat && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-glowup-licorice mb-4">Calculateur CPM Snap Vidéo</h2>
              <p className="text-sm text-gray-500 mb-4">
                Le prix suggéré est calculé à partir des vues moyennes Snap. Cliquez sur « Appliquer » pour remplir le champ Snapchat Spotlight dans la grille.
              </p>
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[200px]">
                  <label className={labelClass}>Vues moyennes snap</label>
                  <input
                    type="number"
                    name="moyenneVuesSnap"
                    value={formData.moyenneVuesSnap}
                    onChange={handleChange}
                    placeholder="25000"
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    Prix suggéré Snap Vidéo :{" "}
                    {(() => {
                      const vues = parseInt(String(formData.moyenneVuesSnap).replace(/\s/g, ""), 10);
                      if (!Number.isFinite(vues) || vues <= 0) return "—";
                      const prix = Math.round((vues / 1000) * 35);
                      return `${prix.toLocaleString("fr-FR")} € HT`;
                    })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const vues = parseInt(String(formData.moyenneVuesSnap).replace(/\s/g, ""), 10);
                      if (!Number.isFinite(vues) || vues <= 0) return;
                      const prix = Math.round((vues / 1000) * 35);
                      setFormData((prev) => ({ ...prev, tarifSnapchatSpotlight: String(prix) }));
                      setSuggestedTarifFields((prev) => {
                        const next = new Set(prev);
                        next.delete("tarifSnapchatSpotlight");
                        return next;
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>
            )}

            {/* Tarifs Snap (internes) — affichés seulement si le talent a Snapchat */}
            {formData.snapchat && (
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded">Interne uniquement</span>
                <h2 className="text-lg font-semibold text-glowup-licorice">Tarifs Snapchat (non affichés sur le book)</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">Ces tarifs sont visibles uniquement en interne (dashboard, négos, collabs).</p>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { name: "tarifSnapchatStory", label: "Snapchat Story €" },
                  { name: "tarifSnapchatSpotlight", label: "Snapchat Spotlight €" },
                ].map((tarif) => (
                  <div key={tarif.name}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className={labelClass}>{tarif.label}</label>
                      {suggestedTarifFields.has(tarif.name) && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Suggéré</span>
                      )}
                    </div>
                    <div className="relative">
                      <input type="number" name={tarif.name} value={(formData as any)[tarif.name]} onChange={handleChange} className={`${inputClass} pr-10`} />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Autres */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-glowup-licorice mb-6">Autres prestations</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { name: "tarifEvent", label: "Event €" },
                  { name: "tarifShooting", label: "Shooting €" },
                  { name: "tarifAmbassadeur", label: "Ambassadeur €" },
                ].map((tarif) => (
                  <div key={tarif.name}>
                    <label className={labelClass}>{tarif.label}</label>
                    <div className="relative">
                      <input type="number" name={tarif.name} value={(formData as any)[tarif.name]} onChange={handleChange} className={`${inputClass} pr-10`} />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          {availableSteps.length > 1 && availableSteps.findIndex(s => s.id === activeStep) > 0 ? (
            <button
              type="button"
              onClick={() => {
                const currentIndex = availableSteps.findIndex(s => s.id === activeStep);
                setActiveStep(availableSteps[currentIndex - 1].id);
              }}
              className="px-6 py-2.5 text-gray-500 hover:text-glowup-licorice"
            >
              Précédent
            </button>
          ) : (
            <div />
          )}
          
          {availableSteps.findIndex(s => s.id === activeStep) < availableSteps.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                const currentIndex = availableSteps.findIndex(s => s.id === activeStep);
                setActiveStep(availableSteps[currentIndex + 1].id);
              }}
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