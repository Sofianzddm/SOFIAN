import { CP, LIME, RTT, SICK, TT } from "@/components/rh/mock/shared";

export type PeopleScreen =
  | "home"
  | "absences"
  | "planning"
  | "remote"
  | "time"
  | "expenses"
  | "team"
  | "approvals"
  | "rh"
  | "manage";

export const TABS: { id: PeopleScreen; label: string; count?: number }[] = [
  { id: "home", label: "Aperçu" },
  { id: "approvals", label: "À valider" },
  { id: "absences", label: "Absences" },
  { id: "planning", label: "Planning" },
  { id: "remote", label: "Présence" },
  { id: "time", label: "Temps" },
  { id: "expenses", label: "Frais" },
  { id: "team", label: "Équipe" },
  { id: "rh", label: "Paie" },
  { id: "manage", label: "Paramètres" },
];

export const ROLE_META: Record<string, string> = {
  COLLAB: "Collaborateur",
  MANAGER: "Manager",
  HR: "RH",
};

export const KIND_COLOR: Record<string, string> = {
  CP,
  RTT,
  RECUP: RTT,
  SS: SICK,
  UNPAID: "#8B95A5",
  SCHOOL: "#B48CF0",
  AUTHORIZED: "#8ED98A",
  TT,
  OFFICE: "#8B95A5",
  TRAVEL: "#F2874E",
  SITE: "#F0C24E",
};

export const ABSENCE_KINDS = new Set([
  "CP",
  "RTT",
  "RECUP",
  "SS",
  "UNPAID",
  "SCHOOL",
  "AUTHORIZED",
]);

export const KIND_LABEL: Record<string, string> = {
  CP: "Congés payés",
  RTT: "RTT",
  RECUP: "Récupération",
  SS: "Maladie",
  UNPAID: "Sans solde",
  SCHOOL: "École",
  AUTHORIZED: "Absence autorisée",
};

/** Codes courts affichés dans le Gantt (à la place des pastilles couleur). */
export const KIND_SHORT: Record<string, string> = {
  CP: "CP",
  RTT: "RTT",
  RECUP: "Réc",
  SS: "Mal",
  UNPAID: "CNP",
  SCHOOL: "Éco",
  AUTHORIZED: "Aut",
  TT: "TT",
  OFFICE: "Bur",
  TRAVEL: "Dép",
  SITE: "Site",
};

export type PlanningEmp = {
  id: string;
  name: string;
  initials: string;
  color: string;
  department: string;
  matricule: string;
  events: Array<{ date: string; kind: string; halfDay: boolean }>;
};

export type TeamAbsence = {
  key: string;
  employeeId: string;
  name: string;
  initials: string;
  color: string;
  department: string;
  kind: string;
  from: string;
  to: string;
  days: number;
};

export type EmployeeFiche = {
  employee: {
    id: string;
    name: string;
    initials: string;
    avatarColor: string;
    avatarUrl?: string | null;
    jobTitle: string;
    department: string;
    matricule: string;
    email: string;
    weeklyHours?: number;
    remoteAgreement?: number;
    healthCover?: string;
    rhRole?: string;
  };
  balances: Array<{
    id: string;
    accountCode: string;
    bookable: number;
    remaining: number;
  }>;
  requests: Array<{
    id: string;
    reference: string;
    type: string;
    status: string;
    title: string;
    days: number | null;
    createdAt: string;
  }>;
};

export type PlanningData = {
  employees: PlanningEmp[];
  absentToday: Array<{
    id: string;
    name: string;
    initials: string;
    color: string;
    department: string;
    kind: string;
  }>;
  coverage: Array<{
    dept: string;
    pct: number;
    label: string;
    color: string;
  }>;
  from: string;
  to: string;
};

export type InboxItem = {
  idx: number;
  id: string;
  who: string;
  initials: string;
  color: string;
  avatarUrl?: string | null;
  employeeId: string;
  kind: string;
  title: string;
  meta: string;
  comment: string;
  detailRaw: Record<string, unknown>;
  status: string;
};

export type ForceForm = {
  employeeId: string;
  from: string;
  to: string;
  accountCode: string;
  minutes: number | "";
};

export type SigItem = {
  id: string;
  name: string;
  email: string;
  isoWeek: number;
  isoYear: number;
  totalMinutes: number;
  signatureRequestedAt: string | null;
  weekStart: string;
  pdfUrl: string | null;
  signedPdfUrl: string | null;
  docusealSigningUrl: string | null;
  docusealSubmissionId: string | null;
};

export { CP, LIME, RTT, SICK, TT };

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}

export function formatFr(iso: string) {
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y?.slice(2) ?? ""}`;
}

/** Regroupe les jours d'absence contigus par collab + type. */
export function buildTeamAbsences(employees: PlanningEmp[]): TeamAbsence[] {
  const out: TeamAbsence[] = [];
  for (const emp of employees) {
    const days = emp.events
      .filter((e) => ABSENCE_KINDS.has(e.kind))
      .map((e) => e.date)
      .sort();
    if (!days.length) continue;

    const byKind = new Map<string, string[]>();
    for (const ev of emp.events.filter((e) => ABSENCE_KINDS.has(e.kind))) {
      const list = byKind.get(ev.kind) || [];
      list.push(ev.date);
      byKind.set(ev.kind, list);
    }

    for (const [kind, dates] of byKind) {
      const sorted = [...new Set(dates)].sort();
      let from = sorted[0]!;
      let prev = sorted[0]!;
      for (let i = 1; i <= sorted.length; i++) {
        const cur = sorted[i];
        const prevD = new Date(prev + "T12:00:00");
        prevD.setDate(prevD.getDate() + 1);
        const contiguous = cur === isoDate(prevD);
        if (!contiguous) {
          out.push({
            key: `${emp.id}-${kind}-${from}`,
            employeeId: emp.id,
            name: emp.name,
            initials: emp.initials,
            color: emp.color,
            department: emp.department,
            kind,
            from,
            to: prev,
            days:
              Math.round(
                (new Date(prev + "T12:00:00").getTime() -
                  new Date(from + "T12:00:00").getTime()) /
                  86400000
              ) + 1,
          });
          if (cur) from = cur;
        }
        if (cur) prev = cur;
      }
    }
  }
  return out.sort(
    (a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name)
  );
}
