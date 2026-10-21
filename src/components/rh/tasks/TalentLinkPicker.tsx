"use client";

import { Search, X } from "lucide-react";
import { RhAvatar } from "@/components/rh/ui/primitives";
import type { TaskTalent } from "@/components/rh/tasks/task-meta";

/** Sélecteur talent — lien interne RH, aucune notif au talent. */
export function TalentLinkPicker({
  selected,
  query,
  onQuery,
  results,
  searching,
  onSelect,
  onClear,
}: {
  selected: TaskTalent | null;
  query: string;
  onQuery: (v: string) => void;
  results: TaskTalent[];
  searching: boolean;
  onSelect: (t: TaskTalent) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {selected ? (
        <div
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 border"
          style={{
            background: "rgba(124,58,237,.08)",
            borderColor: "rgba(124,58,237,.2)",
          }}
        >
          <RhAvatar
            initials={selected.initials}
            color="#7C3AED"
            src={selected.photo}
            size={28}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium truncate">
              {selected.name}
            </div>
            {selected.instagram ? (
              <div
                className="text-[10px] truncate"
                style={{ color: "var(--rh-text-dim)" }}
              >
                @{selected.instagram.replace(/^@/, "")}
              </div>
            ) : null}
          </div>
          <a
            href={`/talents/${selected.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] no-underline"
            style={{ color: "var(--rh-accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            Fiche
          </a>
          <button
            type="button"
            className="p-1 border-0 bg-transparent cursor-pointer"
            style={{ color: "var(--rh-text-muted)" }}
            onClick={onClear}
            title="Retirer"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--rh-text-dim)" }}
            />
            <input
              className="rh-input w-full !pl-9"
              placeholder="Rechercher un talent (nom, IG)…"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
          </div>
          {(query.trim() || results.length > 0) && (
            <div
              className="max-h-[160px] overflow-y-auto rounded-xl border p-1"
              style={{
                background: "var(--rh-bg-panel)",
                borderColor: "var(--rh-border-subtle)",
              }}
            >
              {searching ? (
                <div
                  className="text-center text-[12px] py-3"
                  style={{ color: "var(--rh-text-dim)" }}
                >
                  Recherche…
                </div>
              ) : results.length === 0 ? (
                <div
                  className="text-center text-[12px] py-3"
                  style={{ color: "var(--rh-text-dim)" }}
                >
                  Aucun talent
                </div>
              ) : (
                results.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className="flex w-full items-center gap-2 text-left rounded-lg px-2 py-1.5 border-0 cursor-pointer"
                    style={{
                      background: "transparent",
                      color: "inherit",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--rh-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <RhAvatar
                      initials={t.initials}
                      color="#7C3AED"
                      src={t.photo}
                      size={24}
                    />
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium truncate">
                        {t.name}
                      </div>
                      {t.instagram ? (
                        <div
                          className="text-[10px] truncate"
                          style={{ color: "var(--rh-text-dim)" }}
                        >
                          @{t.instagram.replace(/^@/, "")}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
