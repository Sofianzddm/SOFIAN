"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CANNES_OPP_STATUTS,
  type CannesOppStatut,
} from "@/lib/cannes-partenaires/constants";

const CastingComposer = dynamic(
  () => import("@/app/(dashboard)/casting-outreach/CastingComposer"),
  { ssr: false }
);

type Opp = {
  id: string;
  nomMarque: string;
  marqueId?: string | null;
  statut: string;
  secteur?: string | null;
  angleNote?: string | null;
  contactQualifie?: boolean;
  contacts?: unknown;
  lastEmailSentAt?: string | null;
  lastEmailFrom?: string | null;
  emailSubject?: string | null;
  emailRepliedAt?: string | null;
  relanceSentAt?: string | null;
  relanceError?: string | null;
  emailOpenedAt?: string | null;
  emailOpenCount?: number;
  updatedAt?: string;
  marque?: { id: string; nom: string } | null;
};

const STATUT_LABELS: Record<CannesOppStatut, string> = {
  A_QUALIFIER: "À qualifier",
  IDENTIFIEE: "Identifiée",
  CONTACTEE: "Contactée",
  EN_NEGO: "En négo",
  SIGNEE: "Signée",
  PERDUE: "Perdue",
};

const BOARD_COLUMNS: CannesOppStatut[] = [
  "A_QUALIFIER",
  "IDENTIFIEE",
  "CONTACTEE",
  "EN_NEGO",
  "SIGNEE",
  "PERDUE",
];

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function contactCount(opp: Opp): number {
  return Array.isArray(opp.contacts) ? opp.contacts.length : 0;
}

type CrmContact = {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  poste: string | null;
  priorite: string | null;
  perimetre: string | null;
  linkedinUrl: string | null;
  emailLookupStatus: string | null;
};

type CrmMarque = {
  opportuniteId: string;
  nomMarque: string;
  marqueId: string | null;
  statut: string;
  secteur: string | null;
  siteWeb: string | null;
  ville: string | null;
  contactsCount: number;
  emailsCount: number;
  lastEmailSentAt?: string | null;
  emailRepliedAt?: string | null;
  contacts: CrmContact[];
};

export function CannesPartenairesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const initialTab =
    tabFromUrl === "crm" ||
    tabFromUrl === "contactes" ||
    tabFromUrl === "envoyer" ||
    tabFromUrl === "board"
      ? tabFromUrl
      : "board";
  const [tab, setTab] = useState<"board" | "crm" | "contactes" | "envoyer">(
    initialTab
  );
  const [opportunites, setOpportunites] = useState<Opp[]>([]);
  const [projetSender, setProjetSender] = useState<string | null>(null);
  const [senderAccounts, setSenderAccounts] = useState<
    Array<{ email: string; label: string }>
  >([]);
  const [savingSender, setSavingSender] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [crmRows, setCrmRows] = useState<CrmMarque[]>([]);
  const [crmTotals, setCrmTotals] = useState({
    marques: 0,
    contacts: 0,
    emails: 0,
  });
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmQuery, setCrmQuery] = useState("");

  const [newMarque, setNewMarque] = useState("");
  const [adding, setAdding] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContact, setComposerContact] = useState<{
    company: string;
    contacts: Array<{
      id: string;
      firstname: string;
      lastname: string;
      email: string;
      role?: string;
      market?: "FR" | "BENELUX";
    }>;
    initialSubject?: string;
    initialBodyHtml?: string;
  } | null>(null);
  const [composerOppId, setComposerOppId] = useState<string | null>(null);
  const [composerLoading, setComposerLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cannes-partenaires/opportunites");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setOpportunites((data.opportunites || []) as Opp[]);
      setProjetSender(data.projet?.senderEmail || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSender = useCallback(async () => {
    try {
      const res = await fetch("/api/cannes-partenaires/sender");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setProjetSender(
        typeof data.senderEmail === "string" ? data.senderEmail : null
      );
      setSenderAccounts(
        Array.isArray(data.accounts)
          ? data.accounts.map(
              (a: { email: string; label?: string }) => ({
                email: a.email,
                label: a.label || a.email,
              })
            )
          : []
      );
    } catch {
      /* non bloquant */
    }
  }, []);

  useEffect(() => {
    void loadSender();
  }, [loadSender]);

  async function updateSender(senderEmail: string | null) {
    setSavingSender(true);
    setError(null);
    try {
      const res = await fetch("/api/cannes-partenaires/sender", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || "Changement de boîte impossible"
        );
      }
      setProjetSender(
        (data as { projet?: { senderEmail?: string | null } }).projet
          ?.senderEmail ?? null
      );
      setFlash(
        senderEmail
          ? `Boîte d'envoi : ${senderEmail}`
          : "Boîte d'envoi réinitialisée"
      );
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingSender(false);
    }
  }

  const loadCrm = useCallback(async (q?: string) => {
    setCrmLoading(true);
    try {
      const qs = q?.trim()
        ? `?q=${encodeURIComponent(q.trim())}`
        : "";
      const res = await fetch(`/api/cannes-partenaires/crm${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "CRM indisponible");
      setCrmRows((data.marques || []) as CrmMarque[]);
      setCrmTotals(
        data.totals || { marques: 0, contacts: 0, emails: 0 }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur CRM");
    } finally {
      setCrmLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "crm") void loadCrm(crmQuery);
  }, [tab, loadCrm]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on tab open; search via bouton

  useEffect(() => {
    if (
      tabFromUrl === "crm" ||
      tabFromUrl === "contactes" ||
      tabFromUrl === "envoyer" ||
      tabFromUrl === "board"
    ) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  function selectTab(next: "board" | "crm" | "contactes" | "envoyer") {
    setTab(next);
    router.replace(`/cannes-partenaires?tab=${next}`, { scroll: false });
  }

  const byStatut = useMemo(() => {
    const map: Record<string, Opp[]> = {};
    for (const s of BOARD_COLUMNS) map[s] = [];
    for (const o of opportunites) {
      const key = BOARD_COLUMNS.includes(o.statut as CannesOppStatut)
        ? o.statut
        : "A_QUALIFIER";
      map[key].push(o);
    }
    return map;
  }, [opportunites]);

  const contactes = useMemo(
    () =>
      opportunites.filter((o) =>
        ["CONTACTEE", "EN_NEGO", "SIGNEE", "PERDUE"].includes(o.statut)
      ),
    [opportunites]
  );

  const sendable = useMemo(
    () =>
      opportunites.filter((o) =>
        ["A_QUALIFIER", "IDENTIFIEE", "CONTACTEE", "EN_NEGO"].includes(o.statut)
      ),
    [opportunites]
  );

  async function openComposer(oppId: string) {
    setComposerLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cannes-partenaires/opportunites/${oppId}/mail-contacts`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Contacts introuvables");
      const contacts = (data.contacts || []).map(
        (
          c: {
            firstName?: string;
            lastName?: string;
            email: string;
            role?: string;
          },
          i: number
        ) => ({
          id: `cannes-${oppId}-${i}-${c.email}`,
          firstname: c.firstName || "",
          lastname: c.lastName || "",
          email: c.email,
          role: c.role || "",
          market: "FR" as const,
        })
      );
      if (contacts.length === 0) {
        throw new Error(
          "Aucun contact avec email. Enrichis d’abord la carto Cannes."
        );
      }
      const marque = String(data.nomMarque || "Marque");
      setComposerOppId(oppId);
      // Pas de missionBrief : sinon CastingComposer force l'analyse talents (isProjectMode).
      setComposerContact({
        company: marque,
        contacts,
        initialSubject: `Glow Up × ${marque} — Festival de Cannes`,
        initialBodyHtml: `<p>Bonjour {{ contact.firstname }},</p>
<p>Dans le cadre du <strong>Festival de Cannes</strong>, Glow Up Agency active une villa talents et des partenariats marques (hospitalité, contenu, activations).</p>
<p>Seriez-vous ouvert·e à un échange rapide sur une collaboration avec {{ contact.company }}&nbsp;?</p>
<p>Bien à vous,</p>`,
      });
      setComposerOpen(true);
      selectTab("envoyer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setComposerLoading(false);
    }
  }

  async function addMarque() {
    const nom = newMarque.trim();
    if (!nom) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/cannes-partenaires/opportunites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomMarque: nom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Création impossible");
      setNewMarque("");
      setFlash(`${nom} ajoutée au pipeline`);
      setTimeout(() => setFlash(null), 4000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAdding(false);
    }
  }

  async function moveStatut(id: string, statut: string) {
    setError(null);
    try {
      const res = await fetch(`/api/cannes-partenaires/opportunites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-800">
            Festival de Cannes · prospection partenaires
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Cannes Partenaires
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cannes-partenaires/marques"
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-50"
          >
            Analyse marque
          </Link>
          <Link
            href="/cannes-partenaires/carto"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Lancer une carto Cannes
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
        <div className="min-w-[220px] flex-1">
          <label className="text-xs font-medium text-amber-950">
            Boîte d’envoi (Inès / Gmail connectée)
          </label>
          <select
            className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900"
            value={projetSender || ""}
            disabled={savingSender}
            onChange={(e) =>
              void updateSender(e.target.value.trim() || null)
            }
          >
            <option value="">— Choisir une boîte connectée —</option>
            {senderAccounts.map((a) => (
              <option key={a.email} value={a.email}>
                {a.label} ({a.email})
              </option>
            ))}
          </select>
        </div>
        <Link
          href="/settings/gmail"
          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
        >
          Brancher / gérer Gmail
        </Link>
        {projetSender ? (
          <p className="w-full text-xs text-amber-900/80">
            Les envois et relances Cannes partiront de{" "}
            <span className="font-medium">{projetSender}</span>.
          </p>
        ) : (
          <p className="w-full text-xs text-amber-900/80">
            Branche la boîte d’Inès (ines@glowupagence.fr) puis sélectionne-la
            ici.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {(
          [
            ["board", "Pipeline"],
            ["crm", "CRM"],
            ["contactes", `Contactés (${contactes.length})`],
            ["envoyer", "Envoyer"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === id
                ? "bg-amber-100 text-amber-950"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {flash && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {flash}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && tab !== "crm" ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : tab === "board" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="text-xs font-medium text-gray-600">
                Ajouter une marque
              </label>
              <input
                value={newMarque}
                onChange={(e) => setNewMarque(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addMarque();
                }}
                placeholder="Nom de la marque"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={adding || !newMarque.trim()}
              onClick={() => void addMarque()}
              className="rounded-md bg-amber-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {adding ? "…" : "Ajouter"}
            </button>
          </div>

          <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
            {BOARD_COLUMNS.map((col) => (
              <div
                key={col}
                className="min-w-[160px] rounded-lg border border-gray-200 bg-gray-50 p-2"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-gray-700">
                    {STATUT_LABELS[col]}
                  </span>
                  <span className="text-xs text-gray-400">
                    {byStatut[col]?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(byStatut[col] || []).map((o) => (
                    <div
                      key={o.id}
                      className="rounded-md border border-gray-200 bg-white p-2 shadow-sm"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {o.nomMarque}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {contactCount(o)} contact(s)
                        {o.lastEmailSentAt
                          ? ` · envoyé ${formatDate(o.lastEmailSentAt)}`
                          : ""}
                        {o.emailRepliedAt ? " · a répondu" : ""}
                        {o.relanceSentAt ? " · relancé" : ""}
                      </div>
                      <select
                        className="mt-2 w-full rounded border border-gray-200 bg-white px-1 py-1 text-[11px]"
                        value={o.statut}
                        onChange={(e) => void moveStatut(o.id, e.target.value)}
                      >
                        {CANNES_OPP_STATUTS.map((s) => (
                          <option key={s} value={s}>
                            {STATUT_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="mt-1 w-full text-left text-[11px] text-amber-800 underline"
                        disabled={composerLoading}
                        onClick={() => void openComposer(o.id)}
                      >
                        Rédiger / envoyer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : tab === "crm" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className="text-xs font-medium text-gray-600">
                Recherche CRM Cannes
              </label>
              <input
                value={crmQuery}
                onChange={(e) => setCrmQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadCrm(crmQuery);
                }}
                placeholder="Marque, contact, email, poste…"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadCrm(crmQuery)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800"
            >
              Filtrer
            </button>
            <p className="text-xs text-gray-500">
              {crmTotals.marques} marque(s) · {crmTotals.contacts} contact(s)
              carto · {crmTotals.emails} email(s) — isolé du CRM outreach
            </p>
          </div>

          {crmLoading ? (
            <p className="text-sm text-gray-500">Chargement CRM…</p>
          ) : crmRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
              Aucune marque Cannes pour l’instant.{" "}
              <Link
                href="/cannes-partenaires/carto"
                className="text-amber-800 underline"
              >
                Lancer une carto
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {crmRows.map((m) => (
                <button
                  key={m.opportuniteId}
                  type="button"
                  onClick={() =>
                    router.push(`/cannes-partenaires/crm/${m.opportuniteId}`)
                  }
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:border-amber-300 hover:bg-amber-50/40"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {m.nomMarque}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {STATUT_LABELS[m.statut as CannesOppStatut] || m.statut}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {[m.secteur, m.ville].filter(Boolean).join(" · ") || "—"}
                      {" · "}
                      {m.contactsCount} contact(s) · {m.emailsCount} email(s)
                      {m.lastEmailSentAt
                        ? ` · contacté ${formatDate(m.lastEmailSentAt)}`
                        : ""}
                      {m.emailRepliedAt ? " · a répondu" : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-amber-800">
                    Fiche CRM Cannes →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : tab === "contactes" ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Marque</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Dernier envoi</th>
                <th className="px-3 py-2">Relance</th>
                <th className="px-3 py-2">Réponse</th>
                <th className="px-3 py-2">De</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {contactes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-gray-500"
                  >
                    Aucune marque contactée pour l’instant.
                  </td>
                </tr>
              ) : (
                contactes.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <Link
                        href={`/cannes-partenaires/crm/${o.id}`}
                        className="hover:underline"
                      >
                        {o.nomMarque}
                      </Link>
                      {o.emailSubject ? (
                        <div className="text-xs font-normal text-gray-400">
                          {o.emailSubject}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {STATUT_LABELS[o.statut as CannesOppStatut] || o.statut}
                    </td>
                    <td className="px-3 py-2">{formatDate(o.lastEmailSentAt)}</td>
                    <td className="px-3 py-2">
                      {o.relanceSentAt
                        ? formatDate(o.relanceSentAt)
                        : o.relanceError
                          ? `Erreur: ${o.relanceError}`
                          : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {o.emailRepliedAt ? (
                        <span className="font-medium text-emerald-700">
                          {formatDate(o.emailRepliedAt)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {o.lastEmailFrom || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Relances auto J+3 ouvrés via le cron prospection projet (même
            mécanique que Villa / Ski Trip)
            {projetSender ? ` · boîte projet : ${projetSender}` : " · boîte : Leyna par défaut"}
            .
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {composerLoading ? (
            <p className="text-sm text-gray-500">Ouverture du composer…</p>
          ) : null}
          <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {sendable.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">
                Aucune marque à contacter. Ajoute-en via le pipeline ou la carto.
              </p>
            ) : (
              sendable.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {o.nomMarque}
                    </div>
                    <div className="text-xs text-gray-500">
                      {STATUT_LABELS[o.statut as CannesOppStatut] || o.statut}
                      {o.lastEmailSentAt
                        ? ` · dernier envoi ${formatDate(o.lastEmailSentAt)}`
                        : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={composerLoading}
                    onClick={() => void openComposer(o.id)}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Ouvrir le composer
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <CastingComposer
        open={composerOpen}
        contact={composerContact}
        brandColumn="todo"
        useHubspot={false}
        market="FR"
        readyMode="send"
        readyLabel="Envoyer"
        enableTalentResearch={false}
        fromEmail={projetSender}
        onClose={() => {
          setComposerOpen(false);
          setComposerContact(null);
          setComposerOppId(null);
        }}
        onError={(message) => setError(message)}
        onSuccess={(message) => {
          setFlash(message);
          setTimeout(() => setFlash(null), 6000);
        }}
        onSaved={async (status, draft) => {
          if (status !== "pret" || !composerOppId || !draft) return;
          const res = await fetch(
            `/api/cannes-partenaires/opportunites/${composerOppId}/send-email`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subject: draft.subject,
                bodyHtml: draft.bodyHtml,
                recipients: draft.selectedContacts || [],
                fromEmail: projetSender,
              }),
            }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(
              (data as { error?: string }).error || "Envoi impossible"
            );
          }
          const n = Array.isArray((data as { recipients?: unknown[] }).recipients)
            ? (data as { recipients: unknown[] }).recipients.length
            : 0;
          setFlash(
            `Mail envoyé à ${n} contact(s) · statut ${
              (data as { statut?: string }).statut || "CONTACTEE"
            }`
          );
          setTimeout(() => setFlash(null), 6000);
          setComposerOpen(false);
          setComposerContact(null);
          setComposerOppId(null);
          selectTab("contactes");
          await load();
        }}
      />
    </div>
  );
}
