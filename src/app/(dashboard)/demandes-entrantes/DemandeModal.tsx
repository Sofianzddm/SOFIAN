"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import {
  Calendar,
  Eye,
  ExternalLink,
  Globe,
  Heart,
  Instagram,
  Loader2,
  Mail,
  MapPin,
  Music2,
  Phone,
  Target,
  Users,
  X,
} from "lucide-react";
import EmailComposer, { type BrandResearch, type Talent } from "../casting-outreach/EmailComposer";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

export type DemandeEntrante = {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  status: string;
  emailPret: string | null;
  sujetPret: string | null;
};

type PresskitTalent = {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  niches: string[];
  instagram?: string | null;
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
};

type BriefAnalysis = {
  agence: string;
  marqueFinale: string | null;
  objectif: string;
  criteresTalents: string;
  typeCollab: string;
  deadline: string;
  pointsCles: string;
};

type TalentDetailPreview = {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  email?: string;
  telephone?: string | null;
  bio?: string | null;
  presentation?: string | null;
  presentationEn?: string | null;
  ville?: string | null;
  pays?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  snapchat?: string | null;
  niches: string[];
  selectedClients?: string[];
  commissionInbound?: number;
  commissionOutbound?: number;
  manager?: { prenom: string; nom: string } | null;
  stats?: Record<string, unknown> | null;
  tarifs?: Record<string, unknown> | null;
  collaborations?: Array<{
    id: string;
    marque?: { nom: string } | null;
    livrables?: unknown;
    createdAt?: string;
  }>;
  negociations?: Array<{
    id: string;
    marque?: { nom: string } | null;
    createdAt?: string;
  }>;
  demandesGift?: Array<{
    id: string;
    tm?: { prenom: string; nom: string } | null;
    accountManager?: { prenom: string; nom: string } | null;
    createdAt?: string;
  }>;
};

function nicheColor(index: number): string {
  const palette = ["#C08B8B", "#C8F285", "#1A1110", "#8B7355"];
  return palette[index % palette.length];
}

function formatFollowers(count?: number | null): string {
  if (!count || count <= 0) return "0";
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return String(count);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace("%", "").replace(",", ".");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatPercentValue(value: unknown, digits = 1): string {
  const n = asNumber(value);
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

function clampPercent(value: unknown): number {
  const n = asNumber(value);
  if (n == null) return 0;
  return Math.max(0, Math.min(100, n));
}

function primaryTalentStat(t: PresskitTalent): string {
  if (t.igFollowers > 0) return `${new Intl.NumberFormat("fr-FR").format(t.igFollowers)} abonnes IG`;
  if (t.igEngagement > 0) return `${t.igEngagement.toFixed(1)} % engagement IG`;
  if (t.ttFollowers > 0) return `${new Intl.NumberFormat("fr-FR").format(t.ttFollowers)} abonnes TikTok`;
  if (t.ttEngagement > 0) return `${t.ttEngagement.toFixed(1)} % engagement TikTok`;
  return "—";
}

function markdownBoldToStrong(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function plainTextToEmailHtml(text: string): string {
  const t = text.trim();
  if (!t) return "<p></p>";
  if (t.startsWith("<")) return t;
  const withBold = markdownBoldToStrong(t);
  const normalized = withBold.replace(/\r\n/g, "\n");
  const hasBlankLine = /\n\s*\n/.test(normalized);
  const rawParagraphs = hasBlankLine ? normalized.split(/\n\s*\n+/) : [normalized];
  return rawParagraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function extractBrandName(from: string, subject: string): string {
  const emailMatch = from.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (emailMatch?.[1]) {
    const domain = emailMatch[1].toLowerCase();
    const first = domain.split(".")[0] || "";
    if (first) return first.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const cleanSubject = subject
    .replace(/^(re|fwd?)\s*:\s*/gi, "")
    .replace(/[|/\\-].*$/, "")
    .trim();
  if (cleanSubject) return cleanSubject.slice(0, 60);
  return "Marque";
}

function cleanEmailBody(body: string): string {
  let content = body;

  // ETAPE 1 : Extraire le contenu après "Forwarded message"
  const forwardMarkers = [
    "---------- Forwarded message ---------",
    "---------- Forwarded message ----------",
    "-------- Message transféré --------",
    "-----Original Message-----",
  ];

  for (const marker of forwardMarkers) {
    if (content.includes(marker)) {
      content = content.split(marker)[1] || content;
      break;
    }
  }

  // ETAPE 2 : Supprimer les headers du forward
  // (lignes "De:", "To:", "Cc:", "Date:", "Subject:" en début de ligne)
  content = content.replace(/^(De|From|To|À|Cc|Date|Subject|Objet)\s*:.*/gm, "");

  // ETAPE 3 : Couper à la signature de l'expéditeur
  // (commence par un prénom en gras ou "-- " ou une ligne d'adresse)
  const signatureMarkers = [
    "\n*Eloïse",
    "\nEloïse\n",
    "\nCordialement",
    "\nBien à vous",
    "\nBest regards",
    "\nMerci par avance pour ton retour\nTrès belle journée",
  ];

  for (const marker of signatureMarkers) {
    if (content.includes(marker)) {
      content = content.split(marker)[0] || content;
      break;
    }
  }

  // ETAPE 4 : Nettoyer
  content = content
    .replace(/\[image:[^\]]*\]/g, "") // supprimer [image: logo ADMS]
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return content.length > 20 ? content : body.trim();
}

export default function DemandeModal({
  open,
  demande,
  onClose,
  onSaved,
  onError,
  onSuccess,
}: {
  open: boolean;
  demande: DemandeEntrante | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [briefAnalysis, setBriefAnalysis] = useState<BriefAnalysis | null>(null);
  const [talents, setTalents] = useState<PresskitTalent[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(false);
  const [talentsError, setTalentsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [talentDetailOpen, setTalentDetailOpen] = useState(false);
  const [talentDetailLoading, setTalentDetailLoading] = useState(false);
  const [talentDetailError, setTalentDetailError] = useState<string | null>(null);
  const [talentDetail, setTalentDetail] = useState<TalentDetailPreview | null>(null);
  const rawTalentEntries = useMemo(() => {
    if (!talentDetail) return [] as Array<{ path: string; value: string }>;
    const safeValueToString = (v: unknown): string => {
      if (v === null) return "null";
      if (v === undefined) return "—";
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
      try {
        const s = String(v);
        if (s && s !== "[object Object]") return s;
      } catch {}
      try {
        return JSON.stringify(v);
      } catch {
        return "[unstringifiable]";
      }
    };
    const isPlainObject = (v: unknown): v is Record<string, unknown> => {
      if (!v || typeof v !== "object") return false;
      const proto = Object.getPrototypeOf(v);
      return proto === Object.prototype || proto === null;
    };
    const entries: Array<{ path: string; value: string }> = [];
    const seen = new WeakSet<object>();
    const walk = (val: unknown, path: string, depth: number) => {
      if (entries.length >= 10000) return;
      if (depth > 18) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }
      if (val === null || val === undefined) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }
      if (typeof val !== "object" || val instanceof Date) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }
      if (seen.has(val as object)) {
        entries.push({ path: path || "(root)", value: "[circular]" });
        return;
      }
      seen.add(val as object);
      if (Array.isArray(val)) {
        if (val.length === 0) {
          entries.push({ path: path || "(root)", value: "[]" });
          return;
        }
        val.forEach((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`, depth + 1));
        return;
      }
      if (!isPlainObject(val)) {
        entries.push({ path: path || "(root)", value: safeValueToString(val) });
        return;
      }
      const keys = Object.keys(val);
      if (keys.length === 0) {
        entries.push({ path: path || "(root)", value: "{}" });
        return;
      }
      for (const k of keys) {
        walk((val as Record<string, unknown>)[k], path ? `${path}.${k}` : k, depth + 1);
        if (entries.length >= 10000) break;
      }
    };
    walk(talentDetail, "", 0);
    return entries;
  }, [talentDetail]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, TiptapUnderline],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class:
          "min-h-[360px] max-h-[60vh] overflow-y-auto rounded-xl border px-3 py-2 text-sm focus:outline-none",
        style: `border-color: color-mix(in srgb, ${OLD_ROSE} 35%, transparent); color:${LICORICE};`,
      },
    },
  });

  const brandName = useMemo(
    () => (demande ? extractBrandName(demande.from, demande.subject) : "Marque"),
    [demande]
  );

  useEffect(() => {
    if (!open || !demande) return;
    setSubject(demande.sujetPret || "");
    editor?.commands.setContent(demande.emailPret || "<p></p>");
    setBriefAnalysis(null);
    setSelectedIds(new Set());
  }, [open, demande, editor]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTalents(true);
    setTalentsError(null);
    fetch("/api/talents?presskit=true", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            typeof j.message === "string" ? j.message : "Chargement des talents impossible."
          );
        }
        return res.json();
      })
      .then((data: { talents?: PresskitTalent[] }) => {
        if (!cancelled) setTalents(Array.isArray(data.talents) ? data.talents : []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTalentsError(e instanceof Error ? e.message : "Erreur réseau.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTalents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedTalentsRaw = useMemo(
    () => talents.filter((t) => selectedIds.has(t.id)),
    [talents, selectedIds]
  );

  const selectedTalents: Talent[] = useMemo(
    () =>
      selectedTalentsRaw.map((t) => ({
        id: t.id,
        prenom: t.prenom,
        nom: t.nom,
        niches: t.niches,
      })),
    [selectedTalentsRaw]
  );

  const toggleTalent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openTalentDetail = async (id: string) => {
    setTalentDetailOpen(true);
    setTalentDetailLoading(true);
    setTalentDetailError(null);
    setTalentDetail(null);
    try {
      const res = await fetch(`/api/talents/${id}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Erreur de chargement.");
      }
      setTalentDetail(data as TalentDetailPreview);
    } catch (e: unknown) {
      setTalentDetailError(e instanceof Error ? e.message : "Erreur reseau.");
    } finally {
      setTalentDetailLoading(false);
    }
  };

  const closeTalentDetail = () => {
    setTalentDetailOpen(false);
    setTalentDetailLoading(false);
    setTalentDetailError(null);
    setTalentDetail(null);
  };

  const briefAsBrandResearch = useMemo<BrandResearch | null>(() => {
    if (!briefAnalysis) return null;
    return {
      recentCampaigns: `Agence source: ${briefAnalysis.agence || "—"}. Points clés: ${briefAnalysis.pointsCles || "—"}`,
      newProducts: `Marque finale: ${briefAnalysis.marqueFinale || "Marque confidentielle"}. Type de collaboration: ${briefAnalysis.typeCollab || "—"}. Deadline: ${briefAnalysis.deadline || "—"}`,
      brandPositioning: `Objectif: ${briefAnalysis.objectif || "—"}`,
      influenceStrategy: `Critères talents: ${briefAnalysis.criteresTalents || "—"}`,
    };
  }, [briefAnalysis]);

  const runBrandResearch = async () => {
    if (!demande) return;
    setIsResearching(true);
    try {
      const cleanBody = cleanEmailBody(demande.body || "");
      const res = await fetch("/api/casting/analyze-brief", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: cleanBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Recherche impossible.");
      }
      setBriefAnalysis({
        agence: String(data.agence || ""),
        marqueFinale: data.marqueFinale == null ? null : String(data.marqueFinale),
        objectif: String(data.objectif || ""),
        criteresTalents: String(data.criteresTalents || ""),
        typeCollab: String(data.typeCollab || ""),
        deadline: String(data.deadline || ""),
        pointsCles: String(data.pointsCles || ""),
      });
      onSuccess("Analyse du brief terminée");
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsResearching(false);
    }
  };

  const runGenerateEmail = async () => {
    if (!briefAsBrandResearch) {
      onError("Lance d'abord l'analyse du brief.");
      return;
    }
    if (selectedTalentsRaw.length === 0) {
      onError("Selectionne au moins un talent.");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/casting/generate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          brandResearch: briefAsBrandResearch,
          talents: selectedTalentsRaw.map((t) => {
            const followers = Math.max(t.igFollowers || 0, t.ttFollowers || 0);
            const eng =
              t.igEngagement > 0
                ? t.igEngagement
                : t.ttEngagement > 0
                  ? t.ttEngagement
                  : undefined;
            return {
              name: `${t.prenom} ${t.nom}`.trim(),
              niche: (t.niches || []).join(", ") || "—",
              followers,
              igFollowers: typeof t.igFollowers === "number" ? t.igFollowers : 0,
              ttFollowers: typeof t.ttFollowers === "number" ? t.ttFollowers : 0,
              instagram: t.instagram ?? null,
              ...(typeof eng === "number" ? { engagementRate: eng } : {}),
            };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Génération impossible.");
      }
      const nextSubject = typeof data.subject === "string" ? data.subject : "";
      const nextBody = typeof data.body === "string" ? data.body : "";
      setSubject(nextSubject);
      editor?.commands.setContent(plainTextToEmailHtml(nextBody));
      onSuccess("Brouillon généré");
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsGenerating(false);
    }
  };

  const save = async (status: "en_cours" | "pret") => {
    if (!demande) return;
    if (!subject.trim()) {
      onError("L’objet de la réponse est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/demandes-entrantes/${encodeURIComponent(demande.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          sujetPret: subject.trim(),
          emailPret: editor?.getHTML() || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Enregistrement impossible.");
      }
      onSaved();
      if (status === "pret") {
        onSuccess("Email envoyé à Leyna ✉️");
        onClose();
      } else {
        onSuccess("Brouillon enregistré");
      }
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !demande) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/45 flex justify-end overflow-y-auto overscroll-contain">
      <div
        className="w-full min-h-[calc(100dvh-2rem)] bg-white shadow-2xl flex flex-col overflow-y-auto"
        style={{ fontFamily: "Switzer, system-ui, sans-serif", maxWidth: "100vw" }}
      >
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
        >
          <h2 className="text-xl font-semibold" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>
            Traitement demande entrante
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-black/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          <div
            className="border-r p-4"
            style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 30%, transparent)` }}
          >
            <h3 className="text-lg font-semibold mb-3" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>
              Brief reçu
            </h3>
            <div className="space-y-2 text-sm">
              <span
                className="inline-flex items-center px-2 py-1 rounded-full"
                style={{ backgroundColor: OLD_LACE, color: LICORICE }}
              >
                {demande.from}
              </span>
              <p style={{ color: LICORICE }}>
                <strong>Objet :</strong> {demande.subject}
              </p>
              <p style={{ color: LICORICE }}>
                <strong>Date :</strong> {new Date(demande.date).toLocaleString("fr-FR")}
              </p>
            </div>
            <div
              className="mt-3 rounded-xl p-3 max-h-[36vh] overflow-y-auto text-sm"
              style={{ backgroundColor: OLD_LACE, color: LICORICE, fontSize: 14, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{
                __html: cleanEmailBody(demande.body).replace(/\n/g, "<br />"),
              }}
            />

            <div className="mt-4">
              <p className="text-sm font-medium mb-2" style={{ color: LICORICE }}>
                Talents
              </p>
              {talentsError && (
                <p className="text-xs mb-2" style={{ color: OLD_ROSE }}>
                  {talentsError}
                </p>
              )}
              <div className="max-h-[34vh] overflow-y-auto space-y-2">
                {loadingTalents ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement...
                  </div>
                ) : (
                  talents.map((t) => {
                    const sel = selectedIds.has(t.id);
                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={sel}
                        onClick={() => toggleTalent(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleTalent(t.id);
                          }
                        }}
                        className={`w-full text-left rounded-xl border-2 p-3 transition-colors bg-white/80 cursor-pointer ${sel ? "shadow-sm" : "border-transparent hover:border-black/10"}`}
                        style={{
                          borderColor: sel ? TEA_GREEN : "transparent",
                        }}
                      >
                        <div className="flex gap-3">
                          <div className="shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openTalentDetail(t.id);
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/90 border border-slate-200 hover:bg-white"
                              style={{ color: LICORICE }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Detail
                            </button>
                          </div>
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                            {t.photo ? (
                              <Image src={t.photo} alt="" fill className="object-cover" sizes="56px" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">—</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate" style={{ color: LICORICE }}>
                              {t.prenom} {t.nom}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(t.niches || []).slice(0, 2).map((n, i) => (
                                <span key={n} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: nicheColor(i) }}>
                                  {n}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                              {primaryTalentStat(t)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {selectedTalents.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedTalents.map((t) => (
                    <span key={t.id} className="inline-flex items-center text-xs px-2 py-1 rounded-full" style={{ backgroundColor: TEA_GREEN, color: LICORICE }}>
                      {t.prenom} {t.nom}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={runBrandResearch}
              disabled={isResearching}
              className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            >
              {isResearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyse du brief...
                </>
              ) : (
                <>🔍 Analyser le brief automatiquement</>
              )}
            </button>

            {briefAnalysis && (
              <div className="mt-3 grid gap-2 text-xs">
                <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: OLD_ROSE }}>
                  🏢 {briefAnalysis.agence || "—"}
                </div>
                <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: OLD_ROSE }}>
                  🎯 {briefAnalysis.marqueFinale || "Marque confidentielle"}
                </div>
                <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: OLD_ROSE }}>
                  📋 {briefAnalysis.objectif || "—"}
                </div>
                <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: OLD_ROSE }}>
                  👤 {briefAnalysis.criteresTalents || "—"}
                </div>
                <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: OLD_ROSE }}>
                  🤝 {briefAnalysis.typeCollab || "—"}
                </div>
                <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: OLD_ROSE }}>
                  ⏰ {briefAnalysis.deadline || "—"}
                </div>
                <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: OLD_ROSE }}>
                  💡 {briefAnalysis.pointsCles || "—"}
                </div>
              </div>
            )}

          </div>

          <div className="lg:col-span-2 p-4 pb-24 flex flex-col">
            <EmailComposer
              subject={subject}
              onSubjectChange={setSubject}
              brandName={brandName}
              brandResearch={briefAsBrandResearch}
              onBrandResearch={runBrandResearch}
              isResearching={isResearching}
              talentsSelected={selectedTalents}
              isGenerating={isGenerating}
              onGenerate={runGenerateEmail}
              editor={editor}
            />
          </div>
        </div>

        <div
          className="px-5 py-3 border-t flex items-center justify-end gap-2 sticky bottom-0 bg-white/95"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl border text-sm"
            style={{ borderColor: OLD_ROSE, color: LICORICE }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => save("en_cours")}
            disabled={saving}
            className="px-4 py-2 rounded-xl border text-sm"
            style={{ borderColor: OLD_ROSE, color: LICORICE }}
          >
            Enregistrer brouillon
          </button>
          <button
            type="button"
            onClick={() => save("pret")}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2"
            style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Envoyer à Leyna ✓
          </button>
        </div>
      </div>
      {talentDetailOpen && (
        <div
          className="fixed inset-0 z-[220] bg-black/40 flex items-center justify-center p-4"
          onClick={closeTalentDetail}
          role="dialog"
          aria-modal="true"
          aria-label="Fiche talent"
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-xl border border-[#E8DED0] bg-white"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "Switzer, system-ui, sans-serif" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4" style={{ color: LICORICE }} />
                <p className="text-sm font-semibold truncate" style={{ color: LICORICE }}>
                  Fiche talent
                </p>
              </div>
              <button type="button" onClick={closeTalentDetail} className="p-2 rounded-lg hover:bg-black/5 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-56px)]">
              {talentDetailLoading && (
                <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement…
                </div>
              )}
              {talentDetailError && <p className="text-sm" style={{ color: OLD_ROSE }}>{talentDetailError}</p>}
              {!talentDetailLoading && !talentDetailError && talentDetail && (
                <div className="space-y-3">
                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "#E8DED0" }}>
                    <div className="px-4 py-4 bg-gradient-to-r from-[#1A1110] to-[#2B1E1D]">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white/10 shrink-0">
                          {talentDetail.photo ? (
                            <Image src={talentDetail.photo} alt="" fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-white/70">—</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xl font-semibold truncate text-white">
                            {talentDetail.prenom} {talentDetail.nom}
                          </p>
                          {(talentDetail.ville || talentDetail.pays) && (
                            <p className="text-xs mt-1 text-white/70 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {talentDetail.ville || "—"}
                              {talentDetail.ville && talentDetail.pays ? ", " : ""}
                              {talentDetail.pays || ""}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(talentDetail.niches || []).slice(0, 6).map((n, i) => (
                              <span
                                key={`${n}-${i}`}
                                className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: nicheColor(i) }}
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`/talents/${talentDetail.id}`, "_blank", "noopener,noreferrer")}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-white/90 border-white/25 hover:bg-white/10"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Ouvrir la fiche
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="rounded-xl bg-white/10 px-2.5 py-2">
                          <p className="text-[10px] text-white/70">Instagram</p>
                          <p className="text-sm font-semibold text-white">
                            {formatFollowers(asNumber((talentDetail.stats as Record<string, unknown> | null)?.igFollowers))}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/10 px-2.5 py-2">
                          <p className="text-[10px] text-white/70">TikTok</p>
                          <p className="text-sm font-semibold text-white">
                            {formatFollowers(asNumber((talentDetail.stats as Record<string, unknown> | null)?.ttFollowers))}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/10 px-2.5 py-2">
                          <p className="text-[10px] text-white/70">Collabs</p>
                          <p className="text-sm font-semibold text-white">
                            {(talentDetail.collaborations?.length ?? 0).toLocaleString("fr-FR")}
                          </p>
                        </div>
                      </div>
                    </div>
                    {(talentDetail.presentation || talentDetail.bio) && (
                      <div className="p-4 space-y-2">
                        {talentDetail.presentation && (
                          <p className="text-sm leading-relaxed" style={{ color: LICORICE }}>
                            {talentDetail.presentation.length > 320
                              ? `${talentDetail.presentation.slice(0, 320)}…`
                              : talentDetail.presentation}
                          </p>
                        )}
                        {talentDetail.bio && (
                          <p className="text-sm leading-relaxed opacity-90" style={{ color: LICORICE }}>
                            {talentDetail.bio.length > 220 ? `${talentDetail.bio.slice(0, 220)}…` : talentDetail.bio}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="rounded-xl border p-3"
                      style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                    >
                      <p className="text-xs opacity-75 flex items-center gap-1" style={{ color: OLD_ROSE }}>
                        <Instagram className="w-3.5 h-3.5" /> IG (audience)
                      </p>
                      <p className="text-sm font-medium" style={{ color: LICORICE }}>
                        {typeof (talentDetail.stats as Record<string, unknown> | null)?.igFollowers === "number"
                          ? `${new Intl.NumberFormat("fr-FR").format((talentDetail.stats as Record<string, unknown>).igFollowers as number)} abonnés`
                          : "—"}
                      </p>
                      {typeof (talentDetail.stats as Record<string, unknown> | null)?.igEngagement === "number" && (
                        <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                          Engagement {((talentDetail.stats as Record<string, unknown>).igEngagement as number).toFixed(1)}%
                        </p>
                      )}
                    </div>
                    <div
                      className="rounded-xl border p-3"
                      style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                    >
                      <p className="text-xs opacity-75 flex items-center gap-1" style={{ color: OLD_ROSE }}>
                        <Music2 className="w-3.5 h-3.5" /> TikTok (audience)
                      </p>
                      <p className="text-sm font-medium" style={{ color: LICORICE }}>
                        {typeof (talentDetail.stats as Record<string, unknown> | null)?.ttFollowers === "number"
                          ? `${new Intl.NumberFormat("fr-FR").format((talentDetail.stats as Record<string, unknown>).ttFollowers as number)} abonnés`
                          : "—"}
                      </p>
                      {typeof (talentDetail.stats as Record<string, unknown> | null)?.ttEngagement === "number" && (
                        <p className="text-xs mt-1 opacity-80" style={{ color: LICORICE }}>
                          Engagement {((talentDetail.stats as Record<string, unknown>).ttEngagement as number).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#EFE6D8" }}>
                      <p className="text-base font-semibold flex items-center gap-2 mb-3" style={{ color: LICORICE }}>
                        <Instagram className="w-4 h-4" /> Instagram
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-pink-500 to-rose-500">
                          <p className="text-[11px] text-white/80">Communauté</p>
                          <p className="text-lg font-bold">{formatFollowers(asNumber((talentDetail.stats as Record<string, unknown> | null)?.igFollowers))}</p>
                        </div>
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-purple-500 to-indigo-500">
                          <p className="text-[11px] text-white/80 flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> Engagement</p>
                          <p className="text-lg font-bold">{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.igEngagement)}</p>
                        </div>
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-blue-500 to-cyan-500">
                          <p className="text-[11px] text-white/80 flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Audience FR</p>
                          <p className="text-lg font-bold">{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.igLocFrance)}</p>
                        </div>
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-emerald-500 to-teal-500">
                          <p className="text-[11px] text-white/80">Collaborations</p>
                          <p className="text-lg font-bold">{(talentDetail.collaborations?.length ?? 0).toLocaleString("fr-FR")}</p>
                        </div>
                      </div>
                      <div className="rounded-xl border p-3 bg-gradient-to-br from-gray-50 to-white" style={{ borderColor: "#EFE6D8" }}>
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: LICORICE }}>
                          <Users className="w-4 h-4 text-gray-400" /> Répartition par genre
                        </p>
                        <div className="space-y-2 text-xs">
                          <div>
                            <div className="flex justify-between mb-1">
                              <span style={{ color: LICORICE }}>👩 Femmes</span>
                              <span className="font-semibold" style={{ color: LICORICE }}>{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.igGenreFemme)}</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full" style={{ width: `${clampPercent((talentDetail.stats as Record<string, unknown> | null)?.igGenreFemme)}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span style={{ color: LICORICE }}>👨 Hommes</span>
                              <span className="font-semibold" style={{ color: LICORICE }}>{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.igGenreHomme)}</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full" style={{ width: `${clampPercent((talentDetail.stats as Record<string, unknown> | null)?.igGenreHomme)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border p-3 bg-gradient-to-br from-gray-50 to-white mt-2" style={{ borderColor: "#EFE6D8" }}>
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: LICORICE }}>
                          <Calendar className="w-4 h-4 text-gray-400" /> Tranches d'âge
                        </p>
                        <div className="space-y-2 text-xs">
                          {[
                            { label: "13-17 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.igAge13_17 },
                            { label: "18-24 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.igAge18_24 },
                            { label: "25-34 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.igAge25_34 },
                            { label: "35-44 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.igAge35_44 },
                            { label: "45+ ans", value: (talentDetail.stats as Record<string, unknown> | null)?.igAge45Plus },
                          ].map((age) => (
                            <div key={age.label}>
                              <div className="flex justify-between mb-1">
                                <span style={{ color: "#6B7280" }}>{age.label}</span>
                                <span className="font-semibold" style={{ color: LICORICE }}>{formatPercentValue(age.value)}</span>
                              </div>
                              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-rose-300 to-pink-400 rounded-full" style={{ width: `${clampPercent(age.value)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#EFE6D8" }}>
                      <p className="text-base font-semibold flex items-center gap-2 mb-3" style={{ color: LICORICE }}>
                        <Music2 className="w-4 h-4" /> TikTok
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-gray-700 to-gray-900">
                          <p className="text-[11px] text-white/80">Communauté</p>
                          <p className="text-lg font-bold">{formatFollowers(asNumber((talentDetail.stats as Record<string, unknown> | null)?.ttFollowers))}</p>
                        </div>
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-cyan-500 to-blue-500">
                          <p className="text-[11px] text-white/80 flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> Engagement</p>
                          <p className="text-lg font-bold">{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.ttEngagement)}</p>
                        </div>
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-teal-500 to-emerald-500">
                          <p className="text-[11px] text-white/80 flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Audience FR</p>
                          <p className="text-lg font-bold">{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.ttLocFrance)}</p>
                        </div>
                        <div className="rounded-xl p-3 text-white bg-gradient-to-br from-orange-500 to-amber-500">
                          <p className="text-[11px] text-white/80">Collaborations</p>
                          <p className="text-lg font-bold">{(talentDetail.collaborations?.length ?? 0).toLocaleString("fr-FR")}</p>
                        </div>
                      </div>
                      <div className="rounded-xl border p-3 bg-gradient-to-br from-gray-50 to-white" style={{ borderColor: "#EFE6D8" }}>
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: LICORICE }}>
                          <Users className="w-4 h-4 text-gray-400" /> Répartition par genre
                        </p>
                        <div className="space-y-2 text-xs">
                          <div>
                            <div className="flex justify-between mb-1">
                              <span style={{ color: LICORICE }}>👩 Femmes</span>
                              <span className="font-semibold" style={{ color: LICORICE }}>{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.ttGenreFemme)}</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full" style={{ width: `${clampPercent((talentDetail.stats as Record<string, unknown> | null)?.ttGenreFemme)}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span style={{ color: LICORICE }}>👨 Hommes</span>
                              <span className="font-semibold" style={{ color: LICORICE }}>{formatPercentValue((talentDetail.stats as Record<string, unknown> | null)?.ttGenreHomme)}</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full" style={{ width: `${clampPercent((talentDetail.stats as Record<string, unknown> | null)?.ttGenreHomme)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border p-3 bg-gradient-to-br from-gray-50 to-white mt-2" style={{ borderColor: "#EFE6D8" }}>
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: LICORICE }}>
                          <Calendar className="w-4 h-4 text-gray-400" /> Tranches d'âge
                        </p>
                        <div className="space-y-2 text-xs">
                          {[
                            { label: "13-17 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.ttAge13_17 },
                            { label: "18-24 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.ttAge18_24 },
                            { label: "25-34 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.ttAge25_34 },
                            { label: "35-44 ans", value: (talentDetail.stats as Record<string, unknown> | null)?.ttAge35_44 },
                            { label: "45+ ans", value: (talentDetail.stats as Record<string, unknown> | null)?.ttAge45Plus },
                          ].map((age) => (
                            <div key={age.label}>
                              <div className="flex justify-between mb-1">
                                <span style={{ color: "#6B7280" }}>{age.label}</span>
                                <span className="font-semibold" style={{ color: LICORICE }}>{formatPercentValue(age.value)}</span>
                              </div>
                              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-rose-300 to-pink-400 rounded-full" style={{ width: `${clampPercent(age.value)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className="rounded-xl border p-3"
                    style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
                  >
                    <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: LICORICE }}>
                      <Target className="w-4 h-4" /> Performances Stories (interne)
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-[#F5EBE0] px-2 py-1.5">
                        <p className="text-[10px] uppercase opacity-70" style={{ color: OLD_ROSE }}>Vues 30j</p>
                        <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                          {typeof (talentDetail.stats as Record<string, unknown> | null)?.storyViews30d === "number"
                            ? new Intl.NumberFormat("fr-FR").format((talentDetail.stats as Record<string, unknown>).storyViews30d as number)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#F5EBE0] px-2 py-1.5">
                        <p className="text-[10px] uppercase opacity-70" style={{ color: OLD_ROSE }}>Vues 7j</p>
                        <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                          {typeof (talentDetail.stats as Record<string, unknown> | null)?.storyViews7d === "number"
                            ? new Intl.NumberFormat("fr-FR").format((talentDetail.stats as Record<string, unknown>).storyViews7d as number)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#F5EBE0] px-2 py-1.5">
                        <p className="text-[10px] uppercase opacity-70" style={{ color: OLD_ROSE }}>Clics 30j</p>
                        <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                          {typeof (talentDetail.stats as Record<string, unknown> | null)?.storyLinkClicks30d === "number"
                            ? new Intl.NumberFormat("fr-FR").format((talentDetail.stats as Record<string, unknown>).storyLinkClicks30d as number)
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                      <p className="text-xs opacity-75 flex items-center gap-1" style={{ color: OLD_ROSE }}><Mail className="w-3.5 h-3.5" /> Email</p>
                      <p className="text-sm font-medium break-all" style={{ color: LICORICE }}>{talentDetail.email ? talentDetail.email : "—"}</p>
                    </div>
                    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                      <p className="text-xs opacity-75 flex items-center gap-1" style={{ color: OLD_ROSE }}><Phone className="w-3.5 h-3.5" /> Téléphone</p>
                      <p className="text-sm font-medium" style={{ color: LICORICE }}>{talentDetail.telephone ? talentDetail.telephone : "—"}</p>
                    </div>
                    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                      <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>Ville</p>
                      <p className="text-sm font-medium" style={{ color: LICORICE }}>{talentDetail.ville ? talentDetail.ville : "—"}</p>
                    </div>
                    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                      <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>Pays</p>
                      <p className="text-sm font-medium" style={{ color: LICORICE }}>{talentDetail.pays ? talentDetail.pays : "—"}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                    <p className="text-sm font-semibold" style={{ color: LICORICE }}>Grille tarifaire (aperçu)</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div><p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Story</p><p className="text-sm font-medium" style={{ color: LICORICE }}>{((talentDetail.tarifs as Record<string, unknown> | null)?.tarifStory ?? null) ? `${String((talentDetail.tarifs as Record<string, unknown>).tarifStory)}€` : "—"}</p></div>
                      <div><p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Post</p><p className="text-sm font-medium" style={{ color: LICORICE }}>{((talentDetail.tarifs as Record<string, unknown> | null)?.tarifPost ?? null) ? `${String((talentDetail.tarifs as Record<string, unknown>).tarifPost)}€` : "—"}</p></div>
                      <div><p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Reel</p><p className="text-sm font-medium" style={{ color: LICORICE }}>{((talentDetail.tarifs as Record<string, unknown> | null)?.tarifReel ?? null) ? `${String((talentDetail.tarifs as Record<string, unknown>).tarifReel)}€` : "—"}</p></div>
                      <div><p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>TikTok (vidéo)</p><p className="text-sm font-medium" style={{ color: LICORICE }}>{((talentDetail.tarifs as Record<string, unknown> | null)?.tarifTiktokVideo ?? null) ? `${String((talentDetail.tarifs as Record<string, unknown>).tarifTiktokVideo)}€` : "—"}</p></div>
                      <div><p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>YouTube (vidéo)</p><p className="text-sm font-medium" style={{ color: LICORICE }}>{((talentDetail.tarifs as Record<string, unknown> | null)?.tarifYoutubeVideo ?? null) ? `${String((talentDetail.tarifs as Record<string, unknown>).tarifYoutubeVideo)}€` : "—"}</p></div>
                      <div><p className="text-[11px] opacity-75" style={{ color: OLD_ROSE }}>Shooting</p><p className="text-sm font-medium" style={{ color: LICORICE }}>{((talentDetail.tarifs as Record<string, unknown> | null)?.tarifShooting ?? null) ? `${String((talentDetail.tarifs as Record<string, unknown>).tarifShooting)}€` : "—"}</p></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                      <p className="text-sm font-semibold" style={{ color: LICORICE }}>Collaborations</p>
                      <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>{(talentDetail.collaborations?.length ?? 0)} total</p>
                      <div className="mt-2 space-y-1">
                        {(talentDetail.collaborations ?? []).slice(0, 3).map((c) => <div key={c.id} className="text-xs" style={{ color: LICORICE }}><span className="font-medium">{c.marque?.nom ?? "Marque"}</span>{c.createdAt ? ` — ${new Date(c.createdAt).toLocaleDateString("fr-FR")}` : ""}</div>)}
                        {(talentDetail.collaborations ?? []).length === 0 && <p className="text-xs opacity-60">—</p>}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
                      <p className="text-sm font-semibold" style={{ color: LICORICE }}>Négociations</p>
                      <p className="text-xs opacity-75" style={{ color: OLD_ROSE }}>{(talentDetail.negociations?.length ?? 0)} total</p>
                      <div className="mt-2 space-y-1">
                        {(talentDetail.negociations ?? []).slice(0, 3).map((n) => <div key={n.id} className="text-xs" style={{ color: LICORICE }}><span className="font-medium">{n.marque?.nom ?? "Marque"}</span>{n.createdAt ? ` — ${new Date(n.createdAt).toLocaleDateString("fr-FR")}` : ""}</div>)}
                        {(talentDetail.negociations ?? []).length === 0 && <p className="text-xs opacity-60">—</p>}
                      </div>
                    </div>
                  </div>
                  <details className="rounded-xl border p-3" open={false}>
                    <summary className="text-sm font-medium cursor-pointer" style={{ color: LICORICE }}>Infos brutes (toutes les données)</summary>
                    <div className="mt-2">
                      <div className="max-h-64 overflow-auto border rounded-lg">
                        <table className="w-full text-left"><tbody>
                          {rawTalentEntries.length === 0 ? (
                            <tr><td className="p-3 text-xs opacity-70" style={{ color: LICORICE }}>—</td></tr>
                          ) : (
                            rawTalentEntries.map((e, idx) => (
                              <tr key={`${e.path}-${idx}`} className="border-t">
                                <td className="p-2 align-top font-mono text-[11px] text-slate-700 break-all" style={{ width: "52%" }}>{e.path}</td>
                                <td className="p-2 align-top font-mono text-[11px] text-slate-900 break-all">{e.value}</td>
                              </tr>
                            ))
                          )}
                        </tbody></table>
                      </div>
                    </div>
                  </details>
                </div>
              )}
              {!talentDetailLoading && !talentDetailError && !talentDetail && (
                <p className="text-sm" style={{ color: OLD_ROSE }}>
                  Impossible d’afficher la fiche pour le moment.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

