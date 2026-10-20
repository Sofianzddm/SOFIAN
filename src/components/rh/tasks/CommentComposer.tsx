"use client";

import { useMemo, useRef, useState } from "react";
import { RhAvatar, RhButton } from "@/components/rh/ui/primitives";

export type MentionEmp = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  avatarUrl?: string | null;
};

/** Insère @[Nom](id) à la position du curseur. */
export function insertMention(
  text: string,
  cursor: number,
  person: MentionEmp
): { next: string; cursor: number } {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const at = before.lastIndexOf("@");
  const start = at >= 0 ? at : before.length;
  const token = `@[${person.name}](${person.id}) `;
  const next = before.slice(0, start) + token + after;
  return { next, cursor: start + token.length };
}

export function renderCommentBody(body: string) {
  const parts: Array<{ type: "text" | "mention"; value: string }> = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) {
      parts.push({ type: "text", value: body.slice(last, m.index) });
    }
    parts.push({ type: "mention", value: m[1] || "" });
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    parts.push({ type: "text", value: body.slice(last) });
  }
  if (!parts.length) parts.push({ type: "text", value: body });
  return parts;
}

export function CommentComposer({
  employees,
  busy,
  onSend,
}: {
  employees: MentionEmp[];
  busy: boolean;
  onSend: (body: string, mentionedIds: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    return employees
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [employees, open, query]);

  function detectMention(value: string, cursor: number) {
    const before = value.slice(0, cursor);
    const match = before.match(/@([^@[\]()\n]*)$/);
    if (!match) {
      setOpen(false);
      setQuery("");
      return;
    }
    setOpen(true);
    setQuery(match[1] || "");
    setSel(0);
  }

  function pick(person: MentionEmp) {
    const el = ref.current;
    const cursor = el?.selectionStart ?? text.length;
    const { next, cursor: nextCursor } = insertMention(text, cursor, person);
    setText(next);
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    const mentionedIds = [
      ...new Set(
        [...body.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1]!)
      ),
    ];
    onSend(body, mentionedIds);
    setText("");
    setOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-2">
      <textarea
        ref={ref}
        className="rh-input w-full min-h-[72px]"
        placeholder="Écrire un commentaire… tape @ pour mentionner"
        value={text}
        disabled={busy}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          detectMention(v, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (open && suggestions.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => (s + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => (s - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              pick(suggestions[sel]!);
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <div
          className="absolute left-0 right-0 bottom-full mb-1 z-20 rounded-xl border overflow-hidden max-h-[220px] overflow-y-auto"
          style={{
            background: "#12151A",
            borderColor: "var(--rh-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,.45)",
          }}
        >
          {suggestions.map((e, i) => (
            <button
              key={e.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left border-0 cursor-pointer"
              style={{
                background: i === sel ? "var(--rh-surface-selected)" : "transparent",
                color: "inherit",
              }}
              onMouseDown={(ev) => {
                ev.preventDefault();
                pick(e);
              }}
            >
              <RhAvatar
                initials={e.initials}
                color={e.avatarColor}
                src={e.avatarUrl}
                size={22}
              />
              <span className="text-[13px]">{e.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex justify-between items-center">
        <span className="text-[10px]" style={{ color: "var(--rh-text-dim)" }}>
          @ mention · ⌘↵ envoyer
        </span>
        <RhButton disabled={busy || !text.trim()} onClick={submit}>
          Envoyer
        </RhButton>
      </div>
    </div>
  );
}
