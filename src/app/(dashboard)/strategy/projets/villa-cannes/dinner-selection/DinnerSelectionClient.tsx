"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Check, X, Upload, Images, BarChart3 } from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  clientName: string;
  logoUrl: string | null;
  city: string | null;
  eventDate: string | null;
  status: "draft" | "in_review" | "finalized";
  clientAccessToken: string;
  clientUrl: string;
  candidateCount: number;
  createdAt: string;
  updatedAt: string;
};

type Candidate = {
  id: string;
  campaignId: string;
  talentId: string | null;
  fullName: string;
  manualHandle: string | null;
  creatorEmail: string | null;
  instagramUrl: string | null;
  manualPlatform: string | null;
  followers: number | null;
  engagementRate: number | null;
  estimatedCost: number | null;
  notePlanner: string | null;
  noteClient: string | null;
  source: "planner" | "client";
  status: "proposed" | "approved" | "contacted" | "creator_approved" | "rejected";
  rejectionReason: string | null;
  position: number;
};

type ContactMission = {
  id: string;
  campaignId: string;
  candidateId: string | null;
  creatorName: string;
  targetBrand: string;
  strategyReason: string;
  recommendedAngle: string | null;
  objective: string | null;
  dos: string | null;
  donts: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "READY_FOR_CASTING" | "EMAIL_DRAFTED" | "APPROVED_BY_SALES" | "SENT" | "CANCELLED";
  deadlineAt: string | null;
  createdAt: string;
};

type TalentOption = {
  id: string;
  name: string;
  instagram?: string | null;
  igFollowers?: number;
  igEngagement?: number;
};

type CampaignDetail = {
  campaign: {
    id: string;
    name: string;
    clientName: string;
    logoUrl?: string | null;
    eventPhotos?: string[];
    reportingSummary?: string | null;
    reportingKpis?: {
      impressions?: number;
      reach?: number;
      engagementRate?: number;
      postsCount?: number;
    } | null;
    city: string | null;
    eventDate: string | null;
    status: "draft" | "in_review" | "finalized";
    clientAccessToken?: string;
    clientUrl?: string;
  };
  candidates: Candidate[];
};

const STATUS_LABEL: Record<Candidate["status"], string> = {
  proposed: "Proposés",
  approved: "Validés",
  contacted: "Contactés",
  creator_approved: "Validé par le créateur",
  rejected: "Refusés",
};

export function DinnerSelectionClient() {
  const isEventFinished = (dateValue?: string | null): boolean => {
    if (!dateValue) return false;
    const eventEnd = new Date(`${dateValue}T23:59:59`);
    if (Number.isNaN(eventEnd.getTime())) return false;
    return Date.now() >= eventEnd.getTime();
  };

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string>("");
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    clientName: "",
    logoUrl: "",
    eventPhotosText: "",
    reportingSummary: "",
    city: "",
    eventDate: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null);
  const [editLogoUploading, setEditLogoUploading] = useState(false);
  const [isDraggingEditLogo, setIsDraggingEditLogo] = useState(false);
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [editCampaign, setEditCampaign] = useState({
    name: "",
    clientName: "",
    logoUrl: "",
    eventPhotosText: "",
    reportingSummary: "",
    reportingImpressions: "",
    reportingReach: "",
    reportingEngagementRate: "",
    reportingPostsCount: "",
    city: "",
    eventDate: "",
  });
  const [addForm, setAddForm] = useState({
    talentId: "",
    fullName: "",
    manualHandle: "",
    creatorEmail: "",
    instagramUrl: "",
    followers: "",
    engagementRate: "",
    estimatedCost: "",
    source: "planner" as "planner" | "client",
    notePlanner: "",
  });
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [missions, setMissions] = useState<ContactMission[]>([]);
  const [missionCandidate, setMissionCandidate] = useState<Candidate | null>(null);
  const [missionForm, setMissionForm] = useState({
    targetBrand: "",
    strategyReason: "",
    recommendedAngle: "",
    objective: "",
    dos: "",
    donts: "",
    priority: "MEDIUM" as ContactMission["priority"],
    deadlineAt: "",
  });

  const canUploadNewEventPhotos = useMemo(
    () => isEventFinished(newCampaign.eventDate || null),
    [newCampaign.eventDate]
  );
  const canUploadEditEventPhotos = useMemo(
    () => isEventFinished(editCampaign.eventDate || null),
    [editCampaign.eventDate]
  );

  const grouped = useMemo(() => {
    const base: Record<Candidate["status"], Candidate[]> = {
      proposed: [],
      approved: [],
      contacted: [],
      creator_approved: [],
      rejected: [],
    };
    for (const c of detail?.candidates || []) base[c.status].push(c);
    return base;
  }, [detail?.candidates]);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/dinner/campaigns?projetSlug=villa-cannes", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger les campagnes");
      const list = Array.isArray(data.campaigns) ? (data.campaigns as Campaign[]) : [];
      setCampaigns(list);
      if (!activeCampaignId && list[0]?.id) setActiveCampaignId(list[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoadingCampaigns(false);
    }
  }, [activeCampaignId]);

  const loadTalents = useCallback(async () => {
    try {
      const res = await fetch("/api/talents?presskit=true", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.talents) ? data.talents : [];
      setTalents(
        list.map((t: any) => ({
          id: String(t.id),
          name: String(t.name),
          instagram: t.instagram ? String(t.instagram) : null,
          igFollowers: typeof t.igFollowers === "number" ? t.igFollowers : 0,
          igEngagement: typeof t.igEngagement === "number" ? t.igEngagement : 0,
        }))
      );
    } catch {
      setTalents([]);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/campaigns/${id}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger le board");
      setDetail(data as CampaignDetail);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadMissions = useCallback(async (campaignId: string) => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/strategy/dinner/campaigns/${campaignId}/missions`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement des missions impossible");
      setMissions(Array.isArray(data.missions) ? (data.missions as ContactMission[]) : []);
    } catch {
      setMissions([]);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
    void loadTalents();
  }, [loadCampaigns, loadTalents]);

  useEffect(() => {
    if (!activeCampaignId) return;
    void loadDetail(activeCampaignId);
    void loadMissions(activeCampaignId);
  }, [activeCampaignId, loadDetail, loadMissions]);

  useEffect(() => {
    if (!detail?.campaign) return;
    setEditCampaign({
      name: detail.campaign.name || "",
      clientName: detail.campaign.clientName || "",
      logoUrl: detail.campaign.logoUrl || "",
      eventPhotosText: Array.isArray(detail.campaign.eventPhotos)
        ? detail.campaign.eventPhotos.join("\n")
        : "",
      reportingSummary: detail.campaign.reportingSummary || "",
      reportingImpressions: detail.campaign.reportingKpis?.impressions?.toString() || "",
      reportingReach: detail.campaign.reportingKpis?.reach?.toString() || "",
      reportingEngagementRate: detail.campaign.reportingKpis?.engagementRate?.toString() || "",
      reportingPostsCount: detail.campaign.reportingKpis?.postsCount?.toString() || "",
      city: detail.campaign.city || "",
      eventDate: detail.campaign.eventDate ? String(detail.campaign.eventDate).slice(0, 10) : "",
    });
  }, [detail?.campaign]);

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/dinner/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projetSlug: "villa-cannes",
          name: newCampaign.name,
          clientName: newCampaign.clientName,
          logoUrl: newCampaign.logoUrl || null,
          eventPhotos: newCampaign.eventPhotosText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          reportingSummary: newCampaign.reportingSummary || null,
          city: newCampaign.city || null,
          eventDate: newCampaign.eventDate || null,
          status: "in_review",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Creation impossible");
      setNewCampaign({
        name: "",
        clientName: "",
        logoUrl: "",
        eventPhotosText: "",
        reportingSummary: "",
        city: "",
        eventDate: "",
      });
      await loadCampaigns();
      if (data.campaign?.id) setActiveCampaignId(String(data.campaign.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Le logo doit etre une image (PNG, JPG, WEBP...)");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Le logo depasse 10MB");
    }
    setLogoUploading(true);
    const localPreview = URL.createObjectURL(file);
    setLogoPreview(localPreview);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/strategy/dinner/upload-logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'upload du logo");
      }
      setNewCampaign((v) => ({ ...v, logoUrl: String(data.url || "") }));
    } finally {
      URL.revokeObjectURL(localPreview);
      setLogoUploading(false);
    }
  };

  const onLogoInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogoFile(file);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload logo impossible");
      setLogoPreview(null);
    } finally {
      event.target.value = "";
    }
  };

  const onLogoDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingLogo(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    try {
      await uploadLogoFile(file);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload logo impossible");
      setLogoPreview(null);
    }
  };

  const uploadEditLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Le logo doit etre une image (PNG, JPG, WEBP...)");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Le logo depasse 10MB");
    }
    setEditLogoUploading(true);
    const localPreview = URL.createObjectURL(file);
    setEditLogoPreview(localPreview);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/strategy/dinner/upload-logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'upload du logo");
      }
      setEditCampaign((v) => ({ ...v, logoUrl: String(data.url || "") }));
    } finally {
      URL.revokeObjectURL(localPreview);
      setEditLogoUploading(false);
    }
  };

  const onEditLogoInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await uploadEditLogoFile(file);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload logo impossible");
      setEditLogoPreview(null);
    } finally {
      event.target.value = "";
    }
  };

  const onEditLogoDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingEditLogo(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    try {
      await uploadEditLogoFile(file);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload logo impossible");
      setEditLogoPreview(null);
    }
  };

  const uploadEventPhotoFile = async (file: File, target: "new" | "edit") => {
    if (!file.type.startsWith("image/")) {
      throw new Error("La photo evenement doit etre une image");
    }
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/strategy/dinner/upload-event-photo", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload photo evenement impossible");
    const nextUrl = String(data.url || "").trim();
    if (!nextUrl) return;
    if (target === "new") {
      setNewCampaign((v) => ({
        ...v,
        eventPhotosText: v.eventPhotosText ? `${v.eventPhotosText}\n${nextUrl}` : nextUrl,
      }));
    } else {
      setEditCampaign((v) => ({
        ...v,
        eventPhotosText: v.eventPhotosText ? `${v.eventPhotosText}\n${nextUrl}` : nextUrl,
      }));
    }
  };

  const addCandidate = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeCampaignId) return;
    setSaving(true);
    setError(null);
    try {
      const selectedTalent = addForm.talentId
        ? talents.find((t) => t.id === addForm.talentId) || null
        : null;
      const res = await fetch(`/api/strategy/dinner/campaigns/${activeCampaignId}/candidates`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentId: selectedTalent?.id || null,
          fullName: selectedTalent ? selectedTalent.name : addForm.fullName,
          manualHandle: addForm.manualHandle || selectedTalent?.instagram || null,
          creatorEmail: addForm.creatorEmail || null,
          instagramUrl:
            addForm.instagramUrl ||
            (selectedTalent?.instagram
              ? `https://instagram.com/${String(selectedTalent.instagram).replace(/^@+/, "")}`
              : null),
          followers: selectedTalent?.igFollowers || Number(addForm.followers) || null,
          engagementRate: selectedTalent?.igEngagement || Number(addForm.engagementRate) || null,
          estimatedCost: Number(addForm.estimatedCost) || null,
          source: addForm.source,
          status: "proposed",
          notePlanner: addForm.notePlanner || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout impossible");
      setAddForm({
        talentId: "",
        fullName: "",
        manualHandle: "",
        creatorEmail: "",
        instagramUrl: "",
        followers: "",
        engagementRate: "",
        estimatedCost: "",
        source: "planner",
        notePlanner: "",
      });
      await loadDetail(activeCampaignId);
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const saveCampaignEdits = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeCampaignId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/campaigns/${activeCampaignId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editCampaign.name,
          clientName: editCampaign.clientName,
          logoUrl: editCampaign.logoUrl || null,
          eventPhotos: editCampaign.eventPhotosText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          reportingSummary: editCampaign.reportingSummary || null,
          reportingKpis: {
            impressions: Number(editCampaign.reportingImpressions) || 0,
            reach: Number(editCampaign.reportingReach) || 0,
            engagementRate: Number(editCampaign.reportingEngagementRate) || 0,
            postsCount: Number(editCampaign.reportingPostsCount) || 0,
          },
          city: editCampaign.city || null,
          eventDate: editCampaign.eventDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise a jour impossible");
      await loadDetail(activeCampaignId);
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const moveCandidate = async (
    candidateId: string,
    toStatus: Candidate["status"],
    rejectionReason?: string
  ) => {
    if (!activeCampaignId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/candidates/${candidateId}/move`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus,
          rejectionReason: toStatus === "rejected" ? rejectionReason || "Non retenu" : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise a jour impossible");
      await loadDetail(activeCampaignId);
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const deleteCandidate = async (candidateId: string) => {
    if (!activeCampaignId) return;
    if (!window.confirm("Supprimer ce talent de la campagne ?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/candidates/${candidateId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible");
      if (selectedCandidate?.id === candidateId) setSelectedCandidate(null);
      await loadDetail(activeCampaignId);
      await loadCampaigns();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const saveCandidateDetails = async (candidate: Candidate) => {
    if (!activeCampaignId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/candidates/${candidate.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: candidate.fullName,
          manualHandle: candidate.manualHandle,
          creatorEmail: candidate.creatorEmail,
          instagramUrl: candidate.instagramUrl,
          followers: candidate.followers,
          engagementRate: candidate.engagementRate,
          estimatedCost: candidate.estimatedCost,
          notePlanner: candidate.notePlanner,
          noteClient: candidate.noteClient,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise a jour impossible");
      await loadDetail(activeCampaignId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const openMissionModal = (candidate: Candidate) => {
    setMissionCandidate(candidate);
    setMissionForm({
      targetBrand: "",
      strategyReason: "",
      recommendedAngle: "",
      objective: "",
      dos: "",
      donts: "",
      priority: "MEDIUM",
      deadlineAt: "",
    });
  };

  const createMission = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeCampaignId || !missionCandidate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/campaigns/${activeCampaignId}/missions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: missionCandidate.id,
          creatorName: missionCandidate.fullName,
          targetBrand: missionForm.targetBrand,
          strategyReason: missionForm.strategyReason,
          recommendedAngle: missionForm.recommendedAngle || null,
          objective: missionForm.objective || null,
          dos: missionForm.dos || null,
          donts: missionForm.donts || null,
          priority: missionForm.priority,
          deadlineAt: missionForm.deadlineAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Creation mission impossible");
      setMissionCandidate(null);
      setMissionForm({
        targetBrand: "",
        strategyReason: "",
        recommendedAngle: "",
        objective: "",
        dos: "",
        donts: "",
        priority: "MEDIUM",
        deadlineAt: "",
      });
      await loadMissions(activeCampaignId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur reseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] p-6 md:p-8 space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Sélection de créateurs – dîner</h1>
            <p className="text-sm text-gray-500">
              Le planner propose, la cliente valide dans un board kanban.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadCampaigns();
              if (activeCampaignId) void loadDetail(activeCampaignId);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={createCampaign} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Nouvelle campagne dîner</h2>
          <input
            value={newCampaign.name}
            onChange={(e) => setNewCampaign((v) => ({ ...v, name: e.target.value }))}
            placeholder="Nom de campagne"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
          <input
            value={newCampaign.clientName}
            onChange={(e) => setNewCampaign((v) => ({ ...v, clientName: e.target.value }))}
            placeholder="Nom cliente"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
          <input
            id="dinner-logo-input"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            className="hidden"
            onChange={onLogoInputChange}
          />
          <label
            htmlFor="dinner-logo-input"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingLogo(true);
            }}
            onDragLeave={() => setIsDraggingLogo(false)}
            onDrop={(e) => void onLogoDrop(e)}
            className={`block cursor-pointer rounded-lg border-2 border-dashed p-4 transition ${
              isDraggingLogo
                ? "border-[#1A1110] bg-gray-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                {logoUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                ) : (
                  <Upload className="h-5 w-5 text-gray-600" />
                )}
              </div>
              <div className="text-sm text-gray-700">
                <p className="font-medium">Glisse le logo ici ou clique pour selectionner</p>
                <p className="text-xs text-gray-500">PNG, JPG, WEBP, SVG - max 10MB</p>
              </div>
            </div>
            {(logoPreview || newCampaign.logoUrl) && (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={logoPreview || newCampaign.logoUrl}
                  alt="Apercu logo client"
                  className="h-12 w-auto rounded-md border border-gray-200 bg-white object-contain p-1"
                />
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={(e) => {
                    e.preventDefault();
                    setLogoPreview(null);
                    setNewCampaign((v) => ({ ...v, logoUrl: "" }));
                  }}
                >
                  Retirer le logo
                </button>
              </div>
            )}
          </label>
          <input
            value={newCampaign.logoUrl}
            onChange={(e) => setNewCampaign((v) => ({ ...v, logoUrl: e.target.value }))}
            placeholder="...ou coller une URL logo (https://...)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
            <div className="flex items-center gap-2">
              <Images className="h-4 w-4 text-gray-500" />
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Photos événement</p>
            </div>
            <input
              id="new-event-photo-upload-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void uploadEventPhotoFile(file, "new").catch((err) =>
                  setError(err instanceof Error ? err.message : "Upload photo evenement impossible")
                );
                e.target.value = "";
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (!canUploadNewEventPhotos) return;
                document.getElementById("new-event-photo-upload-input")?.click();
              }}
              disabled={!canUploadNewEventPhotos}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {canUploadNewEventPhotos
                ? "Uploader une photo événement"
                : "Upload verrouillé jusqu'à la fin de l'événement"}
            </button>
            <textarea
              value={newCampaign.eventPhotosText}
              onChange={(e) => setNewCampaign((v) => ({ ...v, eventPhotosText: e.target.value }))}
              placeholder="Une URL photo par ligne"
              className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              {newCampaign.eventPhotosText
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 6)
                .map((url, idx) => (
                  <img
                    key={`${url}-${idx}`}
                    src={url}
                    alt={`Aperçu photo ${idx + 1}`}
                    className="h-16 w-full rounded-lg border border-gray-200 object-cover"
                  />
                ))}
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gray-500" />
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reporting complet</p>
            </div>
            <textarea
              value={newCampaign.reportingSummary}
              onChange={(e) => setNewCampaign((v) => ({ ...v, reportingSummary: e.target.value }))}
              placeholder="Resume complet: deroule, highlights, retours, recommandations..."
              className="min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newCampaign.city}
              onChange={(e) => setNewCampaign((v) => ({ ...v, city: e.target.value }))}
              placeholder="Ville"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={newCampaign.eventDate}
              onChange={(e) => setNewCampaign((v) => ({ ...v, eventDate: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Creer la campagne
          </button>
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Campagne active</h2>
          <select
            value={activeCampaignId}
            onChange={(e) => setActiveCampaignId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Sélectionner</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.clientName} ({c.candidateCount})
              </option>
            ))}
          </select>
          {loadingCampaigns ? <p className="text-sm text-gray-500">Chargement...</p> : null}
          {detail ? (
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                {detail.campaign.clientName} {detail.campaign.city ? `- ${detail.campaign.city}` : ""} -{" "}
                {detail.campaign.status}
              </p>
              {detail.campaign.clientUrl ? (
                <p className="text-xs text-gray-500">
                  Lien client prive:{" "}
                  <a
                    className="text-[#1A1110] underline"
                    href={detail.campaign.clientUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detail.campaign.clientUrl}
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
          {detail ? (
            <form onSubmit={saveCampaignEdits} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Modifier cette campagne cliente
              </p>
              <input
                value={editCampaign.name}
                onChange={(e) => setEditCampaign((v) => ({ ...v, name: e.target.value }))}
                placeholder="Nom campagne"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <input
                value={editCampaign.clientName}
                onChange={(e) => setEditCampaign((v) => ({ ...v, clientName: e.target.value }))}
                placeholder="Nom cliente"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <input
                value={editCampaign.logoUrl}
                onChange={(e) => setEditCampaign((v) => ({ ...v, logoUrl: e.target.value }))}
                placeholder="URL logo (ou uploader juste en dessous)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                id="dinner-edit-logo-input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                className="hidden"
                onChange={onEditLogoInputChange}
              />
              <label
                htmlFor="dinner-edit-logo-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingEditLogo(true);
                }}
                onDragLeave={() => setIsDraggingEditLogo(false)}
                onDrop={(e) => void onEditLogoDrop(e)}
                className={`block cursor-pointer rounded-lg border-2 border-dashed p-3 transition ${
                  isDraggingEditLogo
                    ? "border-[#1A1110] bg-gray-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                    {editLogoUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                    ) : (
                      <Upload className="h-4 w-4 text-gray-600" />
                    )}
                  </div>
                  <div className="text-xs text-gray-700">
                    <p className="font-medium">Uploader logo (glisser/deposer ou clic)</p>
                    <p className="text-[11px] text-gray-500">PNG, JPG, WEBP, SVG - max 10MB</p>
                  </div>
                </div>
                {(editLogoPreview || editCampaign.logoUrl) && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={editLogoPreview || editCampaign.logoUrl}
                      alt="Apercu logo"
                      className="h-10 w-auto rounded border border-gray-200 bg-white object-contain p-1"
                    />
                    <button
                      type="button"
                      className="text-xs text-gray-500 underline"
                      onClick={(e) => {
                        e.preventDefault();
                        setEditLogoPreview(null);
                        setEditCampaign((v) => ({ ...v, logoUrl: "" }));
                      }}
                    >
                      Retirer
                    </button>
                  </div>
                )}
              </label>
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <Images className="h-4 w-4 text-gray-500" />
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Photos événement</p>
                </div>
                <input
                  id="edit-event-photo-upload-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void uploadEventPhotoFile(file, "edit").catch((err) =>
                      setError(err instanceof Error ? err.message : "Upload photo evenement impossible")
                    );
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!canUploadEditEventPhotos) return;
                    document.getElementById("edit-event-photo-upload-input")?.click();
                  }}
                  disabled={!canUploadEditEventPhotos}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                >
                  {canUploadEditEventPhotos
                    ? "Uploader une photo événement"
                    : "Upload verrouillé jusqu'à la fin de l'événement"}
                </button>
                <textarea
                  value={editCampaign.eventPhotosText}
                  onChange={(e) => setEditCampaign((v) => ({ ...v, eventPhotosText: e.target.value }))}
                  placeholder="Une URL photo par ligne"
                  className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  {editCampaign.eventPhotosText
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .slice(0, 9)
                    .map((url, idx) => (
                      <img
                        key={`${url}-${idx}`}
                        src={url}
                        alt={`Photo événement ${idx + 1}`}
                        className="h-16 w-full rounded-lg border border-gray-200 object-cover"
                      />
                    ))}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-gray-500" />
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reporting complet</p>
                </div>
                <textarea
                  value={editCampaign.reportingSummary}
                  onChange={(e) => setEditCampaign((v) => ({ ...v, reportingSummary: e.target.value }))}
                  placeholder="Resume complet: deroule, highlights, retours, recommandations..."
                  className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={editCampaign.reportingImpressions}
                    onChange={(e) =>
                      setEditCampaign((v) => ({ ...v, reportingImpressions: e.target.value }))
                    }
                    placeholder="Impressions"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    value={editCampaign.reportingReach}
                    onChange={(e) => setEditCampaign((v) => ({ ...v, reportingReach: e.target.value }))}
                    placeholder="Reach"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={editCampaign.reportingEngagementRate}
                    onChange={(e) =>
                      setEditCampaign((v) => ({
                        ...v,
                        reportingEngagementRate: e.target.value,
                      }))
                    }
                    placeholder="Taux engagement %"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    value={editCampaign.reportingPostsCount}
                    onChange={(e) =>
                      setEditCampaign((v) => ({ ...v, reportingPostsCount: e.target.value }))
                    }
                    placeholder="Nombre de posts"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <p>Impressions</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Intl.NumberFormat("fr-FR").format(Number(editCampaign.reportingImpressions) || 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <p>Reach</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Intl.NumberFormat("fr-FR").format(Number(editCampaign.reportingReach) || 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <p>Engagement</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {(Number(editCampaign.reportingEngagementRate) || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <p>Posts</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Intl.NumberFormat("fr-FR").format(Number(editCampaign.reportingPostsCount) || 0)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={editCampaign.city}
                  onChange={(e) => setEditCampaign((v) => ({ ...v, city: e.target.value }))}
                  placeholder="Ville"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={editCampaign.eventDate}
                  onChange={(e) => setEditCampaign((v) => ({ ...v, eventDate: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-[#1A1110] px-3 py-2 text-sm font-medium text-[#1A1110] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Enregistrer les modifications
              </button>
            </form>
          ) : null}
        </div>
      </section>

      {activeCampaignId ? (
        <form onSubmit={addCandidate} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Ajouter un créateur</h2>
          <div className="grid gap-2 md:grid-cols-4">
            <select
              value={addForm.talentId}
              onChange={(e) => setAddForm((v) => ({ ...v, talentId: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            >
              <option value="">Choisir dans les talents</option>
              {talents.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              value={addForm.fullName}
              onChange={(e) => setAddForm((v) => ({ ...v, fullName: e.target.value }))}
              placeholder="Ou nom manuel"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              disabled={Boolean(addForm.talentId)}
            />
            <input
              value={addForm.manualHandle}
              onChange={(e) => setAddForm((v) => ({ ...v, manualHandle: e.target.value }))}
              placeholder="@handle"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={addForm.creatorEmail}
              onChange={(e) => setAddForm((v) => ({ ...v, creatorEmail: e.target.value }))}
              placeholder="Email créateur"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="email"
            />
            <input
              value={addForm.instagramUrl}
              onChange={(e) => setAddForm((v) => ({ ...v, instagramUrl: e.target.value }))}
              placeholder="Lien Instagram"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={addForm.followers}
              onChange={(e) => setAddForm((v) => ({ ...v, followers: e.target.value }))}
              placeholder="Abonnés"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="number"
              min={0}
            />
            <input
              value={addForm.engagementRate}
              onChange={(e) => setAddForm((v) => ({ ...v, engagementRate: e.target.value }))}
              placeholder="Engagement %"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="number"
              min={0}
              step="0.1"
            />
            <input
              value={addForm.estimatedCost}
              onChange={(e) => setAddForm((v) => ({ ...v, estimatedCost: e.target.value }))}
              placeholder="Coût estimé EUR"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="number"
              min={0}
            />
            <select
              value={addForm.source}
              onChange={(e) =>
                setAddForm((v) => ({ ...v, source: e.target.value as "planner" | "client" }))
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="planner">Ajouté par planner</option>
              <option value="client">Ajouté par cliente</option>
            </select>
          </div>
          <input
            value={addForm.notePlanner}
            onChange={(e) => setAddForm((v) => ({ ...v, notePlanner: e.target.value }))}
            placeholder="Note interne"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C08B8B] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter au board
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        {(
          ["proposed", "approved", "contacted", "creator_approved", "rejected"] as Candidate["status"][]
        ).map((status) => (
          <div key={status} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{STATUS_LABEL[status]}</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {grouped[status].length}
              </span>
            </div>
            <div className="space-y-2">
              {loadingDetail ? (
                <p className="text-sm text-gray-500">Chargement...</p>
              ) : grouped[status].length === 0 ? (
                <p className="text-sm text-gray-400">Aucun créateur</p>
              ) : (
                grouped[status].map((c) => (
                  <article key={c.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCandidate(c)}
                        className="text-left text-sm font-medium text-gray-900 underline decoration-transparent hover:decoration-gray-400"
                      >
                        {c.fullName}
                      </button>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                        {c.source === "client" ? "Ajout cliente" : "Planner"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {c.manualHandle ? `@${c.manualHandle.replace(/^@+/, "")}` : "Sans handle"}
                      {typeof c.followers === "number"
                        ? ` - ${new Intl.NumberFormat("fr-FR").format(c.followers)} followers`
                        : ""}
                      {typeof c.engagementRate === "number" ? ` - ${c.engagementRate}% engagement` : ""}
                    </p>
                    {(c.creatorEmail || c.instagramUrl) && (
                      <p className="text-xs text-gray-500">
                        {c.creatorEmail ? `${c.creatorEmail}` : ""}
                        {c.creatorEmail && c.instagramUrl ? " - " : ""}
                        {c.instagramUrl ? (
                          <a
                            href={c.instagramUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-gray-700"
                          >
                            Profil Instagram
                          </a>
                        ) : null}
                      </p>
                    )}
                    {c.notePlanner ? <p className="text-xs text-gray-600">{c.notePlanner}</p> : null}
                    {c.rejectionReason ? (
                      <p className="text-xs text-red-600">Refuse - Motif: {c.rejectionReason}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openMissionModal(c)}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                      >
                        Mission casting
                      </button>
                      {c.status !== "contacted" ? (
                        <button
                          type="button"
                          onClick={() => void moveCandidate(c.id, "contacted")}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700"
                        >
                          Contacté
                        </button>
                      ) : null}
                      {c.status !== "creator_approved" ? (
                        <button
                          type="button"
                          onClick={() => void moveCandidate(c.id, "creator_approved")}
                          className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-xs text-purple-700"
                        >
                          Validé créateur
                        </button>
                      ) : null}
                      {c.status !== "approved" ? (
                        <button
                          type="button"
                          onClick={() => void moveCandidate(c.id, "approved")}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Valider
                        </button>
                      ) : null}
                      {c.status !== "rejected" ? (
                        <button
                          type="button"
                          onClick={() => {
                            const reason = window.prompt("Motif du refus", c.rejectionReason || "") || "";
                            void moveCandidate(c.id, "rejected", reason);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                        >
                          <X className="h-3.5 w-3.5" />
                          Refuser
                        </button>
                      ) : null}
                      {c.status !== "proposed" ? (
                        <button
                          type="button"
                          onClick={() => void moveCandidate(c.id, "proposed")}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
                        >
                          Remettre propose
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void deleteCandidate(c.id)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ))}
      </section>

      {missions.length > 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Missions strategy vers casting</h3>
          <div className="mt-3 space-y-2">
            {missions.slice(0, 8).map((m) => (
              <article key={m.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                <p className="font-medium text-gray-900">
                  {m.creatorName} → {m.targetBrand}
                </p>
                <p className="mt-1 text-xs text-gray-600">{m.strategyReason}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedCandidate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Fiche talent</h3>
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
              >
                Fermer
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={selectedCandidate.fullName}
                onChange={(e) =>
                  setSelectedCandidate((prev) => (prev ? { ...prev, fullName: e.target.value } : prev))
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Nom"
              />
              <input
                value={selectedCandidate.manualHandle || ""}
                onChange={(e) =>
                  setSelectedCandidate((prev) =>
                    prev ? { ...prev, manualHandle: e.target.value } : prev
                  )
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="@handle"
              />
              <input
                value={selectedCandidate.creatorEmail || ""}
                onChange={(e) =>
                  setSelectedCandidate((prev) =>
                    prev ? { ...prev, creatorEmail: e.target.value } : prev
                  )
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Email créateur"
                type="email"
              />
              <input
                value={selectedCandidate.instagramUrl || ""}
                onChange={(e) =>
                  setSelectedCandidate((prev) =>
                    prev ? { ...prev, instagramUrl: e.target.value } : prev
                  )
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Lien Instagram"
              />
              <input
                value={selectedCandidate.followers ?? ""}
                onChange={(e) =>
                  setSelectedCandidate((prev) =>
                    prev
                      ? {
                          ...prev,
                          followers: e.target.value ? Number(e.target.value) : null,
                        }
                      : prev
                  )
                }
                type="number"
                min={0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Abonnés"
              />
              <input
                value={selectedCandidate.engagementRate ?? ""}
                onChange={(e) =>
                  setSelectedCandidate((prev) =>
                    prev
                      ? {
                          ...prev,
                          engagementRate: e.target.value ? Number(e.target.value) : null,
                        }
                      : prev
                  )
                }
                type="number"
                min={0}
                step="0.1"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Engagement %"
              />
              <input
                value={selectedCandidate.estimatedCost ?? ""}
                onChange={(e) =>
                  setSelectedCandidate((prev) =>
                    prev
                      ? {
                          ...prev,
                          estimatedCost: e.target.value ? Number(e.target.value) : null,
                        }
                      : prev
                  )
                }
                type="number"
                min={0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                placeholder="Coût estimé EUR"
              />
              <textarea
                value={selectedCandidate.notePlanner || ""}
                onChange={(e) =>
                  setSelectedCandidate((prev) =>
                    prev ? { ...prev, notePlanner: e.target.value } : prev
                  )
                }
                className="min-h-24 rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                placeholder="Note planner"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveCandidateDetails(selectedCandidate)}
                className="rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-white"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => void deleteCandidate(selectedCandidate.id)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700"
              >
                Supprimer ce talent
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {missionCandidate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                Mission casting - {missionCandidate.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setMissionCandidate(null)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
              >
                Fermer
              </button>
            </div>
            <form onSubmit={createMission} className="space-y-2">
              <input
                value={missionForm.targetBrand}
                onChange={(e) => setMissionForm((v) => ({ ...v, targetBrand: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Marque a contacter (ex: La Mer)"
                required
              />
              <textarea
                value={missionForm.strategyReason}
                onChange={(e) => setMissionForm((v) => ({ ...v, strategyReason: e.target.value }))}
                className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Pourquoi cette marque pour ce createur ?"
                required
              />
              <input
                value={missionForm.recommendedAngle}
                onChange={(e) =>
                  setMissionForm((v) => ({ ...v, recommendedAngle: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Angle recommande (optionnel)"
              />
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  value={missionForm.objective}
                  onChange={(e) => setMissionForm((v) => ({ ...v, objective: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Objectif (call, intro...)"
                />
                <select
                  value={missionForm.priority}
                  onChange={(e) =>
                    setMissionForm((v) => ({
                      ...v,
                      priority: e.target.value as ContactMission["priority"],
                    }))
                  }
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="LOW">Priorite basse</option>
                  <option value="MEDIUM">Priorite moyenne</option>
                  <option value="HIGH">Priorite haute</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <input
                  type="datetime-local"
                  value={missionForm.deadlineAt}
                  onChange={(e) => setMissionForm((v) => ({ ...v, deadlineAt: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={missionForm.dos}
                onChange={(e) => setMissionForm((v) => ({ ...v, dos: e.target.value }))}
                className="min-h-16 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Do (optionnel)"
              />
              <textarea
                value={missionForm.donts}
                onChange={(e) => setMissionForm((v) => ({ ...v, donts: e.target.value }))}
                className="min-h-16 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Don't (optionnel)"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Creer et envoyer a casting
                </button>
                <button
                  type="button"
                  onClick={() => setMissionCandidate(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

