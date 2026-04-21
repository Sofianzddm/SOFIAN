"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { HubSpotContactCasting } from "@/lib/hubspot";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";

type Role = "STRATEGY_PLANNER" | "CASTING_MANAGER" | "HEAD_OF_SALES" | "HEAD_OF" | "ADMIN";
type Stage =
  | "STRATEGY_DEFINED"
  | "TO_DRAFT"
  | "DRAFTED_FOR_VALIDATION"
  | "TO_SEND"
  | "SENT"
  | "RESPONSE_RECEIVED"
  | "IN_NEGOTIATION"
  | "WON"
  | "LOST";

type Mission = {
  id: string;
  campaignId: string | null;
  campaignTitle: string | null;
  talentId?: string | null;
  talentName?: string | null;
  creatorName: string;
  targetBrand: string;
  strategyReason: string;
  recommendedAngle: string | null;
  objective: string | null;
  dos: string | null;
  donts: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "READY_FOR_CASTING" | "EMAIL_DRAFTED" | "APPROVED_BY_SALES" | "SENT" | "RELANCED" | "CANCELLED";
  stage: Stage;
  draftEmailSubject?: string | null;
  draftEmailBody?: string | null;
  clientLanguage?: "FR" | "EN" | null;
  clientContacts?: Array<{ firstname?: string; lastname?: string; email?: string; role?: string }> | null;
  updatedAt?: string;
};

type ContactDraft = { firstname: string; lastname: string; email: string; role: string };

const REMINDER_DELAY_HOURS = 72;
const REMINDER_DELAY_MS = REMINDER_DELAY_HOURS * 60 * 60 * 1000;

type TalentOption = { id: string; name: string };
const ALL_TALENTS = "__ALL_TALENTS__";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const STAGE_LABEL: Record<Stage, string> = {
  STRATEGY_DEFINED: "Stratégie définie",
  TO_DRAFT: "À rédiger",
  DRAFTED_FOR_VALIDATION: "Rédigé (validation)",
  TO_SEND: "À envoyer",
  SENT: "Envoyé",
  RESPONSE_RECEIVED: "Réponse reçue",
  IN_NEGOTIATION: "En négo",
  WON: "Gagné",
  LOST: "Perdu",
};

function allowedColumns(role: Role | null): Stage[] {
  if (role === "CASTING_MANAGER") return ["TO_DRAFT", "DRAFTED_FOR_VALIDATION"];
  if (role === "HEAD_OF_SALES") return ["DRAFTED_FOR_VALIDATION", "TO_SEND"];
  if (role === "STRATEGY_PLANNER") {
    return [
      "STRATEGY_DEFINED",
      "TO_DRAFT",
      "DRAFTED_FOR_VALIDATION",
      "TO_SEND",
      "SENT",
      "RESPONSE_RECEIVED",
      "IN_NEGOTIATION",
      "WON",
      "LOST",
    ];
  }
  return [
    "STRATEGY_DEFINED",
    "TO_DRAFT",
    "DRAFTED_FOR_VALIDATION",
    "TO_SEND",
    "SENT",
    "RESPONSE_RECEIVED",
    "IN_NEGOTIATION",
    "WON",
    "LOST",
  ];
}

function stageLabelForRole(stage: Stage, role: Role | null): string {
  if (role === "CASTING_MANAGER" && stage === "DRAFTED_FOR_VALIDATION") {
    return "Prêt";
  }
  return STAGE_LABEL[stage];
}

function columnAccentColor(stage: Stage): string {
  if (stage === "TO_DRAFT") return OLD_ROSE;
  if (stage === "DRAFTED_FOR_VALIDATION") return TEA_GREEN;
  if (stage === "TO_SEND") return "#BFDBFE";
  if (stage === "SENT") return "#86EFAC";
  if (stage === "LOST") return "#FCA5A5";
  return "#D1B070";
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

export function ProspectingPipelineClient() {
  const [role, setRole] = useState<Role | null>(null);
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [selectedTalentId, setSelectedTalentId] = useState(ALL_TALENTS);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContact, setComposerContact] = useState<any>(null);
  const [contactFormByMission, setContactFormByMission] = useState<
    Record<string, { open: boolean; contacts: ContactDraft[] }>
  >({});

  const visibleStages = useMemo(() => allowedColumns(role), [role]);
  const isCastingManager = role === "CASTING_MANAGER";

  async function loadRole() {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.role === "string") {
      setRole(data.role as Role);
    }
  }

  async function loadTalents() {
    const res = await fetch("/api/talents?presskit=true", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur chargement talents");
    const rows = Array.isArray(data.talents) ? data.talents : [];
    const mapped = rows.map((t: any) => ({
      id: String(t.id),
      name: String(t.name || `${t.prenom || ""} ${t.nom || ""}`.trim() || "Talent"),
    }));
    setTalents(mapped);
  }

  async function loadMissions() {
    const isAllTalents = selectedTalentId === ALL_TALENTS || !selectedTalentId;
    const mine = role === "STRATEGY_PLANNER" ? "&mine=1" : "";
    const talentFilter = isAllTalents ? "" : `talentId=${encodeURIComponent(selectedTalentId)}&`;
    const res = await fetch(
      `/api/strategy/contact-missions?${talentFilter}${mine}`,
      { credentials: "include" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur missions");
    setMissions(Array.isArray(data.missions) ? (data.missions as Mission[]) : []);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      await loadRole();
      await loadTalents();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadMissions().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTalentId, role]);

  async function patchMission(
    missionId: string,
    payload: {
      stage?: Stage;
      status?: string;
      draftEmailSubject?: string;
      draftEmailBody?: string;
      clientLanguage?: "FR" | "EN" | "";
      clientContacts?: Array<{ firstname?: string; lastname?: string; email?: string; role?: string }>;
    }
  ) {
    setUpdatingId(missionId);
    try {
      const res = await fetch("/api/strategy/contact-missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible.");
      await loadMissions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function addClientContact(m: Mission) {
    const form = contactFormByMission[m.id];
    const contactsDraft = Array.isArray(form?.contacts) ? form.contacts : [];
    const cleaned = contactsDraft
      .map((c) => ({
        firstname: String(c.firstname || "").trim(),
        lastname: String(c.lastname || "").trim(),
        email: String(c.email || "").trim().toLowerCase(),
        role: String(c.role || "").trim(),
      }))
      .filter((c) => c.firstname && c.email);

    if (cleaned.length === 0) {
      setError("Ajoute au moins un contact avec prénom et email.");
      return;
    }
    setUpdatingId(m.id);
    setError(null);
    setSuccess(null);
    try {
      const results = await Promise.all(
        cleaned.map(async (contact) => {
          const res = await fetch("/api/hubspot/casting/brand-contacts", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brand: m.targetBrand,
              firstname: contact.firstname,
              lastname: contact.lastname,
              email: contact.email,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Création contact impossible.");
          return data;
        })
      );
      const currentContacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
      const byEmail = new Map<string, { firstname?: string; lastname?: string; email?: string; role?: string }>();
      for (const c of currentContacts) {
        const email = String(c?.email || "").trim().toLowerCase();
        if (email) byEmail.set(email, c);
      }
      for (const c of cleaned) {
        byEmail.set(c.email, c);
      }
      const nextContacts = Array.from(byEmail.values());
      await patchMission(m.id, {
        clientContacts: nextContacts,
        clientLanguage: (m.clientLanguage || "FR") as "FR" | "EN",
      });
      setContactFormByMission((prev) => ({
        ...prev,
        [m.id]: { open: false, contacts: [{ firstname: "", lastname: "", email: "", role: "" }] },
      }));
      const reusedCount = results.filter((r) => Boolean(r?.alreadyExisted)).length;
      if (reusedCount > 0) {
        setSuccess(
          `${cleaned.length} contact(s) traité(s) dont ${reusedCount} déjà existant(s) dans HubSpot.`
        );
      } else {
        setSuccess(`${cleaned.length} contact(s) client enregistré(s) avec succès.`);
      }
      await loadMissions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function openComposer(m: Mission) {
    setUpdatingId(m.id);
    try {
      const res = await fetch(
        `/api/hubspot/casting/brand-contacts?brand=${encodeURIComponent(m.targetBrand)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Contacts HubSpot introuvables.");
      const contactsRaw = Array.isArray(data.contacts)
        ? (data.contacts as HubSpotContactCasting[])
        : [];

      const initialFromContacts = pickInitialCastingDraft(contactsRaw);
      setComposerContact({
        company: m.targetBrand,
        contacts: contactsRaw.map((c) => ({
          id: c.id,
          firstname: c.firstname,
          lastname: c.lastname,
          email: c.email,
        })),
        initialSubject:
          String(m.draftEmailSubject || "").trim() ||
          initialFromContacts.initialSubject,
        initialBodyHtml:
          String(m.draftEmailBody || "").trim() ||
          initialFromContacts.initialBodyHtml,
        missionBrief: {
          id: m.id,
          creatorName: m.creatorName,
          targetBrand: m.targetBrand,
          strategyReason: m.strategyReason,
          recommendedAngle: m.recommendedAngle,
          objective: m.objective,
          dos: m.dos,
          donts: m.donts,
          priority: m.priority,
          status: m.status,
          clientLanguage: m.clientLanguage || null,
          clientContacts: Array.isArray(m.clientContacts) ? m.clientContacts : [],
        },
      });
      setComposerOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  const grouped = useMemo(() => {
    const map: Record<Stage, Mission[]> = {
      STRATEGY_DEFINED: [],
      TO_DRAFT: [],
      DRAFTED_FOR_VALIDATION: [],
      TO_SEND: [],
      SENT: [],
      RESPONSE_RECEIVED: [],
      IN_NEGOTIATION: [],
      WON: [],
      LOST: [],
    };
    for (const m of missions) map[m.stage].push(m);
    return map;
  }, [missions]);

  const sentReminderCount = useMemo(() => {
    const now = Date.now();
    return grouped.SENT.filter((mission) => {
      const lastUpdate = mission.updatedAt ? new Date(mission.updatedAt).getTime() : NaN;
      if (!Number.isFinite(lastUpdate)) return false;
      return now - lastUpdate >= REMINDER_DELAY_MS;
    }).length;
  }, [grouped.SENT]);

  return (
    <main
      className="space-y-4 p-6"
      style={isCastingManager ? { fontFamily: "Switzer, system-ui, sans-serif" } : undefined}
    >
      <section
        className="rounded-2xl border p-4"
        style={
          isCastingManager
            ? { backgroundColor: OLD_LACE, borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }
            : undefined
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1
              className="text-2xl font-semibold"
              style={
                isCastingManager
                  ? { color: LICORICE, fontFamily: "Spectral, serif" }
                  : { color: "#111827" }
              }
            >
              Pipeline prospection talent
            </h1>
            <p className="text-sm" style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}>
              Choisis un talent pour voir toutes les marques contactées.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={
              isCastingManager
                ? { borderColor: OLD_ROSE, backgroundColor: "#fff", color: LICORICE }
                : undefined
            }
          >
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </button>
        </div>
        <div className="mt-3">
          <select
            value={selectedTalentId}
            onChange={(e) => setSelectedTalentId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={
              isCastingManager
                ? { borderColor: OLD_ROSE, backgroundColor: "#fff", color: LICORICE }
                : undefined
            }
          >
            <option value={ALL_TALENTS}>Tous les talents</option>
            {talents.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={`grid grid-cols-1 gap-3 ${isCastingManager ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {visibleStages.map((stage) => (
          <div
            key={stage}
            className={`rounded-xl border p-3 ${isCastingManager ? "min-h-[300px] max-h-[calc(100vh-220px)] flex flex-col" : "bg-white border-gray-200"}`}
            style={
              isCastingManager
                ? {
                    backgroundColor: OLD_LACE,
                    borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                  }
                : undefined
            }
          >
            <div
              className={isCastingManager ? "px-1 pb-2 border-b flex items-center justify-between" : ""}
              style={
                isCastingManager
                  ? { borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }
                  : undefined
              }
            >
              <h2
                className={isCastingManager ? "text-lg font-semibold" : "text-sm font-semibold text-gray-900"}
                style={isCastingManager ? { color: LICORICE, fontFamily: "Spectral, serif" } : undefined}
              >
                {isCastingManager ? stageLabelForRole(stage, role) : `${stageLabelForRole(stage, role)} (${grouped[stage].length})`}
              </h2>
              {isCastingManager ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white">{grouped[stage].length}</span>
              ) : null}
            </div>
            {stage === "SENT" && sentReminderCount > 0 && (
              <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                {sentReminderCount} relance{sentReminderCount > 1 ? "s" : ""} à faire (72h sans réponse)
              </p>
            )}
            <div className={isCastingManager ? "mt-3 space-y-3 overflow-y-auto" : "mt-2 space-y-2"}>
              {grouped[stage].map((m) => (
                (() => {
                  const lastUpdate = m.updatedAt ? new Date(m.updatedAt).getTime() : NaN;
                  const reminderDue = m.stage === "SENT" && Number.isFinite(lastUpdate) && Date.now() - lastUpdate >= REMINDER_DELAY_MS;
                  return (
                <article
                  key={m.id}
                  className={isCastingManager ? "bg-white rounded-xl border shadow-sm p-3" : "rounded-lg border border-gray-200 p-2"}
                  style={
                    isCastingManager
                      ? {
                          borderColor: `color-mix(in srgb, ${OLD_ROSE} 30%, transparent)`,
                          borderLeft: `4px solid ${columnAccentColor(stage)}`,
                        }
                      : undefined
                  }
                >
                  <p className="text-sm font-semibold" style={isCastingManager ? { color: LICORICE } : { color: "#111827" }}>
                    {m.creatorName} → {m.targetBrand}
                  </p>
                  <p className="text-xs" style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}>
                    Talent: {m.talentName || "Non renseigné"}
                  </p>
                  {reminderDue && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Rappel 72h: relance client à faire
                    </p>
                  )}
                  {m.status === "RELANCED" && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      Relancé
                    </p>
                  )}
                  {m.clientLanguage && (
                    <p className="text-xs" style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}>
                      Client {m.clientLanguage === "FR" ? "français" : "anglais"}
                    </p>
                  )}
                  {Array.isArray(m.clientContacts) && m.clientContacts.length > 0 && (
                    <p className="text-xs" style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}>
                      {m.clientContacts.length} contact{m.clientContacts.length > 1 ? "s" : ""} enregistré
                    </p>
                  )}
                  <p className="text-xs" style={isCastingManager ? { color: LICORICE, opacity: 0.85 } : { color: "#4B5563" }}>
                    {m.strategyReason}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {role === "CASTING_MANAGER" && stage === "TO_DRAFT" && (
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() => void openComposer(m)}
                        className="rounded px-2 py-1 text-xs"
                        style={
                          isCastingManager
                            ? { border: `1px solid ${OLD_ROSE}`, backgroundColor: OLD_LACE, color: LICORICE }
                            : { border: "1px solid #D1D5DB" }
                        }
                      >
                        {updatingId === m.id ? "Ouverture..." : "Rédiger"}
                      </button>
                    )}
                    {role === "HEAD_OF_SALES" && stage === "DRAFTED_FOR_VALIDATION" && (
                      <>
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void openComposer(m)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          {updatingId === m.id ? "Ouverture..." : "Afficher mail"}
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void patchMission(m.id, { stage: "TO_SEND", status: "APPROVED_BY_SALES" })}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700"
                        >
                          Valider (à envoyer)
                        </button>
                      </>
                    )}
                    {role === "HEAD_OF_SALES" && stage === "TO_SEND" && (
                      <>
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void openComposer(m)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          {updatingId === m.id ? "Ouverture..." : "Afficher mail"}
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void patchMission(m.id, { stage: "SENT", status: "SENT" })}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                        >
                          Marquer envoyé
                        </button>
                      </>
                    )}
                    {(role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_SALES" || role === "STRATEGY_PLANNER") &&
                      stage === "SENT" &&
                      reminderDue && (
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void patchMission(m.id, { stage: "SENT", status: "RELANCED" })}
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                        >
                          Relancer
                        </button>
                      )}
                    {role === "ADMIN" && (
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() =>
                          setContactFormByMission((prev) => ({
                            ...prev,
                            [m.id]: {
                              open: !prev[m.id]?.open,
                              contacts:
                                prev[m.id]?.contacts?.length
                                  ? prev[m.id].contacts
                                  : [{ firstname: "", lastname: "", email: "", role: "" }],
                            },
                          }))
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        Ajouter contact client
                      </button>
                    )}
                    {(role === "ADMIN" || role === "HEAD_OF") && (
                      <>
                        {stage !== "WON" && (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void patchMission(m.id, { stage: "WON" })}
                            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                          >
                            Gagné
                          </button>
                        )}
                        {stage !== "LOST" && (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void patchMission(m.id, { stage: "LOST" })}
                            className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                          >
                            Perdu
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {role === "ADMIN" && contactFormByMission[m.id]?.open && (
                    <div className="mt-2 grid gap-2 rounded-lg border border-gray-200 p-2">
                      {(contactFormByMission[m.id]?.contacts || []).map((contact, index) => (
                        <div key={`${m.id}-contact-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                          <input
                            value={contact.firstname}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, firstname: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Prénom*"
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={contact.lastname}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, lastname: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Nom"
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={contact.email}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, email: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Email*"
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <input
                            value={contact.role}
                            onChange={(e) =>
                              setContactFormByMission((prev) => ({
                                ...prev,
                                [m.id]: {
                                  open: true,
                                  contacts: (prev[m.id]?.contacts || []).map((c, i) =>
                                    i === index ? { ...c, role: e.target.value } : c
                                  ),
                                },
                              }))
                            }
                            placeholder="Rôle / Poste"
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setContactFormByMission((prev) => ({
                            ...prev,
                            [m.id]: {
                              open: true,
                              contacts: [
                                ...(prev[m.id]?.contacts || []),
                                { firstname: "", lastname: "", email: "", role: "" },
                              ],
                            },
                          }))
                        }
                        className="text-left text-xs font-medium text-[#C08B8B]"
                      >
                        + Ajouter un contact
                      </button>
                      <select
                        value={m.clientLanguage || "FR"}
                        onChange={(e) =>
                          void patchMission(m.id, {
                            clientLanguage: e.target.value === "EN" ? "EN" : "FR",
                          })
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="FR">Client français</option>
                        <option value="EN">Client anglais</option>
                      </select>
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() => void addClientContact(m)}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                      >
                        Enregistrer contact
                      </button>
                    </div>
                  )}
                </article>
                  );
                })()
              ))}
              {grouped[stage].length === 0 && (
                <p
                  className={`text-xs ${isCastingManager ? "text-center py-8 opacity-70" : "text-gray-500"}`}
                  style={isCastingManager ? { color: OLD_ROSE } : undefined}
                >
                  Aucune carte.
                </p>
              )}
            </div>
          </div>
        ))}
      </section>

      {loading && (
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement...
        </div>
      )}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <CastingComposer
        open={composerOpen}
        contact={composerContact}
        brandColumn={"todo"}
        onClose={() => {
          setComposerOpen(false);
          setComposerContact(null);
        }}
        onSaved={(
          status: "pret" | "en_cours" | "reset",
          draft?: { subject: string; bodyHtml: string }
        ) => {
          const missionId = composerContact?.missionBrief?.id as string | undefined;
          if (!missionId) return;
          if (status === "pret") {
            void patchMission(missionId, {
              stage: "DRAFTED_FOR_VALIDATION",
              status: "EMAIL_DRAFTED",
              draftEmailSubject: draft?.subject ?? "",
              draftEmailBody: draft?.bodyHtml ?? "",
            });
          } else if (status === "en_cours") {
            void patchMission(missionId, {
              stage: "TO_DRAFT",
              status: "EMAIL_DRAFTED",
              draftEmailSubject: draft?.subject ?? "",
              draftEmailBody: draft?.bodyHtml ?? "",
            });
          }
        }}
        onError={(msg) => setError(msg)}
        onSuccess={() => {
          void loadMissions();
        }}
      />
    </main>
  );
}
