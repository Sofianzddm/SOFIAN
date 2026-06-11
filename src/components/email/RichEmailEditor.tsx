"use client";

/**
 * Éditeur de mail riche réutilisable (Tiptap v3).
 *
 * Pensé pour produire du HTML compatible Gmail/Outlook :
 *  - gras, italique, souligné, barré, couleur de texte
 *  - listes à puces / numérotées, séparateur
 *  - liens avec popover d'édition (ajout, modification, suppression)
 *  - annuler / rétablir, effacer la mise en forme
 *  - aperçu du rendu mail (HTML normalisé, exactement ce qui partira)
 *
 * Le HTML brut de l'éditeur est passé à `onChangeHtml` ; le normaliser avec
 * `normalizeEditorHtmlForEmail` au moment de l'envoi (côté API).
 */

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Minus,
  Undo2,
  Redo2,
  RemoveFormatting,
  Eye,
  Pencil,
  Palette,
  Check,
} from "lucide-react";
import { normalizeEditorHtmlForEmail } from "@/lib/email-body-html";

const TEXT_COLORS: { value: string | null; label: string; swatch: string }[] = [
  { value: null, label: "Par défaut", swatch: "#1A1110" },
  { value: "#B06F70", label: "Rose Glow Up", swatch: "#B06F70" },
  { value: "#6B7280", label: "Gris", swatch: "#6B7280" },
  { value: "#B91C1C", label: "Rouge", swatch: "#B91C1C" },
  { value: "#1D4ED8", label: "Bleu", swatch: "#1D4ED8" },
  { value: "#047857", label: "Vert", swatch: "#047857" },
  { value: "#B45309", label: "Orange", swatch: "#B45309" },
];

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

export type EditorVariable = { token: string; label: string; hint?: string };

export default function RichEmailEditor({
  initialHtml = "",
  onChangeHtml,
  placeholder = "Bonjour,\n\nRédige ton mail ici...",
  minHeight = 240,
  variables = [],
}: {
  initialHtml?: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Jetons insérables ({{prenom}}…), remplacés par destinataire à l'envoi. */
  variables?: EditorVariable[];
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [, setTick] = useState(0);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
    ],
    content: initialHtml || "",
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none px-3.5 py-3 text-sm focus:outline-none [&_a]:text-blue-700 [&_a]:underline`,
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      onChangeHtml(editor.getHTML());
    },
    onTransaction: () => {
      // Re-render pour rafraîchir l'état actif des boutons de la toolbar
      setTick((n) => n + 1);
    },
  });

  useEffect(() => {
    if (linkPanelOpen) linkInputRef.current?.focus();
  }, [linkPanelOpen]);

  if (!editor) {
    return (
      <div
        className="rounded-xl border border-gray-200 bg-gray-50 animate-pulse"
        style={{ minHeight: minHeight + 48 }}
      />
    );
  }

  const openLinkPanel = () => {
    setColorPanelOpen(false);
    const prev = (editor.getAttributes("link").href as string | undefined) || "";
    setLinkUrl(prev || "https://");
    setLinkPanelOpen((open) => !open);
  };

  const applyLink = () => {
    let url = linkUrl.trim();
    if (!url || url === "https://") {
      setLinkPanelOpen(false);
      return;
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith("mailto:")) {
      url = `https://${url}`;
    }
    const { from, to } = editor.state.selection;
    const inLink = editor.isActive("link");
    if (from === to && !inLink) {
      // Aucun texte sélectionné : insérer l'URL comme texte cliquable
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: url.replace(/^mailto:/, ""),
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkPanelOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkPanelOpen(false);
  };

  const currentColor = (editor.getAttributes("textStyle").color as string | undefined) || null;

  return (
    <div className="rounded-xl border border-gray-300 bg-white overflow-hidden">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Annuler (⌘Z)"
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rétablir (⌘⇧Z)"
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Gras (⌘B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italique (⌘I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Souligné (⌘U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Barré (⌘⇧S)"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        {/* Couleur du texte */}
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              setLinkPanelOpen(false);
              setColorPanelOpen((o) => !o);
            }}
            active={Boolean(currentColor)}
            title="Couleur du texte"
          >
            <span className="relative inline-flex">
              <Palette className="h-4 w-4" />
              <span
                className="absolute -bottom-0.5 left-0 right-0 h-[3px] rounded-full"
                style={{ backgroundColor: currentColor || "#1A1110" }}
              />
            </span>
          </ToolbarButton>
          {colorPanelOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (c.value) {
                      editor.chain().focus().setColor(c.value).run();
                    } else {
                      editor.chain().focus().unsetColor().run();
                    }
                    setColorPanelOpen(false);
                  }}
                  title={c.label}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.swatch }}
                >
                  {(currentColor || null) === c.value ? (
                    <Check className="h-3.5 w-3.5 text-white" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Liste à puces"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Liste numérotée"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Ligne de séparation"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <ToolbarButton
          onClick={openLinkPanel}
          active={editor.isActive("link") || linkPanelOpen}
          title="Insérer / modifier un lien (⌘K)"
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={removeLink}
          disabled={!editor.isActive("link")}
          title="Supprimer le lien"
        >
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title="Effacer la mise en forme"
        >
          <RemoveFormatting className="h-4 w-4" />
        </ToolbarButton>

        <div className="ml-auto inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              mode === "edit" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Pencil className="h-3 w-3" />
            Éditer
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              mode === "preview" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Eye className="h-3 w-3" />
            Aperçu mail
          </button>
        </div>
      </div>

      {/* ─── Variables dynamiques ─── */}
      {variables.length > 0 && mode === "edit" && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 bg-emerald-50/50 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Variables
          </span>
          {variables.map((v) => (
            <button
              key={v.token}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().insertContent(v.token).run()}
              title={v.hint ? `${v.hint} — insère ${v.token}` : `Insère ${v.token}`}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              <span className="text-[11px]">+</span>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── Popover lien ─── */}
      {linkPanelOpen && (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-blue-50/60 px-3 py-2">
          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-blue-700" />
          <input
            ref={linkInputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkPanelOpen(false);
            }}
            placeholder="https://exemple.com ou mailto:contact@marque.com"
            className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            type="button"
            onClick={applyLink}
            className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            Appliquer
          </button>
          {editor.isActive("link") && (
            <button
              type="button"
              onClick={removeLink}
              className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs text-blue-700 hover:bg-white"
            >
              Retirer
            </button>
          )}
        </div>
      )}

      {/* ─── Zone d'édition / aperçu ─── */}
      {mode === "edit" ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="px-3.5 py-3" style={{ minHeight }}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Rendu exact dans Gmail (signature ajoutée à l'envoi)
          </p>
          <div
            className="text-sm leading-relaxed text-gray-900 [&_a]:text-blue-700 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{
              __html: normalizeEditorHtmlForEmail(editor.getHTML()) || "<em>(vide)</em>",
            }}
          />
        </div>
      )}

      {/* ─── Footer ─── */}
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">
        <span>
          {(editor.getText().trim().match(/\S+/g) || []).length} mot
          {(editor.getText().trim().match(/\S+/g) || []).length > 1 ? "s" : ""}
        </span>
        <span>Gras ⌘B · Italique ⌘I · Souligné ⌘U · Annuler ⌘Z</span>
      </div>
    </div>
  );
}
