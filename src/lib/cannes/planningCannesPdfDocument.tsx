import path from "path";
import React from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { CANNES_2026_DAYS, isUtcDayInIsoRange } from "@/lib/cannes/dates";
import { eachUtcDayFromMonday, getCannesFestivalMondayWeeks } from "@/lib/cannes/festivalWeeks";

const LOGO_PATH = path.join(process.cwd(), "public", "Logo.png");

const C = {
  ink: "#1A1110",
  rose: "#C08B8B",
  sand: "#F5EBE0",
  sand2: "#EDE6DC",
  line: "#D4CCC2",
  muted: "#6B625C",
  white: "#FFFFFF",
  soft: "#FAF7F3",
};

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
  includeTeam: boolean;
  includeTalents: boolean;
  includeEvents: boolean;
  teamHiddenByDay?: Record<string, true>;
};

const styles = StyleSheet.create({
  pagePortrait: {
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    backgroundColor: C.white,
  },
  pageLandscape: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 32,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: C.ink,
    backgroundColor: C.white,
  },
  accentTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: C.rose,
  },
  pageFooter: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    fontSize: 7,
    color: C.muted,
    textAlign: "center",
    fontFamily: "Helvetica",
  },
  pageFooterLandscape: {
    position: "absolute",
    bottom: 14,
    left: 32,
    right: 32,
    fontSize: 7,
    color: C.muted,
    textAlign: "center",
    fontFamily: "Helvetica",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  kicker: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: C.rose,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    letterSpacing: -0.3,
  },
  titleLandscape: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 9,
    color: C.muted,
    lineHeight: 1.45,
    maxWidth: "72%",
  },
  logo: { width: 52, height: 52, objectFit: "contain" },
  sectionBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
  },
  sectionBarLine: { width: 4, height: 18, backgroundColor: C.rose, marginRight: 10 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
  },
  sectionHint: {
    fontSize: 8,
    color: C.muted,
    marginTop: 2,
  },
  tableWrap: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 12,
  },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line },
  rowLast: { flexDirection: "row", borderBottomWidth: 0 },
  rowAlt: { backgroundColor: C.soft },
  rowTotal: { backgroundColor: C.sand },
  cellHead: {
    paddingVertical: 7,
    paddingHorizontal: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.ink,
    backgroundColor: C.sand2,
    borderRightWidth: 1,
    borderRightColor: C.line,
    textAlign: "center",
  },
  cellHeadFirst: {
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.ink,
    backgroundColor: C.sand,
    borderRightWidth: 1,
    borderRightColor: C.line,
    textAlign: "left",
  },
  cell: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontSize: 7.5,
    borderRightWidth: 1,
    borderRightColor: C.line,
    textAlign: "center",
    color: C.ink,
  },
  cellFirst: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 7.5,
    borderRightWidth: 1,
    borderRightColor: C.line,
    textAlign: "left",
    color: C.ink,
    fontFamily: "Helvetica-Bold",
  },
  legendBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: C.sand,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: C.rose,
  },
  legend: { fontSize: 7.5, color: C.muted, lineHeight: 1.45 },
  footNote: { fontSize: 7.5, color: C.muted, marginTop: 8, lineHeight: 1.4 },
  card: {
    marginBottom: 14,
    padding: 14,
    backgroundColor: C.soft,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: C.rose,
    borderWidth: 1,
    borderColor: C.line,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  cardTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 8 },
  cardLine: { fontSize: 8.5, marginBottom: 4, color: C.ink, lineHeight: 1.35 },
  cardLabel: { fontFamily: "Helvetica-Bold", color: C.muted, fontSize: 7.5 },
  timelineBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: C.sand,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.line,
  },
  timelineLabel: { fontSize: 7, color: C.muted, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  timeline: { fontFamily: "Courier", fontSize: 8, color: C.ink, letterSpacing: 0.3 },
  evRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "flex-start",
  },
  evRowAlt: { backgroundColor: C.soft },
  evHead: {
    flexDirection: "row",
    backgroundColor: C.sand2,
    borderBottomWidth: 2,
    borderBottomColor: C.rose,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  evCell: { paddingRight: 5, fontSize: 8 },
  evTypePill: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    backgroundColor: C.rose,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  emptyState: {
    marginTop: 40,
    padding: 24,
    backgroundColor: C.sand,
    borderRadius: 8,
    textAlign: "center",
  },
  emptyTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 6 },
  emptySub: { fontSize: 9, color: C.muted },
  weekGridFrame: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    overflow: "hidden",
    marginTop: 4,
    minHeight: 300,
  },
  weekGridRow: { flexDirection: "row", flex: 1, minHeight: 298 },
  weekCol: {
    width: "14.28%",
    borderRightWidth: 1,
    borderRightColor: C.line,
    paddingHorizontal: 5,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 298,
  },
  weekColLast: { borderRightWidth: 0 },
  weekColFestival: { backgroundColor: "#FBF5F2" },
  weekDayHead: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: C.ink,
    textTransform: "capitalize",
    marginBottom: 2,
  },
  weekDateNum: { fontSize: 7.5, color: C.muted, marginBottom: 8 },
  weekNamesBlock: { fontSize: 7, lineHeight: 1.4, color: C.ink },
  weekNamesEmpty: { fontSize: 8, color: C.muted, marginTop: 4 },
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

function isTeamHiddenByPlanningChoice(
  p: CannesPlanningPdfPresence,
  day: Date,
  teamHiddenByDay?: Record<string, true>
) {
  if (!teamHiddenByDay) return false;
  return !!teamHiddenByDay[`${p.id}:${day.toISOString().slice(0, 10)}`];
}

function teamDayStats(team: CannesPlanningPdfPresence[], day: Date, teamHiddenByDay?: Record<string, true>) {
  let surPlace = 0;
  let indispo = 0;
  let dispo = 0;
  for (const p of team) {
    const on = isOnSite(p, day);
    const blocked = isTeamBlocked(p, day);
    const hidden = isTeamHiddenByPlanningChoice(p, day, teamHiddenByDay);
    if (on) surPlace++;
    if (blocked) indispo++;
    if (on && !blocked && !hidden) dispo++;
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
      return "·";
    }
    if (on) return "P";
    return "·";
  }).join(" ");
}

function isPresentForPlanning(
  p: CannesPlanningPdfPresence,
  day: Date,
  teamHiddenByDay?: Record<string, true>
) {
  if (!isOnSite(p, day)) return false;
  if (p.user) return !isTeamBlocked(p, day) && !isTeamHiddenByPlanningChoice(p, day, teamHiddenByDay);
  return true;
}

function planningPresenceStats(p: CannesPlanningPdfPresence, teamHiddenByDay?: Record<string, true>) {
  let total = 0;
  let streak = 0;
  let maxStreak = 0;
  for (const d of CANNES_2026_DAYS) {
    if (isPresentForPlanning(p, d, teamHiddenByDay)) {
      total++;
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }
  return { total, maxStreak };
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

const FESTIVAL_DAY_KEYS = new Set(CANNES_2026_DAYS.map((d) => d.toISOString().slice(0, 10)));

function isFestivalUtcDay(day: Date) {
  return FESTIVAL_DAY_KEYS.has(day.toISOString().slice(0, 10));
}

function namesPresentOnDay(
  day: Date,
  team: CannesPlanningPdfPresence[],
  talents: CannesPlanningPdfPresence[],
  includeTeam: boolean,
  includeTalents: boolean,
  teamHiddenByDay?: Record<string, true>
): string[] {
  const items: { sort: string; line: string }[] = [];
  if (includeTeam) {
    for (const p of team) {
      if (!isOnSite(p, day)) continue;
      if (isTeamBlocked(p, day)) continue;
      if (isTeamHiddenByPlanningChoice(p, day, teamHiddenByDay)) continue;
      const name = displayName(p);
      items.push({ sort: name.toLowerCase(), line: name });
    }
  }
  if (includeTalents) {
    for (const p of talents) {
      if (!isOnSite(p, day)) continue;
      const name = displayName(p);
      items.push({ sort: name.toLowerCase(), line: name });
    }
  }
  items.sort((a, b) => a.sort.localeCompare(b.sort, "fr"));
  return items.map((i) => i.line);
}

function formatWeekRangeFrance(monday: Date, sunday: Date) {
  const m = monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const s = sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `${m} au ${s}`;
}

const COL_FIRST = "15%";
const COL_DAY = `${85 / 12}%`;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function PdfPageFooter({ landscape }: { landscape?: boolean }) {
  return (
    <Text
      style={landscape ? styles.pageFooterLandscape : styles.pageFooter}
      render={({ pageNumber, totalPages }) => `Glow Up · Cannes 2026 · ${pageNumber} / ${totalPages}`}
      fixed
    />
  );
}

function FieldLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.cardLine}>
      <Text style={styles.cardLabel}>{label} </Text>
      {value}
    </Text>
  );
}

function PresenceCard({
  p,
  teamHiddenByDay,
}: {
  p: CannesPlanningPdfPresence;
  teamHiddenByDay?: Record<string, true>;
}) {
  const stats = planningPresenceStats(p, teamHiddenByDay);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{displayName(p)}</Text>
      {p.user?.role ? <FieldLine label="Rôle" value={String(p.user.role)} /> : null}
      <FieldLine
        label="Période"
        value={`${new Date(p.arrivalDate).toLocaleDateString("fr-FR")} → ${new Date(p.departureDate).toLocaleDateString("fr-FR")}`}
      />
      <FieldLine label="Hôtel" value={p.hotel || "—"} />
      {p.hotelAddress ? <FieldLine label="Adresse" value={truncate(p.hotelAddress, 220)} /> : null}
      <FieldLine label="Chambre" value={p.roomNumber || "—"} />
      <FieldLine label="Vol arrivée" value={p.flightArrival || "—"} />
      <FieldLine label="Vol départ" value={p.flightDeparture || "—"} />
      <FieldLine
        label="Présence festival"
        value={`${stats.total}/${CANNES_2026_DAYS.length} jour(s)`}
      />
      <FieldLine label="Jours d’affilée (max)" value={`${stats.maxStreak} jour(s)`} />
      {p.notes ? <FieldLine label="Notes" value={truncate(p.notes, 480)} /> : null}
      {(p.teamUnavailabilities?.length ?? 0) > 0 ? (
        <FieldLine
          label="Absences"
          value={p
            .teamUnavailabilities!.map((u) => {
              const a = new Date(u.startDate).toLocaleDateString("fr-FR");
              const b = new Date(u.endDate).toLocaleDateString("fr-FR");
              const lab = u.label ? ` (${u.label})` : "";
              return `${a} – ${b}${lab}`;
            })
            .join(" · ")}
        />
      ) : null}
      <View style={styles.timelineBox}>
        <Text style={styles.timelineLabel}>Calendrier festival (12 → 23 mai)</Text>
        <Text style={styles.timeline}>
          {CANNES_2026_DAYS.map((d) => String(d.getUTCDate()).padStart(2, "0")).join("  ")}
        </Text>
        <Text style={[styles.timeline, { marginTop: 3 }]}>{timelineLine(p)}</Text>
        <Text style={[styles.legend, { marginTop: 6, borderLeftWidth: 0, padding: 0 }]}>
          P = sur place et disponible · point = absent ou indisponible
        </Text>
      </View>
    </View>
  );
}

function SummaryHeaderBlock({
  exportLabel,
  subtitleLine,
  landscape,
}: {
  exportLabel: string;
  subtitleLine: string;
  landscape: boolean;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={styles.kicker}>Festival de Cannes</Text>
        <Text style={landscape ? styles.titleLandscape : styles.title}>
          {exportLabel ? `Planning · ${exportLabel}` : "Planning Cannes"}
        </Text>
        <Text style={styles.subtitle}>{subtitleLine}</Text>
      </View>
      <Image src={LOGO_PATH} style={styles.logo} />
    </View>
  );
}

export function CannesPlanningPdfDocument({
  teamPresences,
  talentPresences,
  events,
  generatedAt,
  includeTeam,
  includeTalents,
  includeEvents,
  teamHiddenByDay,
}: Props) {
  const gen = generatedAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const teamChunks = chunkArray(teamPresences, 5);
  const talentChunks = chunkArray(talentPresences, 6);
  const eventChunks = chunkArray(events, 14);

  const exportLabel = [
    includeTeam ? "Équipe" : null,
    includeTalents ? "Talents" : null,
    includeEvents ? "Agenda" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const subtitleParts: string[] = ["12 – 23 mai 2026"];
  if (includeTeam) subtitleParts.push(`${teamPresences.length} collaborateur(s)`);
  if (includeTalents) subtitleParts.push(`${talentPresences.length} talent(s)`);
  if (includeEvents) subtitleParts.push(`${events.length} événement(s)`);
  subtitleParts.push(`Document généré le ${gen}`);

  const showSummaryTable = includeTeam || includeTalents;

  return (
    <Document>
      {showSummaryTable ? (
        <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
          <View style={styles.accentTop} fixed />
          <SummaryHeaderBlock
            exportLabel={exportLabel}
            subtitleLine={subtitleParts.join(" · ")}
            landscape
          />

          <View style={styles.sectionBar}>
            <View style={styles.sectionBarLine} />
            <View>
              <Text style={styles.sectionTitle}>Synthèse par jour</Text>
              <Text style={styles.sectionHint}>Effectifs sur la fenêtre du festival</Text>
            </View>
          </View>

          <View style={styles.tableWrap}>
            <View style={styles.row}>
              <View style={[styles.cellHeadFirst, { width: COL_FIRST }]}>
                <Text>Indicateur</Text>
              </View>
              {CANNES_2026_DAYS.map((d) => (
                <View key={d.toISOString()} style={[styles.cellHead, { width: COL_DAY }]}>
                  <Text>{shortDay(d)}</Text>
                </View>
              ))}
            </View>
            {includeTeam ? (
              <>
                <DataRow label="Équipe sur place" values={CANNES_2026_DAYS.map((d) => teamDayStats(teamPresences, d, teamHiddenByDay).surPlace)} alt={false} />
                <DataRow label="Équipe disponible" values={CANNES_2026_DAYS.map((d) => teamDayStats(teamPresences, d, teamHiddenByDay).dispo)} alt />
                <DataRow
                  label="Absences déclarées"
                  values={CANNES_2026_DAYS.map((d) => teamDayStats(teamPresences, d, teamHiddenByDay).indispo)}
                  alt={false}
                />
              </>
            ) : null}
            {includeTalents ? (
              <DataRow
                label="Talents sur place"
                values={CANNES_2026_DAYS.map((d) => talentOnSiteCount(talentPresences, d))}
                alt={!includeTeam}
              />
            ) : null}
            {includeTeam && includeTalents ? (
              <DataRow
                label="Total sur site"
                values={CANNES_2026_DAYS.map((d) => {
                  const t = teamDayStats(teamPresences, d, teamHiddenByDay);
                  return t.surPlace + talentOnSiteCount(talentPresences, d);
                })}
                total
              />
            ) : null}
          </View>

          {includeTeam ? (
            <View style={styles.legendBox}>
              <Text style={styles.legend}>
                Légende fiches équipe : chaque colonne correspond à un jour du festival. « P » = présent et
                planifiable ; « · » = absent (hors période enregistrée ou absence déclarée).
              </Text>
            </View>
          ) : null}
          <Text style={styles.footNote}>
            Les chiffres « sur place » suivent les dates d&apos;arrivée et de départ de chaque présence.
          </Text>
          <PdfPageFooter landscape />
        </Page>
      ) : null}

      {showSummaryTable
        ? getCannesFestivalMondayWeeks().map((monday, wi) => {
            const sunday = new Date(monday);
            sunday.setUTCDate(monday.getUTCDate() + 6);
            const days = eachUtcDayFromMonday(monday);
            return (
              <Page key={`week-agenda-${wi}`} size="A4" orientation="landscape" style={styles.pageLandscape}>
                <View style={styles.accentTop} fixed />
                <View style={styles.headerRow}>
                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={styles.kicker}>Vue semaine</Text>
                    <Text style={styles.titleLandscape}>
                      {formatWeekRangeFrance(monday, sunday)}
                    </Text>
                    <Text style={styles.subtitle}>
                      Colonnes lundi → dimanche · uniquement les personnes disponibles ce jour (sur place
                      dans les dates enregistrées et sans absence déclarée). Jours du festival sur fond
                      légèrement teinté.
                    </Text>
                  </View>
                  <Image src={LOGO_PATH} style={styles.logo} />
                </View>
                <View style={styles.sectionBar}>
                  <View style={styles.sectionBarLine} />
                  <View>
                    <Text style={styles.sectionTitle}>Présences sur la semaine</Text>
                    <Text style={styles.sectionHint}>
                      {includeTeam && includeTalents
                        ? "Équipe et talents mélangés, tri alphabétique — les indisponibilités ne sont pas listées ici"
                        : includeTeam
                          ? "Équipe uniquement — indisponibilités exclues de cette vue"
                          : "Talents uniquement"}
                    </Text>
                  </View>
                </View>
                <View style={styles.weekGridFrame}>
                  <View style={styles.weekGridRow}>
                    {days.map((day, di) => {
                      const names = namesPresentOnDay(
                        day,
                        teamPresences,
                        talentPresences,
                        includeTeam,
                        includeTalents,
                        teamHiddenByDay
                      );
                      const fest = isFestivalUtcDay(day);
                      const wd = day.toLocaleDateString("fr-FR", { weekday: "long" });
                      const dayTitle = wd.charAt(0).toUpperCase() + wd.slice(1);
                      const num = day.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
                      const shown = names.slice(0, 24);
                      const overflow = names.length - shown.length;
                      return (
                        <View
                          key={day.toISOString()}
                          style={[
                            styles.weekCol,
                            di === 6 ? styles.weekColLast : {},
                            fest ? styles.weekColFestival : {},
                          ]}
                        >
                          <Text style={styles.weekDayHead}>{dayTitle}</Text>
                          <Text style={styles.weekDateNum}>{num}</Text>
                          {names.length === 0 ? (
                            <Text style={styles.weekNamesEmpty}>—</Text>
                          ) : (
                            <Text style={styles.weekNamesBlock}>
                              {shown.join("\n")}
                              {overflow > 0 ? `\n+ ${overflow} autre(s)` : ""}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
                <PdfPageFooter landscape />
              </Page>
            );
          })
        : null}

      {includeTeam && teamPresences.length > 0
        ? teamChunks.map((chunk, idx) => (
            <Page key={`team-${idx}`} size="A4" orientation="portrait" style={styles.pagePortrait}>
              <View style={styles.accentTop} fixed />
              <SummaryHeaderBlock
                exportLabel="Équipe"
                subtitleLine={`Fiche ${idx + 1} / ${teamChunks.length} · ${subtitleParts.slice(0, -1).join(" · ")}`}
                landscape={false}
              />
              <View style={styles.sectionBar}>
                <View style={styles.sectionBarLine} />
                <View>
                  <Text style={styles.sectionTitle}>Collaborateurs ({teamPresences.length})</Text>
                  <Text style={styles.sectionHint}>Présences, hébergement et calendrier</Text>
                </View>
              </View>
              {chunk.map((p) => (
                <PresenceCard key={p.id} p={p} teamHiddenByDay={teamHiddenByDay} />
              ))}
              <PdfPageFooter />
            </Page>
          ))
        : null}

      {includeTalents && talentPresences.length > 0
        ? talentChunks.map((chunk, idx) => (
            <Page key={`talent-${idx}`} size="A4" orientation="portrait" style={styles.pagePortrait}>
              <View style={styles.accentTop} fixed />
              <SummaryHeaderBlock
                exportLabel="Talents"
                subtitleLine={`Fiche ${idx + 1} / ${talentChunks.length} · ${subtitleParts.slice(0, -1).join(" · ")}`}
                landscape={false}
              />
              <View style={styles.sectionBar}>
                <View style={styles.sectionBarLine} />
                <View>
                  <Text style={styles.sectionTitle}>Talents ({talentPresences.length})</Text>
                  <Text style={styles.sectionHint}>Présences et logistique</Text>
                </View>
              </View>
              {chunk.map((p) => (
                <PresenceCard key={p.id} p={p} />
              ))}
              <PdfPageFooter />
            </Page>
          ))
        : null}

      {includeEvents && events.length > 0
        ? eventChunks.map((chunk, idx) => (
            <Page key={`events-${idx}`} size="A4" orientation="portrait" style={styles.pagePortrait}>
              <View style={styles.accentTop} fixed />
              <SummaryHeaderBlock
                exportLabel="Agenda"
                subtitleLine={`Partie ${idx + 1} / ${eventChunks.length} · ${events.length} événement(s) · ${gen}`}
                landscape={false}
              />
              <View style={styles.sectionBar}>
                <View style={styles.sectionBarLine} />
                <View>
                  <Text style={styles.sectionTitle}>Événements</Text>
                  <Text style={styles.sectionHint}>Date, horaire, lieu et taille des listes d&apos;invités</Text>
                </View>
              </View>
              <View style={styles.tableWrap}>
                <View style={styles.evHead}>
                  <Text style={[styles.evCell, { width: "15%", fontFamily: "Helvetica-Bold" }]}>Date</Text>
                  <Text style={[styles.evCell, { width: "13%", fontFamily: "Helvetica-Bold" }]}>Heure</Text>
                  <Text style={[styles.evCell, { width: "12%", fontFamily: "Helvetica-Bold" }]}>Type</Text>
                  <Text style={[styles.evCell, { width: "28%", fontFamily: "Helvetica-Bold" }]}>Titre</Text>
                  <Text style={[styles.evCell, { width: "22%", fontFamily: "Helvetica-Bold" }]}>Lieu</Text>
                  <Text style={[styles.evCell, { width: "10%", fontFamily: "Helvetica-Bold" }]}>Inv.</Text>
                </View>
                {chunk.map((ev, i) => {
                  const d = new Date(ev.date).toLocaleDateString("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  });
                  const time =
                    ev.endTime && ev.endTime.trim()
                      ? `${ev.startTime} – ${ev.endTime}`
                      : ev.startTime;
                  const lieu = [ev.location, ev.address].filter(Boolean).join(" — ");
                  return (
                    <View key={ev.id} style={i % 2 === 1 ? [styles.evRow, styles.evRowAlt] : styles.evRow}>
                      <Text style={[styles.evCell, { width: "15%", color: C.ink }]}>{d}</Text>
                      <Text style={[styles.evCell, { width: "13%" }]}>{time}</Text>
                      <View style={[styles.evCell, { width: "12%", paddingTop: 1 }]}>
                        <Text style={styles.evTypePill}>{truncate(ev.type, 12)}</Text>
                      </View>
                      <Text style={[styles.evCell, { width: "28%", fontFamily: "Helvetica-Bold" }]}>
                        {truncate(ev.title, 90)}
                      </Text>
                      <Text style={[styles.evCell, { width: "22%", color: C.muted }]}>
                        {truncate(lieu, 130)}
                      </Text>
                      <Text style={[styles.evCell, { width: "10%" }]}>{ev.attendeesCount}</Text>
                    </View>
                  );
                })}
              </View>
              <PdfPageFooter />
            </Page>
          ))
        : null}

      {includeEvents && events.length === 0 ? (
        <Page key="events-empty" size="A4" orientation="portrait" style={styles.pagePortrait}>
          <View style={styles.accentTop} fixed />
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Agenda</Text>
            <Text style={styles.emptySub}>Aucun événement enregistré pour le moment.</Text>
            <Text style={[styles.emptySub, { marginTop: 8 }]}>{gen}</Text>
          </View>
          <PdfPageFooter />
        </Page>
      ) : null}
    </Document>
  );
}

function DataRow({
  label,
  values,
  alt,
  total,
}: {
  label: string;
  values: number[];
  alt?: boolean;
  total?: boolean;
}) {
  return (
    <View style={[styles.row, alt ? styles.rowAlt : {}, total ? styles.rowTotal : {}]}>
      <View style={[styles.cellFirst, { width: COL_FIRST }]}>
        <Text>{label}</Text>
      </View>
      {values.map((v, i) => (
        <View key={String(i)} style={[styles.cell, { width: COL_DAY }]}>
          <Text>{v}</Text>
        </View>
      ))}
    </View>
  );
}
