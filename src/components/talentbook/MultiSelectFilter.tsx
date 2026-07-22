"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toggleFilterValue } from "@/lib/talent-attributes";

type MultiSelectFilterProps = {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  getOptionLabel?: (opt: string) => string;
  /** Padding / typo un peu plus compacte (pages partenaires). */
  compact?: boolean;
  /** Style dashboard interne (bordures grises). */
  variant?: "book" | "dashboard";
};

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  getOptionLabel = (opt) => opt,
  compact = false,
  variant = "book",
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const count = selected.length;
  const isBook = variant === "book";

  const triggerClass = isBook
    ? `inline-flex items-center gap-1.5 ${
        compact ? "px-3 sm:px-4 text-xs sm:text-sm" : "px-4 text-sm"
      } py-2 rounded-full font-switzer transition-all border ${
        count > 0
          ? "bg-[#220101] text-[#F5EDE0] border-[#220101]"
          : "bg-white text-[#220101]/70 border-[#220101]/20 hover:border-[#220101]/40"
      }`
    : `inline-flex w-full items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
        count > 0
          ? "border-glowup-rose bg-glowup-lace/40 text-glowup-burgundy"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      }`;

  return (
    <div ref={rootRef} className="relative inline-block min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <span className="truncate max-w-[10rem] sm:max-w-[14rem]">
          {count === 0
            ? label
            : count === 1
              ? getOptionLabel(selected[0])
              : `${label} (${count})`}
        </span>
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className={`absolute left-0 top-full mt-2 z-50 max-h-64 overflow-y-auto py-2 min-w-[220px] max-w-[min(90vw,280px)] shadow-xl ${
            isBook
              ? "bg-white rounded-2xl border border-[#220101]/10"
              : "bg-white rounded-xl border border-gray-200"
          }`}
        >
          {options.length === 0 ? (
            <p className="px-4 py-2 text-sm text-gray-400">—</p>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => onChange(toggleFilterValue(selected, opt))}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors ${
                    isBook
                      ? checked
                        ? "bg-[#F5EDE0] text-[#220101]"
                        : "text-[#220101]/75 hover:bg-[#F5EDE0]/60"
                      : checked
                        ? "bg-glowup-lace text-glowup-burgundy"
                        : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                      checked
                        ? isBook
                          ? "border-[#220101] bg-[#220101] text-[#F5EDE0]"
                          : "border-glowup-rose bg-glowup-rose text-white"
                        : isBook
                          ? "border-[#220101]/30"
                          : "border-gray-300"
                    }`}
                    aria-hidden
                  >
                    {checked && (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={isBook ? "font-switzer" : undefined}>
                    {getOptionLabel(opt)}
                  </span>
                </button>
              );
            })
          )}
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className={`w-full mt-1 px-3.5 pt-2 pb-1 text-left text-xs border-t ${
                isBook
                  ? "border-[#220101]/10 text-[#B06F70] font-switzer hover:bg-[#B06F70]/5"
                  : "border-gray-100 text-gray-500 hover:text-glowup-rose"
              }`}
            >
              Effacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
