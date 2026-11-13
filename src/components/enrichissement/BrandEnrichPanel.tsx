"use client";

/**
 * Panneau enrichissement d'une fiche marque (FR / Benelux) —
 * même UX que /enrichissement (cartes, Enrichir, FR/BE/FR+BE, Tester…).
 * Réutilisé par le lab carto-pipeline (étape 2 in-page).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Globe,
  Linkedin,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import type {
  EnrichCompareResponse,
  ProviderEnrichmentResult,
} from "@/lib/enrichment/types";
import type {
  EmailVerifyResult,
  EmailVerifyStatus,
} from "@/lib/enrichment/verify-email";
import {
  detectEmailPattern,
  suggestEmailsForContact,
  type DetectedEmailPattern,
  type EmailSuggestion,
} from "@/lib/email-pattern";

const INK = "#1A1110";
const ROSE = "#C08B8B";
const CREAM = "#F5EBE0";
const GREEN = "#3D8B40";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type BrandMarket = "FR" | "BENELUX";
type PersonMarket = BrandMarket | "BOTH";
type ContactLang = "fr" | "en";
type Market = BrandMarket;

type LookupContact = {
  id: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  language: string;
  marqueId: string;
  company: string;
  market: Market;
  source: "CARTO" | "AO" | null;
  siblingCompany?: boolean;
  emailSuggested?: string | null;
  pattern?: {
    kind: string;
    domain: string;
    matches: number;
    label: string;
  } | null;
  suggestions?: EmailSuggestion[];
};

type PersonRef = { id: string; market: Market; marqueId: string };

type Person = {
  key: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  language: ContactLang;
  source: "CARTO" | "AO" | null;
  refs: PersonRef[];
};

const personMarketSelection = (p: Person): PersonMarket => {
  const hasFr = p.refs.some((r) => r.market === "FR");
  const hasBe = p.refs.some((r) => r.market === "BENELUX");
  if (hasFr && hasBe) return "BOTH";
  if (hasBe) return "BENELUX";
  return "FR";
};

const marketsFromSelection = (m: PersonMarket): BrandMarket[] =>
  m === "BOTH" ? ["FR", "BENELUX"] : [m];

const toLang = (v: string | null | undefined): ContactLang =>
  v === "en" ? "en" : "fr";

const verifyStatusColor = (status: EmailVerifyStatus): string => {
  switch (status) {
    case "valid":
      return GREEN;
    case "invalid":
    case "no_mx":
      return "#DC2626";
    case "catch_all":
      return "#D97706";
    default:
      return "#6B7280";
  }
};

function ProviderCard({
  label,
  result,
  agreement,
  onPick,
  onVerify,
  verifyingEmail,
  verifyByEmail,
}: {
  label: string;
  result: ProviderEnrichmentResult;
  agreement: string[];
  onPick: (email: string) => void;
  onVerify: (email: string) => void;
  verifyingEmail: string | null;
  verifyByEmail: Record<string, EmailVerifyResult>;
}) {
  const agreeSet = new Set(agreement.map((e) => e.toLowerCase()));
  return (
    <div
      className="min-w-0 space-y-2 rounded-lg border p-3"
      style={{ borderColor: "#E5E0DA", backgroundColor: "#FAFAF8" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: INK }}>
          {label}
        </span>
        {!result.configured ? (
          <span className="text-[10px] font-medium text-amber-700">
            Clé API manquante
          </span>
        ) : result.ok && result.found ? (
          <span className="text-[10px] font-medium" style={{ color: GREEN }}>
            Match
            {result.confidence ? ` · ${result.confidence}` : ""}
          </span>
        ) : result.ok ? (
          <span className="text-[10px] font-medium text-gray-400">
            Non trouvé
          </span>
        ) : (
          <span className="text-[10px] font-medium text-red-600">Erreur</span>
        )}
      </div>
      {result.error ? (
        <p className="text-[11px] leading-snug text-red-600/90">{result.error}</p>
      ) : null}
      {(result.fullName || result.title || result.company) && (
        <p className="text-[11px] leading-snug text-gray-500">
          {[result.fullName, result.title, result.company]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {result.emails.length > 0 ? (
        <div className="space-y-1.5">
          {result.emails.map((e) => {
            const shared = agreeSet.has(e.email.toLowerCase());
            const verified = verifyByEmail[e.email.toLowerCase()];
            const isVerifying = verifyingEmail === e.email.toLowerCase();
            return (
              <div key={e.email} className="space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onPick(e.email)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition"
                    style={{
                      color: INK,
                      backgroundColor: shared ? "#EEF7EE" : "#fff",
                      borderColor: shared ? GREEN : "#E5E0DA",
                    }}
                  >
                    {shared ? (
                      <Check className="h-3 w-3" style={{ color: GREEN }} />
                    ) : null}
                    {e.email}
                    <span className="text-[9px] uppercase text-gray-400">
                      {e.type}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerify(e.email)}
                    disabled={isVerifying}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold disabled:opacity-40"
                    style={{
                      color: INK,
                      borderColor: "#E5E0DA",
                      backgroundColor: "#fff",
                    }}
                  >
                    {isVerifying ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3 w-3" />
                    )}
                    Tester
                  </button>
                </div>
                {verified ? (
                  <p
                    className="pl-0.5 text-[10px] leading-snug"
                    style={{ color: verifyStatusColor(verified.status) }}
                  >
                    {verified.label}
                    {verified.detail ? ` — ${verified.detail}` : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">Aucun email révélé</p>
      )}
    </div>
  );
}

export type BrandEnrichPanelProps = {
  marqueId: string;
  market: BrandMarket;
  company: string;
  fichePath?: string;
  onBack?: () => void;
};

export function BrandEnrichPanel({
  marqueId,
  market,
  company,
  fichePath,
  onBack,
}: BrandEnrichPanelProps) {
  const [contacts, setContacts] = useState<LookupContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notFound, setNotFound] = useState<Record<string, boolean>>({});
  const [enrichResults, setEnrichResults] = useState<
    Record<string, EnrichCompareResponse>
  >({});
  const [enrichingKey, setEnrichingKey] = useState<string | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichAllProgress, setEnrichAllProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [savingPersonKey, setSavingPersonKey] = useState<string | null>(null);
  const [savingLangKey, setSavingLangKey] = useState<string | null>(null);
  const [savingMarketKey, setSavingMarketKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState<string | null>(null);
  const [verifyByEmail, setVerifyByEmail] = useState<
    Record<string, EmailVerifyResult>
  >({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/email-lookup");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      const all = (data.contacts || []) as LookupContact[];
      setContacts(
        all.filter(
          (c) =>
            c.marqueId === marqueId &&
            (c.market === "FR" || c.market === "BENELUX")
        )
      );
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [marqueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const people: Person[] = useMemo(() => {
    const map = new Map<string, Person>();
    for (const c of contacts) {
      const personId = `${norm(c.prenom || "")}|${norm(c.nom)}|${c.source || ""}`;
      const key = `${norm(c.company)}::${personId}`;
      let p = map.get(key);
      if (!p) {
        p = {
          key,
          prenom: c.prenom,
          nom: c.nom,
          poste: c.poste,
          perimetre: c.perimetre,
          localisation: c.localisation,
          priorite: c.priorite,
          linkedinUrl: c.linkedinUrl,
          language: toLang(c.language),
          source: c.source,
          refs: [],
        };
        map.set(key, p);
      }
      if (!p.linkedinUrl && c.linkedinUrl) p.linkedinUrl = c.linkedinUrl;
      if (!p.poste && c.poste) p.poste = c.poste;
      if (toLang(c.language) === "en") p.language = "en";
      p.refs.push({ id: c.id, market: c.market, marqueId: c.marqueId });
    }
    return Array.from(map.values());
  }, [contacts]);

  useEffect(() => {
    if (people.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of people) {
        if (next[p.key]) continue;
        const row = contacts.find((c) => p.refs.some((r) => r.id === c.id));
        const suggested = row?.emailSuggested?.trim();
        if (suggested && isValidEmail(suggested)) next[p.key] = suggested;
      }
      return next;
    });
  }, [people, contacts]);

  const livePattern = useMemo((): DetectedEmailPattern | null => {
    const row = contacts.find((c) => c.pattern?.kind && c.pattern?.domain);
    if (!row?.pattern) return null;
    return {
      kind: row.pattern.kind as DetectedEmailPattern["kind"],
      domain: row.pattern.domain,
      matches: row.pattern.matches,
      sampleSize: row.pattern.matches,
    };
  }, [contacts]);

  const suggestionFor = (p: Person): EmailSuggestion[] => {
    const row = contacts.find((c) => p.refs.some((r) => r.id === c.id));
    if (row?.suggestions?.length) return row.suggestions;
    if (!livePattern) return [];
    return suggestEmailsForContact({
      prenom: p.prenom,
      nom: p.nom,
      pattern: livePattern,
    });
  };

  const resolvedCount = people.filter(
    (p) => notFound[p.key] || isValidEmail(drafts[p.key] || "")
  ).length;
  const emailCount = people.filter((p) =>
    isValidEmail(drafts[p.key] || "")
  ).length;

  const pickBestEnrichEmail = (result: EnrichCompareResponse): string | null => {
    if (result.agreement.length > 0) return result.agreement[0]!;
    if (result.allEmails.length === 1) return result.allEmails[0]!.email;
    if (result.apollo.emails.length === 1 && result.lusha.emails.length === 0) {
      return result.apollo.emails[0]!.email;
    }
    if (result.lusha.emails.length === 1 && result.apollo.emails.length === 0) {
      return result.lusha.emails[0]!.email;
    }
    return null;
  };

  const verifyEmail = async (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!isValidEmail(email) || verifyingEmail) return;
    setVerifyingEmail(email);
    setFlash(null);
    try {
      const res = await fetch("/api/outreach/email-lookup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec du test");
      const result = data as EmailVerifyResult;
      setVerifyByEmail((prev) => ({ ...prev, [email]: result }));
      setFlash(`${email} → ${result.label}`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur test email");
    } finally {
      setVerifyingEmail(null);
    }
  };

  const fetchEnrichResult = async (
    p: Person,
    companyName: string
  ): Promise<EnrichCompareResponse> => {
    const res = await fetch("/api/outreach/email-lookup/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prenom: p.prenom,
        nom: p.nom,
        linkedinUrl: p.linkedinUrl,
        company: companyName,
        refs: p.refs.map((r) => ({ id: r.id, market: r.market })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Échec de l'enrichissement");
    return data as EnrichCompareResponse;
  };

  const enrichPerson = async (p: Person) => {
    if (busy || enrichingKey || enrichingAll || savingPersonKey || deletingKey) {
      return;
    }
    setEnrichingKey(p.key);
    setFlash(null);
    try {
      const result = await fetchEnrichResult(p, company);
      setEnrichResults((prev) => ({ ...prev, [p.key]: result }));
      const best = pickBestEnrichEmail(result);
      if (best) {
        setNotFound((prev) => ({ ...prev, [p.key]: false }));
        setDrafts((prev) => ({ ...prev, [p.key]: best }));
      }
      if (result.agreement.length > 0) {
        setFlash(
          `${result.agreement.length} email(s) en commun Apollo + Lusha — prérempli.`
        );
      } else if (best) {
        setFlash(`Email prérempli (${best}) — vérifie puis Enregistrer.`);
      } else {
        setFlash("Aucun email trouvé chez Apollo ni Lusha.");
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur enrichissement");
    } finally {
      setEnrichingKey(null);
    }
  };

  const enrichAllPeople = async () => {
    if (busy || enrichingAll || enrichingKey || people.length === 0) return;
    setEnrichingAll(true);
    setEnrichAllProgress({ done: 0, total: people.length });
    setFlash(null);
    let filled = 0;
    try {
      for (let i = 0; i < people.length; i++) {
        const p = people[i]!;
        setEnrichingKey(p.key);
        setEnrichAllProgress({ done: i, total: people.length });
        try {
          const result = await fetchEnrichResult(p, company);
          setEnrichResults((prev) => ({ ...prev, [p.key]: result }));
          const best = pickBestEnrichEmail(result);
          if (best) {
            filled += 1;
            setNotFound((prev) => ({ ...prev, [p.key]: false }));
            setDrafts((prev) => ({ ...prev, [p.key]: best }));
          }
        } catch {
          /* continue */
        }
        setEnrichAllProgress({ done: i + 1, total: people.length });
      }
      setFlash(
        `Enrichissement terminé — ${people.length} contact(s) · ${filled} prérempli(s).`
      );
    } finally {
      setEnrichingKey(null);
      setEnrichingAll(false);
      setEnrichAllProgress(null);
    }
  };

  const savePerson = async (p: Person) => {
    if (busy || savingPersonKey || deletingKey || enrichingKey || enrichingAll) {
      return;
    }
    const isNf = Boolean(notFound[p.key]);
    const email = (drafts[p.key] || "").trim().toLowerCase();
    if (!isNf && !isValidEmail(email)) return;

    const name = [p.prenom, p.nom].filter(Boolean).join(" ") || "Contact";
    setSavingPersonKey(p.key);
    setFlash(null);
    try {
      type ReadyRow = {
        id: string;
        email?: string;
        notFound?: boolean;
        bothMarkets?: boolean;
      };
      const bothMarkets =
        !isNf &&
        p.refs.some((r) => r.market === "FR") &&
        p.refs.some((r) => r.market === "BENELUX");

      const groups = new Map<
        string,
        { market: Market; marqueId: string; contacts: ReadyRow[] }
      >();
      for (const ref of p.refs) {
        const k = `${ref.market}:${ref.marqueId}`;
        let g = groups.get(k);
        if (!g) {
          g = { market: ref.market, marqueId: ref.marqueId, contacts: [] };
          groups.set(k, g);
        }
        g.contacts.push(
          isNf
            ? { id: ref.id, notFound: true }
            : {
                id: ref.id,
                email,
                ...(bothMarkets ? { bothMarkets: true } : {}),
              }
        );
      }

      let totalEnrolled = 0;
      for (const g of groups.values()) {
        const res = await fetch("/api/outreach/email-lookup/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market: g.market,
            marqueId: g.marqueId,
            contacts: g.contacts,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Échec de l'enregistrement");
        totalEnrolled += data.enrolled || 0;
      }

      setContacts((prev) =>
        prev.filter((c) => !p.refs.some((ref) => ref.id === c.id))
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      setNotFound((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      setEnrichResults((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });

      setFlash(
        totalEnrolled > 0
          ? `${name} enregistré — ${totalEnrolled} en outreach.`
          : isNf
            ? `${name} marqué sans email.`
            : `${name} enregistré.`
      );
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingPersonKey(null);
    }
  };

  const updatePersonLanguage = async (p: Person, language: ContactLang) => {
    if (p.language === language || savingLangKey || busy) return;
    setSavingLangKey(p.key);
    setFlash(null);
    try {
      for (const ref of p.refs) {
        const res = await fetch(`/api/outreach/email-lookup/${ref.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ market: ref.market, language }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Échec de la mise à jour");
      }
      const ids = new Set(p.refs.map((r) => r.id));
      setContacts((prev) =>
        prev.map((c) => (ids.has(c.id) ? { ...c, language } : c))
      );
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingLangKey(null);
    }
  };

  const updatePersonMarkets = async (p: Person, next: PersonMarket) => {
    if (savingMarketKey || busy) return;
    const current = personMarketSelection(p);
    if (current === next) return;
    const brandRefs = p.refs.filter(
      (r): r is PersonRef & { market: BrandMarket } =>
        r.market === "FR" || r.market === "BENELUX"
    );
    if (brandRefs.length === 0) return;

    setSavingMarketKey(p.key);
    setFlash(null);
    try {
      const res = await fetch("/api/outreach/email-lookup/set-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refs: brandRefs.map((r) => ({ id: r.id, market: r.market })),
          markets: marketsFromSelection(next),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de la mise à jour");
      await load();
      const label =
        next === "BOTH" ? "FR + BE" : next === "BENELUX" ? "BE" : "FR";
      setFlash(
        data.message ||
          `${[p.prenom, p.nom].filter(Boolean).join(" ")} → ${label}`
      );
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingMarketKey(null);
    }
  };

  const deletePerson = async (p: Person) => {
    if (busy || deletingKey || savingPersonKey || enrichingKey) return;
    if (!window.confirm("Supprimer ce contact de l'enrichissement ?")) return;
    setDeletingKey(p.key);
    setFlash(null);
    try {
      for (const ref of p.refs) {
        const res = await fetch(
          `/api/outreach/email-lookup/${ref.id}?market=${ref.market}`,
          { method: "DELETE" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Échec de la suppression");
      }
      setContacts((prev) =>
        prev.filter((c) => !p.refs.some((ref) => ref.id === c.id))
      );
      setFlash("Contact retiré de l'enrichissement.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeletingKey(null);
    }
  };

  const markReady = async () => {
    if (busy || savingPersonKey) return;
    const ready = people.filter(
      (p) => notFound[p.key] || isValidEmail(drafts[p.key] || "")
    );
    if (ready.length === 0) return;
    setBusy(true);
    setFlash(null);
    try {
      for (const p of ready) {
        await savePerson(p);
      }
      setFlash("Fiche traitée — contacts enregistrés.");
    } finally {
      setBusy(false);
    }
  };

  const allReady =
    people.length > 0 &&
    people.every(
      (p) => notFound[p.key] || isValidEmail(drafts[p.key] || "")
    );

  const ficheHref =
    fichePath ||
    (market === "BENELUX" ? `/marques/benelux/${marqueId}` : `/marques/${marqueId}`);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement enrichissement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              ← Étape 1
            </button>
          ) : null}
          <h2
            className="flex flex-wrap items-center gap-2 text-xl font-bold"
            style={{ color: INK }}
          >
            {company}
            <span
              className="rounded px-2 py-0.5 text-[11px] font-bold"
              style={{
                backgroundColor: market === "BENELUX" ? "#EEF2FF" : CREAM,
                color: INK,
              }}
            >
              {market === "BENELUX" ? "🇧🇪 BENELUX" : "🇫🇷 France"}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void enrichAllPeople()}
            disabled={
              enrichingAll ||
              Boolean(enrichingKey) ||
              busy ||
              Boolean(savingPersonKey) ||
              people.length === 0
            }
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: INK }}
          >
            {enrichingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" style={{ color: ROSE }} />
            )}
            {enrichingAll && enrichAllProgress
              ? `Enrichir… ${enrichAllProgress.done}/${enrichAllProgress.total}`
              : `Enrichir tous (${people.length})`}
          </button>
          <div className="text-xs text-gray-400">
            {resolvedCount} / {people.length} traités
            {emailCount < resolvedCount
              ? ` · ${emailCount} email${emailCount > 1 ? "s" : ""}`
              : ""}
          </div>
        </div>
      </div>

      {livePattern ? (
        <p className="flex items-center gap-1 text-xs text-gray-500">
          <Sparkles className="h-3 w-3" style={{ color: ROSE }} />
          Motif : {livePattern.kind}@{livePattern.domain}
        </p>
      ) : null}

      {flash ? (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: CREAM, color: INK }}
        >
          {flash}
        </p>
      ) : null}

      {people.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Aucun contact en file d&apos;enrichissement pour cette fiche.
          <div className="mt-3">
            <Link href={ficheHref} className="underline">
              Ouvrir la fiche
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mb-6 space-y-3">
          {people.map((p) => {
            const value = drafts[p.key] || "";
            const isNf = Boolean(notFound[p.key]);
            const valid = !isNf && isValidEmail(value);
            const suggestions = suggestionFor(p);
            return (
              <li
                key={p.key}
                className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-black/[0.06]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className="flex flex-wrap items-center gap-2 font-semibold"
                      style={{ color: INK }}
                    >
                      <span>
                        {[p.prenom, p.nom].filter(Boolean).join(" ")}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: CREAM, color: INK }}
                      >
                        Influence
                      </span>
                      <span
                        className="inline-flex shrink-0 overflow-hidden rounded-md border"
                        style={{ borderColor: "#E5E0DA" }}
                      >
                        {(["FR", "BENELUX", "BOTH"] as const).map((m) => {
                          const selected = personMarketSelection(p) === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={
                                savingMarketKey === p.key ||
                                busy ||
                                deletingKey === p.key
                              }
                              onClick={() => void updatePersonMarkets(p, m)}
                              className="px-1.5 py-0.5 text-[10px] font-bold uppercase transition disabled:opacity-40"
                              style={
                                selected
                                  ? { backgroundColor: INK, color: "#fff" }
                                  : {
                                      backgroundColor: "#fff",
                                      color: "#9CA3AF",
                                    }
                              }
                            >
                              {m === "FR"
                                ? "🇫🇷 FR"
                                : m === "BENELUX"
                                  ? "🇧🇪 BE"
                                  : "FR+BE"}
                            </button>
                          );
                        })}
                      </span>
                      {p.priorite ? (
                        <span className="text-[10px] font-bold text-gray-400">
                          {p.priorite}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {[p.poste, p.perimetre, p.localisation]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">Langue :</span>
                      <div className="flex gap-1">
                        {(["fr", "en"] as const).map((lang) => {
                          const selected = p.language === lang;
                          return (
                            <button
                              key={lang}
                              type="button"
                              disabled={savingLangKey === p.key || busy}
                              onClick={() => void updatePersonLanguage(p, lang)}
                              className="rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40"
                              style={
                                selected
                                  ? {
                                      backgroundColor: INK,
                                      color: "#fff",
                                      borderColor: INK,
                                    }
                                  : {
                                      backgroundColor: "#fff",
                                      color: "#4B5563",
                                      borderColor: "#E5E0DA",
                                    }
                              }
                            >
                              {lang === "fr" ? "Français" : "English"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void enrichPerson(p)}
                      disabled={
                        enrichingKey === p.key ||
                        enrichingAll ||
                        busy ||
                        savingPersonKey === p.key ||
                        deletingKey === p.key
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-40"
                      style={{ backgroundColor: INK }}
                    >
                      {enrichingKey === p.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" style={{ color: ROSE }} />
                      )}
                      Enrichir
                    </button>
                    {p.linkedinUrl ? (
                      <a
                        href={p.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                        style={{ backgroundColor: "#0A66C2" }}
                      >
                        <Linkedin className="h-3.5 w-3.5" />
                        LinkedIn
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void deletePerson(p)}
                      disabled={
                        deletingKey === p.key ||
                        busy ||
                        savingPersonKey === p.key ||
                        enrichingKey === p.key
                      }
                      className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      {deletingKey === p.key ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {enrichResults[p.key] ? (
                  <div className="space-y-2">
                    {enrichResults[p.key]!.agreement.length > 0 ? (
                      <p
                        className="text-[11px] font-medium"
                        style={{ color: GREEN }}
                      >
                        Accord Apollo ∩ Lusha :{" "}
                        {enrichResults[p.key]!.agreement.join(", ")}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <ProviderCard
                        label="Apollo"
                        result={enrichResults[p.key]!.apollo}
                        agreement={enrichResults[p.key]!.agreement}
                        onPick={(email) => {
                          setNotFound((prev) => ({ ...prev, [p.key]: false }));
                          setDrafts((prev) => ({ ...prev, [p.key]: email }));
                        }}
                        onVerify={(email) => void verifyEmail(email)}
                        verifyingEmail={verifyingEmail}
                        verifyByEmail={verifyByEmail}
                      />
                      <ProviderCard
                        label="Lusha"
                        result={enrichResults[p.key]!.lusha}
                        agreement={enrichResults[p.key]!.agreement}
                        onPick={(email) => {
                          setNotFound((prev) => ({ ...prev, [p.key]: false }));
                          setDrafts((prev) => ({ ...prev, [p.key]: email }));
                        }}
                        onVerify={(email) => void verifyEmail(email)}
                        verifyingEmail={verifyingEmail}
                        verifyByEmail={verifyByEmail}
                      />
                    </div>
                  </div>
                ) : null}

                {!isNf && suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.email}
                        type="button"
                        onClick={() => {
                          setNotFound((prev) => ({ ...prev, [p.key]: false }));
                          setDrafts((prev) => ({
                            ...prev,
                            [p.key]: s.email,
                          }));
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ring-1 ring-black/[0.08]"
                        style={{ color: INK, backgroundColor: "#FAFAF8" }}
                      >
                        <Sparkles className="h-3 w-3" style={{ color: ROSE }} />
                        {s.email}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={isNf ? "" : value}
                    disabled={isNf || savingPersonKey === p.key}
                    onChange={(e) => {
                      setNotFound((prev) => ({ ...prev, [p.key]: false }));
                      setDrafts((prev) => ({
                        ...prev,
                        [p.key]: e.target.value,
                      }));
                    }}
                    placeholder={
                      isNf ? "Pas d'email trouvé" : "email@marque.fr"
                    }
                    className="min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: isNf ? "#D4D0CB" : valid ? GREEN : "#E5E0DA",
                      backgroundColor: isNf
                        ? "#F5F3F0"
                        : valid
                          ? "#F8FCEF"
                          : "#fff",
                    }}
                    autoComplete="off"
                  />
                  {valid && !isNf && (
                    <button
                      type="button"
                      onClick={() => void verifyEmail(value)}
                      disabled={
                        Boolean(verifyingEmail) ||
                        busy ||
                        savingPersonKey === p.key
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-semibold disabled:opacity-40"
                      style={{
                        color: INK,
                        borderColor: "#E5E0DA",
                        backgroundColor: "#fff",
                      }}
                    >
                      {verifyingEmail === value.trim().toLowerCase() ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      Tester
                    </button>
                  )}
                  {(valid || isNf) && (
                    <button
                      type="button"
                      onClick={() => void savePerson(p)}
                      disabled={
                        busy ||
                        savingPersonKey === p.key ||
                        deletingKey === p.key
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-white transition disabled:opacity-40"
                      style={{ backgroundColor: GREEN }}
                    >
                      {savingPersonKey === p.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Enregistrer
                    </button>
                  )}
                </div>

                {!isNf &&
                  valid &&
                  verifyByEmail[value.trim().toLowerCase()] && (
                    <p
                      className="text-[11px] leading-snug"
                      style={{
                        color: verifyStatusColor(
                          verifyByEmail[value.trim().toLowerCase()]!.status
                        ),
                      }}
                    >
                      {verifyByEmail[value.trim().toLowerCase()]!.label}
                    </p>
                  )}

                <label className="flex cursor-pointer select-none items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isNf}
                    disabled={savingPersonKey === p.key || busy}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNotFound((prev) => ({ ...prev, [p.key]: checked }));
                      if (checked) {
                        setDrafts((prev) => ({ ...prev, [p.key]: "" }));
                      }
                    }}
                    className="rounded border-gray-300"
                    style={{ accentColor: ROSE }}
                  />
                  <span className="text-xs text-gray-600">
                    Pas d&apos;email trouvé
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {people.length > 0 ? (
        <button
          type="button"
          onClick={() => void markReady()}
          disabled={!allReady || busy || Boolean(savingPersonKey)}
          className="sticky bottom-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: INK }}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Prêt — enregistrer tous ({resolvedCount}/{people.length})
        </button>
      ) : null}

      <div className="flex gap-4 text-sm">
        <Link href={ficheHref} className="underline" style={{ color: INK }}>
          Ouvrir la fiche client
        </Link>
        <Link href="/enrichissement" className="text-gray-500 underline">
          File enrichissement globale
        </Link>
      </div>
    </div>
  );
}
