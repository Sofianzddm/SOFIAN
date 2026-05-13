import { NextResponse } from "next/server";

import { parisDayKey } from "@/lib/cannes/dates";
import { villaTvParisDayKeys } from "@/lib/cannes/villaTvWindow";
import { normalizeVillaTvBoardTimeRange } from "@/lib/cannes/villaTvBoardDates";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";
import {
  formatParisLongHeadingFromYmd,
  parisDayBoundsUtc,
  parisYmdHhmmToUtc,
} from "@/lib/cannes/teamPlanningSlotTimes";
import { prisma } from "@/lib/prisma";

const WINDOW = 2;
const RATE_MAX = 120;
const RATE_WINDOW_MS = 60_000;

const AGENDA_TYPE_LABELS: Record<string, string> = {
  SOIREE: "Soirée",
  DINER: "Dîner",
  BRUNCH: "Brunch",
  COCKTAIL: "Cocktail",
  CONFERENCE: "Conférence",
  PROJECTION: "Projection",
  SHOOTING: "Shooting",
  AUTRE: "Autre",
};

function agendaTypeLabel(type: string): string {
  const key = String(type ?? "").trim().toUpperCase();
  return AGENDA_TYPE_LABELS[key] ?? type;
}

function splitAttendeeNames(
  attendees: {
    presence: {
      talentId: string | null;
      userId: string | null;
      talent: { prenom: string; nom: string } | null;
      user: { prenom: string; nom: string } | null;
    };
  }[]
): { talents: string[]; team: string[] } {
  const talents: string[] = [];
  const team: string[] = [];
  for (const a of attendees) {
    const p = a.presence;
    if (p.talentId && p.talent) {
      talents.push(`${p.talent.prenom} ${p.talent.nom}`.trim());
    } else if (p.userId && p.user) {
      team.push(`${p.user.prenom} ${p.user.nom}`.trim());
    }
  }
  return {
    talents: [...new Set(talents)].sort((x, y) => x.localeCompare(y, "fr")),
    team: [...new Set(team)].sort((x, y) => x.localeCompare(y, "fr")),
  };
}

export type VillaTvTimelineItem =
  | {
      kind: "agenda_event";
      sortMs: number;
      id: string;
      startTime: string;
      endTime: string | null;
      title: string;
      location: string;
      eventType: string;
      eventTypeLabel: string;
      description: string | null;
      talents: string[];
      team: string[];
    }
  | {
      kind: "board_item";
      sortMs: number;
      sortOrder: number;
      id: string;
      timeLabel: string;
      endTimeLabel: string | null;
      title: string;
      body: string | null;
    };

export async function GET(req: Request) {
  const ip = getClientIp(req);
  if (!isRateLimitBypassed(ip)) {
    const rl = checkRateLimit({
      key: `cannes-villa-tv:${ip}`,
      max: RATE_MAX,
      windowMs: RATE_WINDOW_MS,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Trop de requêtes — réessaie dans une minute." }, { status: 429 });
    }
  }

  const dayKeys = villaTvParisDayKeys(WINDOW);
  if (dayKeys.length === 0) {
    return NextResponse.json({ days: [], generatedAt: new Date().toISOString() });
  }

  const tStart = parisDayBoundsUtc(dayKeys[0]).start;
  const tEnd = parisDayBoundsUtc(dayKeys[dayKeys.length - 1]).end;

  const [events, boardItems] = await Promise.all([
    prisma.cannesEvent.findMany({
      /** Pas sur l’écran TV public : réservé au suivi interne (annonces TV ou autres types pour la villa). */
      where: { date: { gte: tStart, lt: tEnd }, type: { not: "AUTRE" } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        attendees: {
          include: {
            presence: {
              select: {
                talentId: true,
                userId: true,
                talent: { select: { prenom: true, nom: true } },
                user: { select: { prenom: true, nom: true } },
              },
            },
          },
        },
      },
    }),
    prisma.cannesVillaTvBoardItem.findMany({
      where: { dateYmd: { in: dayKeys } },
      orderBy: [{ dateYmd: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const days = dayKeys.map((ymd) => {
    const weekdayLabel = `${formatParisLongHeadingFromYmd(ymd)} 2026`;

    const dayEvents = events.filter((e) => parisDayKey(e.date.toISOString()) === ymd);
    const dayBoard = boardItems.filter((r) => r.dateYmd === ymd);

    const timeline: VillaTvTimelineItem[] = [];

    for (const e of dayEvents) {
      const { talents, team } = splitAttendeeNames(e.attendees);

      const sortMs =
        parisYmdHhmmToUtc(ymd, e.startTime)?.getTime() ??
        parisYmdHhmmToUtc(ymd, "12:00")!.getTime();
      timeline.push({
        kind: "agenda_event",
        sortMs,
        id: e.id,
        startTime: e.startTime,
        endTime: e.endTime,
        title: e.title,
        location: e.location,
        eventType: e.type,
        eventTypeLabel: agendaTypeLabel(e.type),
        description: e.description?.trim() ? e.description.trim() : null,
        talents,
        team,
      });
    }

    for (const row of dayBoard) {
      const rawTl = (row.timeLabel || "12:00").trim();
      const slot = normalizeVillaTvBoardTimeRange(ymd, rawTl, row.endTimeLabel);
      let timeLabel: string;
      let endTimeLabel: string | null;
      if (slot.ok) {
        timeLabel = slot.timeLabel;
        endTimeLabel = slot.endTimeLabel;
      } else {
        const solo = normalizeVillaTvBoardTimeRange(ymd, rawTl, null);
        timeLabel = solo.ok ? solo.timeLabel : "12:00";
        endTimeLabel = null;
      }
      const sortMs =
        parisYmdHhmmToUtc(ymd, timeLabel)?.getTime() ?? parisYmdHhmmToUtc(ymd, "12:00")!.getTime();
      timeline.push({
        kind: "board_item",
        sortMs,
        sortOrder: row.sortOrder,
        id: row.id,
        timeLabel,
        endTimeLabel,
        title: row.title,
        body: row.body,
      });
    }

    timeline.sort((a, b) => {
      const d = a.sortMs - b.sortMs;
      if (d !== 0) return d;
      if (a.kind === "board_item" && b.kind === "board_item") {
        const o = a.sortOrder - b.sortOrder;
        if (o !== 0) return o;
      }
      return a.id.localeCompare(b.id);
    });

    return { ymd, weekdayLabel, timeline };
  });

  const res = NextResponse.json({
    days,
    dayKeys,
    generatedAt: new Date().toISOString(),
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
