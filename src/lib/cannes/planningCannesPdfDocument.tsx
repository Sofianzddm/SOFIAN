import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { CANNES_2026_DAYS, isUtcDayInIsoRange } from "@/lib/cannes/dates";

export type CannesPlanningPdfPresence = {
  id: string;
  arrivalDate: string;
  departureDate: string;
  hotel: string | null;
  hotelAddress: string | null;
  flightArrival: string | null;
  flightDeparture: string | null;
  roomNumber: string | null;
  notes: string | null;
  user: { prenom: string; nom: string; role?: string | null } | null;
  talent: { prenom: string; nom: string } | null;
  teamUnavailabilities?: Array<{ startDate: string; endDate: string; label: string | null }>;
};

export type CannesPlanningPdfEvent = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  type: string;
  location: string;
  address: string | null;
  description: string | null;
  notes: string | null;
  attendeesCount: number;
};

type Props = {
  teamPresences: CannesPlanningPdfPresence[];
  talentPresences: CannesPlanningPdfPresence[];
  events: CannesPlanningPdfEvent[];
  generatedAt: Date;
};

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#1A1110",
  },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#444", marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc" },
  cellHead: {
    padding: 4,
    fontWeight: "bold",
    borderRightWidth: 0.5,
    borderRightColor: "#ccc",
    backgroundColor: "#f0ebe3",
  },
  cell: { padding: 4, borderRightWidth: 0.5, borderRightColor: "#eee" },
  legend: { fontSize: 7, color: "#555", marginTop: 10 },
  card: {
    marginBottom: 10,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#ccc",
    borderRadius: 2,
  },
  cardTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 3 },
  cardLine: { fontSize: 8, marginBottom: 2 },
  timeline: { fontFamily: "Courier", fontSize: 8, marginTop: 4 },
  footNote: { fontSize: 7, color: "#666", marginTop: 12 },
  evRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  evCell: { paddingRight: 4, fontSize: 7 },
});

function shortDay(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function isOnSite(p: CannesPlanningPdfPresence, day: Date) {
  return new Date(p.arrivalDate) <= day && new Date(p.departureDate) >= day;
}

function isTeamBlocked(p: CannesPlanningPdfPresence, day: Date) {
  const unavs = p.teamUnavailabilities ?? [];
  return unavs.some((u) => isUtcDayInIsoRange(day, u.startDate, u.endDate));
}

function teamDayStats(team: CannesPlanningPdfPresence[], day: Date) {
  let surPlace = 0;
  let indispo = 0;
  let dispo = 0;
  for (const p of team) {
    const on = isOnSite(p, day);
    const blocked = isTeamBlocked(p, day);
    if (on) surPlace++;
    if (blocked) indispo++;
    if (on && !blocked) dispo++;
  }
  return { surPlace, dispo, indispo };
}

function talentOnSiteCount(talents: CannesPlanningPdfPresence[], day: Date) {
  return talents.filter((p) => isOnSite(p, day)).length;
}

function timelineLine(p: CannesPlanningPdfPresence) {
  return CANNES_2026_DAYS.map((d) => {
    const on = isOnSite(p, d);
    const blocked = isTeamBlocked(p, d);
    if (p.user) {
      if (on && !blocked) return "P";
      return "-";
    }
    if (on) return "P";
    return "-";
  }).join(" ");
}

function truncate(s: string | null | undefined, max: number) {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function displayName(p: CannesPlanningPdfPresence) {
  if (p.user) return `${p.user.prenom} ${p.user.nom}`;
  if (p.talent) return `${p.talent.prenom} ${p.talent.nom}`;
  return "—";
}

const COL_FIRST = "14%";
const COL_DAY = `${86 / 12}%`;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function PresenceCard({ p }: { p: CannesPlanningPdfPresence }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{displayName(p)}</Text>
      {p.user?.role ? <Text style={styles.cardLine}>Rôle : {p.user.role}</Text> : null}
      <Text style={styles.cardLine}>
        Période : {new Date(p.arrivalDate).toLocaleDateString("fr-FR")} →{" "}
        {new Date(p.departureDate).toLocaleDateString("fr-FR")}
      </Text>
      <Text style={styles.cardLine}>Hôtel : {p.hotel || "—"}</Text>
      {p.hotelAddress ? (
        <Text style={styles.cardLine}>Adresse hôtel : {truncate(p.hotelAddress, 200)}</Text>
      ) : null}
      <Text style={styles.cardLine}>Chambre : {p.roomNumber || "—"}</Text>
      <Text style={styles.cardLine}>Vol arrivée : {p.flightArrival || "—"}</Text>
      <Text style={styles.cardLine}>Vol départ : {p.flightDeparture || "—"}</Text>
      {p.notes ? <Text style={styles.cardLine}>Notes : {truncate(p.notes, 450)}</Text> : null}
      {(p.teamUnavailabilities?.length ?? 0) > 0 ? (
        <Text style={styles.cardLine}>
          Indisponibilités :{" "}
          {p
            .teamUnavailabilities!.map((u) => {
              const a = new Date(u.startDate).toLocaleDateString("fr-FR");
              const b = new Date(u.endDate).toLocaleDateString("fr-FR");
              const lab = u.label ? ` (${u.label})` : "";
              return `${a}–${b}${lab}`;
            })
            .join(" · ")}
        </Text>
      ) : null}
      <Text style={styles.timeline}>
        {CANNES_2026_DAYS.map((d) => shortDay(d).slice(0, 3)).join(" ")}
      </Text>
      <Text style={styles.timeline}>{timelineLine(p)}</Text>
    </View>
  );
}

export function CannesPlanningPdfDocument({
  teamPresences,
  talentPresences,
  events,
  generatedAt,
}: Props) {
  const gen = generatedAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const teamChunks = chunkArray(teamPresences, 6);
  const talentChunks = chunkArray(talentPresences, 7);
  const eventChunks = chunkArray(events, 16);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Cannes 2026 — Planning complet</Text>
        <Text style={styles.subtitle}>
          Festival 12–23 mai 2026 · {teamPresences.length} collaborateur(s) équipe ·{" "}
          {talentPresences.length} talent(s) · {events.length} événement(s) agenda · Généré le {gen}
        </Text>

        <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 4 }}>
          Synthèse par jour (effectifs)
        </Text>
        <View style={styles.row}>
          <View style={[styles.cellHead, { width: COL_FIRST }]}>
            <Text>Indicateur</Text>
          </View>
          {CANNES_2026_DAYS.map((d) => (
            <View key={d.toISOString()} style={[styles.cellHead, { width: COL_DAY }]}>
              <Text>{shortDay(d)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <View style={[styles.cell, { width: COL_FIRST }]}>
            <Text>Équipe sur place</Text>
          </View>
          {CANNES_2026_DAYS.map((d) => (
            <View key={d.toISOString()} style={[styles.cell, { width: COL_DAY }]}>
              <Text>{teamDayStats(teamPresences, d).surPlace}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <View style={[styles.cell, { width: COL_FIRST }]}>
            <Text>Équipe disponible</Text>
          </View>
          {CANNES_2026_DAYS.map((d) => (
            <View key={d.toISOString()} style={[styles.cell, { width: COL_DAY }]}>
              <Text>{teamDayStats(teamPresences, d).dispo}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <View style={[styles.cell, { width: COL_FIRST }]}>
            <Text>Absences declarees (jour)</Text>
          </View>
          {CANNES_2026_DAYS.map((d) => (
            <View key={d.toISOString()} style={[styles.cell, { width: COL_DAY }]}>
              <Text>{teamDayStats(teamPresences, d).indispo}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <View style={[styles.cell, { width: COL_FIRST }]}>
            <Text>Talents sur place</Text>
          </View>
          {CANNES_2026_DAYS.map((d) => (
            <View key={d.toISOString()} style={[styles.cell, { width: COL_DAY }]}>
              <Text>{talentOnSiteCount(talentPresences, d)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <View style={[styles.cell, { width: COL_FIRST }]}>
            <Text>Total personnes sur site</Text>
          </View>
          {CANNES_2026_DAYS.map((d) => {
            const t = teamDayStats(teamPresences, d);
            const tal = talentOnSiteCount(talentPresences, d);
            return (
              <View key={d.toISOString()} style={[styles.cell, { width: COL_DAY }]}>
                <Text>{t.surPlace + tal}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.legend}>
          Légende calendrier équipe (12 colonnes = 12–23 mai) : « P » sur place et disponible · « - »
          absent (hors dates presence ou jour couvert par une absence declaree)
        </Text>
        <Text style={styles.footNote}>
          Les effectifs suivent les dates d&apos;arrivée et de départ enregistrées pour chaque présence.
        </Text>
      </Page>

      {teamPresences.length > 0
        ? teamChunks.map((chunk, idx) => (
            <Page key={`team-${idx}`} size="A4" orientation="portrait" style={styles.page}>
              <Text style={styles.sectionTitle}>
                Détail — Équipe ({teamPresences.length})
                {teamChunks.length > 1 ? ` · partie ${idx + 1}/${teamChunks.length}` : ""}
              </Text>
              {chunk.map((p) => (
                <PresenceCard key={p.id} p={p} />
              ))}
              <Text style={styles.footNote}>{gen}</Text>
            </Page>
          ))
        : null}

      {talentPresences.length > 0
        ? talentChunks.map((chunk, idx) => (
            <Page key={`talent-${idx}`} size="A4" orientation="portrait" style={styles.page}>
              <Text style={styles.sectionTitle}>
                Détail — Talents ({talentPresences.length})
                {talentChunks.length > 1 ? ` · partie ${idx + 1}/${talentChunks.length}` : ""}
              </Text>
              {chunk.map((p) => (
                <PresenceCard key={p.id} p={p} />
              ))}
              <Text style={styles.footNote}>{gen}</Text>
            </Page>
          ))
        : null}

      {events.length > 0
        ? eventChunks.map((chunk, idx) => (
            <Page key={`events-${idx}`} size="A4" orientation="portrait" style={styles.page}>
              <Text style={styles.sectionTitle}>
                Agenda — Événements ({events.length})
                {eventChunks.length > 1 ? ` · partie ${idx + 1}/${eventChunks.length}` : ""}
              </Text>
              <View style={[styles.evRow, { backgroundColor: "#f0ebe3", borderBottomWidth: 1 }]}>
                <Text style={[styles.evCell, { width: "14%" }]}>Date</Text>
                <Text style={[styles.evCell, { width: "12%" }]}>Heure</Text>
                <Text style={[styles.evCell, { width: "10%" }]}>Type</Text>
                <Text style={[styles.evCell, { width: "26%" }]}>Titre</Text>
                <Text style={[styles.evCell, { width: "24%" }]}>Lieu</Text>
                <Text style={[styles.evCell, { width: "14%" }]}>Invités</Text>
              </View>
              {chunk.map((ev) => {
                const d = new Date(ev.date).toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                const time =
                  ev.endTime && ev.endTime.trim()
                    ? `${ev.startTime}–${ev.endTime}`
                    : ev.startTime;
                const lieu = [ev.location, ev.address].filter(Boolean).join(" — ");
                return (
                  <View key={ev.id} style={styles.evRow}>
                    <Text style={[styles.evCell, { width: "14%" }]}>{d}</Text>
                    <Text style={[styles.evCell, { width: "12%" }]}>{time}</Text>
                    <Text style={[styles.evCell, { width: "10%" }]}>{ev.type}</Text>
                    <Text style={[styles.evCell, { width: "26%" }]}>{truncate(ev.title, 80)}</Text>
                    <Text style={[styles.evCell, { width: "24%" }]}>{truncate(lieu, 120)}</Text>
                    <Text style={[styles.evCell, { width: "14%" }]}>{ev.attendeesCount}</Text>
                  </View>
                );
              })}
              <Text style={styles.footNote}>{gen}</Text>
            </Page>
          ))
        : null}
    </Document>
  );
}
