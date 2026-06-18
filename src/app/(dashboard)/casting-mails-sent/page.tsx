"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Mail, Search, Calendar, ExternalLink, X, Eye, MousePointerClick, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { inboundCategoryLabel } from "@/lib/inbound-categories";
import { businessDeadlineWithJitter } from "@/lib/business-days";

type Mail = {
  id: string;
  talentId: string | null;
  talentName: string;
  talentEmail: string;
  senderEmail: string;
  senderName: string | null;
  senderDomain: string;
  extractedBrand: string | null;
  extractedBudget: string | null;
  subject: string;
  draftEmailSubject: string | null;
  draftEmailBody: string | null;
  sentAt: string;
  receivedAt: string;
  status: string;
  category: string;
  priority: string;
  openedAt: string | null;
  lastOpenAt: string | null;
  openCount: number;
  clickedAt: string | null;
  lastClickAt: string | null;
  lastClickUrl: string | null;
  clickCount: number;
  relance1SentAt: string | null;
  relance2SentAt: string | null;
  replied: boolean;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
  } | null;
};

type ApiResponse = {
  mails: Mail[];
  stats: { total: number; week: number; month: number };
  talentOptions: { id: string; name: string }[];
};

type Period = "all" | "week" | "month";

const ALLOWED = ["HEAD_OF_SALES", "ADMIN", "CASTING_MANAGER"];

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
 * Calcule la date prévisionnelle de la prochaine relance auto.
 * Le cron tourne toutes les 15 min (jours ouvrés, Europe/Paris). L'échéance
 * est calculée À L'HEURE près à partir de l'envoi initial :
 *  - R1 part à l'heure d'envoi + 3 jours ouvrés
 *  - R2 part à l'heure de la R1 + 4 jours ouvrés (≈ J+7 en flux normal)
 * Si l'échéance est dépassée, la relance part au prochain passage (qq minutes).
 */
function computeNextRelance(
  seed: string,
  sentAt: string | null,
  relance1SentAt: string | null,
  relance2SentAt: string | null,
  replied: boolean
): { level: 1 | 2; scheduledAt: Date; isOverdue: boolean } | null {
  if (!sentAt || replied || relance2SentAt) return null;
  const sent = new Date(sentAt);
  const now = new Date();
  const level: 1 | 2 = relance1SentAt ? 2 : 1;
  // R1 : 3 jours ouvrés après l'envoi initial (heure préservée + décalage
  // anti-robot propre au mail). R2 : 4 jours ouvrés après la R1 réellement
  // envoyée (≈ J+7 en flux normal, espacement préservé sur les rattrapages).
  const eligibleAt =
    level === 1
      ? businessDeadlineWithJitter(sent, 3, seed)
      : businessDeadlineWithJitter(new Date(relance1SentAt as string), 4, seed);
  if (eligibleAt > now) return { level, scheduledAt: eligibleAt, isOverdue: false };
  // Échéance passée → partira au prochain passage du cron (toutes les 15 min).
  return { level, scheduledAt: now, isOverdue: true };
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

function RelanceTimeline({ mail }: { mail: Mail }) {
  const next = computeNextRelance(
    mail.id,
    mail.sentAt,
    mail.relance1SentAt,
    mail.relance2SentAt,
    mail.replied
  );

  type Step = {
    label: string;
    state: "done" | "pending" | "skipped" | "stopped";
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
      label: "Client a répondu — relances stoppées",
      state: "stopped",
      hint: "Détecté automatiquement par le cron via Gmail.",
    });
  } else {
    if (mail.relance1SentAt) {
      steps.push({
        label: "Relance 1 envoyée (3 jours ouvrés)",
        state: "done",
        date: `${formatDate(mail.relance1SentAt)} (${relativeDate(mail.relance1SentAt)})`,
      });
    } else if (next?.level === 1) {
      steps.push({
        label: "Relance 1 (3 jours ouvrés)",
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

    if (mail.relance2SentAt) {
      steps.push({
        label: "Relance 2 envoyée (7 jours ouvrés) — dernière",
        state: "done",
        date: `${formatDate(mail.relance2SentAt)} (${relativeDate(mail.relance2SentAt)})`,
      });
    } else if (mail.relance1SentAt && next?.level === 2) {
      steps.push({
        label: "Relance 2 (7 jours ouvrés) — dernière",
        state: "pending",
        date: `Prévue ${formatRelativeFuture(next.scheduledAt)} — ${next.scheduledAt.toLocaleString(
          "fr-FR",
          { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
        )}`,
        hint: next.isOverdue
          ? "Échéance dépassée, partira dans quelques minutes (cron toutes les 15 min)."
          : "À l'heure de la R1 + 4 jours ouvrés (cron toutes les 15 min, week-ends exclus).",
      });
    } else if (!mail.relance1SentAt && !next) {
      // cas rare : pas de sentAt, on n'affiche rien d'autre
    } else if (!mail.relance1SentAt) {
      steps.push({
        label: "Relance 2 (7 jours ouvrés) — dernière",
        state: "skipped",
        hint: "S'enchaînera après la relance 1.",
      });
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Relances automatiques
      </p>
      <ol className="space-y-2">
        {steps.map((s, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                s.state === "done"
                  ? "bg-emerald-100 text-emerald-700"
                  : s.state === "pending"
                    ? "bg-slate-100 text-slate-500"
                    : s.state === "stopped"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-slate-50 text-slate-400"
              }`}
            >
              {s.state === "done" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : s.state === "stopped" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
            </span>
            <div className="flex-1">
              <p
                className={`font-medium ${
                  s.state === "skipped" ? "text-slate-400" : "text-slate-800"
                }`}
              >
                {s.label}
              </p>
              {s.date ? <p className="text-slate-600">{s.date}</p> : null}
              {s.hint ? <p className="text-[11px] text-slate-400">{s.hint}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RelanceStatus({
  id,
  sentAt,
  relance1SentAt,
  relance2SentAt,
  replied,
}: {
  id: string;
  sentAt: string | null;
  relance1SentAt: string | null;
  relance2SentAt: string | null;
  replied: boolean;
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

  if (relance2SentAt) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          R1 + R2 envoyées
        </span>
        <span className="text-[11px] text-slate-500">
          R2 : {relativeDate(relance2SentAt)}
        </span>
      </div>
    );
  }

  const next = computeNextRelance(id, sentAt, relance1SentAt, relance2SentAt, replied);

  return (
    <div className="flex flex-col gap-1 text-xs">
      {relance1SentAt ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700"
          title={`Envoyée le ${formatDate(relance1SentAt)}`}
        >
          <CheckCircle2 className="h-3 w-3" />
          R1 · {relativeDate(relance1SentAt)}
        </span>
      ) : null}
      {next ? (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
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
          {next.isOverdue ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          R{next.level} {formatRelativeFuture(next.scheduledAt)}
        </span>
      ) : null}
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
          <span>
            Cliqué{clickCount > 1 ? ` · ${clickCount}×` : ""}
          </span>
        ) : (
          <span>Aucun clic</span>
        )}
      </span>
    </div>
  );
}

export default function CastingMailsSentPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [talentFilter, setTalentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openMail, setOpenMail] = useState<Mail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const forbidden = status !== "loading" && !ALLOWED.includes(role);

  async function runRelancesNow() {
    if (running) return;
    const ok = window.confirm(
      "Envoyer maintenant toutes les relances dues (R1 puis R2) ?\n\nDe vrais e-mails partiront immédiatement depuis leyna@glowupagence.fr vers les marques concernées. Action irréversible."
    );
    if (!ok) return;
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/casting-mails-sent/run-relances", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as {
        r1Sent?: number;
        r2Sent?: number;
        replied?: number;
        processed?: number;
        error?: string;
      };
      if (!res.ok) {
        setRunMessage(json.error || "Échec du déclenchement des relances.");
      } else {
        const r1 = json.r1Sent ?? 0;
        const r2 = json.r2Sent ?? 0;
        const rep = json.replied ?? 0;
        setRunMessage(
          `Relances envoyées : ${r1} R1, ${r2} R2 (dernière). ${rep} réponse(s) détectée(s). ${json.processed ?? 0} mail(s) analysé(s).`
        );
        setRefreshKey((k) => k + 1);
      }
    } catch {
      setRunMessage("Erreur réseau pendant le déclenchement des relances.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

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
        const res = await fetch(`/api/casting-mails-sent?${params.toString()}`, {
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
  }, [period, talentFilter, debouncedSearch, forbidden, status, refreshKey]);

  const sanitizedBody = useMemo(() => {
    if (!openMail) return "";
    const body = openMail.draftEmailBody || "";
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mails envoyés par le Casting</h1>
          <p className="text-sm text-slate-500">
            Toutes les réponses envoyées depuis <strong>leyna@glowupagence.fr</strong> sur les opportunités inbound.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={runRelancesNow}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C08B8B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a87575] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {running ? "Envoi en cours…" : "Relancer maintenant"}
          </button>
          {runMessage && (
            <p className="max-w-xs text-right text-xs text-slate-600">{runMessage}</p>
          )}
        </div>
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1024px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Envoyé</th>
              <th className="px-4 py-3 text-left">Talent</th>
              <th className="px-4 py-3 text-left">Marque / Expéditeur</th>
              <th className="px-4 py-3 text-left">Objet envoyé</th>
              <th className="px-4 py-3 text-left">Engagement</th>
              <th className="px-4 py-3 text-left">Relances auto</th>
              <th className="px-4 py-3 text-left">Catégorie</th>
              <th className="px-4 py-3 text-left">Priorité</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#C08B8B]" />
                </td>
              </tr>
            ) : (data?.mails.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                  Aucun mail envoyé sur cette période.
                </td>
              </tr>
            ) : (
              data!.mails.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-900">{relativeDate(m.sentAt)}</div>
                    <div className="text-xs text-slate-500">{formatDate(m.sentAt)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200">
                        {m.talent?.photo ? (
                          <Image src={m.talent.photo} alt="" fill className="object-cover" sizes="32px" />
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
                    <div className="font-medium text-slate-800">
                      {m.extractedBrand || m.senderDomain}
                    </div>
                    <div className="text-xs text-slate-500">
                      {m.senderName ? `${m.senderName} · ` : ""}
                      {m.senderEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    <div className="line-clamp-2">{m.draftEmailSubject || "—"}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Mail original : {m.subject.slice(0, 80)}
                    </div>
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
                      relance1SentAt={m.relance1SentAt}
                      relance2SentAt={m.relance2SentAt}
                      replied={m.replied}
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="rounded-full bg-[#F5EBE0] px-2 py-1 text-xs text-[#1A1110]">
                      {inboundCategoryLabel(m.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="rounded-full bg-[#C8F285]/50 px-2 py-1 text-xs text-[#1A1110]">
                      {m.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenMail(m)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Voir le mail
                      </button>
                      <Link
                        href={`/inbound/${m.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Inbound
                      </Link>
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
                <p className="text-xs uppercase tracking-wide text-slate-500">Mail envoyé depuis leyna@glowupagence.fr</p>
                <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
                  {openMail.draftEmailSubject || "(sans objet)"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  À <strong>{openMail.senderEmail}</strong> · {formatDate(openMail.sentAt)}
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
                  <strong>Talent contacté :</strong> {openMail.talentName} ({openMail.talentEmail})
                </p>
                <p>
                  <strong>Marque :</strong> {openMail.extractedBrand || openMail.senderDomain}
                </p>
                {openMail.extractedBudget ? (
                  <p>
                    <strong>Budget mentionné :</strong> {openMail.extractedBudget}
                  </p>
                ) : null}
                <p>
                  <strong>Mail original reçu :</strong> {openMail.subject}
                </p>
              </div>

              <RelanceTimeline mail={openMail} />

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
                      {openMail.lastOpenAt &&
                      openMail.lastOpenAt !== openMail.openedAt ? (
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
                {openMail.draftEmailBody ? (
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
    </div>
  );
}
