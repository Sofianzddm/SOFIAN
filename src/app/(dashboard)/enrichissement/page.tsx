"use client";

/**
 * Enrichissement — /enrichissement
 *
 * Drop carto → liste des marques → ouvrir une fiche → noter tous les mails
 * (suggestions = motif déduit des mails déjà saisis sur CETTE fiche) → Prêt.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Linkedin,
  Check,
  ChevronRight,
  ArrowLeft,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { ImportCartoModal } from "@/components/outreach/ImportCartoModal";
import {
  detectEmailPattern,
  suggestEmailsForContact,
  type EmailSuggestion,
} from "@/lib/email-pattern";

const INK = "#1A1110";
const ROSE = "#C08B8B";
const CREAM = "#F5EBE0";
const GREEN = "#3D8B40";

const ALLOWED = ["ADMIN", "CASTING_MANAGER"];

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type LookupContact = {
  id: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  marqueId: string;
  company: string;
  market: "FR" | "BENELUX";
  source: "CARTO" | "AO" | null;
};

/** Référence d'une copie d'un contact dans un pipeline donné. */
type PersonRef = { id: string; market: "FR" | "BENELUX"; marqueId: string };

/**
 * Personne dédupliquée : un même contact importé « FR+BE » existe en 2 lignes
 * (MarqueContact + BeneluxContact). On les fusionne pour ne saisir le mail
 * qu'une seule fois — il sera propagé à chaque `ref`.
 */
type Person = {
  key: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  source: "CARTO" | "AO" | null;
  refs: PersonRef[];
};

/** Une marque = fusion des fiches FR et BE portant le même nom. */
type BrandGroup = {
  key: string;
  company: string;
  markets: Array<"FR" | "BENELUX">;
  people: Person[];
};

export default function EnrichissementPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role || "";
  const allowed = ALLOWED.includes(role);

  const [contacts, setContacts] = useState<LookupContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /** Brouillons email par contactId — saisis sur la fiche. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showCartoModal, setShowCartoModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/outreach/email-lookup");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      setContacts((data.contacts || []) as LookupContact[]);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && allowed) load();
  }, [status, allowed, load]);

  const brands: BrandGroup[] = useMemo(() => {
    type Acc = {
      company: string;
      markets: Set<"FR" | "BENELUX">;
      people: Map<string, Person>;
    };
    const map = new Map<string, Acc>();
    for (const c of contacts) {
      const brandKey = norm(c.company);
      let b = map.get(brandKey);
      if (!b) {
        b = { company: c.company, markets: new Set(), people: new Map() };
        map.set(brandKey, b);
      }
      const market = c.market || "FR";
      b.markets.add(market);
      // Identité d'une personne : prénom + nom + feuille d'origine (influence/AO).
      const personId = `${norm(c.prenom || "")}|${norm(c.nom)}|${c.source || ""}`;
      let p = b.people.get(personId);
      if (!p) {
        p = {
          key: `${brandKey}::${personId}`,
          prenom: c.prenom,
          nom: c.nom,
          poste: c.poste,
          perimetre: c.perimetre,
          localisation: c.localisation,
          priorite: c.priorite,
          linkedinUrl: c.linkedinUrl,
          source: c.source,
          refs: [],
        };
        b.people.set(personId, p);
      }
      if (!p.linkedinUrl && c.linkedinUrl) p.linkedinUrl = c.linkedinUrl;
      if (!p.poste && c.poste) p.poste = c.poste;
      p.refs.push({ id: c.id, market, marqueId: c.marqueId });
    }
    return Array.from(map.entries()).map(([key, b]) => ({
      key,
      company: b.company,
      markets: Array.from(b.markets),
      people: Array.from(b.people.values()),
    }));
  }, [contacts]);

  const active = brands.find((b) => b.key === activeKey) || null;

  // Si la marque disparaît de la file → retour liste
  useEffect(() => {
    if (activeKey && !active) setActiveKey(null);
  }, [active, activeKey]);

  /** Motif déduit UNIQUEMENT des mails déjà saisis sur cette fiche. */
  const livePattern = useMemo(() => {
    if (!active) return null;
    const known = active.people
      .map((p) => {
        const email = (drafts[p.key] || "").trim().toLowerCase();
        if (!isValidEmail(email)) return null;
        return { email, prenom: p.prenom, nom: p.nom };
      })
      .filter((x): x is { email: string; prenom: string | null; nom: string } => Boolean(x));
    if (known.length === 0) return null;
    return detectEmailPattern(known);
  }, [active, drafts]);

  const suggestionFor = (p: Person): EmailSuggestion[] => {
    if (!livePattern) return [];
    // Ne pas suggérer si ce contact a déjà un mail valide saisi
    if (isValidEmail(drafts[p.key] || "")) return [];
    return suggestEmailsForContact({
      prenom: p.prenom,
      nom: p.nom,
      pattern: livePattern,
    });
  };

  const filledCount = active
    ? active.people.filter((p) => isValidEmail(drafts[p.key] || "")).length
    : 0;
  const allReady = Boolean(active && filledCount === active.people.length && active.people.length > 0);

  const openBrand = (b: BrandGroup) => {
    setFlash(null);
    setActiveKey(b.key);
    // Reset drafts pour cette fiche (vides — elle part de zéro sur les mails)
    const next: Record<string, string> = {};
    for (const p of b.people) next[p.key] = "";
    setDrafts(next);
  };

  const handleImported = async (result: {
    company: string;
    markets: Array<{ market: "FR" | "BENELUX"; id: string; company: string }>;
  }) => {
    setShowCartoModal(false);
    setDroppedFile(null);
    try {
      let totalQueued = 0;
      for (const m of result.markets) {
        const res = await fetch(`/api/marques/${m.id}/queue-enrichissement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ market: m.market }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Impossible de mettre en file");
        totalQueued += data.queued || 0;
      }
      setFlash(
        totalQueued > 0
          ? `${result.company} — ${totalQueued} email${totalQueued > 1 ? "s" : ""} à trouver`
          : `${result.company} — aucun email manquant`
      );
      await load({ silent: true });
      // Ouvre la fiche fusionnée (FR + BE) de la marque importée.
      if (totalQueued > 0 && result.company) {
        setActiveKey(norm(result.company));
        setDrafts({});
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
      await load({ silent: true });
    }
  };

  // Quand on ouvre une marque après import, init drafts
  useEffect(() => {
    if (!active) return;
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of active.people) {
        if (next[p.key] === undefined) {
          next[p.key] = "";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [active?.key, active?.people]);

  const markReady = async () => {
    if (!active || !allReady || busy) return;
    setBusy(true);
    setFlash(null);
    try {
      // Le mail saisi une fois est propagé à chaque copie (FR et/ou BE). On
      // regroupe les refs par pipeline (marché + fiche) → un appel « ready » par
      // pipeline.
      type Group = { market: "FR" | "BENELUX"; marqueId: string; contacts: Array<{ id: string; email: string }> };
      const groups = new Map<string, Group>();
      for (const p of active.people) {
        const email = (drafts[p.key] || "").trim().toLowerCase();
        for (const ref of p.refs) {
          const k = `${ref.market}:${ref.marqueId}`;
          let g = groups.get(k);
          if (!g) {
            g = { market: ref.market, marqueId: ref.marqueId, contacts: [] };
            groups.set(k, g);
          }
          g.contacts.push({ id: ref.id, email });
        }
      }

      let totalSaved = 0;
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
        if (!res.ok) throw new Error(data.error || "Échec");
        totalSaved += data.saved || 0;
        totalEnrolled += data.enrolled || 0;
      }

      setFlash(
        totalEnrolled > 0
          ? `${active.company} — ${totalEnrolled} contact(s) envoyés dans « À contacter » 🎉`
          : `${totalSaved} email(s) enregistrés.`
      );
      setActiveKey(null);
      setDrafts({});
      await load({ silent: true });
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading" || (status === "authenticated" && allowed && loading && contacts.length === 0 && !flash)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: ROSE }} />
      </div>
    );
  }

  if (!allowed) {
    return <div className="p-10 text-center text-gray-500">Accès réservé.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {!active ? (
        <>
          <h1 className="text-2xl font-bold" style={{ color: INK }}>
            Enrichissement
          </h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            Glisse une carto · ouvre une marque · note tous les mails · Prêt
          </p>

          <button
            type="button"
            onClick={() => {
              setDroppedFile(null);
              setShowCartoModal(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0] || null;
              setDroppedFile(file);
              setShowCartoModal(true);
            }}
            className="w-full rounded-xl border-2 border-dashed px-6 py-8 text-center transition mb-6"
            style={{
              borderColor: dragOver ? GREEN : "#E5E0DA",
              backgroundColor: dragOver ? "#F2FAF2" : "#FBF8F4",
            }}
          >
            <FileSpreadsheet
              className="w-7 h-7 mx-auto mb-2"
              style={{ color: dragOver ? GREEN : "#9CA3AF" }}
            />
            <div className="text-sm font-semibold" style={{ color: INK }}>
              Glisse une carto Excel ici
            </div>
            <div className="text-xs text-gray-400 mt-1">ou clique pour choisir</div>
          </button>

          {flash && (
            <p className="mb-4 text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: CREAM, color: INK }}>
              {flash}
            </p>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              À traiter
            </h2>
            <span className="text-xs text-gray-400">{brands.length}</span>
          </div>

          {brands.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Rien en file.</p>
          ) : (
            <ul className="space-y-2">
              {brands.map((b, i) => (
                <li key={b.key}>
                  <button
                    type="button"
                    onClick={() => openBrand(b)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white ring-1 ring-black/[0.06] hover:ring-black/15 text-left transition"
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: CREAM, color: INK }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate flex items-center gap-2" style={{ color: INK }}>
                        <span className="truncate">{b.company}</span>
                        {b.markets.includes("FR") && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: CREAM, color: INK }}
                          >
                            🇫🇷 FR
                          </span>
                        )}
                        {b.markets.includes("BENELUX") && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: "#EEF2FF", color: INK }}
                          >
                            🇧🇪 BE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {b.people.length} contact{b.people.length > 1 ? "s" : ""}
                        {(() => {
                          const ao = b.people.filter((p) => p.source === "AO").length;
                          return ao > 0 ? ` · dont ${ao} AO` : "";
                        })()}
                        {b.markets.length > 1 ? " · FR + BE, mail saisi une fois" : ""}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        /* —— FICHE MARQUE : tous les contacts —— */
        <>
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              type="button"
              onClick={() => {
                setFlash(null);
                setActiveKey(null);
                setDrafts({});
              }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Marques
            </button>
            <div className="text-xs text-gray-400">
              {filledCount} / {active.people.length} emails
            </div>
          </div>

          <div className="mb-5">
            <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap" style={{ color: INK }}>
              {active.company}
              {active.markets.includes("FR") && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: CREAM, color: INK }}
                >
                  🇫🇷 France
                </span>
              )}
              {active.markets.includes("BENELUX") && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: "#EEF2FF", color: INK }}
                >
                  🇧🇪 BENELUX
                </span>
              )}
            </h1>
            {active.markets.length > 1 && (
              <p className="text-xs text-gray-500 mt-1">
                Marque sur les deux marchés — saisis le mail une seule fois, il part
                dans les fiches France et Benelux.
              </p>
            )}
            {livePattern && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" style={{ color: ROSE }} />
                Motif d&apos;après tes saisies : {livePattern.kind}@{livePattern.domain}
              </p>
            )}
          </div>

          {flash && (
            <p className="mb-4 text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: CREAM, color: INK }}>
              {flash}
            </p>
          )}

          <ul className="space-y-3 mb-6">
            {active.people.map((p) => {
              const value = drafts[p.key] || "";
              const valid = isValidEmail(value);
              const suggestions = suggestionFor(p);
              return (
                <li
                  key={p.key}
                  className="rounded-xl bg-white ring-1 ring-black/[0.06] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-2 flex-wrap" style={{ color: INK }}>
                        <span>{[p.prenom, p.nom].filter(Boolean).join(" ")}</span>
                        {p.source === "AO" ? (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "#FBE5D6", color: "#9A5B1E" }}
                            title="Contact issu de la feuille Achats / Appel d'offre"
                          >
                            AO · Achats
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: CREAM, color: INK }}
                            title="Contact issu de la feuille Influence"
                          >
                            Influence
                          </span>
                        )}
                        {p.refs.length > 1 && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "#EEF2FF", color: INK }}
                            title="Ce contact est sur les deux marchés — un seul mail suffit"
                          >
                            FR + BE
                          </span>
                        )}
                        {p.priorite ? (
                          <span className="text-[10px] font-bold text-gray-400">
                            {p.priorite}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[p.poste, p.perimetre, p.localisation].filter(Boolean).join(" · ") ||
                          "—"}
                      </div>
                    </div>
                    {p.linkedinUrl ? (
                      <a
                        href={p.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg text-xs font-semibold text-white"
                        style={{ backgroundColor: "#0A66C2" }}
                      >
                        <Linkedin className="w-3.5 h-3.5" />
                        LinkedIn
                      </a>
                    ) : null}
                  </div>

                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s.email}
                          type="button"
                          onClick={() =>
                            setDrafts((prev) => ({ ...prev, [p.key]: s.email }))
                          }
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ring-1 ring-black/[0.08]"
                          style={{ color: INK, backgroundColor: "#FAFAF8" }}
                        >
                          <Sparkles className="w-3 h-3" style={{ color: ROSE }} />
                          {s.email}
                        </button>
                      ))}
                    </div>
                  )}

                  <input
                    type="email"
                    value={value}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [p.key]: e.target.value }))
                    }
                    placeholder="email@marque.fr"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{
                      borderColor: valid ? GREEN : "#E5E0DA",
                      backgroundColor: valid ? "#F8FCEF" : "#fff",
                    }}
                    autoComplete="off"
                  />
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => void markReady()}
            disabled={!allReady || busy}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-base font-semibold text-white disabled:opacity-40 sticky bottom-4"
            style={{ backgroundColor: allReady ? GREEN : INK }}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {allReady
              ? "Prêt — envoyer dans « À contacter »"
              : `Prêt (${filledCount}/${active.people.length})`}
          </button>
        </>
      )}

      {showCartoModal && (
        <ImportCartoModal
          initialFile={droppedFile}
          onClose={() => {
            setShowCartoModal(false);
            setDroppedFile(null);
          }}
          onImported={handleImported}
          onError={(m) => {
            setShowCartoModal(false);
            setDroppedFile(null);
            setFlash(m);
          }}
        />
      )}
    </div>
  );
}
