"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, X, Images, BarChart3 } from "lucide-react";

type Candidate = {
  id: string;
  fullName: string;
  manualHandle: string | null;
  source: "planner" | "client";
  status: "proposed" | "approved" | "rejected";
  notePlanner: string | null;
  rejectionReason: string | null;
  followers: number | null;
};

type CampaignPayload = {
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
  };
  candidates: Candidate[];
};

const STATUS_LABEL: Record<Candidate["status"], string> = {
  proposed: "À valider",
  approved: "Validés",
  rejected: "Refusés",
};

export function DinnerClientPortal({ token }: { token: string }) {
  const [data, setData] = useState<CampaignPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingEventPhoto, setUploadingEventPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ fullName: "", manualHandle: "" });
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [activeSection, setActiveSection] = useState<"selection" | "reporting">("selection");

  const canUploadEventPhotos = useMemo(() => {
    if (!data?.campaign.eventDate) return false;
    const end = new Date(`${data.campaign.eventDate}T23:59:59`);
    if (Number.isNaN(end.getTime())) return false;
    return Date.now() >= end.getTime();
  }, [data?.campaign.eventDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/public/${token}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Impossible de charger la campagne");
      setData(json as CampaignPayload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const base: Record<Candidate["status"], Candidate[]> = {
      proposed: [],
      approved: [],
      rejected: [],
    };
    for (const c of data?.candidates || []) base[c.status].push(c);
    return base;
  }, [data?.candidates]);

  const moveCandidate = async (candidateId: string, toStatus: Candidate["status"], reason?: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/strategy/dinner/public/${token}/candidates/${candidateId}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toStatus,
            rejectionReason: toStatus === "rejected" ? reason || "Non retenu" : null,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Impossible de mettre a jour");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const addCreator = async (event: FormEvent) => {
    event.preventDefault();
    if (!addForm.fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/dinner/public/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: addForm.fullName,
          manualHandle: addForm.manualHandle,
          source: "client",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Impossible d'ajouter");
      setAddForm({ fullName: "", manualHandle: "" });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const uploadClientEventPhoto = async (file: File) => {
    setUploadingEventPhoto(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/strategy/dinner/public/${token}/upload-event-photo`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload photo impossible");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setUploadingEventPhoto(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 md:px-8 space-y-6">
      <header className="rounded-2xl border border-gray-200 bg-white p-5">
        {data?.campaign.logoUrl ? (
          <img
            src={data.campaign.logoUrl}
            alt={`Logo ${data.campaign.clientName}`}
            className="mb-3 h-12 w-auto object-contain"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="mb-3 inline-flex h-12 min-w-12 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700">
            {(data?.campaign.clientName || "Client")
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() || "")
              .join("")}
          </div>
        )}
        <h1 className="text-xl font-semibold text-gray-900">Sélection créateurs dîner</h1>
        {data?.campaign ? (
          <p className="mt-1 text-sm text-gray-600">
            {data.campaign.clientName} - {data.campaign.name}
            {data.campaign.city ? ` - ${data.campaign.city}` : ""}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveSection("selection")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeSection === "selection"
                ? "bg-[#1A1110] text-white"
                : "border border-gray-300 bg-white text-gray-700"
            }`}
          >
            Sélection créateurs
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canUploadEventPhotos) return;
              setActiveSection("reporting");
            }}
            disabled={!canUploadEventPhotos}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeSection === "reporting"
                ? "bg-[#1A1110] text-white"
                : "border border-gray-300 bg-white text-gray-700"
            } ${
              !canUploadEventPhotos
                ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                : ""
            }`}
          >
            Section événement (PHOTOS + REPORTING)
          </button>
        </div>
      </header>

      {activeSection === "reporting" && (
        <>
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Images className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Photos événement</h2>
        </div>
        <div className="mb-3">
          <input
            id="client-event-photo-input"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void uploadClientEventPhoto(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!canUploadEventPhotos) return;
              document.getElementById("client-event-photo-input")?.click();
            }}
            disabled={!canUploadEventPhotos || uploadingEventPhoto}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            {uploadingEventPhoto
              ? "Upload en cours..."
              : canUploadEventPhotos
                ? "Uploader ici une photo de l'événement"
                : "Upload bloqué jusqu'à la fin de l'événement"}
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.campaign.eventPhotos || []).length === 0 ? (
            <p className="text-sm text-gray-500">Aucune photo partagée pour le moment.</p>
          ) : (
            (data?.campaign.eventPhotos || []).map((url, idx) => (
              <a
                key={`${url}-${idx}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-xl border border-gray-200"
              >
                <img
                  src={url}
                  alt={`Photo événement ${idx + 1}`}
                  className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              </a>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Reporting complet</h2>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
            <p className="text-xs text-gray-500">Impressions</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Intl.NumberFormat("fr-FR").format(data?.campaign.reportingKpis?.impressions || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
            <p className="text-xs text-gray-500">Reach</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Intl.NumberFormat("fr-FR").format(data?.campaign.reportingKpis?.reach || 0)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
            <p className="text-xs text-gray-500">Taux engagement</p>
            <p className="text-lg font-semibold text-gray-900">
              {(data?.campaign.reportingKpis?.engagementRate || 0).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3">
            <p className="text-xs text-gray-500">Posts publiés</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Intl.NumberFormat("fr-FR").format(data?.campaign.reportingKpis?.postsCount || 0)}
            </p>
          </div>
        </div>
        <p className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 whitespace-pre-wrap text-sm text-gray-700">
          {data?.campaign.reportingSummary || "Reporting en cours de rédaction."}
        </p>
      </section>
        </>
      )}

      {activeSection === "selection" && (
        <>
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Ajouter un créateur</h2>
        <form onSubmit={addCreator} className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            value={addForm.fullName}
            onChange={(e) => setAddForm((v) => ({ ...v, fullName: e.target.value }))}
            placeholder="Nom du créateur"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:flex-1"
            required
          />
          <input
            value={addForm.manualHandle}
            onChange={(e) => setAddForm((v) => ({ ...v, manualHandle: e.target.value }))}
            placeholder="@handle (optionnel)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:w-64"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1A1110] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </form>
      </section>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? <p className="text-sm text-gray-500">Chargement...</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        {(["proposed", "approved", "rejected"] as Candidate["status"][]).map((status) => (
          <div key={status} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{STATUS_LABEL[status]}</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {grouped[status].length}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[status].map((c) => (
                <article key={c.id} className="rounded-xl border border-gray-200 p-3">
                  <button
                    type="button"
                    onClick={() => setSelectedCandidate(c)}
                    className="text-left text-sm font-medium text-gray-900 underline decoration-transparent hover:decoration-gray-400"
                  >
                    {c.fullName}
                  </button>
                  <p className="mt-1 text-xs text-gray-500">
                    {c.manualHandle ? `@${c.manualHandle.replace(/^@+/, "")}` : "Sans handle"}
                    {typeof c.followers === "number"
                      ? ` - ${new Intl.NumberFormat("fr-FR").format(c.followers)} followers`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
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
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
        </>
      )}

      {selectedCandidate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Fiche créateur</h3>
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
              >
                Fermer
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <p>
                <span className="font-medium text-gray-900">Nom:</span> {selectedCandidate.fullName}
              </p>
              <p>
                <span className="font-medium text-gray-900">Handle:</span>{" "}
                {selectedCandidate.manualHandle
                  ? `@${selectedCandidate.manualHandle.replace(/^@+/, "")}`
                  : "Non renseigné"}
              </p>
              <p>
                <span className="font-medium text-gray-900">Source:</span>{" "}
                {selectedCandidate.source === "client" ? "Ajouté par cliente" : "Ajouté par planner"}
              </p>
              <p>
                <span className="font-medium text-gray-900">Statut:</span>{" "}
                {selectedCandidate.status === "proposed"
                  ? "À valider"
                  : selectedCandidate.status === "approved"
                    ? "Validé"
                    : "Refusé"}
              </p>
              <p>
                <span className="font-medium text-gray-900">Abonnés:</span>{" "}
                {typeof selectedCandidate.followers === "number"
                  ? new Intl.NumberFormat("fr-FR").format(selectedCandidate.followers)
                  : "Non renseigné"}
              </p>
              <p>
                <span className="font-medium text-gray-900">Note planner:</span>{" "}
                {selectedCandidate.notePlanner || "Aucune note"}
              </p>
              {selectedCandidate.rejectionReason ? (
                <p className="text-red-600">
                  <span className="font-medium">Motif de refus:</span> {selectedCandidate.rejectionReason}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

