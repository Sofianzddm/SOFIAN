"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  Mail,
  Plus,
  Send,
  Clock,
  Save,
  Trash2,
  X,
  Loader2,
  CornerDownRight,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
  Ban,
  ArrowLeft,
  Reply,
  Eye,
  EyeOff,
} from "lucide-react";
import RichEmailEditor from "@/components/email/RichEmailEditor";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

/** Boîte expéditrice présélectionnée par défaut dans le compositeur. */
const DEFAULT_FROM_EMAIL = "s.zeddam@glowupagence.fr";

type GmailAccount = {
  id: string;
  email: string;
  displayName: string | null;
};

type Followup = {
  id: string;
  order: number;
  delayBusinessDays: number;
  subject: string | null;
  bodyHtml: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  sendError: string | null;
  openCount: number;
  openedAt: string | null;
  lastOpenAt: string | null;
};

type AdminMail = {
  id: string;
  fromEmail: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  bodyHtml: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  stopOnReply: boolean;
  sendError: string | null;
  holdReason: string | null;
  openCount: number;
  openedAt: string | null;
  lastOpenAt: string | null;
  createdAt: string;
  followups: Followup[];
};

type FollowupDraft = {
  uid: string;
  delayBusinessDays: number;
  subject: string;
  bodyHtml: string;
};

function newUid() {
  return Math.random().toString(36).slice(2, 10);
}

const STATUS_META: Record<
  string,
  { label: string; bg: string; color: string; icon: React.ElementType }
> = {
  DRAFT: { label: "Brouillon", bg: "#F1F5F9", color: "#475569", icon: Save },
  SCHEDULED: { label: "Programmé", bg: "#FEF3C7", color: "#92400E", icon: CalendarClock },
  SENT: { label: "Envoyé", bg: "#DCFCE7", color: "#166534", icon: CheckCircle2 },
  FAILED: { label: "Échec", bg: "#FEE2E2", color: "#991B1B", icon: AlertCircle },
  CANCELLED: { label: "Annulé", bg: "#F1F5F9", color: "#64748B", icon: Ban },
};

const FOLLOWUP_STATUS_LABEL: Record<string, string> = {
  PENDING: "en attente",
  SENT: "envoyée",
  SKIPPED: "annulée (réponse reçue)",
  CANCELLED: "annulée",
  FAILED: "échec",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DEFAULT_FOLLOWUP_BODY =
  "<p>Bonjour,</p><p>Je me permets de revenir vers vous concernant mon précédent message. Avez-vous eu l'occasion d'y jeter un œil ?</p><p>Je reste à votre disposition.</p><p>Belle journée,</p>";

export default function MailerClient() {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [mails, setMails] = useState<AdminMail[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "compose">("list");

  // ─── Composer ───
  const [fromEmail, setFromEmail] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [stopOnReply, setStopOnReply] = useState(true);
  const [followups, setFollowups] = useState<FollowupDraft[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [composerKey, setComposerKey] = useState(() => newUid());
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/accounts", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        accounts?: GmailAccount[];
      };
      const list = json.accounts || [];
      setAccounts(list);
      // Présélectionne s.zeddam@glowupagence.fr si connectée, sinon 1re boîte.
      const preferred = list.find(
        (a) => a.email.toLowerCase() === DEFAULT_FROM_EMAIL
      );
      setFromEmail((prev) => prev || preferred?.email || list[0]?.email || "");
    } catch {
      setAccounts([]);
    }
  }, []);

  const loadMails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mailer", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { mails?: AdminMail[] };
      setMails(json.mails || []);
    } catch {
      setMails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadMails();
  }, [loadAccounts, loadMails]);

  const resetComposer = useCallback(() => {
    setToEmail("");
    setToName("");
    setSubject("");
    setBodyHtml("");
    setStopOnReply(true);
    setFollowups([]);
    setScheduledAt("");
    setComposerKey(newUid());
  }, []);

  const addFollowup = () => {
    setFollowups((prev) => [
      ...prev,
      {
        uid: newUid(),
        delayBusinessDays: prev.length === 0 ? 3 : 3,
        subject: "",
        bodyHtml: DEFAULT_FOLLOWUP_BODY,
      },
    ]);
  };

  const removeFollowup = (uid: string) => {
    setFollowups((prev) => prev.filter((f) => f.uid !== uid));
  };

  const updateFollowup = (uid: string, patch: Partial<FollowupDraft>) => {
    setFollowups((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f))
    );
  };

  const canSubmit = useMemo(
    () =>
      Boolean(
        fromEmail &&
          /\S+@\S+\.\S+/.test(toEmail) &&
          subject.trim() &&
          bodyHtml.replace(/<[^>]*>/g, "").trim()
      ),
    [fromEmail, toEmail, subject, bodyHtml]
  );

  async function submit(action: "draft" | "schedule" | "send") {
    if (!canSubmit) {
      toast.error("Renseigne l'expéditeur, le destinataire, le sujet et le corps.");
      return;
    }
    if (action === "schedule" && !scheduledAt) {
      toast.error("Choisis une date d'envoi.");
      return;
    }
    const cleanFollowups = followups.filter((f) =>
      f.bodyHtml.replace(/<[^>]*>/g, "").trim()
    );
    setSubmitting(true);
    try {
      const res = await fetch("/api/mailer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail,
          toEmail,
          toName: toName || null,
          subject,
          bodyHtml,
          stopOnReply,
          action,
          scheduledAt:
            action === "schedule" && scheduledAt
              ? new Date(scheduledAt).toISOString()
              : null,
          followups: cleanFollowups.map((f) => ({
            delayBusinessDays: f.delayBusinessDays,
            subject: f.subject || null,
            bodyHtml: f.bodyHtml,
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        held?: boolean;
        message?: string;
      };
      if (!res.ok) {
        toast.error(json.error || "Une erreur est survenue.");
        return;
      }
      if (json.held) {
        toast.warning(json.message || "Mail reporté (contact récent de Leyna).", {
          duration: 8000,
        });
      } else {
        toast.success(
          action === "send"
            ? "Mail envoyé ✉️"
            : action === "schedule"
              ? "Mail programmé ⏰"
              : "Brouillon enregistré"
        );
      }
      resetComposer();
      setView("list");
      loadMails();
    } catch {
      toast.error("Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendNow(id: string, force = false) {
    const res = await fetch(
      `/api/mailer/${id}/send${force ? "?force=1" : ""}`,
      { method: "POST", credentials: "include" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      held?: boolean;
      message?: string;
    };
    if (!res.ok) {
      toast.error(json.error || "Échec de l'envoi.");
    } else if (json.held) {
      toast.warning(json.message || "Mail reporté (contact récent de Leyna).", {
        duration: 8000,
      });
    } else {
      toast.success("Mail envoyé ✉️");
    }
    loadMails();
  }

  async function cancelScheduled(id: string) {
    const res = await fetch(`/api/mailer/${id}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(json.error || "Erreur.");
    } else {
      toast.success("Envoi annulé (repassé en brouillon).");
    }
    loadMails();
  }

  async function cancelFollowups(id: string) {
    const res = await fetch(`/api/mailer/${id}/cancel?followups=1`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Erreur.");
    } else {
      toast.success("Relances en attente annulées.");
    }
    loadMails();
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer définitivement ce mail et ses relances ?")) return;
    const res = await fetch(`/api/mailer/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Erreur lors de la suppression.");
    } else {
      toast.success("Mail supprimé.");
    }
    loadMails();
  }

  const minDateTime = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  return (
    <div style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      <Toaster richColors position="top-right" />

      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
          >
            Rédacteur de mails
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Rédige, programme et relance automatiquement depuis une boîte Gmail connectée.
          </p>
        </div>
        {view === "list" ? (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/auth/gmail"
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
              title="Connecter une boîte Gmail"
            >
              <Mail className="h-4 w-4" /> Connecter une boîte
            </a>
            <button
              type="button"
              onClick={() => {
                if (accounts.length === 0) {
                  toast.error("Connecte d'abord une boîte mail.");
                  return;
                }
                resetComposer();
                setView("compose");
              }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              <Plus className="h-4 w-4" /> Nouveau mail
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setView("list")}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
            style={{ borderColor: OLD_ROSE, color: LICORICE }}
          >
            <ArrowLeft className="h-4 w-4" /> Retour à la liste
          </button>
        )}
      </div>

      {/* ─── Bandeau connexion boîte ─── */}
      {accounts.length === 0 && (
        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5"
          style={{ borderColor: OLD_ROSE, backgroundColor: OLD_LACE }}
        >
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5" style={{ color: LICORICE }} />
            <div>
              <p className="font-medium" style={{ color: LICORICE }}>
                Aucune boîte mail connectée
              </p>
              <p className="text-sm text-slate-600">
                Connecte ta boîte Gmail pour pouvoir envoyer et programmer des mails.
              </p>
            </div>
          </div>
          <a
            href="/api/auth/gmail"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
          >
            <Plus className="h-4 w-4" /> Connecter ma boîte mail
          </a>
        </div>
      )}

      {view === "compose" ? (
        <div className="mt-6 max-w-3xl space-y-5">
          {/* Expéditeur / destinataire */}
          <div
            className="space-y-4 rounded-2xl border bg-white p-6"
            style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Depuis
                </span>
                <select
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.email}>
                      {a.displayName ? `${a.displayName} · ${a.email}` : a.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nom du destinataire (optionnel)
                </span>
                <input
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  placeholder="Marie Dupont"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                À
              </span>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="contact@marque.com"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sujet
              </span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet du mail"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              />
            </label>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Message
              </span>
              <RichEmailEditor
                key={`body-${composerKey}`}
                initialHtml={bodyHtml}
                onChangeHtml={setBodyHtml}
              />
            </div>
          </div>

          {/* Relances */}
          <div
            className="space-y-4 rounded-2xl border bg-white p-6"
            style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ color: LICORICE, fontFamily: "Spectral, serif" }}
                >
                  Relances automatiques
                </h2>
                <p className="text-sm text-slate-600">
                  Envoyées en réponse dans le même fil, à N jours ouvrés après l&apos;étape précédente.
                </p>
              </div>
              <button
                type="button"
                onClick={addFollowup}
                disabled={followups.length >= 5}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              >
                <Plus className="h-4 w-4" /> Ajouter une relance
              </button>
            </div>

            {followups.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune relance programmée.</p>
            ) : (
              <div className="space-y-4">
                {followups.map((f, idx) => (
                  <div
                    key={f.uid}
                    className="rounded-xl border p-4"
                    style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-sm font-semibold"
                        style={{ color: LICORICE }}
                      >
                        <CornerDownRight className="h-4 w-4" style={{ color: OLD_ROSE }} />
                        Relance {idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">après</span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={f.delayBusinessDays}
                          onChange={(e) =>
                            updateFollowup(f.uid, {
                              delayBusinessDays: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-16 rounded-lg border px-2 py-1 text-sm"
                          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                        />
                        <span className="text-sm text-slate-500">j ouvrés</span>
                        <button
                          type="button"
                          onClick={() => removeFollowup(f.uid)}
                          className="ml-2 rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                          title="Supprimer cette relance"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <input
                      value={f.subject}
                      onChange={(e) => updateFollowup(f.uid, { subject: e.target.value })}
                      placeholder="Sujet (par défaut : Re: sujet initial)"
                      className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                    />
                    <RichEmailEditor
                      key={`fu-${f.uid}-${composerKey}`}
                      initialHtml={f.bodyHtml}
                      onChangeHtml={(html) => updateFollowup(f.uid, { bodyHtml: html })}
                      minHeight={140}
                      placeholder="Texte de la relance…"
                    />
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={stopOnReply}
                onChange={(e) => setStopOnReply(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              Stopper les relances si le destinataire répond
            </label>
          </div>

          {/* Actions */}
          <div
            className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-5"
            style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
          >
            <button
              type="button"
              onClick={() => submit("send")}
              disabled={submitting || !canSubmit}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer maintenant
            </button>

            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minDateTime}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
              />
              <button
                type="button"
                onClick={() => submit("schedule")}
                disabled={submitting || !canSubmit}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              >
                <Clock className="h-4 w-4" /> Programmer
              </button>
            </div>

            <button
              type="button"
              onClick={() => submit("draft")}
              disabled={submitting || !canSubmit}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-50"
              style={{ borderColor: "#CBD5E1" }}
            >
              <Save className="h-4 w-4" /> Enregistrer le brouillon
            </button>
          </div>
        </div>
      ) : (
        /* ─── Liste ─── */
        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : mails.length === 0 ? (
            <div
              className="rounded-2xl border bg-white p-12 text-center"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}
            >
              <Mail className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Aucun mail pour le moment. Clique sur « Nouveau mail » pour commencer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mails.map((m) => (
                <MailRow
                  key={m.id}
                  mail={m}
                  onSendNow={sendNow}
                  onCancelScheduled={cancelScheduled}
                  onCancelFollowups={cancelFollowups}
                  onDelete={remove}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MailRow({
  mail,
  onSendNow,
  onCancelScheduled,
  onCancelFollowups,
  onDelete,
}: {
  mail: AdminMail;
  onSendNow: (id: string, force?: boolean) => void;
  onCancelScheduled: (id: string) => void;
  onCancelFollowups: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = STATUS_META[mail.status] || STATUS_META.DRAFT;
  const StatusIcon = meta.icon;
  const pendingFollowups = mail.followups.filter((f) => f.status === "PENDING");

  return (
    <div
      className="rounded-2xl border bg-white p-5"
      style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: meta.bg, color: meta.color }}
            >
              <StatusIcon className="h-3 w-3" />
              {meta.label}
            </span>
            {mail.repliedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <Reply className="h-3 w-3" /> A répondu
              </span>
            )}
            {mail.status === "SENT" &&
              (mail.openCount > 0 ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8" }}
                  title={`${mail.openCount} ouverture${mail.openCount > 1 ? "s" : ""}${
                    mail.lastOpenAt ? ` · dernière le ${formatDateTime(mail.lastOpenAt)}` : ""
                  }`}
                >
                  <Eye className="h-3 w-3" /> Ouvert
                  {mail.openCount > 1 ? ` ×${mail.openCount}` : ""}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "#F1F5F9", color: "#94A3B8" }}
                  title="Aucune ouverture détectée (le tracking par pixel peut être bloqué côté destinataire)"
                >
                  <EyeOff className="h-3 w-3" /> Non ouvert
                </span>
              ))}
          </div>
          <p className="mt-2 truncate font-semibold" style={{ color: LICORICE }}>
            {mail.subject}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {mail.toName ? `${mail.toName} · ` : ""}
            {mail.toEmail} · depuis {mail.fromEmail}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {mail.status === "SCHEDULED"
              ? `Envoi programmé le ${formatDateTime(mail.scheduledAt)}`
              : mail.status === "SENT"
                ? `Envoyé le ${formatDateTime(mail.sentAt)}`
                : `Créé le ${formatDateTime(mail.createdAt)}`}
          </p>
          {mail.sendError && (
            <p className="mt-1 text-xs text-red-600">⚠️ {mail.sendError}</p>
          )}
          {mail.holdReason && (
            <p
              className="mt-1 rounded-md px-2 py-1 text-xs"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
            >
              ⏳ {mail.holdReason}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(mail.status === "DRAFT" ||
            mail.status === "SCHEDULED" ||
            mail.status === "FAILED") && (
            <button
              type="button"
              onClick={() => onSendNow(mail.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
              style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
            >
              <Send className="h-3.5 w-3.5" /> Envoyer
            </button>
          )}
          {mail.holdReason && (
            <button
              type="button"
              onClick={() => onSendNow(mail.id, true)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: "#92400E", color: "#92400E", backgroundColor: "#FEF3C7" }}
              title="Ignorer le cooldown de 20 jours et envoyer immédiatement"
            >
              <Send className="h-3.5 w-3.5" /> Envoyer quand même
            </button>
          )}
          {mail.status === "SCHEDULED" && (
            <button
              type="button"
              onClick={() => onCancelScheduled(mail.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            >
              <Ban className="h-3.5 w-3.5" /> Annuler
            </button>
          )}
          {mail.status === "SENT" && pendingFollowups.length > 0 && (
            <button
              type="button"
              onClick={() => onCancelFollowups(mail.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            >
              <Ban className="h-3.5 w-3.5" /> Stopper relances
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(mail.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Relances */}
      {mail.followups.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t pt-3" style={{ borderColor: OLD_LACE }}>
          {mail.followups.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <CornerDownRight className="h-3.5 w-3.5" style={{ color: OLD_ROSE }} />
              <span className="font-medium" style={{ color: LICORICE }}>
                Relance {f.order}
              </span>
              <span>· {FOLLOWUP_STATUS_LABEL[f.status] || f.status}</span>
              {f.status === "PENDING" && f.scheduledAt && (
                <span>· prévue le {formatDateTime(f.scheduledAt)}</span>
              )}
              {f.status === "PENDING" && !f.scheduledAt && (
                <span>· {f.delayBusinessDays} j ouvrés après l&apos;étape précédente</span>
              )}
              {f.status === "SENT" && f.sentAt && (
                <span>· envoyée le {formatDateTime(f.sentAt)}</span>
              )}
              {f.status === "SENT" &&
                (f.openCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-blue-700">
                    <Eye className="h-3 w-3" /> ouverte
                    {f.openCount > 1 ? ` ×${f.openCount}` : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <EyeOff className="h-3 w-3" /> non ouverte
                  </span>
                ))}
              {f.sendError && <span className="text-red-600">· {f.sendError}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
