"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";

import { looksLikeHtmlNotes, sanitizeCannesTaskHtml } from "@/lib/cannes/cannesTaskNotes";

type EditorProps = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function normalizeIncoming(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (looksLikeHtmlNotes(v)) return v;
  return `<p>${escapePlainForHtml(v)}</p>`;
}

function escapePlainForHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "</p><p>");
}

/**
 * Éditeur riche pour la consigne / la tâche (créneaux équipe Cannes) : gras, listes, titres, alignement.
 */
export function TeamTaskRichEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Décris la tâche : objectifs, liens, contacts, checklist…",
}: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-neutral max-w-none min-h-[140px] px-3 py-2 text-sm text-[#1A1110] focus:outline-none [&_ul]:my-1 [&_ol]:my-1 [&_p]:my-1",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const next = normalizeIncoming(value);
    const cur = editor.getHTML();
    if (cur === next) return;
    editor.commands.setContent(next || "");
  }, [editor, value]);

  if (!editor) return null;

  const showPlaceholder = editor.isEmpty;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-[#E5E0D8] bg-white ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#E5E0D8] bg-[#F5EBE0]/80 px-2 py-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo() || disabled}
          className="rounded px-1.5 py-0.5 text-xs text-[#1A1110] hover:bg-white disabled:opacity-35"
          title="Annuler"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo() || disabled}
          className="rounded px-1.5 py-0.5 text-xs text-[#1A1110] hover:bg-white disabled:opacity-35"
          title="Rétablir"
        >
          ↷
        </button>
        <span className="mx-0.5 h-4 w-px bg-[#E5E0D8]" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded px-1.5 py-0.5 text-xs font-semibold text-[#1A1110] hover:bg-white ${
            editor.isActive("bold") ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded px-1.5 py-0.5 text-xs italic text-[#1A1110] hover:bg-white ${
            editor.isActive("italic") ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`rounded px-1.5 py-0.5 text-xs underline text-[#1A1110] hover:bg-white ${
            editor.isActive("underline") ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          U
        </button>
        <span className="mx-0.5 h-4 w-px bg-[#E5E0D8]" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`rounded px-1.5 py-0.5 text-[11px] text-[#1A1110] hover:bg-white ${
            editor.isActive("heading", { level: 2 }) ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          Titre
        </button>
        <span className="mx-0.5 h-4 w-px bg-[#E5E0D8]" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded px-1.5 py-0.5 text-xs text-[#1A1110] hover:bg-white ${
            editor.isActive("bulletList") ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          • Liste
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`rounded px-1.5 py-0.5 text-xs text-[#1A1110] hover:bg-white ${
            editor.isActive("orderedList") ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          1. Liste
        </button>
        <span className="mx-0.5 h-4 w-px bg-[#E5E0D8]" />
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={`rounded px-1.5 py-0.5 text-xs text-[#1A1110] hover:bg-white ${
            editor.isActive({ textAlign: "left" }) ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          ⬅
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={`rounded px-1.5 py-0.5 text-xs text-[#1A1110] hover:bg-white ${
            editor.isActive({ textAlign: "center" }) ? "bg-white ring-1 ring-[#C08B8B]/40" : ""
          }`}
        >
          ⬌
        </button>
      </div>
      <div className="relative">
        {showPlaceholder && placeholder && (
          <div className="pointer-events-none absolute left-3 top-2 z-0 max-w-[calc(100%-1.5rem)] text-xs leading-relaxed text-[#1A1110]/40">
            {placeholder}
          </div>
        )}
        <div className="relative z-[1]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

type DisplayProps = {
  html: string;
  className?: string;
};

/** Affichage des consignes (HTML ou ancien texte brut). */
export function TeamTaskNotesDisplay({ html, className = "" }: DisplayProps) {
  const trimmed = (html || "").trim();
  if (!trimmed) return null;
  if (!looksLikeHtmlNotes(trimmed)) {
    return (
      <p className={`mt-1 text-xs text-[#1A1110]/65 whitespace-pre-wrap ${className}`}>{trimmed}</p>
    );
  }
  const safe = sanitizeCannesTaskHtml(trimmed);
  return (
    <div
      className={`prose prose-sm prose-neutral max-w-none mt-1 text-xs text-[#1A1110]/80 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
