"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarDays,
  Clock,
  Eye,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Reply,
  Send,
  Trash2,
} from "lucide-react";
import RichEmailEditor from "@/components/email/RichEmailEditor";
import { businessDaysAfter } from "@/lib/business-days";

type FwContact = {
  id?: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
};

type FwClient = {
  id: string;
  nom: string;
  dateDefile: string | null;
  notes: string | null;
  statut: string;
  contactCount: number;
  hasEmails: boolean;
  contacts?: FwContact[];
  lastEmailSentAt: string | null;
  lastEmailFrom: string | null;
  emailOpenedAt: string | null;
  emailOpenCount: number;
  emailRepliedAt: string | null;
  relanceSentAt: string | null;
  createdAt: string;
};

type SenderAccount = { id: string; email: string; label: string };

type ContactDraft = { firstName: string; email: string; role: string };

const COLUMNS = [
  {
    key: "ATTENTE_EMAILS" as const,
    label: "À compléter",
    hint: "Inès a posé le nom — mails à noter",
  },
  {
    key: "PRET" as const,
    label: "Prêt à envoyer",
    hint: "Mails notés — Inès envoie",
  },
  {
    key: "ENVOYES" as const,
    label: "Envoyés",
    hint: "Suivi ouvertures / réponses",
  },
];

function formatDefile(iso: string | null) {
  if (!iso) return "Date non renseignée";
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function senderLabel(accounts: SenderAccount[], email: string | null) {
  if (!email) return "ines@glowupagence.fr";
  const acc = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
  return acc ? `${acc.label} (${acc.email})` : email;
}

function EmailTrackingBadges({ client }: { client: FwClient }) {
  if (!client.lastEmailSentAt) return null;
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${base} bg-gray-100 text-gray-700`}>
        <Mail className="h-3 w-3" />
        Envoyé {formatShortDate(client.lastEmailSentAt)}
      </span>
      {client.emailOpenedAt ? (
        <span className={`${base} bg-sky-100 text-sky-800`}>
          <Eye className="h-3 w-3" />
          Ouvert{client.emailOpenCount > 1 ? ` ×${client.emailOpenCount}` : ""}
        </span>
      ) : null}
      {client.emailRepliedAt ? (
        <span className={`${base} bg-emerald-100 text-emerald-800`}>
          <Reply className="h-3 w-3" />
          A répondu
        </span>
      ) : null}
      {client.relanceSentAt ? (
        <span className={`${base} bg-amber-100 text-amber-800`}>
          <Clock className="h-3 w-3" />
          Relancé {formatShortDate(client.relanceSentAt)}
        </span>
      ) : client.emailRepliedAt ? null : client.lastEmailSentAt ? (
        <span className={`${base} bg-gray-50 text-gray-500`}>
          Relance {formatShortDate(businessDaysAfter(new Date(client.lastEmailSentAt), 3).toISOString())}
        </span>
      ) : null}
    </div>
  );
}

export function FashionWeekClient() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const isAdmin = role === "ADMIN";

  const [clients, setClients] = useState<FwClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formNom, setFormNom] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [senderEmail, setSenderEmail] = useState<string | null>("ines@glowupagence.fr");
  const [senderAccounts, setSenderAccounts] = useState<SenderAccount[]>([]);

  const [emailTarget, setEmailTarget] = useState<FwClient | null>(null);
  const [emailForm, setEmailForm] = useState({ subject: "", bodyHtml: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [contactsTarget, setContactsTarget] = useState<FwClient | null>(null);
  const [contactDrafts, setContactDrafts] = useState<ContactDraft[]>([
    { firstName: "", email: "", role: "" },
  ]);
  const [contactsSaving, setContactsSaving] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clientsRes, projetRes, accountsRes] = await Promise.all([
        fetch("/api/strategy/fw/clients"),
        fetch("/api/strategy/projets?projetSlug=fashion-week"),
        fetch("/api/gmail/accounts"),
      ]);
      if (clientsRes.ok) {
        const json = (await clientsRes.json()) as { clients?: FwClient[] };
        setClients(json.clients || []);
      }
      if (projetRes.ok) {
        const json = (await projetRes.json()) as { projet?: { senderEmail?: string | null } };
        setSenderEmail(json.projet?.senderEmail ?? "ines@glowupagence.fr");
      }
      if (accountsRes.ok) {
        const json = (await accountsRes.json()) as {
          accounts?: Array<{
            email: string;
            displayName?: string | null;
            user?: { prenom: string; nom: string } | null;
          }>;
        };
        setSenderAccounts(
          (json.accounts || []).map((a) => ({
            id: a.email,
            email: a.email,
            label:
              a.displayName ||
              (a.user ? `${a.user.prenom} ${a.user.nom}`.trim() : a.email),
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byColumn = useMemo(() => {
    const attente = clients.filter((c) => c.statut === "ATTENTE_EMAILS");
    const pret = clients.filter((c) => c.statut === "PRET");
    const envoyes = clients.filter(
      (c) => c.statut !== "ATTENTE_EMAILS" && c.statut !== "PRET"
    );
    return { ATTENTE_EMAILS: attente, PRET: pret, ENVOYES: envoyes };
  }, [clients]);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    const nom = formNom.trim();
    if (!nom || !formDate) {
      setFormError("Nom du client et date du défilé requis.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/strategy/fw/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          dateDefile: `${formDate}T12:00:00.000Z`,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFormError(json.error || "Erreur lors de l'ajout.");
        return;
      }
      setFormNom("");
      setFormDate("");
      await load();
    } catch {
      setFormError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient(id: string, nom: string) {
    const ok = window.confirm(`Retirer ${nom} de la base Fashion Week ?`);
    if (!ok) return;
    await fetch(`/api/strategy/fw/clients/${id}`, { method: "DELETE" });
    await load();
  }

  async function patchStatut(id: string, statut: string) {
    await fetch(`/api/strategy/fw/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
    await load();
  }

  async function openContacts(client: FwClient) {
    setContactsError(null);
    let contacts = client.contacts || [];
    if (!contacts.length) {
      const res = await fetch(`/api/strategy/fw/clients/${client.id}`);
      if (res.ok) {
        const json = (await res.json()) as { client?: FwClient };
        contacts = json.client?.contacts || [];
      }
    }
    setContactsTarget(client);
    setContactDrafts(
      contacts.length > 0
        ? contacts.map((c) => ({
            firstName: c.firstName || "",
            email: c.email || "",
            role: c.role || "",
          }))
        : [{ firstName: "", email: "", role: "" }]
    );
  }

  async function saveContacts() {
    if (!contactsTarget) return;
    setContactsSaving(true);
    setContactsError(null);
    try {
      const res = await fetch(`/api/strategy/fw/clients/${contactsTarget.id}/contacts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: contactDrafts
            .map((c) => ({
              firstName: c.firstName.trim(),
              email: c.email.trim(),
              role: c.role.trim(),
            }))
            .filter((c) => c.email),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setContactsError(json.error || "Erreur lors de l'enregistrement.");
        return;
      }
      setContactsTarget(null);
      await load();
    } catch {
      setContactsError("Erreur réseau.");
    } finally {
      setContactsSaving(false);
    }
  }

  async function openEmailModal(client: FwClient) {
    setEmailError(null);
    setEmailForm({
      subject: `Glow Up x ${client.nom} — Fashion Week`,
      bodyHtml: "",
    });
    const res = await fetch(`/api/strategy/fw/clients/${client.id}?forSend=1`);
    if (res.ok) {
      const json = (await res.json()) as { client?: FwClient };
      setEmailTarget(json.client || client);
    } else {
      setEmailTarget(client);
    }
  }

  async function sendEmail() {
    if (!emailTarget) return;
    const bodyTextOnly = emailForm.bodyHtml.replace(/<[^>]*>/g, "").trim();
    if (!emailForm.subject.trim() || !bodyTextOnly) {
      setEmailError("Sujet et corps du mail requis.");
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/strategy/fw/clients/${emailTarget.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailForm.subject.trim(),
          bodyHtml: emailForm.bodyHtml,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setEmailError(json.error || "Erreur lors de l'envoi.");
        return;
      }
      setEmailTarget(null);
      await load();
    } catch {
      setEmailError("Erreur réseau lors de l'envoi.");
    } finally {
      setEmailSending(false);
    }
  }

  function clientsOf(key: (typeof COLUMNS)[number]["key"]) {
    return byColumn[key];
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Projet Strategy
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Fashion Week</h1>
        <p className="mt-1 text-sm text-gray-500">
          Inès pose le nom et la date du défilé. Sofian note le(s) mail(s). Inès envoie depuis{" "}
          <span className="font-medium text-gray-700">
            {senderLabel(senderAccounts, senderEmail)}
          </span>
          .
        </p>

        <form
          onSubmit={createClient}
          className="mt-5 flex flex-col gap-3 md:flex-row md:items-end"
        >
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Nom du client
            </label>
            <input
              value={formNom}
              onChange={(e) => setFormNom(e.target.value)}
              placeholder="Ex. Chanel, Dior, Jacquemus…"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:w-56">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Date du défilé
            </label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-glowup-rose px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </form>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = clientsOf(col.key);
            return (
              <div key={col.key} className="rounded-2xl border border-gray-200 bg-gray-50/40 p-3">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{col.label}</p>
                    <p className="text-[11px] text-gray-500">{col.hint}</p>
                  </div>
                  <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {list.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {list.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-xs text-gray-400">
                      Aucun client
                    </p>
                  ) : (
                    list.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">{c.nom}</p>
                          <button
                            type="button"
                            onClick={() => deleteClient(c.id, c.nom)}
                            className="text-gray-300 hover:text-red-500"
                            title="Retirer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDefile(c.dateDefile)}
                        </p>

                        {col.key === "ATTENTE_EMAILS" ? (
                          <p className="text-[11px] font-medium text-amber-700">
                            En attente de mails
                          </p>
                        ) : (
                          <p className="text-[11px] font-medium text-emerald-700">
                            {c.contactCount} mail{c.contactCount > 1 ? "s" : ""}{" "}
                            {col.key === "PRET" ? "prêt" : "noté"}
                            {c.contactCount > 1 ? "s" : ""}
                          </p>
                        )}

                        {isAdmin && (c.contacts?.length ?? 0) > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.contacts!.map((ct) => (
                              <span
                                key={ct.email}
                                className="rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600"
                              >
                                {ct.firstName ? `${ct.firstName} · ` : ""}
                                {ct.email}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <EmailTrackingBadges client={c} />

                        {col.key === "ENVOYES" ? (
                          <select
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                            value={c.statut}
                            onChange={(e) => patchStatut(c.id, e.target.value)}
                          >
                            <option value="ENVOYE">Envoyé</option>
                            <option value="EN_NEGO">En négo</option>
                            <option value="GAGNE">Gagné</option>
                            <option value="PERDU">Perdu</option>
                          </select>
                        ) : null}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => openContacts(c)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil className="h-3 w-3" />
                              {c.hasEmails ? "Modifier les mails" : "Noter les mails"}
                            </button>
                          ) : null}
                          {c.statut === "PRET" ? (
                            <button
                              type="button"
                              onClick={() => openEmailModal(c)}
                              className="inline-flex items-center gap-1 rounded-lg bg-glowup-rose px-2.5 py-1 text-[11px] font-medium text-white"
                            >
                              <Send className="h-3 w-3" />
                              Envoyer le mail
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contactsTarget && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[min(92vh,720px)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Mails · {contactsTarget.nom}</h3>
              <p className="mt-1 text-sm text-gray-500">
                Un ou plusieurs contacts. Le prénom sert pour {"{{prenom}}"} dans le mail.
              </p>
            </div>
            <div className="space-y-3">
              {contactDrafts.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input
                    className="col-span-3 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Prénom"
                    value={row.firstName}
                    onChange={(e) =>
                      setContactDrafts((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, firstName: e.target.value } : r))
                      )
                    }
                  />
                  <input
                    className="col-span-6 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="email@maison.com"
                    value={row.email}
                    onChange={(e) =>
                      setContactDrafts((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r))
                      )
                    }
                  />
                  <input
                    className="col-span-3 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Rôle"
                    value={row.role}
                    onChange={(e) =>
                      setContactDrafts((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, role: e.target.value } : r))
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setContactDrafts((rows) => [...rows, { firstName: "", email: "", role: "" }])
              }
              className="text-sm font-medium text-glowup-rose"
            >
              + Ajouter un mail
            </button>
            {contactsError ? <p className="text-sm text-red-600">{contactsError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded border text-sm"
                onClick={() => setContactsTarget(null)}
                disabled={contactsSaving}
              >
                Annuler
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-2 rounded bg-glowup-rose text-white text-sm disabled:opacity-60"
                onClick={saveContacts}
                disabled={contactsSaving}
              >
                {contactsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {emailTarget && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[min(92vh,820px)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Mail de prospection · {emailTarget.nom}</h3>
              <p className="mt-1 text-sm text-gray-500">
                Envoyé depuis{" "}
                <span className="font-medium text-gray-700">
                  {senderLabel(senderAccounts, senderEmail)}
                </span>{" "}
                — la signature Gmail de la boîte est ajoutée automatiquement.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Destinataires</p>
              <div className="flex flex-wrap gap-1.5">
                {(emailTarget.contacts || [])
                  .filter((c) => c.email)
                  .map((c, idx) => (
                    <span
                      key={`${c.email}-${idx}`}
                      className="rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs text-gray-700"
                    >
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                      <span className="text-gray-400"> · {c.email}</span>
                    </span>
                  ))}
              </div>
              {(emailTarget.contacts || []).filter((c) => c.email).length > 1 ? (
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Chaque contact reçoit <strong>son propre mail</strong> :{" "}
                  <code className="rounded bg-white px-1">{"{{prenom}}"}</code> est remplacé par le
                  prénom de chacun.
                </p>
              ) : null}
            </div>
            <div>
              <label className="text-xs text-gray-500">Sujet *</label>
              <input
                value={emailForm.subject}
                onChange={(e) => setEmailForm((s) => ({ ...s, subject: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Corps du mail *</label>
              <div className="mt-1">
                <RichEmailEditor
                  onChangeHtml={(html) => setEmailForm((s) => ({ ...s, bodyHtml: html }))}
                  placeholder="Bonjour {{prenom}}, rédige ton mail de prospection Fashion Week ici..."
                  minHeight={260}
                  variables={[
                    {
                      token: "{{prenom}}",
                      label: "PRÉNOM",
                      hint: "Prénom du contact (remplacé pour chaque destinataire)",
                    },
                    {
                      token: "{{nom}}",
                      label: "NOM",
                      hint: "Nom du contact (remplacé pour chaque destinataire)",
                    },
                    {
                      token: "{{marque}}",
                      label: "MARQUE",
                      hint: "Nom du client FW",
                    },
                  ]}
                />
              </div>
            </div>
            {emailError ? <p className="text-sm text-red-600">{emailError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded border"
                onClick={() => setEmailTarget(null)}
                disabled={emailSending}
              >
                Annuler
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-2 rounded bg-glowup-rose text-white disabled:opacity-60"
                onClick={sendEmail}
                disabled={emailSending}
              >
                {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {emailSending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
