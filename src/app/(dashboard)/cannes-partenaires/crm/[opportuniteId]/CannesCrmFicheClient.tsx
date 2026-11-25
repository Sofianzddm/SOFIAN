"use client";

/**
 * Fiche CRM Cannes Partenaires — même langage visuel que /marques,
 * mais données 100 % isolées (pas de collabs, fusion, CA, AO outreach).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Calendar,
  Globe,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Send,
  Users,
} from "lucide-react";
import {
  CANNES_OPP_STATUTS,
  type CannesOppStatut,
} from "@/lib/cannes-partenaires/constants";

const CastingComposer = dynamic(
  () => import("@/app/(dashboard)/casting-outreach/CastingComposer"),
  { ssr: false }
);

const INK = "#16110F";
const ROSE = "#C08B8B";
const BG = "#FAF9F7";

const STATUT_LABELS: Record<CannesOppStatut, string> = {
  A_QUALIFIER: "À qualifier",
  IDENTIFIEE: "Identifiée",
  CONTACTEE: "Contactée",
  EN_NEGO: "En négo",
  SIGNEE: "Signée",
  PERDUE: "Perdue",
};

const STATUT_STYLE: Record<string, { bg: string; color: string }> = {
  A_QUALIFIER: { bg: "#F3F4F6", color: "#4B5563" },
  IDENTIFIEE: { bg: "#EEF2FF", color: "#4338CA" },
  CONTACTEE: { bg: "#FEF3C7", color: "#92400E" },
  EN_NEGO: { bg: "#FFEDD5", color: "#9A3412" },
  SIGNEE: { bg: "#DCFCE7", color: "#166534" },
  PERDUE: { bg: "#FEE2E2", color: "#991B1B" },
};

type Contact = {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  poste: string | null;
  priorite: string | null;
  perimetre: string | null;
  localisation: string | null;
  linkedinUrl: string | null;
  emailLookupStatus: string | null;
};

type Fiche = {
  id: string;
  nomMarque: string;
  marqueId: string | null;
  statut: string;
  secteur: string | null;
  angleNote: string | null;
  typeActivation: string | null;
  siteWeb: string | null;
  ville: string | null;
  contactQualifie: boolean;
  lastEmailSentAt: string | null;
  lastEmailFrom: string | null;
  emailSubject: string | null;
  emailRepliedAt: string | null;
  relanceSentAt: string | null;
  emailOpenCount: number | null;
  createdAt: string;
  updatedAt: string;
  contactsCount: number;
  emailsCount: number;
  contacts: Contact[];
};

type TabId = "overview" | "contacts" | "activite";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function siteDomain(siteWeb: string | null) {
  if (!siteWeb) return null;
  try {
    const u = siteWeb.startsWith("http") ? siteWeb : `https://${siteWeb}`;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return siteWeb;
  }
}

function initials(prenom: string | null, nom: string) {
  return (
    ((prenom || "").charAt(0) + (nom || "").charAt(0) || nom.slice(0, 2)) || "?"
  ).toUpperCase();
}

export function CannesCrmFicheClient({
  opportuniteId,
}: {
  opportuniteId: string;
}) {
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatut, setSavingStatut] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [logoError, setLogoError] = useState(false);

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
  const [composerLoading, setComposerLoading] = useState(false);
  const [projetSender, setProjetSender] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cannes-partenaires/sender");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setProjetSender(
            typeof data.senderEmail === "string" ? data.senderEmail : null
          );
        }
      } catch {
        /* non bloquant */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cannes-partenaires/crm/${opportuniteId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fiche introuvable");
      setFiche(data.opportunite as Fiche);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setFiche(null);
    } finally {
      setLoading(false);
    }
  }, [opportuniteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatut(statut: string) {
    setSavingStatut(true);
    setError(null);
    try {
      const res = await fetch(`/api/cannes-partenaires/crm/${opportuniteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible");
      setFiche((prev) => (prev ? { ...prev, statut } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingStatut(false);
    }
  }

  async function openComposer() {
    setComposerLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cannes-partenaires/opportunites/${opportuniteId}/mail-contacts`
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
          id: `cannes-${opportuniteId}-${i}-${c.email}`,
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
      const marque = String(data.nomMarque || fiche?.nomMarque || "Marque");
      setComposerContact({
        company: marque,
        contacts,
        initialSubject: `Glow Up × ${marque} — Festival de Cannes`,
        initialBodyHtml: `<p>Bonjour {{ contact.firstname }},</p>
<p>Dans le cadre du <strong>Festival de Cannes</strong>, Glow Up Agency active une villa talents et des partenariats marques.</p>
<p>Seriez-vous ouvert·e à un échange sur une collaboration avec {{ contact.company }}&nbsp;?</p>
<p>Bien à vous,</p>`,
      });
      setComposerOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setComposerLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" style={{ backgroundColor: BG }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: ROSE }} />
      </div>
    );
  }

  if (!fiche) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <p className="text-red-600">{error || "Fiche introuvable"}</p>
        <Link
          href="/cannes-partenaires?tab=crm"
          className="text-sm underline"
          style={{ color: ROSE }}
        >
          ← Retour CRM Cannes
        </Link>
      </div>
    );
  }

  const domain = siteDomain(fiche.siteWeb);
  const lifecycle = STATUT_STYLE[fiche.statut] || STATUT_STYLE.A_QUALIFIER;
  const tabs: Array<{ id: TabId; label: string; badge?: number | null }> = [
    { id: "overview", label: "Overview" },
    {
      id: "contacts",
      label: "Contacts",
      badge: fiche.contactsCount || null,
    },
    { id: "activite", label: "Activité" },
  ];

  return (
    <div className="min-h-full" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-6">
        {/* Bandeau Cannes */}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-900/70">
                Cannes Partenaires · isolé du CRM marques
              </p>
              <p className="truncate text-sm text-amber-950">
                Pipeline opportunité · {fiche.nomMarque}
              </p>
              {fiche.angleNote ? (
                <p className="mt-1 line-clamp-2 text-xs text-amber-900/80">
                  {fiche.angleNote}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900"
                value={fiche.statut}
                disabled={savingStatut}
                onChange={(e) => void changeStatut(e.target.value)}
              >
                {CANNES_OPP_STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {STATUT_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void openComposer()}
                disabled={composerLoading}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: "#92400E" }}
              >
                {composerLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Envoyer (Cannes)
              </button>
            </div>
          </div>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/cannes-partenaires?tab=crm"
            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            CRM Cannes
          </Link>
          <span className="text-gray-300">/</span>
          <span className="truncate font-medium" style={{ color: INK }}>
            {fiche.nomMarque}
          </span>
        </div>

        {/* Record header */}
        <div className="rounded-xl bg-white px-4 py-4 ring-1 ring-black/[0.06] sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#FAF9F7] ring-1 ring-black/[0.06]">
                {domain && !logoError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
                    alt={fiche.nomMarque}
                    className="h-7 w-7 object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="text-lg font-bold" style={{ color: ROSE }}>
                    {fiche.nomMarque.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1
                    className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em]"
                    style={{ color: INK }}
                  >
                    {fiche.nomMarque}
                  </h1>
                  <span
                    className="inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: lifecycle.bg,
                      color: lifecycle.color,
                    }}
                  >
                    {STATUT_LABELS[fiche.statut as CannesOppStatut] ||
                      fiche.statut}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-500">
                  {fiche.secteur ? <span>{fiche.secteur}</span> : null}
                  {domain ? (
                    <a
                      href={
                        fiche.siteWeb!.startsWith("http")
                          ? fiche.siteWeb!
                          : `https://${fiche.siteWeb}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:underline"
                      style={{ color: ROSE }}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {domain}
                    </a>
                  ) : null}
                  {fiche.ville ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {fiche.ville}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1 text-gray-400">
                    <Calendar className="h-3.5 w-3.5" />
                    pipeline depuis{" "}
                    {new Date(fiche.createdAt).toLocaleDateString("fr-FR", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-black/[0.06]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t.id ? "" : "text-gray-400 hover:text-gray-700"
              }`}
              style={tab === t.id ? { color: INK } : undefined}
            >
              {t.label}
              {t.badge ? (
                <span className="ml-1.5 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[11px] text-gray-500">
                  {t.badge}
                </span>
              ) : null}
              {tab === t.id ? (
                <span
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                  style={{ backgroundColor: ROSE }}
                />
              ) : null}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">
            {tab === "overview" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-black/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Contacts Cannes
                    </p>
                    <p className="mt-1 text-xl font-semibold" style={{ color: INK }}>
                      {fiche.contactsCount}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      {fiche.emailsCount} email(s)
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-black/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Dernier envoi
                    </p>
                    <p className="mt-1 text-[15px] font-semibold" style={{ color: INK }}>
                      {formatDate(fiche.lastEmailSentAt)}
                    </p>
                    <p className="truncate text-[12px] text-gray-500">
                      {fiche.lastEmailFrom || "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-black/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Réponse
                    </p>
                    <p className="mt-1 text-[15px] font-semibold" style={{ color: INK }}>
                      {fiche.emailRepliedAt
                        ? formatDate(fiche.emailRepliedAt)
                        : "—"}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      Relance : {formatDate(fiche.relanceSentAt)}
                    </p>
                  </div>
                </div>

                {fiche.emailSubject ? (
                  <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-black/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                      Dernier objet
                    </p>
                    <p className="mt-1 text-[13px]" style={{ color: INK }}>
                      {fiche.emailSubject}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-xl bg-white ring-1 ring-black/[0.06]">
                  <div className="flex items-center justify-between border-b border-black/[0.04] px-4 py-3">
                    <p className="text-[13px] font-semibold" style={{ color: INK }}>
                      Contacts carto Cannes
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab("contacts")}
                      className="text-[12px] font-medium hover:underline"
                      style={{ color: ROSE }}
                    >
                      Voir tout
                    </button>
                  </div>
                  <ul className="divide-y divide-black/[0.04]">
                    {fiche.contacts.slice(0, 5).map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start gap-3 px-4 py-3"
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                          style={{
                            background:
                              "linear-gradient(135deg, #3A2E2A, #16110F)",
                          }}
                        >
                          {initials(c.prenom, c.nom)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-[13.5px] font-semibold"
                            style={{ color: INK }}
                          >
                            {[c.prenom, c.nom].filter(Boolean).join(" ")}
                          </p>
                          {c.poste ? (
                            <p className="text-[12px] text-gray-500">{c.poste}</p>
                          ) : null}
                          {c.email ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-gray-600">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[12px] text-amber-700">
                              Pas d’email
                            </p>
                          )}
                        </div>
                        {c.linkedinUrl ? (
                          <a
                            href={c.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-gray-400 hover:text-[#0A66C2]"
                          >
                            <Linkedin className="h-4 w-4" />
                          </a>
                        ) : null}
                      </li>
                    ))}
                    {fiche.contacts.length === 0 ? (
                      <li className="px-4 py-8 text-center text-sm text-gray-500">
                        Aucun contact carto Cannes. Lance une carto.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </>
            ) : null}

            {tab === "contacts" ? (
              <div className="rounded-xl bg-white ring-1 ring-black/[0.06]">
                <div className="flex items-center gap-2 border-b border-black/[0.04] px-4 py-3">
                  <Users className="h-4 w-4" style={{ color: ROSE }} />
                  <p className="text-[13px] font-semibold" style={{ color: INK }}>
                    Contacts isolés (CARTO · hors outreach)
                  </p>
                </div>
                <ul className="divide-y divide-black/[0.04]">
                  {fiche.contacts.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-3.5 px-4 py-3.5"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                        style={{
                          background:
                            "linear-gradient(135deg, #3A2E2A, #16110F)",
                        }}
                      >
                        {initials(c.prenom, c.nom)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className="text-[13.5px] font-semibold"
                            style={{ color: INK }}
                          >
                            {[c.prenom, c.nom].filter(Boolean).join(" ")}
                          </p>
                          {c.priorite ? (
                            <span className="rounded bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                              {c.priorite}
                            </span>
                          ) : null}
                        </div>
                        {c.poste ? (
                          <p className="text-[12px] text-gray-500">{c.poste}</p>
                        ) : null}
                        {c.perimetre ? (
                          <p className="text-[11px] text-gray-400">
                            {c.perimetre}
                            {c.localisation ? ` · ${c.localisation}` : ""}
                          </p>
                        ) : null}
                        {c.email ? (
                          <p className="mt-1 flex items-center gap-1 text-[12px] text-gray-600">
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </p>
                        ) : (
                          <p className="mt-1 text-[12px] text-amber-700">
                            Email manquant
                          </p>
                        )}
                      </div>
                      {c.linkedinUrl ? (
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-gray-400 hover:text-[#0A66C2]"
                        >
                          <Linkedin className="h-4 w-4" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                  {fiche.contacts.length === 0 ? (
                    <li className="px-4 py-10 text-center text-sm text-gray-500">
                      Aucun contact.{" "}
                      <Link
                        href="/cannes-partenaires/carto"
                        className="underline"
                        style={{ color: ROSE }}
                      >
                        Lancer une carto
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {tab === "activite" ? (
              <div className="rounded-xl bg-white ring-1 ring-black/[0.06]">
                <div className="border-b border-black/[0.04] px-4 py-3">
                  <p className="text-[13px] font-semibold" style={{ color: INK }}>
                    Activité pipeline Cannes
                  </p>
                </div>
                <ul className="divide-y divide-black/[0.04] text-[13px]">
                  <li className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-gray-500">Créée</span>
                    <span style={{ color: INK }}>
                      {formatDate(fiche.createdAt)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-gray-500">Mise à jour</span>
                    <span style={{ color: INK }}>
                      {formatDate(fiche.updatedAt)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-gray-500">Dernier envoi</span>
                    <span style={{ color: INK }}>
                      {formatDate(fiche.lastEmailSentAt)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-gray-500">Relance</span>
                    <span style={{ color: INK }}>
                      {formatDate(fiche.relanceSentAt)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-gray-500">Réponse</span>
                    <span style={{ color: INK }}>
                      {formatDate(fiche.emailRepliedAt)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-gray-500">Ouvertures</span>
                    <span style={{ color: INK }}>
                      {fiche.emailOpenCount ?? 0}
                    </span>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>

          {/* Sidebar About */}
          <aside className="space-y-4">
            <div className="rounded-xl bg-white px-4 py-4 ring-1 ring-black/[0.06]">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                About · Cannes
              </p>
              <dl className="space-y-3 text-[12.5px]">
                <div>
                  <dt className="text-gray-400">Statut pipeline</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: INK }}>
                    {STATUT_LABELS[fiche.statut as CannesOppStatut] ||
                      fiche.statut}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Secteur</dt>
                  <dd className="mt-0.5" style={{ color: INK }}>
                    {fiche.secteur || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Ville</dt>
                  <dd className="mt-0.5" style={{ color: INK }}>
                    {fiche.ville || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Activation</dt>
                  <dd className="mt-0.5" style={{ color: INK }}>
                    {fiche.typeActivation || "CANNES_PARTENARIAT"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Contacts qualifiés</dt>
                  <dd className="mt-0.5" style={{ color: INK }}>
                    {fiche.contactQualifie ? "Oui" : "Non"}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="px-1 text-[11px] leading-relaxed text-gray-400">
              Cette fiche ne montre que le pipeline Cannes Partenaires. Pas de
              collabs, CA, fusion ni cycle outreach du CRM marques.
            </p>
          </aside>
        </div>
      </div>

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
        }}
        onError={(message) => setError(message)}
        onSuccess={() => {}}
        onSaved={async (status, draft) => {
          if (status !== "pret" || !draft) return;
          const res = await fetch(
            `/api/cannes-partenaires/opportunites/${opportuniteId}/send-email`,
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
          setComposerOpen(false);
          setComposerContact(null);
          await load();
        }}
      />
    </div>
  );
}
