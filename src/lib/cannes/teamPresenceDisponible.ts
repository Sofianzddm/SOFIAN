import { isUtcDayInIsoRange } from "@/lib/cannes/dates";

/** Présence équipe / talent : fenêtre Cannes + indispos internes. */
export type PresenceArrivalWindow = {
  arrivalDate: string;
  departureDate: string;
  teamUnavailabilities?: Array<{ startDate: string; endDate: string }>;
};

/** Collaborateur considéré « sur place » et disponible ce jour calendaire (Paris, comme le planning équipe). */
export function teamPresenceDisponibleOnDay(p: PresenceArrivalWindow, day: Date): boolean {
  const onPresenceWindow = isUtcDayInIsoRange(day, p.arrivalDate, p.departureDate);
  const absenceDay = (p.teamUnavailabilities ?? []).some((u) =>
    isUtcDayInIsoRange(day, u.startDate, u.endDate)
  );
  return onPresenceWindow && !absenceDay;
}
