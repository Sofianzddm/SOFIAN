"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import { Loader2, X } from "lucide-react";
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
  const markers = [/^--\s*$/m, /^---------- Forwarded message/m, /^________________________________/m];
  let cleaned = body || "";
  for (const m of markers) {
    const match = cleaned.match(m);
    if (match && typeof match.index === "number") {
      cleaned = cleaned.slice(0, match.index);
      break;
    }
  }
  const deFrom = cleaned.match(/^(De|From)\s*:/m);
  if (deFrom && typeof deFrom.index === "number" && deFrom.index > 0) {
    cleaned = cleaned.slice(0, deFrom.index);
  }
  return cleaned.replace(/\n{2,}/g, "\n").trim();
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
  const [brandResearch, setBrandResearch] = useState<BrandResearch | null>(null);
  const [talents, setTalents] = useState<PresskitTalent[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(false);
  const [talentsError, setTalentsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    setBrandResearch(null);
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

  const runBrandResearch = async () => {
    if (!demande) return;
    setIsResearching(true);
    try {
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Recherche impossible.");
      }
      setBrandResearch({
        recentCampaigns: String(data.recentCampaigns || ""),
        newProducts: String(data.newProducts || ""),
        brandPositioning: String(data.brandPositioning || ""),
        influenceStrategy: String(data.influenceStrategy || ""),
      });
      onSuccess("Analyse terminee");
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsResearching(false);
    }
  };

  const runGenerateEmail = async () => {
    if (!brandResearch) {
      onError("Lance d'abord l'analyse automatique.");
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
          brandResearch,
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
    <div className="fixed inset-0 z-[120] bg-black/45 flex justify-end">
      <div
        className="w-full h-full bg-white shadow-2xl flex flex-col"
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 flex-1 min-h-0">
          <div
            className="border-r p-4 overflow-y-auto"
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
              <div className="max-h-[28vh] overflow-y-auto space-y-1.5">
                {loadingTalents ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement...
                  </div>
                ) : (
                  talents.map((t) => {
                    const sel = selectedIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTalent(t.id)}
                        className="w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors"
                        style={{
                          borderColor: sel ? TEA_GREEN : `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                          backgroundColor: sel ? "rgba(200, 242, 133, 0.18)" : "white",
                          color: LICORICE,
                        }}
                      >
                        <p className="font-medium">
                          {t.prenom} {t.nom}
                        </p>
                        <p className="opacity-75">{(t.niches || []).slice(0, 2).join(", ") || "—"}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={runBrandResearch}
              disabled={isResearching}
              className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            >
              {isResearching && <Loader2 className="w-4 h-4 animate-spin" />}
              🔍 Analyser automatiquement
            </button>

          </div>

          <div className="lg:col-span-2 p-4 flex flex-col min-h-0">
            <EmailComposer
              subject={subject}
              onSubjectChange={setSubject}
              brandName={brandName}
              brandResearch={brandResearch}
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
          className="px-5 py-3 border-t flex items-center justify-end gap-2"
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
    </div>
  );
}

