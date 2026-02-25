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
  Download,
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
} from "lucide-react";
import { formatPercent } from "@/lib/format";

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
    tarifReel: number | null;
    tarifTiktokVideo: number | null;
    tarifYoutubeVideo: number | null;
    tarifYoutubeShort: number | null;
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
  
  // Upload photo state
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const user = session?.user as { id: string; role: string } | undefined;
  const role = user?.role || "";
  const userId = user?.id || "";

  const canEditTalent = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canDeleteTalent = role === "ADMIN";
  const canUpdateStats = role === "TM" || role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE";
  const canUploadPhoto = role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_INFLUENCE" || role === "TM";
  const isMyTalent = talent?.managerId === userId;

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
            <button className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105" title="Partager">
              <Share2 className="w-5 h-5" />
            </button>
            <button className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white/90 hover:bg-white/20 transition-all hover:scale-105" title="Télécharger Media Kit">
              <Download className="w-5 h-5" />
            </button>
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
        {talent.presentation && (
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-glowup-rose/10 rounded-xl">
                <Sparkles className="w-5 h-5 text-glowup-rose" />
              </div>
              <h2 className="text-lg font-bold text-glowup-licorice">À propos</h2>
            </div>
            <p className="text-gray-600 leading-relaxed text-lg">{talent.presentation}</p>
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
                      href={`https://instagram.com/${talent.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-2xl hover:shadow-lg hover:shadow-pink-500/30 transition-all hover:scale-105"
                    >
                      <Instagram className="w-5 h-5" />
                      @{talent.instagram}
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
          {/* Stories – bloc interne TM */}
          {(stats?.storyViews30d ||
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
                <div>
                  <h2 className="text-lg font-bold text-glowup-licorice">Performances Stories (interne)</h2>
                  <p className="text-sm text-gray-500">
                    Vues max stories (30j / 7j) + clics lien (30j) avec screenshots à l’appui.
                  </p>
                </div>
              </div>

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

              {(storyScreens30d.length > 0 ||
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
                      <p className="text-[11px] text-amber-700">
                        Ou utilisez le bouton « Télécharger » sous chaque screen.
                      </p>
                    </div>
                  </div>
                  {storyScreens30d.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-700 mb-1">Stories – 30 derniers jours</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {storyScreens30d.map((url, idx) => (
                          <div key={`30d-${idx}`} className="space-y-1">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative block w-full max-w-[150px] pb-[177%] mx-auto rounded-[1.5rem] overflow-hidden border border-amber-100 bg-black shadow-sm hover:shadow-md transition-shadow"
                            >
                              <img
                                src={url}
                                alt={`Stories 30j screenshot ${idx + 1}`}
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white flex items-center justify-between">
                                  <span>Voir le screen</span>
                                  <ExternalLink className="w-3 h-3" />
                                </div>
                              </div>
                            </a>
                            <a
                              href={url}
                              download={`stories-30j-${idx + 1}.jpg`}
                              className="inline-flex items-center justify-center px-2 py-1 rounded-full border border-amber-200 bg-white text-[10px] font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                            >
                              Télécharger
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {storyScreens7d.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-700 mb-1">Stories – 7 derniers jours</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {storyScreens7d.map((url, idx) => (
                          <div key={`7d-${idx}`} className="space-y-1">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative block w-full max-w-[150px] pb-[177%] mx-auto rounded-[1.5rem] overflow-hidden border border-amber-100 bg-black shadow-sm hover:shadow-md transition-shadow"
                            >
                              <img
                                src={url}
                                alt={`Stories 7j screenshot ${idx + 1}`}
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white flex items-center justify-between">
                                  <span>Voir le screen</span>
                                  <ExternalLink className="w-3 h-3" />
                                </div>
                              </div>
                            </a>
                            <a
                              href={url}
                              download={`stories-7j-${idx + 1}.jpg`}
                              className="inline-flex items-center justify-center px-2 py-1 rounded-full border border-amber-200 bg-white text-[10px] font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                            >
                              Télécharger
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {storyScreensClicks30d.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-700 mb-1">Clics sur lien – 30 derniers jours</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {storyScreensClicks30d.map((url, idx) => (
                          <div key={`clicks-${idx}`} className="space-y-1">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative block w-full max-w-[150px] pb-[177%] mx-auto rounded-[1.5rem] overflow-hidden border border-amber-100 bg-black shadow-sm hover:shadow-md transition-shadow"
                            >
                              <img
                                src={url}
                                alt={`Clics lien 30j screenshot ${idx + 1}`}
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white flex items-center justify-between">
                                  <span>Voir le screen</span>
                                  <ExternalLink className="w-3 h-3" />
                                </div>
                              </div>
                            </a>
                            <a
                              href={url}
                              download={`clics-lien-30j-${idx + 1}.jpg`}
                              className="inline-flex items-center justify-center px-2 py-1 rounded-full border border-amber-200 bg-white text-[10px] font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                            >
                              Télécharger
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
  }: {
    label: string;
    value: string;
    evolution?: number | null;
    evolutionSuffix?: string;
    gradient: string;
    icon: React.ReactNode;
  }
) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-lg`}>
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 bg-white/20 rounded-xl">{icon}</div>
          {evolution !== undefined && evolution !== null && (
            <span className={`flex items-center gap-1 text-sm font-medium ${evolution >= 0 ? "text-emerald-200" : "text-red-200"}`}>
              {evolution >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {evolution >= 0 ? "+" : ""}{evolution}{evolutionSuffix}
            </span>
          )}
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