"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { HubSpotContactCasting } from "@/lib/hubspot";
import CastingComposer from "../CastingComposer";

type Mission = {
  id: string;
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

type ComposerPayload = {
  company: string;
  contacts: Array<Pick<HubSpotContactCasting, "id" | "firstname" | "lastname" | "email">>;
  initialSubject?: string;
  initialBodyHtml?: string;
  missionBrief?: {
    id: string;
    creatorName: string;
    targetBrand: string;
    strategyReason: string;
    recommendedAngle?: string | null;
    objective?: string | null;
    dos?: string | null;
    donts?: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    status: "READY_FOR_CASTING" | "EMAIL_DRAFTED" | "APPROVED_BY_SALES" | "SENT" | "CANCELLED";
    deadlineAt?: string | null;
  } | null;
};

const STATUS_LABEL: Record<Mission["status"], string> = {
  READY_FOR_CASTING: "À rédiger",
  EMAIL_DRAFTED: "Brouillon en cours",
  APPROVED_BY_SALES: "Mail prêt",
  SENT: "Envoyé",
  CANCELLED: "Annulé",
};

const PRIORITY_LABEL: Record<Mission["priority"], string> = {
  LOW: "Basse",
  MEDIUM: "Moyenne",
  HIGH: "Haute",
  URGENT: "Urgente",
};

function columnFor(contact: HubSpotContactCasting): "todo" | "progress" | "ready" {
  const body = (contact.castingEmailBody || "").trim();
  const st = (contact.castingStatus || "").trim().toLowerCase();
  if (st === "pret") return "ready";
  if (!body) return "todo";
  return "progress";
}

function brandColumnFor(contacts: HubSpotContactCasting[]): "todo" | "progress" | "ready" {
  let hasProgress = false;
  for (const c of contacts) {
    const col = columnFor(c);
    if (col === "ready") return "ready";
    if (col === "progress") hasProgress = true;
  }
  return hasProgress ? "progress" : "todo";
}

function pickInitialCastingDraft(contacts: HubSpotContactCasting[]): {
  initialSubject: string;
  initialBodyHtml: string;
} {
  const withBody = contacts.find((c) => (c.castingEmailBody || "").trim());
  const withSubject = contacts.find((c) => (c.castingEmailSubject || "").trim());
  const ref = withBody || withSubject || contacts[0];
  if (!ref) return { initialSubject: "", initialBodyHtml: "" };
  return {
    initialSubject: (ref.castingEmailSubject || "").trim(),
    initialBodyHtml: (ref.castingEmailBody || "").trim(),
  };
}

export function CastingMissionsClient() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openingComposerId, setOpeningComposerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | Mission["status"]>("ALL");
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContact, setComposerContact] = useState<ComposerPayload | null>(null);
  const [composerColumn, setComposerColumn] = useState<"todo" | "progress" | "ready" | null>(null);
  const [notice, setNotice] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return missions.filter((m) => {
      if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
      if (!q) return true;
      const pool = `${m.creatorName} ${m.targetBrand} ${m.strategyReason}`.toLowerCase();
      return pool.includes(q);
    });
  }, [missions, query, statusFilter]);

  function showNotice(message: string, type: "success" | "error") {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4000);
  }

  async function loadMissions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategy/contact-missions", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger les missions.");
      setMissions(Array.isArray(data.missions) ? (data.missions as Mission[]) : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setMissions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMissions();
  }, []);

  async function updateStatus(missionId: string, status: Mission["status"]) {
    setSavingId(missionId);
    setError(null);
    try {
      const res = await fetch("/api/strategy/contact-missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible.");
      setMissions((prev) => prev.map((m) => (m.id === missionId ? { ...m, status } : m)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setSavingId(null);
    }
  }

  async function openComposerForMission(mission: Mission) {
    setOpeningComposerId(mission.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/hubspot/casting/brand-contacts?brand=${encodeURIComponent(mission.targetBrand)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger les contacts de la marque.");
      const contactsRaw = Array.isArray(data.contacts)
        ? (data.contacts as HubSpotContactCasting[])
        : [];
      if (contactsRaw.length === 0) {
        showNotice("Aucun contact HubSpot lié, rédaction disponible quand même.", "success");
      }

      const payload: ComposerPayload = {
        company: mission.targetBrand,
        contacts: contactsRaw.map((c) => ({
          id: c.id,
          firstname: c.firstname,
          lastname: c.lastname,
          email: c.email,
        })),
        ...pickInitialCastingDraft(contactsRaw),
        missionBrief: {
          id: mission.id,
          creatorName: mission.creatorName,
          targetBrand: mission.targetBrand,
          strategyReason: mission.strategyReason,
          recommendedAngle: mission.recommendedAngle,
          objective: mission.objective,
          dos: mission.dos,
          donts: mission.donts,
          priority: mission.priority,
          status: mission.status,
          deadlineAt: mission.deadlineAt,
        },
      };

      setComposerContact(payload);
      setComposerColumn(contactsRaw.length > 0 ? brandColumnFor(contactsRaw) : "todo");
      setComposerOpen(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur réseau.";
      setError(message);
      showNotice(message, "error");
    } finally {
      setOpeningComposerId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-6 md:p-8">
      {notice && (
        <div
          className="fixed bottom-6 right-6 z-[200] rounded-xl border px-4 py-3 text-sm shadow-lg"
          style={{
            backgroundColor: notice.type === "success" ? "#C8F285" : "#FEE2E2",
            borderColor: notice.type === "success" ? "#1A1110" : "#B91C1C",
            color: "#1A1110",
          }}
        >
          {notice.message}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Missions Strategy (Casting)</h1>
            <p className="mt-1 text-sm text-gray-500">
              Suivi opérationnel des missions Strategy Planner vers Casting Manager.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMissions()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Recherche créateur, marque, raison..."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | Mission["status"])}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="ALL">Tous statuts</option>
            <option value="READY_FOR_CASTING">À rédiger</option>
            <option value="EMAIL_DRAFTED">Brouillon en cours</option>
            <option value="APPROVED_BY_SALES">Mail prêt</option>
            <option value="SENT">Envoyé</option>
            <option value="CANCELLED">Annulé</option>
          </select>
        </div>

        <div className="space-y-2">
          {filtered.map((m) => (
            <article key={m.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  {m.creatorName} → {m.targetBrand}
                </p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {STATUS_LABEL[m.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">{m.strategyReason}</p>
              <p className="mt-1 text-[11px] text-gray-500">Priorité: {PRIORITY_LABEL[m.priority]}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={openingComposerId === m.id}
                  onClick={() => void openComposerForMission(m)}
                  className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700 disabled:opacity-60"
                >
                  {openingComposerId === m.id ? "Ouverture..." : "Rédiger email"}
                </button>
                {m.status !== "EMAIL_DRAFTED" && (
                  <button
                    type="button"
                    disabled={savingId === m.id}
                    onClick={() => void updateStatus(m.id, "EMAIL_DRAFTED")}
                    className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 disabled:opacity-60"
                  >
                    Brouillon en cours
                  </button>
                )}
                {m.status !== "APPROVED_BY_SALES" && (
                  <button
                    type="button"
                    disabled={savingId === m.id}
                    onClick={() => void updateStatus(m.id, "APPROVED_BY_SALES")}
                    className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 disabled:opacity-60"
                  >
                    Mail prêt
                  </button>
                )}
                {m.status !== "SENT" && (
                  <button
                    type="button"
                    disabled={savingId === m.id}
                    onClick={() => void updateStatus(m.id, "SENT")}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 disabled:opacity-60"
                  >
                    Marquer envoyé
                  </button>
                )}
              </div>
            </article>
          ))}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-gray-500">Aucune mission trouvée.</p>
          )}
        </div>
      </section>

      {loading && (
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement...
        </div>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <CastingComposer
        open={composerOpen}
        contact={composerContact}
        brandColumn={composerColumn}
        onClose={() => {
          setComposerOpen(false);
          setComposerContact(null);
          setComposerColumn(null);
        }}
        onSaved={() => {
          void loadMissions();
        }}
        onError={(msg) => showNotice(msg, "error")}
        onSuccess={(msg) => {
          showNotice(msg, "success");
          void loadMissions();
        }}
      />
    </main>
  );
}
