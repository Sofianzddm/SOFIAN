import path from "path";
import React from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";

import { formatParisLongHeadingFromYmd, parisYmdHhmmToUtc } from "@/lib/cannes/teamPlanningSlotTimes";
import { PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";

import type {
  TeamKanbanPdfEvent,
  TeamKanbanPdfPresence,
  TeamKanbanPdfSlot,
} from "@/lib/cannes/teamIndividualKanbanPdfDocument";

const LOGO_PATH = path.join(process.cwd(), "public", "Logo.png");

const C = {
  ink: "#1A1110",
  rose: "#B87A7A",
  roseDeep: "#8E4A4A",
  sand: "#F7F0EA",
  sand2: "#EDE6DC",
  line: "#D9D0C6",
  muted: "#6B625C",
  white: "#FFFFFF",
  soft: "#FBF8F5",
  agendaBg: "#EEF2FF",
  agendaInk: "#3730A3",
  planningBg: "#F5E6E6",
  planningInk: "#5C2A2A",
  notes: "#3D3835",
};

const NOTES_MAX = 2800;

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    backgroundColor: C.white,
  },
  accentTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: C.roseDeep,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: C.rose,
  },
  kicker: {
    fontSize: 7,
    letterSpacing: 2,
    color: C.roseDeep,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 10, color: C.muted, marginTop: 5, lineHeight: 1.45 },
  logo: { width: 48, height: 48, objectFit: "contain" },
  personSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  personSectionFirst: {
    marginTop: 4,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  personName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 4 },
  personMeta: { fontSize: 8, color: C.muted, marginBottom: 10, lineHeight: 1.4 },
  listHeading: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.roseDeep,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  taskRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 5,
    backgroundColor: C.soft,
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftColor: C.rose,
  },
  taskRowAgenda: {
    borderLeftColor: "#6366F1",
    backgroundColor: "#FAFAFF",
  },
  timeCol: { width: "24%", paddingRight: 6 },
  timeText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink, lineHeight: 1.35 },
  bodyCol: { width: "76%" },
  tag: {
    alignSelf: "flex-start",
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tagPlanning: { backgroundColor: C.planningBg, color: C.planningInk },
  tagAgenda: { backgroundColor: C.agendaBg, color: C.agendaInk },
  taskTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, lineHeight: 1.35 },
  taskMeta: { fontSize: 8, color: C.muted, marginTop: 3, lineHeight: 1.4 },
  taskNotes: { fontSize: 8, color: C.notes, marginTop: 5, lineHeight: 1.45 },
  emptyList: {
    fontSize: 9,
    color: C.muted,
    fontStyle: "italic",
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: C.sand2,
    borderRadius: 4,
  },
  emptyPeople: {
    marginTop: 24,
    padding: 16,
    backgroundColor: C.sand,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
  },
  emptyPeopleText: { fontSize: 10, color: C.muted, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 7,
    color: C.muted,
    textAlign: "center",
  },
});

function truncate(s: string, n: number) {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function eventSortMs(dateYmd: string, ev: TeamKanbanPdfEvent): number {
  const parsed = parisYmdHhmmToUtc(dateYmd, ev.startTime);
  if (parsed) return parsed.getTime();
  const noon = parisYmdHhmmToUtc(dateYmd, "12:00");
  return noon ? noon.getTime() : new Date(ev.date).getTime();
}

type DayTask =
  | { kind: "slot"; t: number; slot: TeamKanbanPdfSlot }
  | { kind: "event"; t: number; event: TeamKanbanPdfEvent };

function mergeDayTasks(dateYmd: string, slots: TeamKanbanPdfSlot[], events: TeamKanbanPdfEvent[]): DayTask[] {
  const out: DayTask[] = [];
  for (const slot of slots) {
    out.push({ kind: "slot", t: new Date(slot.startsAt).getTime(), slot });
  }
  for (const event of events) {
    out.push({ kind: "event", t: eventSortMs(dateYmd, event), event });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export type TeamDayPdfPerson = {
  presence: TeamKanbanPdfPresence;
  slots: TeamKanbanPdfSlot[];
  events: TeamKanbanPdfEvent[];
  statusLabel: string;
  statusKey: "dispo" | "blocked" | "off";
};

type Props = {
  dateYmd: string;
  /** Attendu : uniquement les collaborateurs « sur place » ce jour. */
  people: TeamDayPdfPerson[];
  generatedAt: Date;
};

function TaskList({ dateYmd, row }: { dateYmd: string; row: TeamDayPdfPerson }) {
  const tasks = mergeDayTasks(dateYmd, row.slots, row.events);

  if (tasks.length === 0) {
    return (
      <Text style={styles.emptyList}>
        Aucun créneau horaire ni inscription agenda pour ce jour — compléter le planning ou l’onglet Agenda.
      </Text>
    );
  }

  return (
    <View>
      {tasks.map((task, i) => {
        if (task.kind === "slot") {
          const s = task.slot;
          const t0 = formatInTimeZone(new Date(s.startsAt), PARIS_TZ, "HH:mm");
          const t1 = formatInTimeZone(new Date(s.endsAt), PARIS_TZ, "HH:mm");
          const title = (s.title || "Sans titre").trim() || "Sans titre";
          const loc = (s.location || "").trim();
          const notesRaw = (s.notesPlain || "").trim();
          const notes = notesRaw ? truncate(notesRaw, NOTES_MAX) : "";
          return (
            <View key={`${row.presence.id}-t-${i}`} style={styles.taskRow}>
              <View style={styles.timeCol}>
                <Text style={styles.timeText}>
                  {t0} → {t1}
                </Text>
              </View>
              <View style={styles.bodyCol}>
                <Text style={[styles.tag, styles.tagPlanning]}>Créneau équipe</Text>
                <Text style={styles.taskTitle}>{title}</Text>
                {loc ? <Text style={styles.taskMeta}>Lieu : {loc}</Text> : null}
                {notes ? (
                  <Text style={styles.taskNotes}>
                    {notes}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }
        const ev = task.event;
        const timeEnd = ev.endTime ? ` → ${ev.endTime}` : "";
        const loc = (ev.location || "").trim();
        return (
          <View key={`${row.presence.id}-t-${i}`} style={[styles.taskRow, styles.taskRowAgenda]}>
            <View style={styles.timeCol}>
              <Text style={styles.timeText}>
                {ev.startTime}
                {timeEnd}
              </Text>
            </View>
            <View style={styles.bodyCol}>
              <Text style={[styles.tag, styles.tagAgenda]}>Agenda</Text>
              <Text style={styles.taskTitle}>{ev.title}</Text>
              {loc ? <Text style={styles.taskMeta}>Lieu : {loc}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function TeamDayAllIndividualsPdfDocument({ dateYmd, people, generatedAt }: Props) {
  const dateTitle = `${formatParisLongHeadingFromYmd(dateYmd)} 2026`;
  const genStr = formatInTimeZone(generatedAt, PARIS_TZ, "d MMMM yyyy 'à' HH:mm", { locale: fr });
  const n = people.length;

  return (
    <Document title={`Cannes 2026 — Planning ${dateTitle}`} author="Glow Up Agency" subject="Planning jour — équipe sur place">
      <Page size="A4" orientation="portrait" style={styles.page} wrap>
        <View style={styles.accentTop} fixed />
        <View style={styles.headerRow}>
          <View style={{ maxWidth: "76%" }}>
            <Text style={styles.kicker}>Festival de Cannes 2026</Text>
            <Text style={styles.title}>Planning du jour</Text>
            <Text style={styles.subtitle}>{dateTitle}</Text>
            <Text style={[styles.subtitle, { marginTop: 6 }]}>
              {n === 0
                ? "Aucun collaborateur sur place ce jour."
                : n === 1
                  ? "1 collaborateur sur place — tâches et rendez-vous en ordre horaire."
                  : `${n} collaborateurs sur place — listes horaires (créneaux + agenda).`}
            </Text>
          </View>
          <Image src={LOGO_PATH} style={styles.logo} />
        </View>

        {n === 0 ? (
          <View style={styles.emptyPeople}>
            <Text style={styles.emptyPeopleText}>
              Personne n’est dans la fenêtre arrivée / départ sans indisponibilité ce jour-là. Les PDF ne
              incluent que l’équipe réellement sur place.
            </Text>
          </View>
        ) : (
          people.map((row, idx) => {
            const fullName = `${row.presence.user.prenom} ${row.presence.user.nom}`.trim();
            const role = row.presence.user.role?.trim();
            const hotel = row.presence.hotel?.trim();
            const metaBits = [role && `Rôle : ${role}`, hotel && `Hébergement : ${hotel}`].filter(
              (x): x is string => Boolean(x)
            );
            const metaLine = metaBits.join(" · ");
            return (
              <View
                key={row.presence.id}
                style={idx === 0 ? styles.personSectionFirst : styles.personSection}
              >
                <Text style={styles.personName}>{fullName}</Text>
                {metaLine ? <Text style={styles.personMeta}>{metaLine}</Text> : null}
                <Text style={styles.listHeading}>À faire — journée (ordre horaire)</Text>
                <TaskList dateYmd={dateYmd} row={row} />
              </View>
            );
          })
        )}

        <Text style={styles.footer} fixed>
          Europe/Paris · uniquement l’équipe sur place · généré le {genStr} · Glow Up
        </Text>
      </Page>
    </Document>
  );
}
