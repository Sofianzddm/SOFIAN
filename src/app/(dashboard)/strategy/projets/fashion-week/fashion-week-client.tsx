"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarDays,
  Clock,
  Database,
  FileSpreadsheet,
  Download,
  Linkedin,
  Eye,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Reply,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import RichEmailEditor from "@/components/email/RichEmailEditor";
import { FwImportCartoModal } from "@/components/fw/FwImportCartoModal";
import { businessDaysAfter } from "@/lib/business-days";
import { FW_VILLES, fwVilleLabel, type FwVille } from "@/lib/fw-villes";

type FwCartoFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type FwContact = {
  id?: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  perimetre?: string | null;
  localisation?: string | null;
  linkedinUrl?: string | null;
  marquesGerees?: string | null;
  marche?: string | null;
  note?: string | null;
};

type FwClient = {
  id: string;
  nom: string;
  ville: string;
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
  cartoFiles?: FwCartoFile[];
};

type SenderAccount = { id: string; email: string; label: string };

type ContactDraft = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  perimetre: string;
  marquesGerees: string;
  marche: string;
  localisation: string;
  linkedinUrl: string;
  note: string;
};

const emptyDraft = (): ContactDraft => ({
  firstName: "",
  lastName: "",
  email: "",
  role: "",
  perimetre: "",
  marquesGerees: "",
  marche: "",
  localisation: "",
  linkedinUrl: "",
  note: "",
});

const COLUMNS = [
  {
    key: "ATTENTE_EMAILS" as const,
    label: "À compléter",
  },
  {
    key: "PRET" as const,
    label: "Prêt à envoyer",
  },
  {
    key: "ENVOYES" as const,
    label: "Envoyés",
  },
];

const STATUT_LABEL: Record<string, string> = {
  ATTENTE_EMAILS: "À compléter",
  PRET: "Prêt à envoyer",
  ENVOYE: "Envoyé",
  EN_NEGO: "En négo",
  GAGNE: "Gagné",
  PERDU: "Perdu",
};

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
  const [formVille, setFormVille] = useState<FwVille>("PARIS");
  const [formDate, setFormDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [filterVille, setFilterVille] = useState<FwVille | "ALL">("ALL");
  const [tab, setTab] = useState<"crm" | "pipeline">("crm");
  const [crmSearch, setCrmSearch] = useState("");

  const [senderEmail, setSenderEmail] = useState<string | null>("ines@glowupagence.fr");
  const [senderAccounts, setSenderAccounts] = useState<SenderAccount[]>([]);

  const [emailTarget, setEmailTarget] = useState<FwClient | null>(null);
  const [emailForm, setEmailForm] = useState({ subject: "", bodyHtml: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [contactsTarget, setContactsTarget] = useState<FwClient | null>(null);
  const [showCartoModal, setShowCartoModal] = useState(false);
  const [cartoClient, setCartoClient] = useState<FwClient | null>(null);
  const [droppedCarto, setDroppedCarto] = useState<File | null>(null);
  const [cartoDragOver, setCartoDragOver] = useState(false);

  function openCartoImport(client?: FwClient | null, file?: File | null) {
    setContactsTarget(null);
    setCartoClient(client || null);
    setDroppedCarto(file || null);
    setShowCartoModal(true);
  }
  const [contactDrafts, setContactDrafts] = useState<ContactDraft[]>([emptyDraft()]);
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

  const visibleClients = useMemo(() => {
    const byVille =
      filterVille === "ALL" ? clients : clients.filter((c) => c.ville === filterVille);
    const q = crmSearch.trim().toLowerCase();
    if (!q) return byVille;
    return byVille.filter((c) => {
      const emails = (c.contacts || []).map((ct) => ct.email).join(" ");
      return [c.nom, c.notes || "", emails, fwVilleLabel(c.ville)].join(" ").toLowerCase().includes(q);
    });
  }, [clients, filterVille, crmSearch]);

  const byColumn = useMemo(() => {
    const attente = visibleClients.filter((c) => c.statut === "ATTENTE_EMAILS");
    const pret = visibleClients.filter((c) => c.statut === "PRET");
    const envoyes = visibleClients.filter(
      (c) => c.statut !== "ATTENTE_EMAILS" && c.statut !== "PRET"
    );
    return { ATTENTE_EMAILS: attente, PRET: pret, ENVOYES: envoyes };
  }, [visibleClients]);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    const nom = formNom.trim();
    if (!nom || !formDate) {
      setFormError("Nom du client, ville et date du défilé requis.");
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
          ville: formVille,
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
      setFormVille("PARIS");
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

  async function patchClient(id: string, data: Record<string, unknown>) {
    await fetch(`/api/strategy/fw/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  }

  async function patchStatut(id: string, statut: string) {
    await patchClient(id, { statut });
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
            lastName: c.lastName || "",
            email: c.email || "",
            role: c.role || "",
            perimetre: c.perimetre || "",
            marquesGerees: c.marquesGerees || "",
            marche: c.marche || "",
            localisation: c.localisation || "",
            linkedinUrl: c.linkedinUrl || "",
            note: c.note || "",
          }))
        : [emptyDraft()]
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
              lastName: c.lastName.trim(),
              email: c.email.trim(),
              role: c.role.trim(),
              perimetre: c.perimetre.trim(),
              marquesGerees: c.marquesGerees.trim(),
              marche: c.marche.trim(),
              localisation: c.localisation.trim(),
              linkedinUrl: c.linkedinUrl.trim(),
              note: c.note.trim(),
            }))
            .filter((c) => c.email || c.firstName || c.lastName),
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
      subject: `Glow Up x ${client.nom} — Fashion Week ${fwVilleLabel(client.ville)}`,
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
          <div className="md:w-44">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Fashion Week
            </label>
            <select
              value={formVille}
              onChange={(e) => setFormVille(e.target.value as FwVille)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              {FW_VILLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("crm")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${
            tab === "crm" ? "bg-glowup-rose text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600"
          }`}
        >
          <Database className="h-4 w-4" />
          Base CRM
          <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${tab === "crm" ? "bg-white/20" : "bg-gray-100"}`}>
            {clients.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("pipeline")}
          className={`rounded-xl px-4 py-2 text-sm font-medium ${
            tab === "pipeline" ? "bg-glowup-rose text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600"
          }`}
        >
          Prospection
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => openCartoImport(null)}
            onDragEnter={(e) => {
              e.preventDefault();
              setCartoDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setCartoDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setCartoDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setCartoDragOver(false);
              openCartoImport(null, e.dataTransfer.files?.[0] || null);
            }}
            className={`ml-auto inline-flex items-center gap-2 rounded-xl border-2 border-dashed px-4 py-2 text-sm font-semibold ${
              cartoDragOver
                ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                : "border-glowup-rose/40 bg-white text-glowup-rose hover:bg-rose-50"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Importer un Excel
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterVille("ALL")}
          className={`rounded-full px-3 py-1 text-xs font-medium border ${
            filterVille === "ALL"
              ? "bg-glowup-rose text-white border-glowup-rose"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          Toutes
        </button>
        {FW_VILLES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setFilterVille(v.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium border ${
              filterVille === v.id
                ? "bg-glowup-rose text-white border-glowup-rose"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : tab === "crm" ? (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Maisons</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => openCartoImport(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Importer une carto
                </button>
              ) : null}
              <div className="relative md:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  placeholder="Chercher une maison, un mail…"
                  className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </div>
          </div>
          {visibleClients.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-gray-400">
              Aucune maison dans la base{filterVille !== "ALL" ? ` ${fwVilleLabel(filterVille)}` : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Maison</th>
                    <th className="px-4 py-2 font-medium">Ville</th>
                    <th className="px-4 py-2 font-medium">Défilé</th>
                    <th className="px-4 py-2 font-medium">Contacts</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                    <th className="px-4 py-2 font-medium">Statut</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleClients.map((c) => (
                    <tr key={c.id} className="align-top hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{c.nom}</p>
                        <EmailTrackingBadges client={c} />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                          value={c.ville}
                          onChange={(e) => patchClient(c.id, { ville: e.target.value })}
                        >
                          {FW_VILLES.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatDefile(c.dateDefile)}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <div className="space-y-1">
                            {(c.contacts || []).length === 0 ? (
                              <p className="text-[11px] text-gray-400">—</p>
                            ) : (
                              (c.contacts || []).map((ct, idx) => (
                                <div
                                  key={ct.id || `${ct.email}-${idx}`}
                                  className="text-xs text-gray-700"
                                >
                                  <p className="font-medium">
                                    {[ct.firstName, ct.lastName].filter(Boolean).join(" ") ||
                                      "Sans nom"}
                                    {ct.linkedinUrl ? (
                                      <a
                                        href={ct.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-1 inline-flex text-[#0A66C2]"
                                      >
                                        <Linkedin className="inline h-3 w-3" />
                                      </a>
                                    ) : null}
                                  </p>
                                  <p className="text-[11px] text-gray-500">
                                    {[ct.role, ct.perimetre, ct.marquesGerees]
                                      .filter(Boolean)
                                      .join(" · ") || null}
                                  </p>
                                  <p>
                                    {ct.email || (
                                      <span className="text-amber-700">mail à noter</span>
                                    )}
                                  </p>
                                  {ct.note ? (
                                    <p className="text-[11px] text-gray-400">{ct.note}</p>
                                  ) : null}
                                </div>
                              ))
                            )}
                            <div className="flex flex-wrap gap-x-2 gap-y-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => openContacts(c)}
                              className="text-[11px] font-medium text-glowup-rose"
                            >
                              {c.hasEmails ? "Modifier" : "Ajouter"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openCartoImport(c)}
                              className="text-[11px] font-medium text-gray-500 hover:text-glowup-rose"
                            >
                              Carto
                            </button>
                            {(c.contacts || []).length > 0 ? (
                              <a
                                href={`/api/strategy/fw/clients/${c.id}/export-carto`}
                                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-500 hover:text-glowup-rose"
                              >
                                <Download className="h-3 w-3" />
                                Excel
                              </a>
                            ) : null}
                            {(c.cartoFiles || []).map((f) => (
                              <a
                                key={f.id}
                                href={`/api/strategy/fw/clients/${c.id}/carto-files/${f.id}`}
                                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 hover:underline"
                                title={f.fileName}
                              >
                                <FileSpreadsheet className="h-3 w-3" />
                                {f.fileName}
                              </a>
                            ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600">
                            {c.hasEmails ? `${c.contactCount}` : "—"}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <textarea
                          defaultValue={c.notes || ""}
                          key={`${c.id}-${c.notes || ""}`}
                          rows={2}
                          placeholder="Notes"
                          className="w-full resize-none rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next === (c.notes || "").trim()) return;
                            patchClient(c.id, { notes: next || null });
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {c.statut === "ATTENTE_EMAILS" || c.statut === "PRET" ? (
                          <span className="text-xs text-gray-600">{STATUT_LABEL[c.statut]}</span>
                        ) : (
                          <select
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                            value={c.statut}
                            onChange={(e) => patchStatut(c.id, e.target.value)}
                          >
                            <option value="ENVOYE">Envoyé</option>
                            <option value="EN_NEGO">En négo</option>
                            <option value="GAGNE">Gagné</option>
                            <option value="PERDU">Perdu</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {c.statut === "PRET" ? (
                            <button
                              type="button"
                              onClick={() => openEmailModal(c)}
                              className="inline-flex items-center gap-1 rounded-lg bg-glowup-rose px-2 py-1 text-[11px] font-medium text-white"
                            >
                              <Send className="h-3 w-3" />
                              Envoyer
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => deleteClient(c.id, c.nom)}
                            className="rounded-lg p-1 text-gray-300 hover:text-red-500"
                            title="Retirer de la base FW"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = clientsOf(col.key);
            return (
              <div key={col.key} className="rounded-2xl border border-gray-200 bg-gray-50/40 p-3">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{col.label}</p>
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
                          <MapPin className="h-3.5 w-3.5" />
                          {fwVilleLabel(c.ville)}
                          <span className="text-gray-300">·</span>
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDefile(c.dateDefile)}
                        </p>

                        {isAdmin && (c.contacts?.length ?? 0) > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.contacts!.map((ct, idx) => (
                              <span
                                key={ct.id || `${ct.email}-${idx}`}
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
                            <>
                            <button
                              type="button"
                              onClick={() => openContacts(c)}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil className="h-3 w-3" />
                              {c.hasEmails ? "Contacts" : "Ajouter un contact"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openCartoImport(c)}
                              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-glowup-rose/40 px-2.5 py-1 text-[11px] font-medium text-glowup-rose hover:bg-rose-50"
                            >
                              <FileSpreadsheet className="h-3 w-3" />
                              Excel
                            </button>
                            </>
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
          <div className="w-full max-w-3xl max-h-[min(92vh,820px)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Contacts · {contactsTarget.nom}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Importe un Excel, ou saisis à la main. {"{{prenom}}"} est remplacé à l’envoi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCartoImport(contactsTarget)}
                className="inline-flex items-center gap-2 rounded-xl bg-glowup-rose px-3 py-2 text-sm font-medium text-white"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Importer l’Excel
              </button>
            </div>
            <div className="space-y-4">
              {contactDrafts.map((row, idx) => (
                <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      className="col-span-3 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Prénom"
                      value={row.firstName}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, firstName: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-3 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Nom"
                      value={row.lastName}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, lastName: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-6 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="email@maison.com"
                      value={row.email}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-4 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Rôle"
                      value={row.role}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, role: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-4 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Équipe / Périmètre"
                      value={row.perimetre}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, perimetre: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-4 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Marque(s) gérée(s)"
                      value={row.marquesGerees}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, marquesGerees: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-3 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Marché"
                      value={row.marche}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, marche: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-3 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Localisation"
                      value={row.localisation}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, localisation: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-6 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="URL LinkedIn"
                      value={row.linkedinUrl}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, linkedinUrl: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="col-span-12 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      placeholder="Note"
                      value={row.note}
                      onChange={(e) =>
                        setContactDrafts((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setContactDrafts((rows) => [...rows, emptyDraft()])}
              className="text-sm font-medium text-glowup-rose"
            >
              + Ajouter un contact
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
                Envoi depuis {senderLabel(senderAccounts, senderEmail)}. Signature Gmail ajoutée
                automatiquement.
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
      {showCartoModal && isAdmin ? (
        <FwImportCartoModal
          lockedClient={cartoClient ? { id: cartoClient.id, nom: cartoClient.nom } : null}
          clients={clients.map((c) => ({ id: c.id, nom: c.nom }))}
          initialFile={droppedCarto}
          defaultVille={filterVille === "ALL" ? "PARIS" : filterVille}
          onClose={() => {
            setShowCartoModal(false);
            setCartoClient(null);
            setDroppedCarto(null);
          }}
          onImported={() => {
            setShowCartoModal(false);
            setCartoClient(null);
            setDroppedCarto(null);
            void load();
          }}
          onError={(m) => {
            setShowCartoModal(false);
            setFormError(m);
          }}
        />
      ) : null}
    </div>
  );
}
