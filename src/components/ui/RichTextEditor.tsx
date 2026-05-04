"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Mention from "@tiptap/extension-mention";
import tippy, { Instance as TippyInstance } from "tippy.js";
import "tippy.js/dist/tippy.css";
import MentionList from "./MentionList";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  users?: { id: string; name: string }[];
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  users = [],
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      Color.configure({ types: ["textStyle"] }),
      TextStyle,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        renderLabel: ({ node }) => `@${node.attrs.label}`,
        suggestion: {
          char: "@",
          items: ({ query }) =>
            (users || [])
              .filter((u) =>
                u.name.toLowerCase().includes(query.toLowerCase())
              )
              .slice(0, 8),
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: "mention",
                attrs: {
                  id: props.id,
                  label: props.label,
                },
              })
              .insertContent(" ")
              .run();
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: TippyInstance | null = null;
            return {
              onStart: (props) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });
                popup = tippy(document.body, {
                  getReferenceClientRect: () =>
                    props.clientRect?.() || new DOMRect(0, 0, 0, 0),
                  appendTo: () => document.body,
                  content: (component as any).element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate: (props) => {
                if (!component || !popup) return;
                component.updateProps(props);
                popup.setProps({
                  getReferenceClientRect: () =>
                    props.clientRect?.() || new DOMRect(0, 0, 0, 0),
                });
              },
              onKeyDown: (props) => {
                if (!component || !popup) return false;
                if (props.event.key === "Escape") {
                  popup.hide();
                  return true;
                }
                return (component.ref as any)?.onKeyDown(props);
              },
              onExit: () => {
                if (!popup || !component) return;
                popup.destroy();
                component.destroy();
              },
            };
          },
        },
      }),
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[96px] px-3 py-2 text-sm focus:outline-none",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextValue = value || "";
    if (editor.getHTML() !== nextValue) {
      editor.commands.setContent(nextValue);
    }
  }, [editor, value]);

  if (!editor) return null;

  const setColor = (color: string) => {
    editor.chain().focus().setColor(color).run();
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-[#F5EBE0] rounded-t-lg">
        {/* Undo / Redo */}
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-white disabled:opacity-40"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-white disabled:opacity-40"
        >
          ↷
        </button>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        {/* Font family (decorative) */}
        <button
          type="button"
          className="px-2 py-0.5 text-[11px] rounded border border-transparent text-gray-700"
        >
          Sans Serif
        </button>

        {/* Font size (decorative) */}
        <button
          type="button"
          className="px-2 py-0.5 text-[11px] rounded border border-transparent text-gray-700"
        >
          tT
        </button>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        {/* Bold / Italic / Underline */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive("bold") ? "bg-white font-semibold" : ""
          }`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive("italic") ? "bg-white italic" : ""
          }`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive("underline") ? "bg-white underline" : ""
          }`}
        >
          U
        </button>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        {/* Text color */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-700">A</span>
          <input
            type="color"
            onChange={(e) => setColor(e.target.value)}
            className="w-5 h-5 p-0 border border-gray-300 rounded cursor-pointer bg-transparent"
          />
        </div>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        {/* Alignment */}
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive({ textAlign: "left" }) ? "bg-white" : ""
          }`}
        >
          ⬅
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive({ textAlign: "center" }) ? "bg-white" : ""
          }`}
        >
          ⬌
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive({ textAlign: "right" }) ? "bg-white" : ""
          }`}
        >
          ➡
        </button>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        {/* Lists */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive("bulletList") ? "bg-white" : ""
          }`}
        >
          ••
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-white ${
            editor.isActive("orderedList") ? "bg-white" : ""
          }`}
        >
          1.
        </button>

        <span className="w-px h-5 bg-gray-300 mx-1" />

        {/* Indent / Outdent */}
        <button
          type="button"
          onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-white"
        >
          ↳
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().liftListItem("listItem").run()}
          className="px-1.5 py-0.5 text-xs rounded hover:bg-white"
        >
          ↰
        </button>
      </div>

      {/* Editor */}
      <div className="px-2 py-1">
        {placeholder && !value && editor.isEmpty && (
          <div className="text-xs text-gray-400 px-3 pt-2 select-none pointer-events-none">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

