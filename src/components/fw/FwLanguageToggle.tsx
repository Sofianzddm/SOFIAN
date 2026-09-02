"use client";

import type { FwLanguage } from "@/lib/fw-language";

const OPTIONS: Array<{ id: FwLanguage; label: string; short: string }> = [
  { id: "fr", label: "Français", short: "FR" },
  { id: "en", label: "Anglais", short: "EN" },
];

export function FwLanguageToggle({
  value,
  onChange,
  size = "md",
  compact = false,
}: {
  value: FwLanguage | null;
  onChange: (lang: FwLanguage) => void;
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-lg border font-medium transition ${pad} ${
              active
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {compact ? opt.short : opt.label}
          </button>
        );
      })}
    </div>
  );
}
