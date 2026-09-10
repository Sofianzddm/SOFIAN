"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import {
  Bold,
  Eye,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Pencil,
  Italic,
  Underline as UnderlineIcon,
  Languages,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { talentToTiptapNode } from "@/lib/talent-email-links";
import { plainTextToEmailHtml } from "@/lib/email-body-html";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const VARIABLES_CONTACT_OWNER: { token: string; label: string }[] = [
  { token: "{{ contact.firstname }}", label: "Prenom du contact" },
  { token: "{{contact.lastname}}", label: "Nom du contact" },
  { token: "{{ contact.company }}", label: "Nom de la marque" },
  { token: "{{ owner.firstname }}", label: "Prenom de la sales" },
];

const PIPELINE_VARIABLES: { token: string; label: string; hint: string }[] = [
  {
    token: "{{ contact.firstname }}",
    label: "PRÉNOM",
    hint: "Prénom saisi dans Ajouter contact client",
  },
  {
    token: "{{contact.lastname}}",
    label: "NOM",
    hint: "Nom saisi dans Ajouter contact client",
  },
  {
    token: "{{ contact.company }}",
    label: "MARQUE",
    hint: "Nom de la marque ciblée",
  },
  {
    token: "{{ owner.firstname }}",
    label: "MOI",
    hint: "Prénom de l'expéditrice (Leyna)",
  },
];

export type BrandResearch = {
  recentCampaigns: string;
  newProducts: string;
  brandPositioning: string;
  influenceStrategy: string;
};

export type Talent = {
  id: string;
  prenom?: string;
  nom?: string;
  niches?: string[];
  instagram?: string | null;
};

export interface EmailComposerProps {
  subject: string;
  onSubjectChange: (v: string) => void;
  language: "fr" | "en";
  onLanguageChange: (v: "fr" | "en") => void;
  brandName: string;
  brandResearch: BrandResearch | null;
  onBrandResearch: () => void;
  isResearching: boolean;
  talentsSelected: Talent[];
  isGenerating: boolean;
  onGenerate: () => void;
  editor: Editor | null;
  /** hubspot = jetons {{talent_N}} (casting HubSpot). instagram = liens cliquables (envoi Gmail direct). */
  talentInsertMode?: "hubspot" | "instagram";
  /**
   * Affiche en plus une rangee de gros boutons (PRENOM, NOM, MARQUE, MOI)
   * tres visibles, utilises uniquement dans le composer ouvert depuis le
   * pipeline prospection talent. Pas affiche dans le casting-outreach inbound.
   */
  showPipelineVariables?: boolean;
  /**
   * Ajoute la variable {{ contact.marques }} (liste des sous-marques couvertes)
   * — utilisée quand le contact couvre plusieurs marques (marque mère / sœurs).
   */
  showMarquesVariable?: boolean;
  /**
   * Sous-marques réellement ciblées par la recherche IA + la rédaction
   * (ex. « Dove, Axe, Rexona ») quand les contacts couvrent des marques filles.
   * Affiché près du bouton de recherche pour clarifier que l'analyse ne porte
   * pas sur la maison mère.
   */
  researchTargetLabel?: string | null;
}

export default function EmailComposer({
  subject,
  onSubjectChange,
  language,
  onLanguageChange,
  brandName,
  brandResearch,
  onBrandResearch,
  isResearching,
  talentsSelected,
  isGenerating,
  onGenerate,
  editor,
  talentInsertMode = "hubspot",
  showPipelineVariables = false,
  showMarquesVariable = false,
  researchTargetLabel = null,
}: EmailComposerProps) {
  const contactOwnerVariables = showMarquesVariable
    ? [
        ...VARIABLES_CONTACT_OWNER.slice(0, 3),
        { token: "{{ contact.marques }}", label: "Marques couvertes (Dove, Axe…)" },
        ...VARIABLES_CONTACT_OWNER.slice(3),
      ]
    : VARIABLES_CONTACT_OWNER;
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [lastField, setLastField] = useState<"subject" | "body">("body");
  const [bodyTick, setBodyTick] = useState(0);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const [customTalentIndex, setCustomTalentIndex] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [tone, setTone] = useState<"tu" | "vous">("vous");
  const [isRewritingTone, setIsRewritingTone] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);

  const talentTokensFromSelection = useMemo<
    { token: string; label: string; node?: Record<string, unknown> }[]
  >(() => {
    return talentsSelected.map((t, i) => {
      const name = `${t.prenom || ""} ${t.nom || ""}`.trim() || `Talent ${i + 1}`;
      const token = `{{talent_${i + 1}}}`;
      if (talentInsertMode === "instagram") {
        return { token, label: name, node: talentToTiptapNode(t) };
      }
      return { token, label: name };
    });
  }, [talentsSelected, talentInsertMode]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => setBodyTick((n) => n + 1);
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor]);

  useEffect(() => {
    const key = `email-composer-draft:${brandName || "default"}`;
    const id = window.setTimeout(() => {
      const payload = {
        language,
        subject,
        body: editor?.getHTML() || "",
        at: Date.now(),
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    }, 500);
    return () => window.clearTimeout(id);
  }, [subject, language, brandName, editor, bodyTick]);

  const insertVariable = (token: string) => {
    if (lastField === "subject") {
      const el = subjectInputRef.current;
      if (!el) {
        onSubjectChange(`${subject}${token}`);
        return;
      }
      const start = Math.min(el.selectionStart ?? subject.length, subject.length);
      const end = Math.min(el.selectionEnd ?? subject.length, subject.length);
      const next = subject.slice(0, start) + token + subject.slice(end);
      onSubjectChange(next);
      const pos = start + token.length;
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
      return;
    }
    editor?.chain().focus().insertContent(token).run();
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien", prev || "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  };

  const translateEmail = async () => {
    if (!editor) return;
    const currentSubject = subject.trim();
    const currentBody = editor.getHTML().trim();
    if (!currentSubject && (!currentBody || currentBody === "<p></p>")) {
      setTranslateError("Rédige d'abord un objet ou un corps avant de traduire.");
      return;
    }
    const targetLanguage: "fr" | "en" = language === "fr" ? "en" : "fr";
    setIsTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch("/api/casting/translate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: currentSubject,
          bodyHtml: currentBody,
          targetLanguage,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        subject?: string;
        body?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Traduction impossible.");
      }
      const nextSubject = typeof data.subject === "string" ? data.subject : "";
      const nextBody = typeof data.body === "string" ? data.body : "";
      onSubjectChange(nextSubject);
      const html = nextBody.startsWith("<")
        ? nextBody
        : plainTextToEmailHtml(nextBody) || "<p></p>";
      editor.commands.setContent(html);
      setBodyTick((n) => n + 1);
      onLanguageChange(targetLanguage);
    } catch (e: unknown) {
      setTranslateError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsTranslating(false);
    }
  };

  const rewriteTone = async () => {
    if (!editor) return;
    const currentSubject = subject.trim();
    const currentBody = editor.getHTML().trim();
    if (!currentSubject && (!currentBody || currentBody === "<p></p>")) {
      setTranslateError("Rédige d'abord un objet ou un corps avant de changer le ton.");
      return;
    }
    const targetTone: "tu" | "vous" = tone === "vous" ? "tu" : "vous";
    setIsRewritingTone(true);
    setTranslateError(null);
    try {
      const res = await fetch("/api/casting/rewrite-tone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: currentSubject,
          bodyHtml: currentBody,
          targetTone,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        subject?: string;
        body?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Réécriture impossible.");
      }
      const nextSubject = typeof data.subject === "string" ? data.subject : "";
      const nextBody = typeof data.body === "string" ? data.body : "";
      onSubjectChange(nextSubject);
      const html = nextBody.startsWith("<")
        ? nextBody
        : plainTextToEmailHtml(nextBody) || "<p></p>";
      editor.commands.setContent(html);
      setBodyTick((n) => n + 1);
      setTone(targetTone);
    } catch (e: unknown) {
      setTranslateError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setIsRewritingTone(false);
    }
  };

  const words = useMemo(() => {
    const t = (editor?.getText() || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }, [editor, bodyTick]);

  const previewBody = useMemo(() => {
    if (!editor) return "";
    return editor.getHTML().replace(/\n/g, "<br />");
  }, [editor, bodyTick]);

  const chipBtn =
    "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-semibold transition-colors hover:shadow-sm shrink-0";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Recherche marque — une ligne, détail repliable */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onBrandResearch}
          disabled={isResearching}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-opacity disabled:opacity-60"
          style={{ borderColor: OLD_ROSE, color: LICORICE }}
        >
          {isResearching ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Analyse…
            </>
          ) : (
            <>Par recherche</>
          )}
        </button>
        {brandResearch && (
          <button
            type="button"
            onClick={() => setResearchOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg hover:bg-black/5"
            style={{ color: OLD_ROSE }}
          >
            Recherche OK
            {researchOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
        {researchTargetLabel && (
          <span className="text-[11px] truncate" style={{ color: OLD_ROSE }}>
            Cible : <span style={{ color: LICORICE }}>{researchTargetLabel}</span>
          </span>
        )}
        <div className="ml-auto inline-flex rounded-lg border p-0.5 shrink-0" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 45%, transparent)`, backgroundColor: "white" }}>
          <button
            type="button"
            onClick={() => setPreviewMode("edit")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: previewMode === "edit" ? TEA_GREEN : "transparent", color: LICORICE }}
          >
            <Pencil className="w-3 h-3" />
            Editer
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("preview")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: previewMode === "preview" ? TEA_GREEN : "transparent", color: LICORICE }}
          >
            <Eye className="w-3 h-3" />
            Apercu
          </button>
        </div>
      </div>
      {brandResearch && researchOpen && (
        <div
          className="rounded-lg border px-3 py-2 space-y-1.5 text-xs shrink-0 max-h-28 overflow-y-auto"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, color: LICORICE }}
        >
          <p>{brandResearch.recentCampaigns}</p>
          <p>{brandResearch.newProducts}</p>
          <p>{brandResearch.brandPositioning}</p>
          <p>{brandResearch.influenceStrategy}</p>
        </div>
      )}

      {previewMode === "edit" && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value === "en" ? "en" : "fr")}
            className="rounded-lg border px-2 py-1.5 text-xs bg-white shrink-0"
            style={{ borderColor: OLD_ROSE, color: LICORICE }}
            title="Langue de rédaction"
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
          </select>
          <input
            ref={subjectInputRef}
            type="text"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            onFocus={() => setLastField("subject")}
            className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:ring-offset-0"
            style={{ borderColor: OLD_ROSE, color: LICORICE }}
            placeholder="Objet…"
          />
        </div>
      )}

      {previewMode === "edit" && (
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: OLD_ROSE }}>
            Vars ({lastField === "subject" ? "objet" : "corps"})
          </span>
          {showPipelineVariables && talentInsertMode !== "instagram"
            ? PIPELINE_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  className={chipBtn}
                  style={{
                    borderColor: TEA_GREEN,
                    backgroundColor: `color-mix(in srgb, ${TEA_GREEN} 35%, white)`,
                    color: LICORICE,
                  }}
                  title={`${v.hint} — ${v.token}`}
                >
                  + {v.label}
                </button>
              ))
            : null}
          {!showPipelineVariables && talentInsertMode !== "instagram"
            ? contactOwnerVariables.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  className={`${chipBtn} font-mono max-w-[10rem]`}
                  style={{ borderColor: OLD_ROSE, backgroundColor: "white", color: LICORICE }}
                  title={`${v.label} — ${v.token}`}
                >
                  <span className="truncate">{v.token}</span>
                </button>
              ))
            : null}
          <span className="text-[10px] uppercase tracking-wide ml-1 shrink-0" style={{ color: OLD_ROSE }}>
            Talent
          </span>
          {talentTokensFromSelection.length === 0 ? (
            <span className="text-[11px] opacity-70" style={{ color: OLD_ROSE }}>
              (sélection à gauche)
            </span>
          ) : (
            talentTokensFromSelection.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => {
                  if (talentInsertMode === "instagram") {
                    if (v.node && lastField === "body") {
                      editor
                        ?.chain()
                        .focus()
                        .insertContent([v.node, { type: "text", text: " " }])
                        .run();
                      return;
                    }
                    insertVariable(v.label);
                    return;
                  }
                  insertVariable(v.token);
                }}
                className={`${chipBtn} max-w-[9rem]`}
                style={{ borderColor: OLD_ROSE, backgroundColor: "white", color: LICORICE }}
                title={v.label}
              >
                <span className="truncate font-mono">
                  {talentInsertMode === "instagram" ? v.label : v.token}
                </span>
              </button>
            ))
          )}
          {talentInsertMode !== "instagram" && (
            <>
              <input
                type="number"
                min={1}
                step={1}
                value={customTalentIndex}
                onChange={(e) => setCustomTalentIndex(e.target.value)}
                placeholder="N°"
                className="w-12 rounded-md border px-1.5 py-1 text-[11px] font-mono"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
                title="Autre n° talent"
              />
              <button
                type="button"
                onClick={() => {
                  const n = Number.parseInt(customTalentIndex.trim(), 10);
                  if (!Number.isFinite(n) || n < 1) return;
                  insertVariable(`{{talent_${n}}}`);
                }}
                className={chipBtn}
                style={{ borderColor: OLD_ROSE, backgroundColor: OLD_LACE, color: LICORICE }}
              >
                + talent_N
              </button>
            </>
          )}
        </div>
      )}

      {previewMode === "preview" ? (
        <div
          className="flex-1 min-h-0 overflow-y-auto rounded-xl border p-4 space-y-3 bg-white"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
        >
          <div>
            <p className="text-[10px] uppercase mb-1 opacity-70" style={{ color: LICORICE }}>
              Objet
            </p>
            <p className="text-sm font-semibold" style={{ color: LICORICE }}>
              {subject || "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase mb-1 opacity-70" style={{ color: LICORICE }}>
              Corps
            </p>
            <div
              className="prose prose-sm max-w-none text-sm border-t pt-3"
              style={{ color: LICORICE }}
              dangerouslySetInnerHTML={{ __html: previewBody || "<p></p>" }}
            />
          </div>
        </div>
      ) : (
        <div
          className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border bg-white"
          style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
        >
          {editor && (
            <div
              className="flex flex-wrap items-center gap-1 px-2 py-1 border-b shrink-0"
              style={{
                borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`,
                backgroundColor: OLD_LACE,
              }}
            >
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("bold") ? "bg-white" : ""}`}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("italic") ? "bg-white" : ""}`}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("underline") ? "bg-white" : ""}`}
              >
                <UnderlineIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("bulletList") ? "bg-white" : ""}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("orderedList") ? "bg-white" : ""}`}
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={setLink}
                className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("link") ? "bg-white" : ""}`}
              >
                <LinkIcon className="w-4 h-4" />
              </button>
              <span className="text-sm px-1 self-center select-none" style={{ color: OLD_ROSE }}>
                |
              </span>
              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50 ${
                  !brandResearch || talentsSelected.length === 0 ? "opacity-60" : ""
                }`}
                style={{ backgroundColor: OLD_ROSE, color: "white" }}
                title={
                  !brandResearch
                    ? "Lance d'abord l'analyse de la marque (Par recherche)"
                    : talentsSelected.length === 0
                      ? "Sélectionne au moins un talent à gauche"
                      : "Rédiger le mail"
                }
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Rédaction…
                  </>
                ) : (
                  <>Rédiger</>
                )}
              </button>
              <button
                type="button"
                onClick={translateEmail}
                disabled={isTranslating}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border-2 disabled:opacity-50 transition-colors"
                style={{
                  borderColor: LICORICE,
                  backgroundColor: "white",
                  color: LICORICE,
                }}
                title={language === "fr" ? "Traduire en anglais" : "Traduire en français"}
              >
                {isTranslating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Traduction...
                  </>
                ) : (
                  <>
                    <Languages className="w-3.5 h-3.5" />
                    {language === "fr" ? "EN" : "FR"}
                  </>
                )}
              </button>
              {language === "fr" && (
                <button
                  type="button"
                  onClick={rewriteTone}
                  disabled={isRewritingTone}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border-2 disabled:opacity-50 transition-colors"
                  style={{
                    borderColor: OLD_ROSE,
                    backgroundColor: "white",
                    color: LICORICE,
                  }}
                  title={
                    tone === "vous"
                      ? "Réécrit tout le mail en tutoiement (tu / ton / ta…)"
                      : "Réécrit tout le mail en vouvoiement (vous / votre…)"
                  }
                >
                  {isRewritingTone ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      Réécriture...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-3.5 h-3.5" />
                      {tone === "vous" ? "Tutoyer" : "Vouvoyer"}
                    </>
                  )}
                </button>
              )}
            </div>
          )}
          {translateError && (
            <div
              className="px-3 py-1 text-xs border-b shrink-0"
              style={{
                borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`,
                color: "#991B1B",
                backgroundColor: "#FEF2F2",
              }}
            >
              {translateError}
            </div>
          )}
          <div
            className="relative flex-1 min-h-0 overflow-y-auto"
            onClick={() => setLastField("body")}
          >
            <EditorContent editor={editor} className="h-full [&_.ProseMirror]:min-h-full" />
          </div>
          <div
            className="px-3 py-1.5 border-t text-[11px] shrink-0"
            style={{
              borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`,
              color: OLD_ROSE,
            }}
          >
            {words} mot{words > 1 ? "s" : ""} • {talentsSelected.length} talent
            {talentsSelected.length > 1 ? "s" : ""} selectionne
            {talentsSelected.length > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
