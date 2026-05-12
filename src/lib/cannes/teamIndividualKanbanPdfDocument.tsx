import path from "path";
import React from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";

import {
  CANNES_2026_DAYS,
  formatParisDate,
  isUtcDayInIsoRange,
  parisDayKey,
} from "@/lib/cannes/dates";
import { PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";

const LOGO_PATH = path.join(process.cwd(), "public", "Logo.png");

const C = {
  ink: "#1A1110",
  rose: "#C08B8B",
  roseLight: "#E8D4D4",
  sand: "#F5EBE0",
  sand2: "#EDE6DC",
  line: "#D4CCC2",
  muted: "#6B625C",
  white: "#FFFFFF",
  soft: "#FAF7F3",
  ok: "#2D6A4F",
  warn: "#BC6C25",
  off: "#9D8F88",
};

const styles = StyleSheet.create({
  cover: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontSize: 10,
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
    backgroundColor: C.rose,
  },
  coverKicker: {
    fontSize: 8,
    letterSpacing: 2,
    color: C.rose,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  coverTitle: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  coverName: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.rose,
    marginBottom: 14,
  },
  coverLine: { fontSize: 10, color: C.muted, marginBottom: 5, lineHeight: 1.45 },
  coverLegend: {
    marginTop: 28,
    padding: 14,
    backgroundColor: C.sand,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: C.rose,
  },
  coverLegendTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 8, color: C.ink },
  coverLegendRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  coverLegendSw: { width: 14, height: 10, borderRadius: 2, marginRight: 10 },
  coverLegendTxt: { fontSize: 8.5, color: C.muted, flex: 1 },
  logo: { width: 56, height: 56, objectFit: "contain", marginBottom: 16 },
  footerCover: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 7.5,
    color: C.muted,
    textAlign: "center",
  },
  land: {
    paddingTop: 22,
    paddingBottom: 28,
    paddingHorizontal: 20,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: C.ink,
    backgroundColor: C.white,
  },
  landAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: C.rose,
  },
  landHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  landTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.ink },
  landSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  landLogo: { width: 36, height: 36, objectFit: "contain" },
  kanbanRow: { flexDirection: "row", flexGrow: 1, alignItems: "stretch" },
  col: {
    flex: 1,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    backgroundColor: C.soft,
    overflow: "hidden",
    minHeight: 420,
  },
  colHeader: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: C.roseLight,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    alignItems: "center",
  },
  colWeekday: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    textTransform: "capitalize",
    textAlign: "center",
  },
  colDate: { fontSize: 6.5, color: C.muted, marginTop: 2, textAlign: "center" },
  statusPill: {
    marginTop: 5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignSelf: "center",
  },
  statusTxt: { fontSize: 5.5, fontFamily: "Helvetica-Bold", color: C.white },
  colBody: { padding: 4, flexGrow: 1 },
  card: {
    marginBottom: 4,
    padding: 5,
    backgroundColor: C.white,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.rose,
    borderWidth: 1,
    borderColor: C.line,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  cardTime: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 2 },
  cardTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 2 },
  cardLoc: { fontSize: 6.5, color: C.muted, marginBottom: 2 },
  cardNotes: { fontSize: 6, color: C.muted, lineHeight: 1.35 },
  evMini: {
    marginTop: 3,
    paddingVertical: 2,
    paddingHorizontal: 3,
    backgroundColor: "#EEF2FF",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  evMiniTxt: { fontSize: 5.5, color: "#312E81" },
  emptyCol: { fontSize: 6.5, color: C.muted, fontStyle: "italic", textAlign: "center", marginTop: 8 },
  moreSlots: { fontSize: 6, color: C.muted, textAlign: "center", marginTop: 4, fontFamily: "Helvetica-Bold" },
  landFooter: {
    position: "absolute",
    bottom: 14,
    left: 20,
    right: 20,
    fontSize: 7,
    color: C.muted,
    textAlign: "center",
  },
});

export type TeamKanbanPdfPresence = {
  id: string;
  arrivalDate: string;
  departureDate: string;
  hotel: string | null;
  user: { prenom: string; nom: string; role?: string | null };
  teamUnavailabilities: Array<{ startDate: string; endDate: string; label: string | null }>;
};

export type TeamKanbanPdfSlot = {
  startsAt: string;
  endsAt: string;
  title: string;
  location: string | null;
  notesPlain: string;
};

export type TeamKanbanPdfEvent = {
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  location: string;
};

type Props = {
  presence: TeamKanbanPdfPresence;
  slots: TeamKanbanPdfSlot[];
  events: TeamKanbanPdfEvent[];
  generatedAt: Date;
};

const MAX_SLOTS_SHOWN = 7;
const NOTES_MAX = 140;

function dayStatus(
  presence: TeamKanbanPdfPresence,
  day: Date
): { label: string; bg: string } {
  const on = isUtcDayInIsoRange(day, presence.arrivalDate, presence.departureDate);
  const blocked = presence.teamUnavailabilities.some((u) =>
    isUtcDayInIsoRange(day, u.startDate, u.endDate)
  );
  if (!on) return { label: "Hors période", bg: C.off };
  if (blocked) return { label: "Indispo", bg: C.warn };
  return { label: "Sur place", bg: C.ok };
}

function slotsForDay(slots: TeamKanbanPdfSlot[], ymd: string) {
  return slots
    .filter((s) => parisDayKey(s.startsAt) === ymd)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function eventsForDay(events: TeamKanbanPdfEvent[], ymd: string) {
  return events.filter((ev) => parisDayKey(ev.date) === ymd);
}

function truncate(s: string, n: number) {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function KanbanColumn({
  day,
  presence,
  slots,
  events,
}: {
  day: Date;
  presence: TeamKanbanPdfPresence;
  slots: TeamKanbanPdfSlot[];
  events: TeamKanbanPdfEvent[];
}) {
  const ymd = parisDayKey(day);
  const st = dayStatus(presence, day);
  const daySlots = slotsForDay(slots, ymd);
  const dayEvents = eventsForDay(events, ymd);
  const shown = daySlots.slice(0, MAX_SLOTS_SHOWN);
  const extra = daySlots.length - shown.length;

  const weekday = formatParisDate(day, { weekday: "short" });
  const dateShort = formatParisDate(day, { day: "numeric", month: "short" });

  return (
    <View style={styles.col}>
      <View style={styles.colHeader}>
        <Text style={styles.colWeekday}>{weekday}</Text>
        <Text style={styles.colDate}>{dateShort}</Text>
        <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
          <Text style={styles.statusTxt}>{st.label}</Text>
        </View>
      </View>
      <View style={styles.colBody}>
        {shown.length === 0 && st.label === "Sur place" ? (
          <Text style={styles.emptyCol}>Aucun créneau saisi</Text>
        ) : shown.length === 0 && st.label !== "Sur place" ? (
          <Text style={styles.emptyCol}>—</Text>
        ) : null}
        {shown.map((s, i) => {
          const t0 = formatInTimeZone(new Date(s.startsAt), PARIS_TZ, "HH:mm");
          const t1 = formatInTimeZone(new Date(s.endsAt), PARIS_TZ, "HH:mm");
          const title = (s.title || "Sans titre").trim() || "Sans titre";
          const loc = (s.location || "").trim();
          const notes = s.notesPlain ? truncate(s.notesPlain, NOTES_MAX) : "";
          return (
            <View key={`${ymd}-${i}`} style={styles.card}>
              <Text style={styles.cardTime}>
                {t0} – {t1}
              </Text>
              <Text style={styles.cardTitle}>{title}</Text>
              {loc ? <Text style={styles.cardLoc}>{loc}</Text> : null}
              {notes ? (
                <Text style={styles.cardNotes}>{notes}</Text>
              ) : null}
            </View>
          );
        })}
        {extra > 0 ? (
          <Text style={styles.moreSlots}>+{extra} créneau{extra > 1 ? "x" : ""}</Text>
        ) : null}
        {dayEvents.map((ev, i) => (
          <View key={`ev-${ymd}-${i}`} style={styles.evMini}>
            <Text style={styles.evMiniTxt}>
              {ev.startTime}
              {ev.endTime ? `–${ev.endTime}` : ""} · {truncate(ev.title, 42)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function TeamIndividualKanbanPdfDocument({ presence, slots, events, generatedAt }: Props) {
  const fullName = `${presence.user.prenom} ${presence.user.nom}`.trim();
  const role = presence.user.role?.trim();
  const dayChunks = chunk(CANNES_2026_DAYS, 6);
  const genStr = formatInTimeZone(generatedAt, PARIS_TZ, "d MMMM yyyy 'à' HH:mm", { locale: fr });

  return (
    <Document
      title={`Planning Cannes 2026 — ${fullName}`}
      author="Glow Up Agency"
      subject="Planning individuel créneaux"
    >
      <Page size="A4" orientation="portrait" style={styles.cover}>
        <View style={styles.accentTop} fixed />
        <Image src={LOGO_PATH} style={styles.logo} />
        <Text style={styles.coverKicker}>Festival de Cannes 2026</Text>
        <Text style={styles.coverTitle}>Planning individuel</Text>
        <Text style={styles.coverName}>{fullName}</Text>
        {role ? <Text style={styles.coverLine}>Rôle : {role}</Text> : null}
        <Text style={styles.coverLine}>
          Présence : {formatParisDate(presence.arrivalDate, { day: "numeric", month: "long" })} →{" "}
          {formatParisDate(presence.departureDate, { day: "numeric", month: "long", year: "numeric" })}
        </Text>
        {presence.hotel ? <Text style={styles.coverLine}>Hébergement : {presence.hotel}</Text> : null}
        <Text style={styles.coverLine}>Fuseau horaire des créneaux : Europe/Paris</Text>
        <View style={styles.coverLegend}>
          <Text style={styles.coverLegendTitle}>Lecture du kanban (pages suivantes)</Text>
          <View style={styles.coverLegendRow}>
            <View style={[styles.coverLegendSw, { backgroundColor: C.ok }]} />
            <Text style={styles.coverLegendTxt}>Sur place — journée dans la fenêtre d’arrivée / départ, sans indispo.</Text>
          </View>
          <View style={styles.coverLegendRow}>
            <View style={[styles.coverLegendSw, { backgroundColor: C.warn }]} />
            <Text style={styles.coverLegendTxt}>Indispo — journée bloquée (créneau interne).</Text>
          </View>
          <View style={styles.coverLegendRow}>
            <View style={[styles.coverLegendSw, { backgroundColor: C.off }]} />
            <Text style={styles.coverLegendTxt}>Hors période — en dehors des dates de présence.</Text>
          </View>
          <View style={styles.coverLegendRow}>
            <View style={[styles.coverLegendSw, { backgroundColor: C.rose, width: 4, marginRight: 8 }]} />
            <Text style={styles.coverLegendTxt}>
              Chaque carte = un créneau horaire (titre, lieu, consignes). Les pastilles violettes = événements agenda
              auxquels tu es inscrit(e) ce jour-là.
            </Text>
          </View>
        </View>
        <Text style={styles.footerCover} fixed>
          Document généré le {genStr} · Glow Up · Cannes 2026
        </Text>
      </Page>

      {dayChunks.map((days, pageIdx) => {
        const d0 = days[0];
        const d1 = days[days.length - 1];
        const rangeLabel = `${formatParisDate(d0, { day: "numeric", month: "short" })} – ${formatParisDate(d1, {
          day: "numeric",
          month: "short",
        })}`;
        return (
        <Page key={`land-${pageIdx}`} size="A4" orientation="landscape" style={styles.land}>
          <View style={styles.landAccent} fixed />
          <View style={styles.landHeader}>
            <View>
              <Text style={styles.landTitle}>Kanban par jour · {fullName}</Text>
              <Text style={styles.landSub}>
                {rangeLabel} 2026 · créneaux & événements
              </Text>
            </View>
            <Image src={LOGO_PATH} style={styles.landLogo} />
          </View>
          <View style={styles.kanbanRow}>
            {days.map((day) => (
              <KanbanColumn
                key={parisDayKey(day)}
                day={day}
                presence={presence}
                slots={slots}
                events={events}
              />
            ))}
          </View>
          <Text style={styles.landFooter} fixed>
            {fullName} · page {pageIdx + 2} · {genStr}
          </Text>
        </Page>
        );
      })}
    </Document>
  );
}
