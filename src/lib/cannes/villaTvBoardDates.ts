import { CANNES_2026_DAYS, parisDayKey } from "@/lib/cannes/dates";
import { parseParisHhmm, parisYmdHhmmToUtc } from "@/lib/cannes/teamPlanningSlotTimes";

export const CANNES_VILLA_TV_ALLOWED_YMD = new Set(CANNES_2026_DAYS.map((d) => parisDayKey(d)));

export function isVillaTvBoardDateAllowed(ymd: string): boolean {
  return CANNES_VILLA_TV_ALLOWED_YMD.has(ymd.trim());
}

/** Début + fin optionnelle ; la fin doit être après le début (même jour Paris). */
export function normalizeVillaTvBoardTimeRange(
  dateYmd: string,
  rawStart: string,
  rawEnd: string | null | undefined
):
  | { ok: true; timeLabel: string; endTimeLabel: string | null }
  | { ok: false; error: string } {
  const rawS = (rawStart || "12:00").trim();
  const timeLabel = parseParisHhmm(rawS).ok ? rawS : "12:00";

  const endTrim =
    rawEnd === null || rawEnd === undefined ? "" : String(rawEnd).trim();
  if (!endTrim) {
    return { ok: true, timeLabel, endTimeLabel: null };
  }
  if (!parseParisHhmm(endTrim).ok) {
    return { ok: false, error: "Heure de fin invalide (format HH:mm, ex. 14:00)" };
  }

  const t0 = parisYmdHhmmToUtc(dateYmd, timeLabel)?.getTime();
  const t1 = parisYmdHhmmToUtc(dateYmd, endTrim)?.getTime();
  if (t0 == null || t1 == null) {
    return { ok: true, timeLabel, endTimeLabel: endTrim };
  }
  if (t1 <= t0) {
    return { ok: false, error: "L’heure de fin doit être après l’heure de début" };
  }
  return { ok: true, timeLabel, endTimeLabel: endTrim };
}
