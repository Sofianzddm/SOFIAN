"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface MentionableUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
];

function getAvatarColor(userId: string): string {
  let n = 0;
  for (let i = 0; i < userId.length; i++) n += userId.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  mentionableUsers: MentionableUser[];
  className?: string;
  "data-testid"?: string;
}

export function MentionTextarea({
  value,
  onChange,
  placeholder = "Votre commentaire...",
  rows = 3,
  disabled,
  mentionableUsers,
  className = "",
  "data-testid": dataTestId,
}: MentionTextareaProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState("");
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const [atStartIndex, setAtStartIndex] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredUsers = useMemo(() => {
    if (!filter.trim()) return mentionableUsers;
    const f = filter.toLowerCase();
    return mentionableUsers.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(f) ||
        u.firstName.toLowerCase().includes(f) ||
        u.lastName.toLowerCase().includes(f)
    );
  }, [mentionableUsers, filter]);

  const openDropdown = useCallback((startIndex: number, query: string) => {
    setAtStartIndex(startIndex);
    setFilter(query);
    setShowDropdown(true);
    setDropdownIndex(0);
  }, []);

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setFilter("");
    setAtStartIndex(null);
  }, []);

  const insertMention = useCallback(
    (user: MentionableUser) => {
      if (atStartIndex == null || !textareaRef.current) return;
      const before = value.slice(0, atStartIndex);
      const after = value.slice(textareaRef.current.selectionStart);
      const mention = `@[${user.id}]`;
      const newValue = before + mention + " " + after;
      onChange(newValue);
      closeDropdown();
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const pos = atStartIndex + mention.length + 1;
        textareaRef.current?.setSelectionRange(pos, pos);
      });
    },
    [atStartIndex, value, onChange, closeDropdown]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      const selStart = e.target.selectionStart ?? v.length;

      onChange(v);

      const textBeforeCaret = v.slice(0, selStart);
      const lastAt = textBeforeCaret.lastIndexOf("@");
      if (lastAt === -1) {
        closeDropdown();
        return;
      }
      const afterAt = textBeforeCaret.slice(lastAt + 1);
      if (/[\s\[]/.test(afterAt) || afterAt.includes("]")) {
        closeDropdown();
        return;
      }
      openDropdown(lastAt, afterAt);
    },
    [onChange, openDropdown, closeDropdown]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown || filteredUsers.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDropdownIndex((i) => (i + 1) % filteredUsers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setDropdownIndex(
          (i) => (i - 1 + filteredUsers.length) % filteredUsers.length
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredUsers[dropdownIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeDropdown();
      }
    },
    [showDropdown, filteredUsers, dropdownIndex, insertMention, closeDropdown]
  );

  useEffect(() => {
    setDropdownIndex(0);
  }, [filter]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  return (
    <div ref={wrapperRef} className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        data-testid={dataTestId}
        className={
          "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none min-h-[80px] " +
          (className || "")
        }
      />
      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full min-w-[240px] max-h-[220px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl py-1"
          role="listbox"
        >
          {filteredUsers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              Aucun utilisateur
            </div>
          ) : (
            filteredUsers.map((user, i) => (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={i === dropdownIndex}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  i === dropdownIndex ? "bg-gray-50" : ""
                }`}
                onClick={() => insertMention(user)}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${getAvatarColor(
                    user.id
                  )}`}
                >
                  {user.firstName?.[0] || ""}
                  {user.lastName?.[0] || ""}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="ml-2 text-gray-500 text-xs">{user.role}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Parser le contenu avec @[userId] et afficher les mentions stylées
export function renderCommentWithMentions(
  content: string,
  usersById: Map<string, { firstName: string; lastName: string }>,
  currentUserId?: string | null
): React.ReactNode {
  if (!content || typeof content !== "string") return content;
  // Normaliser les crochets (fullwidth → ASCII) pour que le regex matche
  const normalized = content.replace(/\uFF3B/g, "[").replace(/\uFF3D/g, "]");
  const parts: React.ReactNode[] = [];
  // @[userId]
  const regex = /@\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      parts.push(normalized.slice(lastIndex, match.index));
    }
    const userId = String(match[1]).trim();
    const user = usersById.get(userId);
    const label = user ? `${user.firstName} ${user.lastName}` : "Utilisateur";
    const isMe = currentUserId && userId === currentUserId;
    parts.push(
      <span
        key={`${match.index}-${userId}`}
        className={
          isMe
            ? "bg-amber-100 text-amber-700 rounded px-1 font-medium"
            : "bg-blue-100 text-blue-700 rounded px-1 font-medium"
        }
      >
        @{label}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < normalized.length) {
    parts.push(normalized.slice(lastIndex));
  }
  return parts.length > 0 ? <>{parts}</> : content;
}
