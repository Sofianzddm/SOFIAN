"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Mail,
  Search,
  Calendar,
  X,
  Eye,
  MousePointerClick,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  BellOff,
  BellRing,
  Send,
} from "lucide-react";
import { businessDeadlineWithJitter } from "@/lib/business-days";

const RELANCE_BUSINESS_DAYS = 3;

type Recipient = { firstname: string; lastname: string; email: string; role: string };

type SentMission = {
  id: string;
  talentId: string | null;
  talentName: string;
  talentPhoto: string | null;
  creatorName: string;
  targetBrand: string;
  campaignTitle: string | null;
  priority: string;
  stage: string;
  status: string;
  subject: string | null;
  body: string | null;
  clientLanguage: "FR" | "EN" | null;
  recipients: Recipient[];
  recipientEmails: string[];
  failedEmails: { email: string; error: string }[];
  sentAt: string | null;
  sendError: string | null;
  openedAt: string | null;
  lastOpenAt: string | null;
  openCount: number;
  clickedAt: string | null;
  lastClickAt: string | null;
  lastClickUrl: string | null;
  clickCount: number;
  relanceSentAt: string | null;
  relanceError: string | null;
  relanceCancelledAt: string | null;
  replied: boolean;
};

type ApiResponse = {
  mails: SentMission[];
  stats: { total: number; week: number; month: number };
  talentOptions: { id: string; name: string }[];
};

type Period = "all" | "week" | "month";

const ALLOWED = ["HEAD_OF_SALES", "ADMIN", "HEAD_OF", "CASTING_MANAGER", "STRATEGY_PLANNER"];
const CAN_MANAGE_RELANCE = ["HEAD_OF_SALES", "ADMIN", "HEAD_OF", "STRATEGY_PLANNER"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeDate(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / (1000 * 60 * 60));
  if (h < 1) {
    const min = Math.max(1, Math.floor(diff / (1000 * 60)));
    return `il y a ${min} min`;
  }
  if (h < 24) return `il y a ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `il y a ${days}j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

/**
 * Relance unique J+3 (jours ouvrés Lun-Ven, Europe/Paris), calculée À L'HEURE
 * près à partir de l'envoi initial, avec un décalage anti-robot propre à chaque
 * mission : un mail parti à 17h sera relancé un peu après 17h le 3e jour ouvré
 * (jamais pile à la même minute). Le cron tourne toutes les 15 min ; si
 * l'échéance est passée, la relance part au prochain passage (quelques minutes).
 */
function computeNextRelance(
  seed: string,
  sentAt: string | null,
  relanceSentAt: string | null,
  replied: boolean,
  relanceCancelledAt: string | null = null
): { scheduledAt: Date; isOverdue: boolean } | null {
  if (!sentAt || replied || relanceSentAt || relanceCancelledAt) return null;
  const sent = new Date(sentAt);
  const eligibleAt = businessDeadlineWithJitter(sent, RELANCE_BUSINESS_DAYS, seed);
  const now = new Date();
  if (eligibleAt > now) return { scheduledAt: eligibleAt, isOverdue: false };
  // Échéance dépassée → partira au prochain passage du cron (toutes les 15 min).
  return { scheduledAt: now, isOverdue: true };
}

function formatRelativeFuture(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "imminente";
  const minutes = Math.round(diffMs / (1000 * 60));
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `dans ${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "demain";
  return `dans ${days}j`;
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function RelanceStatus({
  id,
  sentAt,
  relanceSentAt,
  replied,
  relanceCancelledAt,
}: {
  id: string;
  sentAt: string | null;
  relanceSentAt: string | null;
  replied: boolean;
  relanceCancelledAt: string | null;
}) {
  if (replied) {
    return (
      <div
        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
        title="Le client a répondu, plus aucune relance ne sera envoyée."
      >
        <CheckCircle2 className="h-3 w-3" />
        Stoppée — client a répondu
      </div>
    );
  }

  if (relanceSentAt) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
        title={`Envoyée le ${formatDate(relanceSentAt)}`}
      >
        <CheckCircle2 className="h-3 w-3" />
        Relance · {relativeDate(relanceSentAt)}
      </span>
    );
  }

  if (relanceCancelledAt) {
    return (
      <div
        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
        title={`Stoppée manuellement le ${formatDate(relanceCancelledAt)}`}
      >
        <BellOff className="h-3 w-3" />
        Stoppée manuellement
      </div>
    );
  }

  const next = computeNextRelance(id, sentAt, relanceSentAt, replied, relanceCancelledAt);
  if (!next) return <span className="text-xs text-slate-400">—</span>;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        next.isOverdue
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
      title={`Programmée le ${next.scheduledAt.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })} (cron toutes les 15 min, jours ouvrés)`}
    >
      {next.isOverdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      Relance J+3 {formatRelativeFuture(next.scheduledAt)}
    </span>
  );
}

function RelanceTimeline({ mail }: { mail: SentMission }) {
  type Step = {
    label: string;
    state: "done" | "pending" | "stopped";
    date?: string;
    hint?: string;
  };

  const steps: Step[] = [
    {
      label: "Mail initial envoyé",
      state: "done",
      date: mail.sentAt
        ? `${formatDate(mail.sentAt)} (${relativeDate(mail.sentAt)})`
        : undefined,
    },
  ];

  if (mail.replied) {
    steps.push({
      label: "Client a répondu — relance stoppée",
      state: "stopped",
      hint: "Détecté automatiquement par le cron via Gmail.",
    });
  } else if (mail.relanceSentAt) {
    steps.push({
      label: "Relance J+3 envoyée",
      state: "done",
      date: `${formatDate(mail.relanceSentAt)} (${relativeDate(mail.relanceSentAt)})`,
    });
  } else if (mail.relanceCancelledAt) {
    steps.push({
      label: "Relance auto stoppée manuellement",
      state: "stopped",
      date: `${formatDate(mail.relanceCancelledAt)} (${relativeDate(mail.relanceCancelledAt)})`,
      hint: "Tu peux la réactiver à tout moment depuis la table ou la pipeline.",
    });
  } else {
    const next = computeNextRelance(
      mail.id,
      mail.sentAt,
      mail.relanceSentAt,
      mail.replied,
      mail.relanceCancelledAt
    );
    if (next) {
      steps.push({
        label: "Relance J+3",
        state: "pending",
        date: `Prévue ${formatRelativeFuture(next.scheduledAt)} — ${next.scheduledAt.toLocaleString(
          "fr-FR",
          { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
        )}`,
        hint: next.isOverdue
          ? "Échéance dépassée, partira dans quelques minutes (cron toutes les 15 min)."
          : "À l'heure d'envoi + 3 jours ouvrés (cron toutes les 15 min, week-ends exclus).",
      });
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Relance automatique
      </p>
      <ol className="space-y-2">
        {steps.map((s, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                s.state === "done"
                  ? "bg-emerald-100 text-emerald-700"
                  : s.state === "stopped"
                    ? "bg-sky-100 text-sky-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {s.state === "pending" ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            </span>
            <div className="flex-1">
              <p className="font-medium text-slate-800">{s.label}</p>
              {s.date ? <p className="text-slate-600">{s.date}</p> : null}
              {s.hint ? <p className="text-[11px] text-slate-400">{s.hint}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EngagementBadges({
  openCount,
  lastOpenAt,
  clickCount,
  lastClickAt,
}: {
  openCount: number;
  lastOpenAt: string | null;
  clickCount: number;
  lastClickAt: string | null;
}) {
  const opened = openCount > 0;
  const clicked = clickCount > 0;
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
          opened
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-slate-50 text-slate-400 border border-slate-200"
        }`}
        title={
          opened && lastOpenAt
            ? `Dernière ouverture : ${new Date(lastOpenAt).toLocaleString("fr-FR")}`
            : "Pas encore ouvert"
        }
      >
        <Eye className="h-3 w-3" />
        {opened ? (
          <span>
            Ouvert{openCount > 1 ? ` · ${openCount}×` : ""}
            {lastOpenAt ? ` · ${relativeDate(lastOpenAt)}` : ""}
          </span>
        ) : (
          <span>Non ouvert</span>
        )}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
          clicked
            ? "bg-amber-50 text-amber-700 border border-amber-200"
            : "bg-slate-50 text-slate-400 border border-slate-200"
        }`}
        title={
          clicked && lastClickAt
            ? `Dernier clic : ${new Date(lastClickAt).toLocaleString("fr-FR")}`
            : "Aucun clic"
        }
      >
        <MousePointerClick className="h-3 w-3" />
        {clicked ? (
          <span>Cliqué{clickCount > 1 ? ` · ${clickCount}×` : ""}</span>
        ) : (
          <span>Aucun clic</span>
        )}
      </span>
    </div>
  );
}

type RelancePreview = {
  mission: SentMission;
  subject: string;
  body: string;
  recipients: { email: string; firstname: string; lastname: string }[];
};

export default function PipelineMailsEnvoyesPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [talentFilter, setTalentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openMail, setOpenMail] = useState<SentMission | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [relancePreview, setRelancePreview] = useState<RelancePreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [sendingRelance, setSendingRelance] = useState(false);

  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const forbidden = status !== "loading" && !ALLOWED.includes(role);
  const canManageRelance = CAN_MANAGE_RELANCE.includes(role);

  async function openRelancePreview(mail: SentMission) {
    setPreviewLoadingId(mail.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${mail.id}/relance-now`, {
        method: "GET",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Impossible de générer la prévisualisation.");
      const draft = json.draft as {
        subject: string;
        bodyTemplate: string;
        recipients: { email: string; firstname: string; lastname: string; body: string }[];
      };
      setRelancePreview({
        mission: mail,
        subject: draft.subject,
        body: draft.bodyTemplate,
        recipients: draft.recipients.map((r) => ({
          email: r.email,
          firstname: r.firstname,
          lastname: r.lastname,
        })),
      });
    } catch (e) {
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Erreur réseau.",
      });
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function sendRelanceNow() {
    if (!relancePreview) return;
    if (relancePreview.recipients.length === 0) {
      setFeedback({ kind: "error", message: "Aucun destinataire valide pour la relance." });
      return;
    }
    if (
      !confirm(
        `Envoyer la relance maintenant à ${relancePreview.recipients.length} destinataire(s) ?`
      )
    )
      return;

    setSendingRelance(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/strategy/contact-missions/${relancePreview.mission.id}/relance-now`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            subject: relancePreview.subject,
            body: relancePreview.body,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error || "L'envoi a échoué (Gmail / quota / autorisations).");

      console.info("[relance-now] outcome:", json.outcome);

      const okCount = json.outcome?.succeeded ?? 0;
      const attempts = json.outcome?.attempted ?? 0;
      const failures: string[] = json.outcome?.errors ?? [];

      const nowIso = new Date().toISOString();
      setData((prev) =>
        prev
          ? {
              ...prev,
              mails: prev.mails.map((m) =>
                m.id === relancePreview.mission.id
                  ? { ...m, relanceSentAt: nowIso, relanceCancelledAt: null }
                  : m
              ),
            }
          : prev
      );
      setOpenMail((prev) =>
        prev && prev.id === relancePreview.mission.id
          ? { ...prev, relanceSentAt: nowIso, relanceCancelledAt: null }
          : prev
      );
      setRelancePreview(null);

      // Refetch DB-truth pour que le badge "Relance · il y a X" reflète bien
      // la valeur côté serveur (même après reload).
      await refetchList();

      if (failures.length > 0) {
        setFeedback({
          kind: "error",
          message: `Relance partielle (${okCount}/${attempts}) pour ${relancePreview.mission.targetBrand}. Erreur(s) : ${failures.join(" | ")}`,
        });
      } else {
        setFeedback({
          kind: "success",
          message: `✓ Relance envoyée à ${okCount}/${attempts} destinataire(s) pour ${relancePreview.mission.targetBrand}.`,
        });
      }
    } catch (e) {
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Erreur réseau.",
      });
    } finally {
      setSendingRelance(false);
    }
  }

  async function markAsSent(mail: SentMission) {
    if (
      !confirm(
        `Marquer la mission "${mail.targetBrand}" comme relancée sans envoyer de mail ?`
      )
    )
      return;
    setSendingRelance(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/strategy/contact-missions/${mail.id}/mark-relance-sent`,
        { method: "POST", credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setFeedback({
        kind: "success",
        message: `✓ Mission ${mail.targetBrand} marquée comme relancée.`,
      });
      setRelancePreview(null);
      await refetchList();
    } catch (e) {
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Erreur",
      });
    } finally {
      setSendingRelance(false);
    }
  }

  async function toggleRelance(mail: SentMission, action: "cancel" | "resume") {
    setTogglingId(mail.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/strategy/contact-missions/${mail.id}/cancel-relance`, {
        method: action === "cancel" ? "POST" : "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Action impossible.");
      setFeedback({
        kind: "success",
        message:
          action === "cancel"
            ? `Relance auto stoppée pour ${mail.targetBrand}.`
            : `Relance auto réactivée pour ${mail.targetBrand}.`,
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          mails: prev.mails.map((m) =>
            m.id === mail.id
              ? {
                  ...m,
                  relanceCancelledAt:
                    action === "cancel"
                      ? json.mission?.relanceCancelledAt ?? new Date().toISOString()
                      : null,
                }
              : m
          ),
        };
      });
      setOpenMail((prev) =>
        prev && prev.id === mail.id
          ? {
              ...prev,
              relanceCancelledAt:
                action === "cancel"
                  ? json.mission?.relanceCancelledAt ?? new Date().toISOString()
                  : null,
            }
          : prev
      );
    } catch (e) {
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Erreur réseau.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const refetchList = useCallback(async () => {
    if (forbidden) return;
    try {
      const params = new URLSearchParams();
      if (period !== "all") params.set("period", period);
      if (talentFilter !== "ALL") params.set("talentId", talentFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/strategy/contact-missions/sent?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (e) {
      console.error("[mails-envoyes] refetch failed:", e);
    }
  }, [period, talentFilter, debouncedSearch, forbidden]);

  useEffect(() => {
    if (forbidden || status === "loading") return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (period !== "all") params.set("period", period);
        if (talentFilter !== "ALL") params.set("talentId", talentFilter);
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetch(`/api/strategy/contact-missions/sent?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, talentFilter, debouncedSearch, forbidden, status]);

  const sanitizedBody = useMemo(() => {
    if (!openMail) return "";
    const body = openMail.body || "";
    return body.replace(/<script[\s\S]*?<\/script>/gi, "");
  }, [openMail]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C08B8B]" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">
        Acces refuse.
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Mails envoyés — pipeline prospection talent
          </h1>
          <p className="text-sm text-slate-500">
            Mails sortants depuis <strong>leyna@glowupagence.fr</strong>, suivis (ouvertures, clics) et relance auto J+3.
          </p>
        </div>
        <Link
          href="/strategy/projet-individuel-talent/pipeline"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour pipeline
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total envoyés" value={data?.stats.total ?? 0} hint="Depuis toujours" />
        <StatCard label="Ce mois" value={data?.stats.month ?? 0} hint="30 derniers jours" />
        <StatCard label="Cette semaine" value={data?.stats.week ?? 0} hint="7 derniers jours" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <Calendar className="h-4 w-4 text-slate-500" />
        <div className="flex gap-1">
          {(["all", "month", "week"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                period === p
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {p === "all" ? "Tout" : p === "month" ? "30j" : "7j"}
            </button>
          ))}
        </div>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <select
          value={talentFilter}
          onChange={(e) => setTalentFilter(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="ALL">Tous les talents</option>
          {(data?.talentOptions ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Rechercher marque, talent, sujet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded border border-slate-300 pl-8 pr-3 py-1 text-sm"
          />
        </div>
      </div>

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1024px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Envoyé</th>
              <th className="px-4 py-3 text-left">Talent</th>
              <th className="px-4 py-3 text-left">Marque / Contacts</th>
              <th className="px-4 py-3 text-left">Objet envoyé</th>
              <th className="px-4 py-3 text-left">Engagement</th>
              <th className="px-4 py-3 text-left">Relance auto</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#C08B8B]" />
                </td>
              </tr>
            ) : (data?.mails.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  Aucun mail envoyé sur cette période.
                </td>
              </tr>
            ) : (
              data!.mails.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3 align-top">
                    {m.sentAt ? (
                      <>
                        <div className="text-slate-900">{relativeDate(m.sentAt)}</div>
                        <div className="text-xs text-slate-500">{formatDate(m.sentAt)}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200">
                        {m.talentPhoto ? (
                          <Image src={m.talentPhoto} alt="" fill className="object-cover" sizes="32px" />
                        ) : null}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{m.talentName}</div>
                        {m.talentId ? (
                          <Link
                            href={`/talents/${m.talentId}`}
                            className="text-xs text-slate-500 underline hover:text-slate-700"
                          >
                            Fiche talent
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-slate-800">{m.targetBrand}</div>
                    <div className="text-xs text-slate-500">
                      {m.recipients.length} contact{m.recipients.length > 1 ? "s" : ""}
                      {m.recipients[0]?.email ? ` · ${m.recipients[0].email}` : ""}
                      {m.recipients.length > 1 ? ` +${m.recipients.length - 1}` : ""}
                    </div>
                    {m.failedEmails.length > 0 ? (
                      <div className="mt-1 text-xs text-red-600">
                        {m.failedEmails.length} échec{m.failedEmails.length > 1 ? "s" : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    <div className="line-clamp-2">{m.subject || "—"}</div>
                    {m.campaignTitle ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Campagne : {m.campaignTitle}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <EngagementBadges
                      openCount={m.openCount}
                      lastOpenAt={m.lastOpenAt}
                      clickCount={m.clickCount}
                      lastClickAt={m.lastClickAt}
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <RelanceStatus
                      id={m.id}
                      sentAt={m.sentAt}
                      relanceSentAt={m.relanceSentAt}
                      replied={m.replied}
                      relanceCancelledAt={m.relanceCancelledAt}
                    />
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => setOpenMail(m)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Voir le mail
                      </button>
                      {canManageRelance && !m.relanceSentAt && (
                        <>
                          <button
                            type="button"
                            disabled={previewLoadingId === m.id}
                            onClick={() => void openRelancePreview(m)}
                            className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                            title="Prévisualiser et envoyer la relance immédiatement"
                          >
                            {previewLoadingId === m.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Relancer maintenant
                          </button>
                          {m.relanceCancelledAt ? (
                            <button
                              type="button"
                              disabled={togglingId === m.id}
                              onClick={() => void toggleRelance(m, "resume")}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              title="Réactiver la relance automatique J+3"
                            >
                              <BellRing className="h-3.5 w-3.5" />
                              Réactiver auto
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={togglingId === m.id}
                              onClick={() => void toggleRelance(m, "cancel")}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                              title="Stopper la relance automatique J+3"
                            >
                              <BellOff className="h-3.5 w-3.5" />
                              Stopper auto
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openMail && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 p-4"
          onClick={() => setOpenMail(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Mail envoyé depuis leyna@glowupagence.fr
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
                  {openMail.subject || "(sans objet)"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Marque : <strong>{openMail.targetBrand}</strong>
                  {openMail.sentAt ? ` · ${formatDate(openMail.sentAt)}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenMail(null)}
                className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  <strong>Talent :</strong> {openMail.talentName}
                </p>
                <p>
                  <strong>Marque :</strong> {openMail.targetBrand}
                </p>
                {openMail.campaignTitle ? (
                  <p>
                    <strong>Campagne :</strong> {openMail.campaignTitle}
                  </p>
                ) : null}
                {openMail.clientLanguage ? (
                  <p>
                    <strong>Langue client :</strong>{" "}
                    {openMail.clientLanguage === "FR" ? "Français" : "Anglais"}
                  </p>
                ) : null}
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Destinataires ({openMail.recipients.length})
                </p>
                <ul className="space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
                  {openMail.recipients.map((r, idx) => {
                    const failed = openMail.failedEmails.find(
                      (f) => f.email.toLowerCase() === r.email.toLowerCase()
                    );
                    return (
                      <li key={`${r.email}-${idx}`} className="flex items-center justify-between gap-2">
                        <span>
                          <strong>{r.firstname}</strong>
                          {r.lastname ? ` ${r.lastname}` : ""} — {r.email}
                          {r.role ? <span className="text-slate-500"> ({r.role})</span> : null}
                        </span>
                        {failed ? (
                          <span
                            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-700"
                            title={failed.error}
                          >
                            échec
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                            envoyé
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {openMail.sendError ? (
                  <p
                    className="mt-1 text-[11px] text-red-600"
                    title={openMail.sendError}
                  >
                    Erreurs serveur : {openMail.sendError}
                  </p>
                ) : null}
              </div>

              <RelanceTimeline mail={openMail} />

              {canManageRelance && !openMail.relanceSentAt ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={previewLoadingId === openMail.id}
                    onClick={() => void openRelancePreview(openMail)}
                    className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                  >
                    {previewLoadingId === openMail.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Relancer maintenant
                  </button>
                  {openMail.relanceCancelledAt ? (
                    <button
                      type="button"
                      disabled={togglingId === openMail.id}
                      onClick={() => void toggleRelance(openMail, "resume")}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <BellRing className="h-3.5 w-3.5" />
                      Réactiver la relance auto J+3
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={togglingId === openMail.id}
                      onClick={() => void toggleRelance(openMail, "cancel")}
                      className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <BellOff className="h-3.5 w-3.5" />
                      Stopper la relance auto J+3
                    </button>
                  )}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    openMail.openCount > 0
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-emerald-700" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Ouvertures
                    </p>
                  </div>
                  {openMail.openCount > 0 ? (
                    <div className="mt-1 space-y-0.5 text-slate-700">
                      <p>
                        <strong>{openMail.openCount}</strong> ouverture
                        {openMail.openCount > 1 ? "s" : ""}
                      </p>
                      {openMail.openedAt ? (
                        <p>1ère ouverture : {formatDate(openMail.openedAt)}</p>
                      ) : null}
                      {openMail.lastOpenAt && openMail.lastOpenAt !== openMail.openedAt ? (
                        <p>Dernière : {formatDate(openMail.lastOpenAt)}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">Pas encore ouvert.</p>
                  )}
                </div>

                <div
                  className={`rounded-lg border p-3 text-xs ${
                    openMail.clickCount > 0
                      ? "border-amber-200 bg-amber-50/60"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MousePointerClick className="h-3.5 w-3.5 text-amber-700" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Clics
                    </p>
                  </div>
                  {openMail.clickCount > 0 ? (
                    <div className="mt-1 space-y-0.5 text-slate-700">
                      <p>
                        <strong>{openMail.clickCount}</strong> clic
                        {openMail.clickCount > 1 ? "s" : ""}
                      </p>
                      {openMail.lastClickAt ? (
                        <p>Dernier clic : {formatDate(openMail.lastClickAt)}</p>
                      ) : null}
                      {openMail.lastClickUrl ? (
                        <p className="truncate">
                          Lien :{" "}
                          <a
                            href={openMail.lastClickUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-slate-900"
                          >
                            {openMail.lastClickUrl}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">Aucun lien cliqué.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Corps du mail envoyé
                </p>
                {openMail.body ? (
                  <div
                    className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800"
                    dangerouslySetInnerHTML={{ __html: sanitizedBody }}
                  />
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    Corps du mail non sauvegardé en base.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {relancePreview && (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-black/50 p-4"
          onClick={() => (sendingRelance ? null : setRelancePreview(null))}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-sky-700">
                  Relance manuelle — envoi immédiat
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
                  {relancePreview.mission.targetBrand}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Réponse au même thread Gmail, depuis leyna@glowupagence.fr
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRelancePreview(null)}
                disabled={sendingRelance}
                className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Destinataires ({relancePreview.recipients.length})
                </p>
                {relancePreview.recipients.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    Aucun destinataire valide trouvé (threads Gmail introuvables ou en erreur).
                  </p>
                ) : (
                  <ul className="space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
                    {relancePreview.recipients.map((r) => (
                      <li key={r.email}>
                        <strong>{r.firstname}</strong>
                        {r.lastname ? ` ${r.lastname}` : ""} — {r.email}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Sujet
                </label>
                <input
                  type="text"
                  value={relancePreview.subject}
                  onChange={(e) =>
                    setRelancePreview((prev) =>
                      prev ? { ...prev, subject: e.target.value } : prev
                    )
                  }
                  disabled={sendingRelance}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Corps (HTML — variables : <code>{"{{contact.firstname}}"}</code>,{" "}
                  <code>{"{{contact.lastname}}"}</code>, <code>{"{{contact.company}}"}</code>)
                </label>
                <textarea
                  value={relancePreview.body}
                  onChange={(e) =>
                    setRelancePreview((prev) =>
                      prev ? { ...prev, body: e.target.value } : prev
                    )
                  }
                  disabled={sendingRelance}
                  rows={8}
                  className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs disabled:bg-slate-50"
                />
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Aperçu (1er destinataire)
                </p>
                <div
                  className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800"
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      const r = relancePreview.recipients[0];
                      if (!r) return relancePreview.body;
                      return relancePreview.body
                        .replace(/\{\{\s*contact\.firstname\s*\}\}/gi, r.firstname || "—")
                        .replace(/\{\{\s*contact\.lastname\s*\}\}/gi, r.lastname || "")
                        .replace(
                          /\{\{\s*contact\.company\s*\}\}/gi,
                          relancePreview.mission.targetBrand || "—"
                        )
                        .replace(/\{\{\s*owner\.firstname\s*\}\}/gi, "Leyna");
                    })(),
                  }}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setRelancePreview(null)}
                  disabled={sendingRelance}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void markAsSent(relancePreview.mission)}
                  disabled={sendingRelance}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  title="Si tu as déjà relancé en dehors de la plateforme (ou si l'envoi a réussi sans MAJ de l'historique), marque la mission comme relancée sans renvoyer le mail."
                >
                  Marquer comme déjà relancé
                </button>
                <button
                  type="button"
                  onClick={() => void sendRelanceNow()}
                  disabled={sendingRelance || relancePreview.recipients.length === 0}
                  className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {sendingRelance ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Envoyer la relance maintenant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
