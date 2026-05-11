import { parisDayKey } from "@/lib/cannes/dates";

/** Événement agenda Cannes avec participants (structure page Cannes 2026). */
export type CannesEventForPresence = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  location: string;
  attendees: Array<{ presenceId: string }>;
};

/**
 * Événements du jour civil Paris où la présence est listée comme participante.
 */
export function listCannesEventsForPresenceOnDay(
  events: CannesEventForPresence[],
  presenceId: string,
  dayYmd: string
): CannesEventForPresence[] {
  return events
    .filter((ev) => {
      if (parisDayKey(ev.date) !== dayYmd) return false;
      return ev.attendees.some((a) => a.presenceId === presenceId);
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
