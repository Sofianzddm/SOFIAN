"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import { Bold, Italic, Underline as UnderlineIcon, Loader2, X } from "lucide-react";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

type BrandResearchState = {
  recentCampaigns: string;
  newProducts: string;
  brandPositioning: string;
  influenceStrategy: string;
};

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
  const [brandResearch, setBrandResearch] = useState<BrandResearchState | null>(null);

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
  }, [open, demande, editor]);

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
      onSuccess("Analyse Grok terminée");
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsResearching(false);
    }
  };

  const runGenerateEmail = async () => {
    if (!brandResearch) {
      onError("Lance d'abord l'analyse Grok.");
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
          talents: [],
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
              style={{ backgroundColor: OLD_LACE, color: LICORICE }}
            >
              {demande.body}
            </div>

            <button
              type="button"
              onClick={runBrandResearch}
              disabled={isResearching}
              className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            >
              {isResearching && <Loader2 className="w-4 h-4 animate-spin" />}
              🔍 Analyser avec Grok
            </button>

            {brandResearch && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="rounded-lg border p-2" style={{ borderColor: OLD_ROSE }}>
                  <p className="font-medium">Recent campaigns</p>
                  <p>{brandResearch.recentCampaigns}</p>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: OLD_ROSE }}>
                  <p className="font-medium">New products</p>
                  <p>{brandResearch.newProducts}</p>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: OLD_ROSE }}>
                  <p className="font-medium">Brand positioning</p>
                  <p>{brandResearch.brandPositioning}</p>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: OLD_ROSE }}>
                  <p className="font-medium">Influence strategy</p>
                  <p>{brandResearch.influenceStrategy}</p>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 p-4 flex flex-col min-h-0">
            <h3 className="text-lg font-semibold mb-3" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>
              Réponse
            </h3>
            <label className="text-xs font-medium mb-1" style={{ color: OLD_ROSE }}>
              Objet de la réponse
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm mb-3"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            />

            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className="p-2 rounded-lg border"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className="p-2 rounded-lg border"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                className="p-2 rounded-lg border"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              >
                <UnderlineIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={runGenerateEmail}
                disabled={isGenerating}
                className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              >
                {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
                ✍️ Rédiger avec Grok
              </button>
            </div>

            <div className="flex-1 min-h-0">
              <EditorContent editor={editor} />
            </div>
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

