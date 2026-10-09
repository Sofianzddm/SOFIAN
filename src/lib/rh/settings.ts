import prisma from "@/lib/prisma";
import { writeRhAudit } from "@/lib/rh/workflow";

export type RhScheduleSlot = { from: string; to: string };

export type RhSettingsData = {
  /** Contrat hebdo par défaut (si non défini sur le collab) */
  defaultWeeklyHours: number;
  /** Minutes d’une journée de référence (7 h = 420) */
  workdayMinutes: number;
  /** Créneaux lun–jeu */
  slotsWeekday: RhScheduleSlot[];
  /** Créneaux vendredi */
  slotsFriday: RhScheduleSlot[];
  /** Pause déjeuner défaut (min) sur feuille — 0 si hors créneaux */
  defaultBreakMinutes: number;

  /** Premières heures HS à 25 % (au-delà → 50 %) */
  ot25CapHours: number;
  /** HS sous ce seuil (min) → file « micro » manager */
  microOtMaxMinutes: number;

  /** Art. 1.6 : dès N absences → max 1 j TT */
  remoteAbsencesForOneDay: number;
  /** Art. 1.6 : dès N absences → 0 j TT */
  remoteAbsencesForZero: number;

  /** CP jours / an */
  cpDaysPerYear: number;
  /** Mois de début d’exercice (0 = janv., 6 = juil.) */
  cpExerciseStartMonth: number;
  /** Ancienneté (années) avant pose CP */
  cpSeniorityYears: number;

  /** Récup : min / max / pas (minutes) */
  recupMinMinutes: number;
  recupMaxMinutes: number;
  recupStepMinutes: number;
  /** Validité récup après crédit HS (jours) — 0 = pas d’auto-expiration */
  recupExpiryDays: number;

  /** Seuil couverture équipe (%) */
  coverageThresholdPercent: number;

  /** Titres-restaurant */
  trFacial: number;
  trCompanyShare: number;
  /** Retenue paie = facial − companyShare si non fourni */
  trPayrollDeduction: number | null;

  /** IK €/km (CV de référence 5) */
  mileageRatePerKm: number;
};

export const RH_SETTINGS_DEFAULTS: RhSettingsData = {
  defaultWeeklyHours: 35,
  workdayMinutes: 7 * 60,
  slotsWeekday: [
    { from: "09:30", to: "12:00" },
    { from: "14:00", to: "18:30" },
  ],
  slotsFriday: [
    { from: "09:30", to: "12:00" },
    { from: "13:00", to: "17:30" },
  ],
  defaultBreakMinutes: 20,
  ot25CapHours: 8,
  microOtMaxMinutes: 30,
  remoteAbsencesForOneDay: 1,
  remoteAbsencesForZero: 3,
  cpDaysPerYear: 25,
  cpExerciseStartMonth: 6,
  cpSeniorityYears: 1,
  recupMinMinutes: 15,
  recupMaxMinutes: 7 * 60,
  recupStepMinutes: 15,
  recupExpiryDays: 90,
  coverageThresholdPercent: 60,
  trFacial: 9,
  trCompanyShare: 5.4,
  trPayrollDeduction: null,
  mileageRatePerKm: 0.339,
};

function isSlot(v: unknown): v is RhScheduleSlot {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as RhScheduleSlot).from === "string" &&
    typeof (v as RhScheduleSlot).to === "string"
  );
}

function mergeSettings(raw: unknown): RhSettingsData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<RhSettingsData>;
  const weekday = Array.isArray(d.slotsWeekday)
    ? d.slotsWeekday.filter(isSlot)
    : RH_SETTINGS_DEFAULTS.slotsWeekday;
  const friday = Array.isArray(d.slotsFriday)
    ? d.slotsFriday.filter(isSlot)
    : RH_SETTINGS_DEFAULTS.slotsFriday;
  return {
    ...RH_SETTINGS_DEFAULTS,
    ...d,
    slotsWeekday: weekday.length ? weekday : RH_SETTINGS_DEFAULTS.slotsWeekday,
    slotsFriday: friday.length ? friday : RH_SETTINGS_DEFAULTS.slotsFriday,
    defaultWeeklyHours: Number(d.defaultWeeklyHours ?? RH_SETTINGS_DEFAULTS.defaultWeeklyHours),
    workdayMinutes: Number(d.workdayMinutes ?? RH_SETTINGS_DEFAULTS.workdayMinutes),
    defaultBreakMinutes: Number(
      d.defaultBreakMinutes ?? RH_SETTINGS_DEFAULTS.defaultBreakMinutes
    ),
    ot25CapHours: Number(d.ot25CapHours ?? RH_SETTINGS_DEFAULTS.ot25CapHours),
    microOtMaxMinutes: Number(
      d.microOtMaxMinutes ?? RH_SETTINGS_DEFAULTS.microOtMaxMinutes
    ),
    remoteAbsencesForOneDay: Number(
      d.remoteAbsencesForOneDay ?? RH_SETTINGS_DEFAULTS.remoteAbsencesForOneDay
    ),
    remoteAbsencesForZero: Number(
      d.remoteAbsencesForZero ?? RH_SETTINGS_DEFAULTS.remoteAbsencesForZero
    ),
    cpDaysPerYear: Number(d.cpDaysPerYear ?? RH_SETTINGS_DEFAULTS.cpDaysPerYear),
    cpExerciseStartMonth: Number(
      d.cpExerciseStartMonth ?? RH_SETTINGS_DEFAULTS.cpExerciseStartMonth
    ),
    cpSeniorityYears: Number(
      d.cpSeniorityYears ?? RH_SETTINGS_DEFAULTS.cpSeniorityYears
    ),
    recupMinMinutes: Number(d.recupMinMinutes ?? RH_SETTINGS_DEFAULTS.recupMinMinutes),
    recupMaxMinutes: Number(d.recupMaxMinutes ?? RH_SETTINGS_DEFAULTS.recupMaxMinutes),
    recupStepMinutes: Number(
      d.recupStepMinutes ?? RH_SETTINGS_DEFAULTS.recupStepMinutes
    ),
    recupExpiryDays: Number(d.recupExpiryDays ?? RH_SETTINGS_DEFAULTS.recupExpiryDays),
    coverageThresholdPercent: Number(
      d.coverageThresholdPercent ?? RH_SETTINGS_DEFAULTS.coverageThresholdPercent
    ),
    trFacial: Number(d.trFacial ?? RH_SETTINGS_DEFAULTS.trFacial),
    trCompanyShare: Number(d.trCompanyShare ?? RH_SETTINGS_DEFAULTS.trCompanyShare),
    trPayrollDeduction:
      d.trPayrollDeduction == null
        ? null
        : Number(d.trPayrollDeduction),
    mileageRatePerKm: Number(
      d.mileageRatePerKm ?? RH_SETTINGS_DEFAULTS.mileageRatePerKm
    ),
  };
}

let cache: { at: number; data: RhSettingsData } | null = null;
const CACHE_MS = 15_000;

export async function getRhSettings(): Promise<RhSettingsData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const row = await prisma.rhSettings.findUnique({ where: { id: "default" } });
    const data = mergeSettings(row?.data);
    cache = { at: Date.now(), data };
    return data;
  } catch {
    // Table absente / migrate pas encore appliquée
    return { ...RH_SETTINGS_DEFAULTS };
  }
}

export function invalidateRhSettingsCache() {
  cache = null;
}

export async function updateRhSettings(params: {
  data: Partial<RhSettingsData>;
  actorId: string;
}): Promise<RhSettingsData> {
  const current = await getRhSettings();
  const next = mergeSettings({ ...current, ...params.data });
  await prisma.rhSettings.upsert({
    where: { id: "default" },
    create: { id: "default", data: next, updatedById: params.actorId },
    update: { data: next, updatedById: params.actorId },
  });
  invalidateRhSettingsCache();
  await writeRhAudit({
    actorId: params.actorId,
    action: "settings.update",
    detail: { keys: Object.keys(params.data) },
  });
  return next;
}

export function trPayrollDeductionOf(s: RhSettingsData): number {
  if (s.trPayrollDeduction != null) return s.trPayrollDeduction;
  return Math.round((s.trFacial - s.trCompanyShare) * 100) / 100;
}

export function scheduleBoundsFromSettings(
  s: RhSettingsData,
  isFriday: boolean
): { start: string; end: string; slots: RhScheduleSlot[] } {
  const slots = isFriday ? s.slotsFriday : s.slotsWeekday;
  const start = slots.reduce(
    (min, sl) => (sl.from < min ? sl.from : min),
    slots[0]?.from || "09:30"
  );
  const end = slots.reduce(
    (max, sl) => (sl.to > max ? sl.to : max),
    slots[0]?.to || "18:30"
  );
  return { start, end, slots };
}
