"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { Bold, Eye, Link as LinkIcon, List, ListOrdered, Loader2, Pencil, Italic, Underline as UnderlineIcon } from "lucide-react";

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
}: EmailComposerProps) {
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [lastField, setLastField] = useState<"subject" | "body">("body");
  const [bodyTick, setBodyTick] = useState(0);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const [customTalentIndex, setCustomTalentIndex] = useState<string>("");

  const talentTokensFromSelection = useMemo<
    { token: string; label: string }[]
  >(() => {
    return talentsSelected.map((t, i) => {
      const name = `${t.prenom || ""} ${t.nom || ""}`.trim() || `Talent ${i + 1}`;
      return { token: `{{talent_${i + 1}}}`, label: name };
    });
  }, [talentsSelected]);

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

  const words = useMemo(() => {
    const t = (editor?.getText() || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }, [editor, bodyTick]);

  const previewBody = useMemo(() => {
    if (!editor) return "";
    return editor.getHTML().replace(/\n/g, "<br />");
  }, [editor, bodyTick]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold" style={{ fontFamily: "Spectral, serif", color: LICORICE }}>
        {brandName || "Marque"}
      </h2>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBrandResearch}
            disabled={isResearching}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl border transition-opacity disabled:opacity-60"
            style={{ borderColor: OLD_ROSE, color: LICORICE }}
          >
            {isResearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Analyse automatique en cours
              </>
            ) : (
              <>🔍 Par recherche automatique</>
            )}
          </button>
          {brandResearch && (
            <button
              type="button"
              onClick={onBrandResearch}
              disabled={isResearching}
              className="text-sm px-2 py-1 rounded-lg hover:bg-black/5 transition-colors disabled:opacity-60"
              style={{ color: OLD_ROSE }}
            >
              🔄 Actualiser
            </button>
          )}
        </div>
        {brandResearch && (
          <div className="rounded-xl border p-4 space-y-3 text-sm" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, color: LICORICE }}>
            <p>{brandResearch.recentCampaigns}</p>
            <p>{brandResearch.newProducts}</p>
            <p>{brandResearch.brandPositioning}</p>
            <p>{brandResearch.influenceStrategy}</p>
          </div>
        )}
      </div>

      {previewMode === "edit" && (
        <div className="space-y-3">
          <div className="w-full sm:w-44">
            <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
              Langue de rédaction
            </label>
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value === "en" ? "en" : "fr")}
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
              Objet de l'email <span className="text-red-500">*</span>
            </label>
            <input
              ref={subjectInputRef}
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              onFocus={() => setLastField("subject")}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-0"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
              placeholder="Objet..."
            />
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs space-y-0.5" style={{ color: OLD_ROSE }}>
          <p className="font-medium" style={{ color: LICORICE }}>
            Variables dynamiques
          </p>
          <p>
            Cliquez sur un jeton : insertion dans <strong>{lastField === "subject" ? "l'objet" : "le corps"}</strong>.
          </p>
        </div>
        <div className="inline-flex rounded-xl border p-0.5 shrink-0" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 45%, transparent)`, backgroundColor: "white" }}>
          <button
            type="button"
            onClick={() => setPreviewMode("edit")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: previewMode === "edit" ? TEA_GREEN : "transparent", color: LICORICE }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Editer
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("preview")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: previewMode === "preview" ? TEA_GREEN : "transparent", color: LICORICE }}
          >
            <Eye className="w-3.5 h-3.5" />
            Apercu
          </button>
        </div>
      </div>

      {previewMode === "edit" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES_CONTACT_OWNER.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => insertVariable(v.token)}
                className="text-xs px-2 py-1.5 rounded-lg border font-mono text-left max-w-full"
                style={{ borderColor: OLD_ROSE, backgroundColor: "white", color: LICORICE }}
                title={`${v.label} — ${v.token}`}
              >
                <span className="block truncate">{v.token}</span>
                <span className="block text-[10px] font-sans opacity-80 font-normal normal-case">{v.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: OLD_ROSE }}>
            Talents (optionnel) — ordre = sélection ; <code className="font-mono">{'{{talent_N}}'}</code> pour tout N
          </p>
          <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 pr-1">
            {talentTokensFromSelection.length === 0 ? (
              <p className="text-[11px] font-sans normal-case opacity-80" style={{ color: OLD_ROSE }}>
                Sélectionnez des talents à gauche pour insérer les jetons correspondants.
              </p>
            ) : (
              talentTokensFromSelection.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  className="text-xs px-2 py-1 rounded-lg border font-mono text-left max-w-full"
                  style={{ borderColor: OLD_ROSE, backgroundColor: "white", color: LICORICE }}
                  title={v.label}
                >
                  <span className="block truncate">{v.token}</span>
                  <span className="block text-[10px] font-sans opacity-80 font-normal normal-case truncate">
                    {v.label}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="flex flex-col gap-0.5 text-[10px] font-sans normal-case" style={{ color: OLD_ROSE }}>
              Autre n°
              <input
                type="number"
                min={1}
                step={1}
                value={customTalentIndex}
                onChange={(e) => setCustomTalentIndex(e.target.value)}
                placeholder="ex. 12"
                className="w-20 rounded-lg border px-2 py-1 text-xs font-mono"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const n = Number.parseInt(customTalentIndex.trim(), 10);
                if (!Number.isFinite(n) || n < 1) return;
                insertVariable(`{{talent_${n}}}`);
              }}
              className="text-xs px-2 py-1.5 rounded-lg border font-medium"
              style={{ borderColor: OLD_ROSE, backgroundColor: OLD_LACE, color: LICORICE }}
            >
              Insérer {'{{talent_N}}'}
            </button>
          </div>
        </div>
      )}

      {previewMode === "preview" ? (
        <div className="rounded-xl border p-4 space-y-4 bg-white" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
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
            <div className="prose prose-sm max-w-none text-sm min-h-[200px] border-t pt-3" style={{ color: LICORICE }} dangerouslySetInnerHTML={{ __html: previewBody || "<p></p>" }} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}>
          {editor && (
            <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`, backgroundColor: OLD_LACE }}>
              <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("bold") ? "bg-white" : ""}`}>
                <Bold className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("italic") ? "bg-white" : ""}`}>
                <Italic className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("underline") ? "bg-white" : ""}`}>
                <UnderlineIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("bulletList") ? "bg-white" : ""}`}>
                <List className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("orderedList") ? "bg-white" : ""}`}>
                <ListOrdered className="w-4 h-4" />
              </button>
              <button type="button" onClick={setLink} className={`p-1.5 rounded hover:bg-white/80 ${editor.isActive("link") ? "bg-white" : ""}`}>
                <LinkIcon className="w-4 h-4" />
              </button>
              <span className="text-sm px-1 self-center select-none" style={{ color: OLD_ROSE }}>|</span>
              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating || !brandResearch}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ backgroundColor: OLD_ROSE, color: "white" }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Redaction en cours...
                  </>
                ) : (
                  <>✍️ Rediger automatiquement</>
                )}
              </button>
            </div>
          )}
          <div className="relative" onClick={() => setLastField("body")}>
            <EditorContent editor={editor} />
          </div>
          <div className="px-3 py-2 border-t text-xs" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)`, color: OLD_ROSE }}>
            {words} mot{words > 1 ? "s" : ""} • {talentsSelected.length} talent{talentsSelected.length > 1 ? "s" : ""} selectionne{talentsSelected.length > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

