"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Mail, BellOff, BellRing, CheckCircle2, Pencil, Check, X } from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";
import { hasBusinessDaysElapsed } from "@/lib/business-days";

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
  draftLanguage?: "fr" | "en" | null;
  clientLanguage?: "FR" | "EN" | null;
  clientContacts?: Array<{ firstname?: string; lastname?: string; email?: string; role?: string }> | null;
  scheduledSendAt?: string | null;
  sentAt?: string | null;
  sendError?: string | null;
  relanceSentAt?: string | null;
  relanceError?: string | null;
  relanceCancelledAt?: string | null;
  replied?: boolean;
  openCount?: number;
  openedAt?: string | null;
  clickCount?: number;
  clickedAt?: string | null;
  updatedAt?: string;
};

type ScheduledSend = {
  missionId: string;
  brandLabel: string;
  scheduledAt: number;
};

type ContactDraft = { firstname: string; lastname: string; email: string; role: string };

type SearchedContact = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  companyName: string;
  source: "app" | "hubspot";
};

type ContactSearchState = {
  loading: boolean;
  results: SearchedContact[];
  searched: boolean;
};

const REMINDER_BUSINESS_DAYS = 3;

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
  const [contactSearchByMission, setContactSearchByMission] = useState<
    Record<string, ContactSearchState>
  >({});
  const [scheduledSends, setScheduledSends] = useState<ScheduledSend[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const sendingMissionIdsRef = useRef<Set<string>>(new Set());
  // Édition inline du nom de la marque (correction de faute de frappe)
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingBrandValue, setEditingBrandValue] = useState("");

  const visibleStages = useMemo(() => allowedColumns(role), [role]);
  const isCastingManager = role === "CASTING_MANAGER";
  // Rôles autorisés à corriger le nom de la marque sur une carte.
  const canEditBrand =
    role === "ADMIN" || role === "HEAD_OF" || role === "STRATEGY_PLANNER";

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

  useEffect(() => {
    const hydrated: ScheduledSend[] = missions
      .filter((m) => m.scheduledSendAt && !m.sentAt && m.stage === "TO_SEND")
      .map((m) => ({
        missionId: m.id,
        brandLabel: `${m.creatorName} → ${m.targetBrand}`,
        scheduledAt: new Date(m.scheduledSendAt!).getTime(),
      }));
    setScheduledSends((prev) => {
      const byId = new Map(prev.map((s) => [s.missionId, s]));
      for (const s of hydrated) byId.set(s.missionId, s);
      for (const id of Array.from(byId.keys())) {
        const stillPlanned = missions.find(
          (m) => m.id === id && m.scheduledSendAt && !m.sentAt && m.stage === "TO_SEND"
        );
        if (!stillPlanned) byId.delete(id);
      }
      return Array.from(byId.values());
    });
  }, [missions]);

  useEffect(() => {
    if (scheduledSends.length === 0) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [scheduledSends.length]);

  useEffect(() => {
    for (const planned of scheduledSends) {
      if (sendingMissionIdsRef.current.has(planned.missionId)) continue;
      if (planned.scheduledAt > nowTick) continue;
      sendingMissionIdsRef.current.add(planned.missionId);
      void (async () => {
        try {
          const res = await fetch(
            `/api/strategy/contact-missions/${planned.missionId}/send-now`,
            { method: "POST", credentials: "include" }
          );
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            const succ = Number(data.succeeded ?? 0);
            const fail = Number(data.failed ?? 0);
            if (succ > 0 && fail === 0) {
              setSuccess(`Mail envoyé depuis Leyna (${succ} destinataire${succ > 1 ? "s" : ""}).`);
            } else if (succ > 0) {
              setSuccess(`Envoi partiel : ${succ} ok, ${fail} échec(s).`);
            } else {
              setError(data.errors?.join(" | ") || "Aucun mail envoyé.");
            }
          } else if (res.status !== 409) {
            setError(data.error || "Envoi automatique impossible.");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur réseau pendant l'envoi auto.");
        } finally {
          sendingMissionIdsRef.current.delete(planned.missionId);
          setScheduledSends((prev) => prev.filter((s) => s.missionId !== planned.missionId));
          await loadMissions().catch(() => {});
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledSends, nowTick]);

  async function patchMission(
    missionId: string,
    payload: {
      stage?: Stage;
      status?: string;
      targetBrand?: string;
      draftEmailSubject?: string;
      draftEmailBody?: string;
      draftLanguage?: "fr" | "en";
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

  function startEditBrand(m: Mission) {
    setEditingBrandId(m.id);
    setEditingBrandValue(m.targetBrand || "");
  }

  function cancelEditBrand() {
    setEditingBrandId(null);
    setEditingBrandValue("");
  }

  async function saveBrand(m: Mission) {
    const next = editingBrandValue.trim();
    if (!next) {
      setError("Le nom de la marque ne peut pas être vide.");
      return;
    }
    if (next === m.targetBrand) {
      cancelEditBrand();
      return;
    }
    await patchMission(m.id, { targetBrand: next });
    setSuccess(`Marque renommée en « ${next} ».`);
    cancelEditBrand();
  }

  async function searchClientContacts(m: Mission) {
    const brand = String(m.targetBrand || "").trim();
    if (brand.length < 2) {
      setError("Nom de la boîte trop court pour rechercher des contacts.");
      return;
    }
    setError(null);
    setContactSearchByMission((prev) => ({
      ...prev,
      [m.id]: {
        loading: true,
        results: prev[m.id]?.results || [],
        searched: prev[m.id]?.searched || false,
      },
    }));
    try {
      const res = await fetch(
        `/api/marques/contacts?brand=${encodeURIComponent(brand)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Recherche impossible.");
      const results: SearchedContact[] = (Array.isArray(data.contacts) ? data.contacts : [])
        .map((c: Record<string, unknown>) => ({
          id: String(c.id || ""),
          firstname: String(c.firstname || "").trim(),
          lastname: String(c.lastname || "").trim(),
          email: String(c.email || "").trim(),
          role: String(c.role || "").trim(),
          companyName: String(c.companyName || "").trim(),
          source: c.source === "hubspot" ? "hubspot" : "app",
        }))
        .filter((c: SearchedContact) => c.email);
      setContactSearchByMission((prev) => ({
        ...prev,
        [m.id]: { loading: false, results, searched: true },
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setContactSearchByMission((prev) => ({
        ...prev,
        [m.id]: { loading: false, results: [], searched: true },
      }));
    }
  }

  function addSearchedContactToForm(missionId: string, sc: SearchedContact) {
    const email = String(sc.email || "").trim().toLowerCase();
    if (!email) return;
    setContactFormByMission((prev) => {
      const existing = prev[missionId]?.contacts || [];
      if (existing.some((c) => c.email.trim().toLowerCase() === email)) {
        return prev;
      }
      const draft: ContactDraft = {
        firstname: sc.firstname || "",
        lastname: sc.lastname || "",
        email: sc.email || "",
        role: sc.role || "",
      };
      const firstEmptyIndex = existing.findIndex(
        (c) => !c.firstname.trim() && !c.email.trim()
      );
      const nextContacts =
        firstEmptyIndex >= 0
          ? existing.map((c, i) => (i === firstEmptyIndex ? draft : c))
          : [...existing, draft];
      return { ...prev, [missionId]: { open: true, contacts: nextContacts } };
    });
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
      const currentContacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
      const existingEmails = new Set(
        currentContacts
          .map((c) => String(c?.email || "").trim().toLowerCase())
          .filter(Boolean)
      );
      // Pour décider du message de succès, on calcule combien de contacts
      // sont vraiment nouveaux. Sur une mission déjà envoyée, seuls les
      // nouveaux contacts recevront effectivement le mail (le backend skip
      // ceux déjà présents dans `sentMessageIds`).
      const newlyAdded = cleaned.filter((c) => !existingEmails.has(c.email));
      const isAlreadySent = Boolean(m.sentAt);

      // Même système que /outreach : si la langue du client diffère de la
      // langue de rédaction du brouillon, le mail sera traduit automatiquement
      // au moment de l'envoi. On l'indique clairement dans le message de succès.
      const clientLang = (m.clientLanguage || "FR") as "FR" | "EN";
      const draftLang = String(m.draftLanguage || "fr").toUpperCase();
      const willTranslate = clientLang !== draftLang;
      const translateNote = willTranslate
        ? ` 🌐 Traduit automatiquement en ${clientLang === "EN" ? "anglais" : "français"} avant envoi.`
        : "";

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
      await loadMissions();

      // Si aucun email réellement nouveau et que la mission est déjà envoyée,
      // pas la peine d'appeler schedule-send (le backend renverra une erreur
      // « tous déjà contactés »). On s'arrête sur un message d'info.
      if (isAlreadySent && newlyAdded.length === 0) {
        setSuccess(
          `${cleaned.length} contact(s) enregistré(s). Aucun envoi à faire : ces emails ont déjà été contactés sur cette carte.`
        );
        return;
      }

      // Déclenche immédiatement l'envoi auto depuis la boîte de Leyna :
      // 1 mail par contact, dans 30s, avec possibilité d'annuler. Sur une
      // mission déjà envoyée, le backend n'enverra qu'aux NOUVEAUX contacts
      // (les anciens présents dans sentMessageIds sont automatiquement skippés).
      try {
        const sendRes = await fetch(
          `/api/strategy/contact-missions/${m.id}/schedule-send`,
          { method: "POST", credentials: "include" }
        );
        const sendData = await sendRes.json().catch(() => ({}));
        // Cas "deja contacte recemment" : on propose d'envoyer quand meme.
        if (!sendRes.ok && sendData?.canForce) {
          const confirmed = window.confirm(
            `${m.creatorName} → ${m.targetBrand}\n\n${
              sendData.error || "Ce contact a déjà été contacté récemment."
            }\n\nÊtes-vous sûr de vouloir quand même envoyer le mail ?`
          );
          if (confirmed) {
            await scheduleSend(m, true);
            return;
          }
          setSuccess(
            `${cleaned.length} contact(s) enregistré(s). Envoi non effectué (contact déjà contacté récemment).`
          );
          return;
        }
        if (sendRes.ok) {
          const scheduledAt = sendData.scheduledSendAt
            ? new Date(sendData.scheduledSendAt).getTime()
            : Date.now() + 30000;
          const recipientsCount =
            typeof sendData.reachableContacts === "number"
              ? sendData.reachableContacts
              : isAlreadySent
              ? newlyAdded.length
              : cleaned.length;
          setScheduledSends((prev) => [
            ...prev.filter((s) => s.missionId !== m.id),
            {
              missionId: m.id,
              brandLabel: `${m.creatorName} → ${m.targetBrand}`,
              scheduledAt,
            },
          ]);
          if (isAlreadySent) {
            setSuccess(
              `${cleaned.length} contact(s) enregistré(s). Envoi dans 30s uniquement au${recipientsCount > 1 ? "x" : ""} ${recipientsCount} nouveau${recipientsCount > 1 ? "x" : ""} contact${recipientsCount > 1 ? "s" : ""} (les ${existingEmails.size} déjà contacté${existingEmails.size > 1 ? "s" : ""} sont ignoré${existingEmails.size > 1 ? "s" : ""}).${translateNote}`
            );
          } else {
            setSuccess(
              `${cleaned.length} contact(s) enregistré(s). Envoi auto dans 30s depuis leyna@glowupagence.fr.${translateNote}`
            );
          }
          await loadMissions();
        } else {
          setSuccess(
            `${cleaned.length} contact(s) enregistré(s). Envoi auto en attente : ${
              sendData.error || "le brouillon n'est pas encore prêt."
            }`
          );
        }
      } catch {
        setSuccess(
          `${cleaned.length} contact(s) enregistré(s) (envoi auto en attente, brouillon non prêt).`
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function scheduleSend(m: Mission, force = false) {
    setUpdatingId(m.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${m.id}/schedule-send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Cas "deja contacte recemment" : on propose d'envoyer quand meme
        // apres confirmation explicite (bypass du cooldown anti-spam).
        if (data?.canForce && !force) {
          const confirmed = window.confirm(
            `${m.creatorName} → ${m.targetBrand}\n\n${
              data.error || "Ce contact a déjà été contacté récemment."
            }\n\nÊtes-vous sûr de vouloir quand même envoyer le mail ?`
          );
          if (confirmed) {
            setUpdatingId(null);
            await scheduleSend(m, true);
          }
          return;
        }
        throw new Error(data.error || "Planification impossible.");
      }
      const scheduledAt = data.scheduledSendAt
        ? new Date(data.scheduledSendAt).getTime()
        : Date.now() + 30000;
      setScheduledSends((prev) => [
        ...prev.filter((s) => s.missionId !== m.id),
        {
          missionId: m.id,
          brandLabel: `${m.creatorName} → ${m.targetBrand}`,
          scheduledAt,
        },
      ]);
      setSuccess(`Envoi programmé dans 30s vers ${m.targetBrand} (boîte Leyna).`);
      await loadMissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleRelanceCancellation(m: Mission, action: "cancel" | "resume") {
    setUpdatingId(m.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${m.id}/cancel-relance`, {
        method: action === "cancel" ? "POST" : "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Action impossible.");
      }
      setSuccess(
        action === "cancel"
          ? `Relance auto stoppée pour ${m.creatorName} → ${m.targetBrand}.`
          : `Relance auto réactivée pour ${m.creatorName} → ${m.targetBrand}.`
      );
      await loadMissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function cancelSend(missionId: string) {
    setUpdatingId(missionId);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${missionId}/cancel-send`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Annulation impossible.");
      setScheduledSends((prev) => prev.filter((s) => s.missionId !== missionId));
      setSuccess("Envoi annulé. La carte est revenue en « Rédigé ».");
      await loadMissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function openComposer(m: Mission) {
    setUpdatingId(m.id);
    try {
      const localContacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
      setComposerContact({
        company: m.targetBrand,
        contacts: localContacts.map((c, index) => ({
          id: `${m.id}-${index}`,
          firstname: String(c?.firstname || "").trim(),
          lastname: String(c?.lastname || "").trim(),
          email: String(c?.email || "").trim(),
        })),
        initialSubject: String(m.draftEmailSubject || "").trim(),
        initialBodyHtml: String(m.draftEmailBody || "").trim(),
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
    const now = new Date();
    return grouped.SENT.filter((mission) => {
      if (!mission.updatedAt) return false;
      const lastUpdate = new Date(mission.updatedAt);
      if (Number.isNaN(lastUpdate.getTime())) return false;
      return hasBusinessDaysElapsed(lastUpdate, REMINDER_BUSINESS_DAYS, now);
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
          <div className="flex items-center gap-2">
            <Link
              href="/strategy/projet-individuel-talent/mails-envoyes"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              style={
                isCastingManager
                  ? { borderColor: OLD_ROSE, backgroundColor: "#fff", color: LICORICE }
                  : { borderColor: "#D1D5DB", backgroundColor: "#fff", color: "#111827" }
              }
              title="Voir les mails envoyés, ouvertures, clics et relances prévues"
            >
              <Mail className="h-4 w-4" />
              Mails envoyés
            </Link>
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
                {sentReminderCount} relance{sentReminderCount > 1 ? "s" : ""} à faire (3 jours ouvrés sans réponse)
              </p>
            )}
            <div className={isCastingManager ? "mt-3 space-y-3 overflow-y-auto" : "mt-2 space-y-2"}>
              {grouped[stage].map((m) => (
                (() => {
                  const lastUpdate = m.updatedAt ? new Date(m.updatedAt) : null;
                  const reminderDue =
                    m.stage === "SENT" &&
                    lastUpdate !== null &&
                    !Number.isNaN(lastUpdate.getTime()) &&
                    hasBusinessDaysElapsed(lastUpdate, REMINDER_BUSINESS_DAYS);
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
                  {editingBrandId === m.id ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-sm font-semibold shrink-0"
                        style={isCastingManager ? { color: LICORICE } : { color: "#111827" }}
                      >
                        {m.creatorName} →
                      </span>
                      <input
                        autoFocus
                        value={editingBrandValue}
                        onChange={(e) => setEditingBrandValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveBrand(m);
                          if (e.key === "Escape") cancelEditBrand();
                        }}
                        className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-sm"
                        placeholder="Nom de la marque"
                      />
                      <button
                        type="button"
                        disabled={updatingId === m.id}
                        onClick={() => void saveBrand(m)}
                        className="shrink-0 rounded border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 disabled:opacity-50"
                        title="Enregistrer"
                      >
                        {updatingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditBrand}
                        className="shrink-0 rounded border border-gray-200 bg-white p-1 text-gray-500"
                        title="Annuler"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="group/brand flex items-center gap-1 text-sm font-semibold"
                      style={isCastingManager ? { color: LICORICE } : { color: "#111827" }}
                    >
                      <span>
                        {m.creatorName} → {m.targetBrand}
                      </span>
                      {canEditBrand && (
                        <button
                          type="button"
                          onClick={() => startEditBrand(m)}
                          className="opacity-0 group-hover/brand:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-700 transition-opacity"
                          title="Corriger le nom de la marque"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </p>
                  )}
                  <p className="text-xs" style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}>
                    Talent: {m.talentName || "Non renseigné"}
                  </p>
                  {reminderDue && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Rappel 3 jours ouvrés : relance client à faire
                    </p>
                  )}
                  {(() => {
                    const planned = scheduledSends.find((s) => s.missionId === m.id);
                    if (!planned) return null;
                    const remaining = Math.max(0, Math.ceil((planned.scheduledAt - nowTick) / 1000));
                    return (
                      <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        Envoi auto dans {remaining}s
                      </p>
                    );
                  })()}
                  {m.sentAt && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Envoyé via Leyna le {new Date(m.sentAt).toLocaleDateString("fr-FR")}
                      {typeof m.openCount === "number" && m.openCount > 0 ? ` · ${m.openCount} ouverture${m.openCount > 1 ? "s" : ""}` : ""}
                    </p>
                  )}
                  {m.relanceSentAt && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      Relance J+3 envoyée le {new Date(m.relanceSentAt).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                  {m.replied && (
                    <p
                      className="mt-1 inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700"
                      title="Le client a répondu, les relances auto sont stoppées."
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Client a répondu — relances stoppées
                    </p>
                  )}
                  {!m.replied && m.relanceCancelledAt && !m.relanceSentAt && (
                    <p
                      className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                      title={`Stoppée manuellement le ${new Date(m.relanceCancelledAt).toLocaleString("fr-FR")}`}
                    >
                      <BellOff className="h-3 w-3" />
                      Relance auto stoppée
                    </p>
                  )}
                  {m.sendError && (
                    <p className="mt-1 text-[11px] text-red-600" title={m.sendError}>
                      Erreur d'envoi (partielle) — voir détails
                    </p>
                  )}
                  {m.status === "RELANCED" && !m.relanceSentAt && (
                    <p className="mt-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      Relancé
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className="text-xs"
                      style={isCastingManager ? { color: OLD_ROSE } : { color: "#6B7280" }}
                    >
                      Langue client :
                    </span>
                    {(["FR", "EN"] as const).map((lang) => {
                      const active = (m.clientLanguage || "FR") === lang;
                      return (
                        <button
                          key={lang}
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => {
                            if ((m.clientLanguage || "FR") === lang) return;
                            void patchMission(m.id, { clientLanguage: lang });
                          }}
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50"
                          style={
                            active
                              ? { backgroundColor: "#1A1110", color: "#fff", border: "1px solid #1A1110" }
                              : { backgroundColor: "#fff", color: "#6B7280", border: "1px solid #D1D5DB" }
                          }
                          title={
                            lang === "EN"
                              ? "Client anglais : le mail est traduit automatiquement en anglais à l'envoi"
                              : "Client français : le mail est envoyé en français"
                          }
                        >
                          {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
                        </button>
                      );
                    })}
                    {m.clientLanguage === "EN" && (
                      <span className="text-[11px] text-blue-700" title="Traduction automatique FR→EN à l'envoi">
                        · traduit auto
                      </span>
                    )}
                  </div>
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
                    {role === "CASTING_MANAGER" && stage === "DRAFTED_FOR_VALIDATION" && (
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
                        {updatingId === m.id ? "Ouverture..." : "Revoir le mail"}
                      </button>
                    )}
                    {(role === "ADMIN" || role === "HEAD_OF" || role === "STRATEGY_PLANNER") &&
                      (stage === "DRAFTED_FOR_VALIDATION" || stage === "TO_SEND" || stage === "SENT") &&
                      (m.draftEmailSubject || m.draftEmailBody) && (
                        <button
                          type="button"
                          disabled={updatingId === m.id}
                          onClick={() => void openComposer(m)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          {updatingId === m.id ? "Ouverture..." : "Afficher mail"}
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
                          onClick={() => void scheduleSend(m)}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700"
                          title="Valide et déclenche l'envoi auto depuis leyna@glowupagence.fr dans 30s"
                        >
                          {updatingId === m.id ? "Validation..." : "Valider → envoi auto"}
                        </button>
                      </>
                    )}
                    {(role === "HEAD_OF_SALES" || role === "ADMIN" || role === "HEAD_OF") &&
                      stage === "TO_SEND" && (
                        <>
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void openComposer(m)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            {updatingId === m.id ? "Ouverture..." : "Afficher mail"}
                          </button>
                          {m.scheduledSendAt && !m.sentAt && (
                            <button
                              type="button"
                              disabled={updatingId === m.id}
                              onClick={() => void cancelSend(m.id)}
                              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                            >
                              Annuler l'envoi
                            </button>
                          )}
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
                    {(role === "ADMIN" || role === "HEAD_OF" || role === "HEAD_OF_SALES" || role === "STRATEGY_PLANNER") &&
                      stage === "SENT" &&
                      !m.replied &&
                      !m.relanceSentAt && (
                        m.relanceCancelledAt ? (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void toggleRelanceCancellation(m, "resume")}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                            title="Réactiver la relance automatique J+3"
                          >
                            <BellRing className="h-3 w-3" />
                            Réactiver relance
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={updatingId === m.id}
                            onClick={() => void toggleRelanceCancellation(m, "cancel")}
                            className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                            title="Stopper la relance automatique J+3"
                          >
                            <BellOff className="h-3 w-3" />
                            Stopper relance
                          </button>
                        )
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
                      <div className="grid gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-600">
                            Pas les contacts ? Cherche la marque dans l&apos;app et HubSpot
                          </span>
                          <button
                            type="button"
                            disabled={contactSearchByMission[m.id]?.loading}
                            onClick={() => void searchClientContacts(m)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                          >
                            {contactSearchByMission[m.id]?.loading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Rechercher « {m.targetBrand} »
                          </button>
                        </div>
                        {contactSearchByMission[m.id]?.searched &&
                          !contactSearchByMission[m.id]?.loading &&
                          (contactSearchByMission[m.id]?.results.length ?? 0) === 0 && (
                            <p className="text-xs text-gray-500">
                              Aucun contact trouvé pour « {m.targetBrand} » dans l&apos;app ni
                              dans HubSpot. Saisis-les manuellement ci-dessous.
                            </p>
                          )}
                        {(contactSearchByMission[m.id]?.results.length ?? 0) > 0 && (
                          <ul className="grid gap-1">
                            {contactSearchByMission[m.id]?.results.map((sc) => {
                              const already = (contactFormByMission[m.id]?.contacts || []).some(
                                (c) =>
                                  c.email.trim().toLowerCase() ===
                                  sc.email.trim().toLowerCase()
                              );
                              return (
                                <li
                                  key={sc.id || sc.email}
                                  className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-white px-2 py-1"
                                >
                                  <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 truncate text-xs font-medium text-gray-800">
                                      <span className="truncate">
                                        {[sc.firstname, sc.lastname].filter(Boolean).join(" ") ||
                                          sc.email}
                                      </span>
                                      <span
                                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                          sc.source === "hubspot"
                                            ? "bg-orange-50 text-orange-600"
                                            : "bg-indigo-50 text-indigo-600"
                                        }`}
                                      >
                                        {sc.source === "hubspot" ? "HubSpot" : "App"}
                                      </span>
                                    </p>
                                    <p className="truncate text-[11px] text-gray-500">
                                      {sc.email}
                                      {sc.companyName ? ` · ${sc.companyName}` : ""}
                                      {sc.role ? ` · ${sc.role}` : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={already}
                                    onClick={() => addSearchedContactToForm(m.id, sc)}
                                    className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 disabled:opacity-50"
                                  >
                                    {already ? "Ajouté" : "+ Ajouter"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
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

      {scheduledSends.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[360px] flex-col gap-2">
          {scheduledSends.map((planned) => {
            const remaining = Math.max(0, Math.ceil((planned.scheduledAt - nowTick) / 1000));
            return (
              <div
                key={planned.missionId}
                className="rounded-xl border border-blue-200 bg-white p-3 shadow-lg"
              >
                <p className="text-sm font-semibold text-blue-900">
                  Envoi auto dans {remaining}s
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {planned.brandLabel} · depuis leyna@glowupagence.fr
                </p>
                <button
                  type="button"
                  onClick={() => void cancelSend(planned.missionId)}
                  disabled={remaining <= 0}
                  className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            );
          })}
        </div>
      )}

      <CastingComposer
        open={composerOpen}
        contact={composerContact}
        brandColumn={"todo"}
        useHubspot={false}
        onClose={() => {
          setComposerOpen(false);
          setComposerContact(null);
        }}
        onSaved={(
          status: "pret" | "en_cours" | "reset",
          draft?: { subject: string; bodyHtml: string; language?: "fr" | "en" }
        ) => {
          const missionId = composerContact?.missionBrief?.id as string | undefined;
          if (!missionId) return;
          const draftLanguage: "fr" | "en" = draft?.language === "en" ? "en" : "fr";
          if (status === "pret") {
            void patchMission(missionId, {
              stage: "DRAFTED_FOR_VALIDATION",
              status: "EMAIL_DRAFTED",
              draftEmailSubject: draft?.subject ?? "",
              draftEmailBody: draft?.bodyHtml ?? "",
              draftLanguage,
            });
          } else if (status === "en_cours") {
            void patchMission(missionId, {
              stage: "TO_DRAFT",
              status: "EMAIL_DRAFTED",
              draftEmailSubject: draft?.subject ?? "",
              draftEmailBody: draft?.bodyHtml ?? "",
              draftLanguage,
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
