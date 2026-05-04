export const CANNES_PDF_SECTION_KEYS = ["team", "talents", "events"] as const;
export type CannesPdfSection = (typeof CANNES_PDF_SECTION_KEYS)[number];

export type CannesPdfSectionFlags = Record<CannesPdfSection, boolean>;

export const CANNES_PDF_ALL_SECTIONS: CannesPdfSectionFlags = {
  team: true,
  talents: true,
  events: true,
};

/** Query `?sections=team` ou `team,talents`. Absent ou vide = tout. */
export function parseCannesPdfSectionsParam(param: string | null): CannesPdfSectionFlags {
  if (param == null || !String(param).trim()) {
    return { ...CANNES_PDF_ALL_SECTIONS };
  }
  const set = new Set(
    String(param)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const flags: CannesPdfSectionFlags = {
    team: set.has("team"),
    talents: set.has("talents"),
    events: set.has("events"),
  };
  if (!flags.team && !flags.talents && !flags.events) {
    return { ...CANNES_PDF_ALL_SECTIONS };
  }
  return flags;
}

export function flagsToSectionsSearchParam(flags: CannesPdfSectionFlags): string {
  const keys = CANNES_PDF_SECTION_KEYS.filter((k) => flags[k]);
  if (keys.length === CANNES_PDF_SECTION_KEYS.length) return "";
  return `sections=${encodeURIComponent(keys.join(","))}`;
}

export function filenameSlugForFlags(flags: CannesPdfSectionFlags): string {
  const keys = CANNES_PDF_SECTION_KEYS.filter((k) => flags[k]);
  if (keys.length === CANNES_PDF_SECTION_KEYS.length) return "complet";
  return keys.join("-");
}
