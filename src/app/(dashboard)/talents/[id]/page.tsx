"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Instagram,
  Music2,
  Youtube,
  MapPin,
  Mail,
  Phone,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Users,
  Heart,
  Euro,
  Loader2,
  Share2,
  BarChart3,
  Sparkles,
  Calendar,
  Globe,
  Star,
  Play,
  Camera,
  Zap,
  Target,
  Crown,
  Upload,
  Check,
  X,
  Send,
  RefreshCw,
} from "lucide-react";
import { formatPercent } from "@/lib/format";
import { getInstagramProfileUrl, normalizeInstagramHandle } from "@/lib/social-links";
import KitPhotosManager from "@/components/talent/KitPhotosManager";
import ContratsTalentBloc from "@/components/talent/ContratsTalentBloc";
import { talentSlug } from "@/lib/talent-slug";

interface TalentDetail {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  bio: string | null;
  presentation: string | null;
  ville: string | null;
  pays: string | null;
  photo: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  niches: string[];
  selectedClients: string[];
  commissionInbound: number;
  commissionOutbound: number;
  dateArrivee: string;
  createdAt: string;
  managerId: string;
  manager?: { id: string; prenom: string; nom: string; email: string } | null;
  user?: { id: string; email: string; actif: boolean } | null;
  stats?: {
    igFollowers: number | null;
    igFollowersEvol: number | null;
    igEngagement: number | null;
    igEngagementEvol: number | null;
    igGenreFemme: number | null;
    igGenreHomme: number | null;
    igAge13_17: number | null;
    igAge18_24: number | null;
    igAge25_34: number | null;
    igAge35_44: number | null;
    igAge45Plus: number | null;
    igLocFrance: number | null;
    ttFollowers: number | null;
    ttFollowersEvol: number | null;
    ttEngagement: number | null;
    ttEngagementEvol: number | null;
    ttGenreFemme: number | null;
    ttGenreHomme: number | null;
    ttAge13_17: number | null;
    ttAge18_24: number | null;
    ttAge25_34: number | null;
    ttAge35_44: number | null;
    ttAge45Plus: number | null;
    ttLocFrance: number | null;
    ytAbonnes: number | null;
    ytAbonnesEvol: number | null;
    // Stories / clicks stats
    storyViews30d: number | null;
    storyViews7d: number | null;
    storyLinkClicks30d: number | null;
    // Screenshots JSON blob
    storyScreenshots?: unknown;
    lastUpdate: string | null;
  } | null;
  tarifs?: {
    tarifStory: number | null;
    tarifStoryConcours: number | null;
    tarifPost: number | null;
    tarifPostConcours: number | null;
    tarifPostCommun: number | null;
    tarifPostCrosspost: number | null;
    tarifReel: number | null;
    tarifReelCrosspost: number | null;
    tarifReelConcours: number | null;
    tarifTiktokVideo: number | null;
    tarifTiktokConcours: number | null;
    tarifYoutubeVideo: number | null;
    tarifYoutubeShort: number | null;
    tarifSnapchatStory: number | null;
    tarifSnapchatSpotlight: number | null;
    tarifEvent: number | null;
    tarifShooting: number | null;
    tarifAmbassadeur: number | null;
  } | null;
  collaborations?: Array<{
    id: string;
    marque: { id: string; nom: string };
    livrables: any[];
    createdAt: string;
  }>;
  negociations?: Array<{
    id: string;
    marque: { id: string; nom: string };
    createdAt: string;
  }>;
  demandesGift?: Array<{
    id: string;
    tm: { id: string; prenom: string; nom: string };
    accountManager?: { id: string; prenom: string; nom: string } | null;
    createdAt: string;
  }>;
  _count?: { collaborations: number };
}

export default function TalentDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [talent, setTalent] = useState<TalentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"instagram" | "tiktok">("instagram");
  const [kitMediaOpen, setKitMediaOpen] = useState(false);

  // Refresh stats Instagram/TikTok via Apify
  const [refreshingStats, setRefreshingStats] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Upload photo state
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [demanderTarifsLoading, setDemanderTarifsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bio edit state
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  // Performances Stories — édition inline
  const [editingStoryStats, setEditingStoryStats] = useState(false);
  const [storyStatsDraft, setStoryStatsDraft] = useState({
    storyViews30d: "",
    storyViews7d: "",
    storyLinkClicks30d: "",
  });
  const [savingStoryStats, setSavingStoryStats] = useState(false);
  const [storyStatsError, setStoryStatsError] = useState<string | null>(null);

  // Performances Stories — upload screenshots (inline)
  const [storyUploadingSlot, setStoryUploadingSlot] = useState<
    "views30d" | "views7d" | "linkClicks30d" | null
  >(null);
  const [storyScreensError, setStoryScreensError] = useState<string | null>(null);

  const user = session?.user as { id: string; role: string } | undefined;
  const role = user?.role || "";
  const userId = user?.id || "";

  const canEditTalent = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canDeleteTalent = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canUpdateStats = role === "TM" || role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE" || role === "HEAD_OF_SALES";
  const canUploadPhoto = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE" || role === "HEAD_OF_SALES" || role === "TM";
  const isMyTalent = talent?.managerId === userId;
  // Le TM peut modifier la bio uniquement de ses propres talents.
  const canEditBio = canEditTalent || (role === "TM" && isMyTalent);

  useEffect(() => {
    if (params.id) fetchTalent();
  }, [params.id]);

  const fetchTalent = async () => {
    try {
      const res = await fetch(`/api/talents/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setTalent(data);
        // Auto-select tab based on available data
        if (data.tiktok && data.stats?.ttFollowers && (!data.instagram || !data.stats?.igFollowers)) {
          setActiveTab("tiktok");
        }
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteTalent) return;
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${talent?.prenom} ${talent?.nom} ? Cette action est irréversible.`)) return;
    
    try {
      const res = await fetch(`/api/talents/${params.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/talents");
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  };

  const handleRefreshStats = async () => {
    if (!talent?.id || refreshingStats) return;
    setRefreshingStats(true);
    setRefreshFeedback(null);
    try {
      const res = await fetch(`/api/talents/${talent.id}/refresh-stats`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setRefreshFeedback({
          type: "error",
          message: data.error ?? "Erreur lors de la mise à jour des stats.",
        });
        return;
      }

      const ig = data.instagram as
        | { ok: boolean; after: number | null; error?: string }
        | undefined;
      const tt = data.tiktok as
        | { ok: boolean; after: number | null; error?: string }
        | undefined;

      const parts: string[] = [];
      if (ig?.ok && typeof ig.after === "number") {
        parts.push(`Instagram : ${ig.after.toLocaleString("fr-FR")} abonnés`);
      }
      if (tt?.ok && typeof tt.after === "number") {
        parts.push(`TikTok : ${tt.after.toLocaleString("fr-FR")} abonnés`);
      }

      if (parts.length === 0) {
        const reasons = [ig?.error, tt?.error].filter(Boolean).join(" — ");
        setRefreshFeedback({
          type: "error",
          message: reasons || "Aucune stat n'a pu être récupérée.",
        });
      } else {
        setRefreshFeedback({
          type: "success",
          message: `Stats mises à jour. ${parts.join(" · ")}`,
        });
        // Recharge la fiche pour afficher les nouvelles valeurs
        await fetchTalent();
      }
    } catch (e) {
      console.error("refresh stats error", e);
      setRefreshFeedback({
        type: "error",
        message: "Erreur réseau lors de la mise à jour.",
      });
    } finally {
      setRefreshingStats(false);
      setTimeout(() => setRefreshFeedback(null), 6000);
    }
  };

  const handleDemanderRevoirTarifs = async () => {
    if (role !== "ADMIN" || !talent?.id) return;
    setDemanderTarifsLoading(true);
    try {
      const res = await fetch(`/api/talents/${talent.id}/demander-revoir-tarifs`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(data.message ?? "Demande envoyée à Manon.");
      } else {
        alert(data.error ?? "Erreur lors de l'envoi de la demande.");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de l'envoi de la demande.");
    } finally {
      setDemanderTarifsLoading(false);
    }
  };

  // ========== EDIT BIO (présentation) ==========
  const handleStartEditBio = () => {
    setBioDraft(talent?.presentation ?? "");
    setBioError(null);
    setEditingBio(true);
  };

  const handleCancelEditBio = () => {
    setEditingBio(false);
    setBioDraft("");
    setBioError(null);
  };

  const handleSaveBio = async () => {
    if (!talent) return;
    setSavingBio(true);
    setBioError(null);
    try {
      const res = await fetch(`/api/talents/${talent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentation: bioDraft.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur lors de l'enregistrement");
      }
      setTalent({ ...talent, presentation: bioDraft.trim() || null });
      setEditingBio(false);
    } catch (e: any) {
      setBioError(e?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSavingBio(false);
    }
  };
  // ========== FIN EDIT BIO ==========

  // ========== EDIT PERFORMANCES STORIES (inline) ==========
  type StorySlot = "views30d" | "views7d" | "linkClicks30d";

  const handleStartEditStoryStats = () => {
    setStoryStatsDraft({
      storyViews30d: talent?.stats?.storyViews30d?.toString() ?? "",
      storyViews7d: talent?.stats?.storyViews7d?.toString() ?? "",
      storyLinkClicks30d: talent?.stats?.storyLinkClicks30d?.toString() ?? "",
    });
    setStoryStatsError(null);
    setEditingStoryStats(true);
  };

  const handleCancelEditStoryStats = () => {
    setEditingStoryStats(false);
    setStoryStatsError(null);
  };

  const handleSaveStoryStats = async () => {
    if (!talent) return;
    setSavingStoryStats(true);
    setStoryStatsError(null);
    try {
      const res = await fetch(`/api/talents/${talent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyViews30d: storyStatsDraft.storyViews30d,
          storyViews7d: storyStatsDraft.storyViews7d,
          storyLinkClicks30d: storyStatsDraft.storyLinkClicks30d,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur lors de l'enregistrement");
      }
      const updated = await res.json();
      setTalent((prev) =>
        prev ? { ...prev, stats: updated.stats ?? prev.stats } : prev
      );
      setEditingStoryStats(false);
    } catch (e: any) {
      setStoryStatsError(e?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSavingStoryStats(false);
    }
  };

  const updateStoryScreensInTalent = (data: {
    views30d?: unknown;
    views7d?: unknown;
    linkClicks30d?: unknown;
  }) => {
    const isStr = (u: unknown): u is string => typeof u === "string";
    const screenshots = {
      views30d: Array.isArray(data.views30d) ? data.views30d.filter(isStr) : [],
      views7d: Array.isArray(data.views7d) ? data.views7d.filter(isStr) : [],
      linkClicks30d: Array.isArray(data.linkClicks30d)
        ? data.linkClicks30d.filter(isStr)
        : [],
    };
    setTalent((prev) =>
      prev
        ? {
            ...prev,
            stats: prev.stats
              ? { ...prev.stats, storyScreenshots: screenshots }
              : ({ storyScreenshots: screenshots } as any),
          }
        : prev
    );
  };

  const handleStoryScreensUpload = async (
    slot: StorySlot,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!talent) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStoryScreensError(null);
    setStoryUploadingSlot(slot);
    try {
      const fd = new FormData();
      fd.append("slot", slot);
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/talents/${talent.id}/story-screenshots`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur lors de l'upload");
      }
      const data = await res.json();
      updateStoryScreensInTalent(data);
    } catch (error: any) {
      console.error("Erreur upload screenshot story:", error);
      setStoryScreensError(error?.message || "Erreur lors de l'upload");
    } finally {
      setStoryUploadingSlot(null);
      if (e.target) e.target.value = "";
    }
  };

  const handleStoryScreensRemove = async (slot: StorySlot, urlToRemove: string) => {
    if (!talent) return;
    if (!confirm("Supprimer ce screenshot ?")) return;
    const current = (() => {
      const raw = talent.stats?.storyScreenshots as any;
      if (Array.isArray(raw)) {
        return slot === "views30d" ? raw.filter((u: any) => typeof u === "string") : [];
      }
      if (raw && typeof raw === "object") {
        return Array.isArray(raw[slot])
          ? raw[slot].filter((u: any) => typeof u === "string")
          : [];
      }
      return [];
    })();
    const nextUrls = current.filter((u: string) => u !== urlToRemove);

    setStoryScreensError(null);
    try {
      const res = await fetch(`/api/talents/${talent.id}/story-screenshots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, urls: nextUrls }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur lors de la suppression");
      }
      const data = await res.json();
      updateStoryScreensInTalent(data);
    } catch (error: any) {
      console.error("Erreur suppression screenshot story:", error);
      setStoryScreensError(error?.message || "Erreur lors de la suppression");
    }
  };
  // ========== FIN EDIT PERFORMANCES STORIES ==========

  // ========== UPLOAD PHOTO (Direct Cloudinary) ==========
  const handlePhotoClick = () => {
    if (canUploadPhoto && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !talent) return;

    // Vérifier le type de fichier
    if (!file.type.startsWith("image/")) {
      setUploadError("Veuillez sélectionner une image");
      return;
    }

    // Pas de limite stricte - Cloudinary gère jusqu'à 100MB
    if (file.size > 100 * 1024 * 1024) {
      setUploadError("L'image ne doit pas dépasser 100MB");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      // 1. Récupérer la signature depuis notre API
      const signatureRes = await fetch("/api/upload/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId: talent.id }),
      });

      if (!signatureRes.ok) {
        throw new Error("Erreur de signature");
      }

      const { signature, timestamp, folder, publicId, cloudName, apiKey } = await signatureRes.json();

      // 2. Upload direct vers Cloudinary (bypass Vercel)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("signature", signature);
      formData.append("timestamp", timestamp.toString());
      formData.append("folder", folder);
      formData.append("public_id", publicId);
      formData.append("api_key", apiKey);

      const cloudinaryRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!cloudinaryRes.ok) {
        throw new Error("Erreur upload Cloudinary");
      }

      const cloudinaryData = await cloudinaryRes.json();
      const photoUrl = cloudinaryData.secure_url;

      // 3. Mettre à jour la DB avec la nouvelle URL
      const updateRes = await fetch("/api/upload/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId: talent.id, photoUrl }),
      });

      if (!updateRes.ok) {
        throw new Error("Erreur mise à jour DB");
      }

      setUploadSuccess(true);
      setTalent({ ...talent, photo: photoUrl });
      setTimeout(() => setUploadSuccess(false), 2000);

    } catch (error) {
      console.error("Erreur upload:", error);
      setUploadError("Erreur lors de l'upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  // ========== FIN UPLOAD PHOTO ==========

  const formatFollowers = (count: number | null) => {
    if (!count) return "0";
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  const formatMoney = (amount: number | null) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-glowup-rose to-pink-500 animate-pulse mx-auto" />
            <Loader2 className="w-10 h-10 animate-spin text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-gray-500 mt-4 font-medium">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (!talent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="w-24 h-24 rounded-3xl bg-gray-200 flex items-center justify-center mb-4">
          <Users className="w-12 h-12 text-gray-400" />
        </div>
        <p className="text-gray-500 text-lg">Talent non trouvé</p>
        <Link href="/talents" className="mt-4 text-glowup-rose hover:underline font-medium">
          ← Retour à la liste
        </Link>
      </div>
    );
  }

  const stats = talent.stats;
  const rawStoryScreens = stats?.storyScreenshots as any;
  let storyScreens30d: string[] = [];
  let storyScreens7d: string[] = [];
  let storyScreensClicks30d: string[] = [];

  if (Array.isArray(rawStoryScreens)) {
    // Ancien format: toutes les images dans un seul tableau → on les met en 30j
    storyScreens30d = rawStoryScreens.filter((u: any) => typeof u === "string");
  } else if (rawStoryScreens && typeof rawStoryScreens === "object") {
    storyScreens30d = (rawStoryScreens.views30d || []).filter((u: any) => typeof u === "string");
    storyScreens7d = (rawStoryScreens.views7d || []).filter((u: any) => typeof u === "string");
    storyScreensClicks30d = (rawStoryScreens.linkClicks30d || []).filter(
      (u: any) => typeof u === "string"
    );
  }
  const tarifs = talent.tarifs;
  const hasInstagram = talent.instagram && stats?.igFollowers;
  const hasTiktok = talent.tiktok && stats?.ttFollowers;
  const totalFollowers = (stats?.igFollowers || 0) + (stats?.ttFollowers || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* ============================================ */}
      {/* HERO SECTION */}
      {/* ============================================ */}
      <div className="relative overflow-hidden">
        {/* Background with animated gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-glowup-licorice via-gray-900 to-glowup-licorice">
          {/* Animated orbs */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-glowup-rose/30 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 animate-pulse" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-pink-500/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3" />
          <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Navigation */}
        <div className="relative z-20 flex items-center justify-between p-6 max-w-7xl mx-auto">
          <Link 
            href="/talents" 
            className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Retour</span>
          </Link>
          
          <div className="flex items-center gap-2">
            <Link
              href={`/kit/${talentSlug(talent.prenom, talent.nom)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105"
              title="Ouvrir le Kit Media public dans un nouvel onglet"
            >
              <Share2 className="w-5 h-5" />
            </Link>
            <Link
              href={`/tarifs/${talentSlug(talent.prenom, talent.nom)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105"
              title="Ouvrir la Grille Tarifaire publique dans un nouvel onglet"
            >
              <Euro className="w-5 h-5" />
            </Link>
            {canUploadPhoto && (
              <button
                type="button"
                onClick={() => setKitMediaOpen(true)}
                className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105"
                title="Kit Media — 10 photos"
              >
                <Camera className="w-5 h-5" />
              </button>
            )}
            {(canUpdateStats && (isMyTalent || role !== "TM")) && (
              <Link 
                href={`/talents/${talent.id}/stats`}
                className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105"
                title="Mettre à jour les stats"
              >
                <BarChart3 className="w-5 h-5" />
              </Link>
            )}
            {canEditTalent && (
              <Link 
                href={`/talents/${talent.id}/edit`}
                className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105"
                title="Modifier"
              >
                <Pencil className="w-5 h-5" />
              </Link>
            )}
            {role === "ADMIN" && (
              <button
                type="button"
                onClick={handleDemanderRevoirTarifs}
                disabled={demanderTarifsLoading}
                className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105 disabled:opacity-50"
                title="Demander à Manon de revoir les tarifs"
              >
                {demanderTarifsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            )}
            {canDeleteTalent && (
              <button 
                onClick={handleDelete}
                className="p-3 bg-red-500/20 backdrop-blur-md rounded-2xl text-red-300 hover:bg-red-500/40 transition-all hover:scale-105"
                title="Supprimer"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Toast feedback rafraîchissement stats */}
        {refreshFeedback && (
          <div className="relative z-10 max-w-7xl mx-auto px-6 mt-3">
            <div
              className={`text-sm rounded-2xl px-4 py-2.5 backdrop-blur-md ${
                refreshFeedback.type === "success"
                  ? "bg-emerald-500/15 text-emerald-100 border border-emerald-400/30"
                  : "bg-red-500/15 text-red-100 border border-red-400/30"
              }`}
            >
              {refreshFeedback.message}
            </div>
          </div>
        )}

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-32 pt-8">
          <div className="flex flex-col lg:flex-row items-center lg:items-end gap-8 lg:gap-12">
            {/* Photo avec Upload */}
            <div className="relative group">
              {/* Input file caché */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              
              <div className="absolute -inset-2 bg-gradient-to-br from-glowup-rose via-pink-500 to-purple-500 rounded-[2rem] opacity-75 blur-lg group-hover:opacity-100 transition-opacity" />
              <div 
                className={`relative w-48 h-48 lg:w-56 lg:h-56 rounded-[1.5rem] bg-gradient-to-br from-glowup-rose/20 to-purple-500/20 p-1 ${canUploadPhoto ? "cursor-pointer" : ""}`}
                onClick={handlePhotoClick}
              >
                <div className="w-full h-full rounded-[1.25rem] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden relative">
                  {talent.photo ? (
                    <img src={talent.photo} alt={talent.prenom} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-6xl lg:text-7xl font-bold bg-gradient-to-br from-glowup-rose to-pink-400 bg-clip-text text-transparent">
                      {talent.prenom.charAt(0)}{talent.nom.charAt(0)}
                    </span>
                  )}
                  
                  {/* Overlay upload au hover */}
                  {canUploadPhoto && !uploading && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[1.25rem]">
                      <div className="text-center text-white">
                        <Camera className="w-10 h-10 mx-auto mb-2" />
                        <p className="text-sm font-medium">Changer la photo</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Loading state */}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-[1.25rem]">
                      <div className="text-center text-white">
                        <Loader2 className="w-10 h-10 mx-auto mb-2 animate-spin" />
                        <p className="text-sm font-medium">Upload en cours...</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Success state */}
                  {uploadSuccess && (
                    <div className="absolute inset-0 bg-emerald-500/80 flex items-center justify-center rounded-[1.25rem]">
                      <div className="text-center text-white">
                        <Check className="w-10 h-10 mx-auto mb-2" />
                        <p className="text-sm font-medium">Photo mise à jour !</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Badge vérifié / Upload icon */}
              <div className={`absolute -bottom-2 -right-2 w-12 h-12 ${uploadSuccess ? "bg-emerald-500" : "bg-gradient-to-br from-glowup-rose to-pink-500"} rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/30 transition-colors`}>
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : uploadSuccess ? (
                  <Check className="w-6 h-6 text-white" />
                ) : canUploadPhoto ? (
                  <Camera className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
              
              {/* Error message */}
              {uploadError && (
                <div className="absolute -bottom-16 left-0 right-0 bg-red-500 text-white text-sm px-4 py-2 rounded-xl text-center">
                  {uploadError}
                  <button onClick={() => setUploadError(null)} className="ml-2">
                    <X className="w-4 h-4 inline" />
                  </button>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center lg:text-left">
              <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-4">
                {talent.niches.map((niche) => (
                  <span 
                    key={niche} 
                    className="px-4 py-1.5 bg-white/10 backdrop-blur-md text-white/90 text-sm font-medium rounded-full border border-white/10"
                  >
                    {niche}
                  </span>
                ))}
              </div>
              
              <h1 className="text-4xl lg:text-6xl font-bold text-white mb-3">
                {talent.prenom} {talent.nom}
              </h1>
              
              {(talent.ville || talent.pays) && (
                <p className="flex items-center justify-center lg:justify-start gap-2 text-white/60 text-lg mb-6">
                  <MapPin className="w-5 h-5" />
                  {talent.ville}{talent.ville && talent.pays && ", "}{talent.pays}
                </p>
              )}

              {/* Quick stats */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-6">
                {hasInstagram && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                      <Instagram className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-2xl font-bold text-white">{formatFollowers(stats?.igFollowers)}</p>
                      <p className="text-white/50 text-sm">Instagram</p>
                    </div>
                  </div>
                )}
                {hasTiktok && (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-700 to-black flex items-center justify-center">
                      <Music2 className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-2xl font-bold text-white">{formatFollowers(stats?.ttFollowers)}</p>
                      <p className="text-white/50 text-sm">TikTok</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-2xl font-bold text-white">{talent._count?.collaborations || 0}</p>
                    <p className="text-white/50 text-sm">Collabs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Commission badges */}
            <div className="flex flex-col gap-3">
              <div className="px-5 py-3 bg-blue-500/20 backdrop-blur-md rounded-2xl border border-blue-400/20">
                <p className="text-blue-300 text-xs font-medium uppercase tracking-wider">Inbound</p>
                <p className="text-2xl font-bold text-white">{talent.commissionInbound}%</p>
              </div>
              <div className="px-5 py-3 bg-emerald-500/20 backdrop-blur-md rounded-2xl border border-emerald-400/20">
                <p className="text-emerald-300 text-xs font-medium uppercase tracking-wider">Outbound</p>
                <p className="text-2xl font-bold text-white">{talent.commissionOutbound}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path 
              d="M0 120L48 110C96 100 192 80 288 70C384 60 480 60 576 65C672 70 768 80 864 85C960 90 1056 90 1152 85C1248 80 1344 70 1392 65L1440 60V120H1392C1344 120 1248 120 1152 120C1056 120 960 120 864 120C768 120 672 120 576 120C480 120 384 120 288 120C192 120 96 120 48 120H0Z" 
              className="fill-gray-50"
            />
          </svg>
        </div>
      </div>

      {/* ============================================ */}
      {/* CONTENT */}
      {/* ============================================ */}
      <div className="max-w-7xl mx-auto px-6 -mt-16 relative z-20 pb-12 space-y-8">
        
        {/* Alerte stats périmées */}
        {role === "TM" && isMyTalent && stats?.lastUpdate && (
          (() => {
            const daysSinceUpdate = Math.floor((Date.now() - new Date(stats.lastUpdate).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceUpdate > 30) {
              return (
                <div className="relative overflow-hidden bg-gradient-to-r from-red-500 to-rose-600 rounded-3xl p-6 text-white shadow-2xl shadow-red-500/20">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                  <div className="relative flex items-center gap-4">
                    <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                      <BarChart3 className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-xl">⚠️ Stats à mettre à jour</p>
                      <p className="text-white/80">Dernière mise à jour il y a {daysSinceUpdate} jours</p>
                    </div>
                    <Link 
                      href={`/talents/${talent.id}/stats`}
                      className="px-6 py-3 bg-white text-red-600 rounded-2xl font-bold hover:bg-white/90 transition-all hover:scale-105 shadow-lg"
                    >
                      Mettre à jour
                    </Link>
                  </div>
                </div>
              );
            }
            return null;
          })()
        )}

        {/* Présentation */}
        {(talent.presentation || canEditBio) && (
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-glowup-rose/10 rounded-xl">
                  <Sparkles className="w-5 h-5 text-glowup-rose" />
                </div>
                <h2 className="text-lg font-bold text-glowup-licorice">À propos</h2>
              </div>
              {canEditBio && !editingBio && (
                <button
                  type="button"
                  onClick={handleStartEditBio}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-glowup-rose hover:bg-glowup-rose/10 rounded-xl transition-colors"
                  title="Modifier la bio"
                >
                  <Pencil className="w-4 h-4" />
                  {talent.presentation ? "Modifier" : "Ajouter"}
                </button>
              )}
            </div>

            {editingBio ? (
              <div className="space-y-3">
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Joviale et pleine d'entrain, elle partage quotidiennement ses looks à sa communauté..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20 transition-all resize-none text-gray-700 leading-relaxed"
                  autoFocus
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-400">
                    {bioDraft.length}/2000 caractères
                  </p>
                  <div className="flex items-center gap-2">
                    {bioError && (
                      <span className="text-xs text-red-600 mr-2">{bioError}</span>
                    )}
                    <button
                      type="button"
                      onClick={handleCancelEditBio}
                      disabled={savingBio}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBio}
                      disabled={savingBio}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-glowup-rose text-white text-sm font-medium rounded-xl hover:bg-glowup-rose-dark transition-colors shadow-sm shadow-glowup-rose/25 disabled:opacity-50"
                    >
                      {savingBio ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>
            ) : talent.presentation ? (
              <p className="text-gray-600 leading-relaxed text-lg whitespace-pre-wrap">{talent.presentation}</p>
            ) : (
              <p className="text-gray-400 italic">Aucune présentation pour l'instant. Cliquez sur « Ajouter » pour en rédiger une.</p>
            )}
          </div>
        )}

        {/* Selected Clients */}
        {talent.selectedClients.length > 0 && (
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Crown className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-glowup-licorice">Selected Clients</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {talent.selectedClients.map((client, i) => (
                <span 
                  key={i} 
                  className="px-5 py-2.5 bg-gradient-to-br from-gray-50 to-gray-100 text-glowup-licorice font-semibold rounded-2xl border border-gray-200 hover:border-glowup-rose/30 hover:shadow-lg transition-all cursor-default"
                >
                  {client}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stats Section */}
        {(hasInstagram || hasTiktok) && (
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 overflow-hidden border border-gray-100">
            {/* Tab Header */}
            <div className="flex border-b border-gray-100">
              {hasInstagram && (
                <button
                  onClick={() => setActiveTab("instagram")}
                  className={`flex-1 flex items-center justify-center gap-3 py-5 font-semibold transition-all ${
                    activeTab === "instagram"
                      ? "text-pink-500 bg-gradient-to-b from-pink-50 to-transparent border-b-4 border-pink-500"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Instagram className="w-6 h-6" />
                  <span>Instagram</span>
                  {stats?.igFollowers && (
                    <span className={`px-3 py-1 rounded-full text-sm ${activeTab === "instagram" ? "bg-pink-100 text-pink-600" : "bg-gray-100 text-gray-500"}`}>
                      {formatFollowers(stats.igFollowers)}
                    </span>
                  )}
                </button>
              )}
              {hasTiktok && (
                <button
                  onClick={() => setActiveTab("tiktok")}
                  className={`flex-1 flex items-center justify-center gap-3 py-5 font-semibold transition-all ${
                    activeTab === "tiktok"
                      ? "text-gray-900 bg-gradient-to-b from-gray-100 to-transparent border-b-4 border-gray-900"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Music2 className="w-6 h-6" />
                  <span>TikTok</span>
                  {stats?.ttFollowers && (
                    <span className={`px-3 py-1 rounded-full text-sm ${activeTab === "tiktok" ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-500"}`}>
                      {formatFollowers(stats.ttFollowers)}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="p-8">
              {activeTab === "instagram" && hasInstagram && (
                <div className="space-y-8">
                  {/* Main Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard 
                      label="Communauté" 
                      value={formatFollowers(stats?.igFollowers)} 
                      evolution={stats?.igFollowersEvol}
                      gradient="from-pink-500 to-rose-500"
                      icon={<Users className="w-6 h-6" />}
                      onRefresh={
                        canUpdateStats && talent.instagram
                          ? handleRefreshStats
                          : undefined
                      }
                      refreshing={refreshingStats}
                      refreshTitle="Mettre à jour automatiquement les abonnés Instagram"
                    />
                    <StatCard 
                      label="Engagement" 
                      value={stats?.igEngagement != null ? `${formatPercent(stats.igEngagement, 2)}%` : "—"} 
                      evolution={stats?.igEngagementEvol}
                      evolutionSuffix=" pts"
                      gradient="from-purple-500 to-indigo-500"
                      icon={<Heart className="w-6 h-6" />}
                    />
                    <StatCard 
                      label="Audience FR" 
                      value={stats?.igLocFrance != null ? `${formatPercent(stats.igLocFrance, 1)}%` : "—"} 
                      gradient="from-blue-500 to-cyan-500"
                      icon={<Globe className="w-6 h-6" />}
                    />
                    <StatCard 
                      label="Collaborations" 
                      value={(talent._count?.collaborations || 0).toString()} 
                      gradient="from-emerald-500 to-teal-500"
                      icon={<Star className="w-6 h-6" />}
                    />
                  </div>

                  {/* Demographics */}
                  <div className="grid lg:grid-cols-2 gap-8">
                    {/* Gender */}
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 border border-gray-100">
                      <h3 className="font-bold text-glowup-licorice mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-gray-400" />
                        Répartition par genre
                      </h3>
                      <div className="space-y-5">
                        <GenderBar label="Femmes" value={stats?.igGenreFemme || 0} color="from-pink-400 to-pink-500" emoji="👩" />
                        <GenderBar label="Hommes" value={stats?.igGenreHomme || 0} color="from-blue-400 to-blue-500" emoji="👨" />
                      </div>
                    </div>

                    {/* Age */}
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 border border-gray-100">
                      <h3 className="font-bold text-glowup-licorice mb-6 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        Tranches d'âge
                      </h3>
                      <div className="space-y-3">
                        {[
                          { label: "13-17 ans", value: stats?.igAge13_17 || 0 },
                          { label: "18-24 ans", value: stats?.igAge18_24 || 0 },
                          { label: "25-34 ans", value: stats?.igAge25_34 || 0 },
                          { label: "35-44 ans", value: stats?.igAge35_44 || 0 },
                          { label: "45+ ans", value: stats?.igAge45Plus || 0 },
                        ].map((age) => (
                          <AgeBar key={age.label} label={age.label} value={age.value} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Social Link */}
                  {talent.instagram && (
                    <a
                      href={getInstagramProfileUrl(talent.instagram) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-2xl hover:shadow-lg hover:shadow-pink-500/30 transition-all hover:scale-105"
                    >
                      <Instagram className="w-5 h-5" />
                      @{normalizeInstagramHandle(talent.instagram)}
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}

              {activeTab === "tiktok" && hasTiktok && (
                <div className="space-y-8">
                  {/* Main Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard 
                      label="Communauté" 
                      value={formatFollowers(stats?.ttFollowers)} 
                      evolution={stats?.ttFollowersEvol}
                      gradient="from-gray-700 to-gray-900"
                      icon={<Users className="w-6 h-6" />}
                      onRefresh={
                        canUpdateStats && talent.tiktok
                          ? handleRefreshStats
                          : undefined
                      }
                      refreshing={refreshingStats}
                      refreshTitle="Mettre à jour automatiquement les abonnés TikTok"
                    />
                    <StatCard 
                      label="Engagement" 
                      value={stats?.ttEngagement != null ? `${formatPercent(stats.ttEngagement, 2)}%` : "—"} 
                      evolution={stats?.ttEngagementEvol}
                      evolutionSuffix=" pts"
                      gradient="from-cyan-500 to-blue-500"
                      icon={<Heart className="w-6 h-6" />}
                    />
                    <StatCard 
                      label="Audience FR" 
                      value={stats?.ttLocFrance != null ? `${formatPercent(stats.ttLocFrance, 1)}%` : "—"} 
                      gradient="from-teal-500 to-emerald-500"
                      icon={<Globe className="w-6 h-6" />}
                    />
                    <StatCard 
                      label="Collaborations" 
                      value={(talent._count?.collaborations || 0).toString()} 
                      gradient="from-orange-500 to-amber-500"
                      icon={<Star className="w-6 h-6" />}
                    />
                  </div>

                  {/* Demographics */}
                  <div className="grid lg:grid-cols-2 gap-8">
                    {/* Gender */}
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 border border-gray-100">
                      <h3 className="font-bold text-glowup-licorice mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-gray-400" />
                        Répartition par genre
                      </h3>
                      <div className="space-y-5">
                        <GenderBar label="Femmes" value={stats?.ttGenreFemme || 0} color="from-pink-400 to-pink-500" emoji="👩" />
                        <GenderBar label="Hommes" value={stats?.ttGenreHomme || 0} color="from-blue-400 to-blue-500" emoji="👨" />
                      </div>
                    </div>

                    {/* Age */}
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 border border-gray-100">
                      <h3 className="font-bold text-glowup-licorice mb-6 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        Tranches d'âge
                      </h3>
                      <div className="space-y-3">
                        {[
                          { label: "13-17 ans", value: stats?.ttAge13_17 || 0 },
                          { label: "18-24 ans", value: stats?.ttAge18_24 || 0 },
                          { label: "25-34 ans", value: stats?.ttAge25_34 || 0 },
                          { label: "35-44 ans", value: stats?.ttAge35_44 || 0 },
                          { label: "45+ ans", value: stats?.ttAge45Plus || 0 },
                        ].map((age) => (
                          <AgeBar key={age.label} label={age.label} value={age.value} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Social Link */}
                  {talent.tiktok && (
                    <a
                      href={`https://tiktok.com/@${talent.tiktok}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-gray-800 to-black text-white font-semibold rounded-2xl hover:shadow-lg hover:shadow-gray-500/30 transition-all hover:scale-105"
                    >
                      <Music2 className="w-5 h-5" />
                      @{talent.tiktok}
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tarifs Section */}
        {tarifs && (
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl">
                <Euro className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-glowup-licorice">Grille tarifaire</h2>
                <p className="text-gray-500 text-sm">Tarifs indicatifs, négociables selon le projet</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Instagram Tarifs */}
              {hasInstagram && (
                <>
                  {tarifs.tarifStory && (
                    <TarifCard icon={<Camera />} label="Story Instagram" price={tarifs.tarifStory} color="pink" />
                  )}
                  {tarifs.tarifPost && (
                    <TarifCard icon={<Camera />} label="Post Instagram" price={tarifs.tarifPost} color="pink" />
                  )}
                  {tarifs.tarifReel && (
                    <TarifCard icon={<Play />} label="Reel Instagram" price={tarifs.tarifReel} color="purple" />
                  )}
                  {tarifs.tarifStoryConcours && (
                    <TarifCard icon={<Star />} label="Story Concours" price={tarifs.tarifStoryConcours} color="amber" />
                  )}
                  {tarifs.tarifPostConcours && (
                    <TarifCard icon={<Star />} label="Post Concours" price={tarifs.tarifPostConcours} color="amber" />
                  )}
                </>
              )}

              {/* TikTok Tarifs */}
              {hasTiktok && tarifs.tarifTiktokVideo && (
                <TarifCard icon={<Music2 />} label="Vidéo TikTok" price={tarifs.tarifTiktokVideo} color="gray" />
              )}
              {hasTiktok && tarifs.tarifTiktokConcours && (
                <TarifCard icon={<Music2 />} label="TikTok Jeu Concours" price={tarifs.tarifTiktokConcours} color="gray" />
              )}

              {/* Tarifs internes (non affichés sur le book) */}
              {(tarifs.tarifPostCrosspost || tarifs.tarifReelCrosspost || tarifs.tarifReelConcours || tarifs.tarifSnapchatStory || tarifs.tarifSnapchatSpotlight) && (
                <>
                  {tarifs.tarifPostCrosspost && <TarifCard icon={<Camera />} label="IG Post Crosspost" price={tarifs.tarifPostCrosspost} color="slate" />}
                  {tarifs.tarifReelCrosspost && <TarifCard icon={<Play />} label="IG Réel Crosspost" price={tarifs.tarifReelCrosspost} color="slate" />}
                  {tarifs.tarifReelConcours && <TarifCard icon={<Star />} label="IG Réel Jeu Concours" price={tarifs.tarifReelConcours} color="slate" />}
                  {tarifs.tarifSnapchatStory && <TarifCard icon={<Camera />} label="Snapchat Story" price={tarifs.tarifSnapchatStory} color="slate" />}
                  {tarifs.tarifSnapchatSpotlight && <TarifCard icon={<Play />} label="Snapchat Spotlight" price={tarifs.tarifSnapchatSpotlight} color="slate" />}
                </>
              )}

              {/* Other Tarifs */}
              {tarifs.tarifEvent && (
                <TarifCard icon={<Calendar />} label="Event / Apparition" price={tarifs.tarifEvent} color="blue" />
              )}
              {tarifs.tarifShooting && (
                <TarifCard icon={<Camera />} label="Shooting photo" price={tarifs.tarifShooting} color="teal" />
              )}
              {tarifs.tarifAmbassadeur && (
                <TarifCard icon={<Crown />} label="Ambassadeur" price={tarifs.tarifAmbassadeur} color="amber" highlight />
              )}
            </div>
          </div>
        )}

        {/* Contact & Manager Section */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Contact */}
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-xl">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-glowup-licorice">Contact</h2>
            </div>
            <div className="space-y-4">
              <a 
                href={`mailto:${talent.email}`}
                className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group"
              >
                <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-shadow">
                  <Mail className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium text-glowup-licorice">{talent.email}</p>
                </div>
              </a>
              {talent.telephone && (
                <a 
                  href={`tel:${talent.telephone}`}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group"
                >
                  <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-shadow">
                    <Phone className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Téléphone</p>
                    <p className="font-medium text-glowup-licorice">{talent.telephone}</p>
                  </div>
                </a>
              )}
            </div>
          </div>

        {/* Stories (interne) + Manager & Info */}
        <div className="space-y-6">
          {/* Stories – bloc interne TM (éditable inline) */}
          {(canEditBio ||
            stats?.storyViews30d ||
            stats?.storyViews7d ||
            stats?.storyLinkClicks30d ||
            storyScreens30d.length > 0 ||
            storyScreens7d.length > 0 ||
            storyScreensClicks30d.length > 0) && (
            <div className="bg-gradient-to-br from-amber-50 via-white to-amber-50 rounded-3xl shadow-xl shadow-amber-100/80 p-8 border border-amber-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-xl">
                  <BarChart3 className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-glowup-licorice">Performances Stories (interne)</h2>
                  <p className="text-sm text-gray-500">
                    Vues max stories (30j / 7j) + clics lien (30j) avec screenshots à l’appui.
                  </p>
                </div>
                {canEditBio && !editingStoryStats && (
                  <button
                    type="button"
                    onClick={handleStartEditStoryStats}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-xl transition-colors"
                    title="Modifier les vues stories et les clics lien"
                  >
                    <Pencil className="w-4 h-4" />
                    Modifier
                  </button>
                )}
              </div>

              {/* Cartes vues / clics */}
              {editingStoryStats ? (
                <div className="space-y-3 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white/80 rounded-2xl p-4 border border-amber-200 shadow-sm">
                      <label className="block text-xs text-amber-700 mb-1">
                        Vues max stories (30j)
                      </label>
                      <input
                        type="number"
                        value={storyStatsDraft.storyViews30d}
                        onChange={(e) =>
                          setStoryStatsDraft((prev) => ({
                            ...prev,
                            storyViews30d: e.target.value,
                          }))
                        }
                        placeholder="12500"
                        className="w-full bg-transparent text-xl font-bold text-amber-900 focus:outline-none"
                      />
                    </div>
                    <div className="bg-white/80 rounded-2xl p-4 border border-amber-200 shadow-sm">
                      <label className="block text-xs text-amber-700 mb-1">
                        Vues max stories (7j)
                      </label>
                      <input
                        type="number"
                        value={storyStatsDraft.storyViews7d}
                        onChange={(e) =>
                          setStoryStatsDraft((prev) => ({
                            ...prev,
                            storyViews7d: e.target.value,
                          }))
                        }
                        placeholder="6200"
                        className="w-full bg-transparent text-xl font-bold text-amber-900 focus:outline-none"
                      />
                    </div>
                    <div className="bg-white/80 rounded-2xl p-4 border border-amber-200 shadow-sm">
                      <label className="block text-xs text-amber-700 mb-1">
                        Clics sur lien max (30j)
                      </label>
                      <input
                        type="number"
                        value={storyStatsDraft.storyLinkClicks30d}
                        onChange={(e) =>
                          setStoryStatsDraft((prev) => ({
                            ...prev,
                            storyLinkClicks30d: e.target.value,
                          }))
                        }
                        placeholder="850"
                        className="w-full bg-transparent text-xl font-bold text-amber-900 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {storyStatsError && (
                      <span className="text-xs text-red-600 mr-2">
                        {storyStatsError}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleCancelEditStoryStats}
                      disabled={savingStoryStats}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveStoryStats}
                      disabled={savingStoryStats}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 transition-colors shadow-sm shadow-amber-600/25 disabled:opacity-50"
                    >
                      {savingStoryStats ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/80 rounded-2xl p-4 text-center border border-amber-100 shadow-sm">
                    <p className="text-xs text-amber-700 mb-1">Vues max stories (30j)</p>
                    <p className="text-xl font-bold text-amber-900">
                      {stats?.storyViews30d != null ? stats.storyViews30d.toLocaleString("fr-FR") : "-"}
                    </p>
                  </div>
                  <div className="bg-white/80 rounded-2xl p-4 text-center border border-amber-100 shadow-sm">
                    <p className="text-xs text-amber-700 mb-1">Vues max stories (7j)</p>
                    <p className="text-xl font-bold text-amber-900">
                      {stats?.storyViews7d != null ? stats.storyViews7d.toLocaleString("fr-FR") : "-"}
                    </p>
                  </div>
                  <div className="bg-white/80 rounded-2xl p-4 text-center border border-amber-100 shadow-sm">
                    <p className="text-xs text-amber-700 mb-1">Clics sur lien max (30j)</p>
                    <p className="text-xl font-bold text-amber-900">
                      {stats?.storyLinkClicks30d != null ? stats.storyLinkClicks30d.toLocaleString("fr-FR") : "-"}
                    </p>
                  </div>
                </div>
              )}

              {/* Screenshots — toujours affichés, et avec corbeille + bouton + pour les utilisateurs autorisés */}
              {(canEditBio ||
                storyScreens30d.length > 0 ||
                storyScreens7d.length > 0 ||
                storyScreensClicks30d.length > 0) && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-amber-900 tracking-wide uppercase">
                      Screenshots (internes)
                    </p>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-[11px] text-amber-700">
                        Cliquez sur une vignette pour ouvrir le screen en grand.
                      </p>
                      {canEditBio && (
                        <p className="text-[11px] text-amber-700">
                          Survol → corbeille pour supprimer · « + Ajouter » pour uploader.
                        </p>
                      )}
                    </div>
                  </div>

                  {storyScreensError && (
                    <p className="text-xs text-red-600">{storyScreensError}</p>
                  )}

                  {(
                    [
                      { slot: "views30d" as StorySlot, label: "Stories – 30 derniers jours", urls: storyScreens30d, dl: "stories-30j" },
                      { slot: "views7d" as StorySlot, label: "Stories – 7 derniers jours", urls: storyScreens7d, dl: "stories-7j" },
                      { slot: "linkClicks30d" as StorySlot, label: "Clics sur lien – 30 derniers jours", urls: storyScreensClicks30d, dl: "clics-lien-30j" },
                    ] satisfies { slot: StorySlot; label: string; urls: string[]; dl: string }[]
                  ).map(({ slot, label, urls, dl }) => {
                    if (!canEditBio && urls.length === 0) return null;
                    const inputId = `story-upload-${slot}`;
                    const isUploadingThis = storyUploadingSlot === slot;
                    return (
                      <div key={slot} className="space-y-2">
                        <p className="text-[11px] text-amber-700 mb-1">{label}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {urls.map((url, idx) => (
                            <div key={`${slot}-${idx}`} className="space-y-1">
                              <div className="group relative block w-full max-w-[150px] pb-[177%] mx-auto rounded-[1.5rem] overflow-hidden border border-amber-100 bg-black shadow-sm hover:shadow-md transition-shadow">
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="absolute inset-0"
                                >
                                  <img
                                    src={url}
                                    alt={`${label} ${idx + 1}`}
                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white flex items-center justify-between">
                                      <span>Voir le screen</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </div>
                                  </div>
                                </a>
                                {canEditBio && (
                                  <button
                                    type="button"
                                    onClick={() => handleStoryScreensRemove(slot, url)}
                                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                    title="Supprimer ce screenshot"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <a
                                href={url}
                                download={`${dl}-${idx + 1}.jpg`}
                                className="inline-flex items-center justify-center px-2 py-1 rounded-full border border-amber-200 bg-white text-[10px] font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                              >
                                Télécharger
                              </a>
                            </div>
                          ))}

                          {canEditBio && (
                            <div className="space-y-1">
                              <label
                                htmlFor={inputId}
                                className={`relative block w-full max-w-[150px] pb-[177%] mx-auto rounded-[1.5rem] overflow-hidden border-2 border-dashed border-amber-300 bg-white/60 hover:border-amber-500 hover:bg-amber-50 transition-colors ${
                                  isUploadingThis ? "opacity-50 cursor-wait" : "cursor-pointer"
                                }`}
                              >
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-700">
                                  {isUploadingThis ? (
                                    <>
                                      <Loader2 className="w-6 h-6 animate-spin mb-1" />
                                      <span className="text-[11px] font-medium">Upload...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-6 h-6 mb-1" />
                                      <span className="text-[11px] font-medium">+ Ajouter</span>
                                      <span className="text-[10px] text-amber-600 mt-0.5">
                                        Multi-sélection OK
                                      </span>
                                    </>
                                  )}
                                </div>
                                <input
                                  id={inputId}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => handleStoryScreensUpload(slot, e)}
                                  disabled={storyUploadingSlot !== null}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Manager & Info */}
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-glowup-rose/10 rounded-xl">
                <Users className="w-5 h-5 text-glowup-rose" />
              </div>
              <h2 className="text-lg font-bold text-glowup-licorice">Talent Manager</h2>
            </div>
            {talent.manager ? (
              <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-glowup-rose/5 to-pink-50 rounded-2xl border border-glowup-rose/10 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-glowup-rose to-pink-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-pink-200">
                  {talent.manager.prenom.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-glowup-licorice text-lg">{talent.manager.prenom} {talent.manager.nom}</p>
                  <p className="text-gray-500">{talent.manager.email}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 rounded-2xl text-center text-gray-500 mb-6">
                <p>Aucun manager assigné</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-2xl text-center">
                <p className="text-sm text-gray-500 mb-1">Arrivée</p>
                <p className="font-bold text-glowup-licorice">{new Date(talent.dateArrivee).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-2xl text-center">
                <p className="text-sm text-gray-500 mb-1">MAJ Stats</p>
                <p className="font-bold text-glowup-licorice">
                  {stats?.lastUpdate ? new Date(stats.lastUpdate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Contrats en signature électronique (DocuSeal) */}
        {["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"].includes(role) && (
          <ContratsTalentBloc talentId={talent.id} />
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          {role === "TM" ? (
            <>
              <button
                type="button"
                disabled
                className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl border border-gray-200 bg-gray-50 text-gray-400 font-bold cursor-not-allowed"
              >
                <Heart className="w-6 h-6" />
                Nouvelle collaboration
              </button>
              <button
                type="button"
                disabled
                className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl border border-gray-200 bg-gray-50 text-gray-400 font-bold cursor-not-allowed"
              >
                <Zap className="w-6 h-6" />
                Nouvelle négociation
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/collaborations/new?talent=${talent.id}`}
                className="flex-1 flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-glowup-licorice to-gray-800 text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-gray-300/50 transition-all hover:scale-[1.02]"
              >
                <Heart className="w-6 h-6" />
                Nouvelle collaboration
              </Link>
              <Link
                href={`/negociations/new?talent=${talent.id}`}
                className="flex-1 flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-glowup-rose to-pink-500 text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-pink-300/50 transition-all hover:scale-[1.02]"
              >
                <Zap className="w-6 h-6" />
                Nouvelle négociation
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Modale Kit Media — ouverte depuis le bouton appareil photo du header */}
      {kitMediaOpen && (
        <KitMediaModal
          talentId={talent.id}
          slug={talentSlug(talent.prenom, talent.nom)}
          onClose={() => setKitMediaOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================
// MODALE KIT MEDIA
// ============================================
function KitMediaModal({
  talentId,
  slug,
  onClose,
}: {
  talentId: string;
  slug: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/kit/${slug}` : "";

  // Fermeture sur Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-50 w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: "calc(100vh - 24px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (sticky en haut grâce au flex column) */}
        <div className="bg-gradient-to-br from-[#220101] to-[#5C2A30] rounded-t-3xl px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/60 mb-1">
              Kit Media public
            </p>
            <p className="text-xs sm:text-sm text-white font-medium truncate">
              {url || `glowupagence.fr/kit/${slug}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!url) return;
                navigator.clipboard?.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium transition-colors"
            >
              {copied ? "✓ Copié" : "Copier"}
            </button>
            <Link
              href={`/kit/${slug}`}
              target="_blank"
              className="px-3 py-1.5 rounded-full bg-white text-[#220101] hover:bg-white/90 text-xs sm:text-sm font-medium transition-colors inline-flex items-center gap-1.5"
            >
              Voir
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-white/80 hover:bg-white/10 transition-colors"
              title="Fermer (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body — scroll interne */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          <KitPhotosManager talentId={talentId} />
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENTS
// ============================================

function StatCard(
  {
    label,
    value,
    evolution,
    evolutionSuffix = "%", 
    gradient,
    icon,
    onRefresh,
    refreshing,
    refreshTitle,
  }: {
    label: string;
    value: string;
    evolution?: number | null;
    evolutionSuffix?: string;
    gradient: string;
    icon: React.ReactNode;
    onRefresh?: () => void;
    refreshing?: boolean;
    refreshTitle?: string;
  }
) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-lg`}>
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 bg-white/20 rounded-xl">{icon}</div>
          <div className="flex items-center gap-2">
            {evolution !== undefined && evolution !== null && (
              <span className={`flex items-center gap-1 text-sm font-medium ${evolution >= 0 ? "text-emerald-200" : "text-red-200"}`}>
                {evolution >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {evolution >= 0 ? "+" : ""}{evolution}{evolutionSuffix}
              </span>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                title={refreshTitle ?? "Mettre à jour automatiquement"}
                className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
        <p className="text-3xl font-bold">{value}</p>
        <p className="text-white/70 text-sm mt-1">{label}</p>
      </div>
    </div>
  );
}

function GenderBar(
  {
    label,
    value,
    color,
    emoji,
  }: {
    label: string;
    value: number;
    color: string;
    emoji: string;
  }
) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-gray-600 font-medium flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          {label}
        </span>
        <span className="font-bold text-glowup-licorice text-lg">{formatPercent(value, 1)}%</span>
      </div>
      <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function AgeBar(
  {
    label,
    value,
  }: {
    label: string;
    value: number;
  }
) {
  const maxValue = 60; // Pour une meilleure visualisation
  const width = Math.min((value / maxValue) * 100, 100);
  
  return (
    <div className="flex items-center gap-4">
      <span className="text-gray-500 text-sm w-20">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-glowup-rose to-pink-400 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="font-bold text-glowup-licorice w-12 text-right">{formatPercent(value, 1)}%</span>
    </div>
  );
}

function TarifCard(
  {
    icon,
    label,
    price,
    color,
    highlight = false,
  }: {
    icon: React.ReactNode;
    label: string;
    price: number;
    color: string;
    highlight?: boolean;
  }
) {
  const colorClasses: Record<string, { bg: string; text: string; icon: string }> = {
    pink: { bg: "bg-pink-50", text: "text-pink-600", icon: "bg-pink-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", icon: "bg-purple-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", icon: "bg-amber-100" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", icon: "bg-blue-100" },
    teal: { bg: "bg-teal-50", text: "text-teal-600", icon: "bg-teal-100" },
    gray: { bg: "bg-gray-50", text: "text-gray-700", icon: "bg-gray-200" },
  };
  
  const c = colorClasses[color] || colorClasses.gray;

  return (
    <div className={`relative overflow-hidden ${c.bg} rounded-2xl p-5 border-2 ${highlight ? "border-amber-300 shadow-lg shadow-amber-100" : "border-transparent"} hover:shadow-lg transition-all hover:scale-[1.02] cursor-default`}>
      {highlight && (
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold rounded-lg">
            Premium
          </span>
        </div>
      )}
      <div className={`w-10 h-10 ${c.icon} rounded-xl flex items-center justify-center ${c.text} mb-3`}>
        {icon}
      </div>
      <p className="text-gray-600 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${c.text}`}>
        {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(price)}
      </p>
    </div>
  );
}