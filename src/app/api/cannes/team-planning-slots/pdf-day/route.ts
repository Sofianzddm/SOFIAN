import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { htmlToPlainTextForExport } from "@/lib/cannes/cannesTaskNotes";
import { CANNES_2026_DAYS, isUtcDayInIsoRange, parisDayKey } from "@/lib/cannes/dates";
import {
  TeamDayAllIndividualsPdfDocument,
  type TeamDayPdfPerson,
} from "@/lib/cannes/teamDayAllIndividualsPdfDocument";
import type {
  TeamKanbanPdfEvent,
  TeamKanbanPdfPresence,
  TeamKanbanPdfSlot,
} from "@/lib/cannes/teamIndividualKanbanPdfDocument";
import { filenameFragmentForPresence } from "@/lib/cannes/planningPdfFilename";
import { parisDayBoundsUtc } from "@/lib/cannes/teamPlanningSlotTimes";
import { prisma } from "@/lib/prisma";

const ALLOWED_YMD = new Set(CANNES_2026_DAYS.map((d) => parisDayKey(d)));

function mapPresenceToDayPdfPerson(
  p: {
    id: string;
    arrivalDate: Date;
    departureDate: Date;
    hotel: string | null;
    user: { prenom: string; nom: string; role: unknown } | null;
    planningSlots: { startsAt: Date; endsAt: Date; title: string; location: string | null; notes: string | null }[];
    teamUnavailabilities: { startDate: Date; endDate: Date; label: string | null }[];
  },
  dayDate: Date,
  dateYmd: string,
  eventsThatDay: {
    date: Date;
    startTime: string;
    endTime: string | null;
    title: string;
    location: string;
    attendees: { presenceId: string }[];
  }[]
): TeamDayPdfPerson {
  const onWindow = isUtcDayInIsoRange(dayDate, p.arrivalDate.toISOString(), p.departureDate.toISOString());
  const blocked = p.teamUnavailabilities.some((u) =>
    isUtcDayInIsoRange(dayDate, u.startDate.toISOString(), u.endDate.toISOString())
  );

  let statusLabel = "Hors période";
  let statusKey: TeamDayPdfPerson["statusKey"] = "off";
  if (!onWindow) {
    statusLabel = "Hors période";
    statusKey = "off";
  } else if (blocked) {
    statusLabel = "Indisponible";
    statusKey = "blocked";
  } else {
    statusLabel = "Sur place";
    statusKey = "dispo";
  }

  const presencePayload: TeamKanbanPdfPresence = {
    id: p.id,
    arrivalDate: p.arrivalDate.toISOString(),
    departureDate: p.departureDate.toISOString(),
    hotel: p.hotel,
    user: {
      prenom: p.user!.prenom,
      nom: p.user!.nom,
      role: p.user!.role != null ? String(p.user!.role) : undefined,
    },
    teamUnavailabilities: p.teamUnavailabilities.map((u) => ({
      startDate: u.startDate.toISOString(),
      endDate: u.endDate.toISOString(),
      label: u.label,
    })),
  };

  const slots: TeamKanbanPdfSlot[] = p.planningSlots
    .filter((s) => parisDayKey(s.startsAt.toISOString()) === dateYmd)
    .map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      title: s.title,
      location: s.location,
      notesPlain: htmlToPlainTextForExport(s.notes || ""),
    }));

  const events: TeamKanbanPdfEvent[] = eventsThatDay
    .filter((ev) => ev.attendees.some((a) => a.presenceId === p.id))
    .map((e) => ({
      date: e.date.toISOString(),
      startTime: e.startTime,
      endTime: e.endTime,
      title: e.title,
      location: e.location,
    }));

  return { presence: presencePayload, slots, events, statusLabel, statusKey };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const dateYmd = (request.nextUrl.searchParams.get("date") || "").trim();
    if (!dateYmd || !ALLOWED_YMD.has(dateYmd)) {
      return NextResponse.json({ error: "Date invalide (jour du festival requis)" }, { status: 400 });
    }

    const presenceIdFilter = (request.nextUrl.searchParams.get("presenceId") || "").trim();

    const { start: dayStart, end: dayEnd } = parisDayBoundsUtc(dateYmd);
    const queryStart = new Date(dayStart.getTime() - 48 * 3600 * 1000);
    const queryEnd = new Date(dayEnd.getTime() + 48 * 3600 * 1000);

    const presenceWhere = presenceIdFilter
      ? { id: presenceIdFilter, userId: { not: null } }
      : { userId: { not: null } };

    const [presences, eventsRaw] = await Promise.all([
      prisma.cannesPresence.findMany({
        where: presenceWhere,
        orderBy: [{ user: { nom: "asc" } }, { user: { prenom: "asc" } }],
        include: {
          user: { select: { prenom: true, nom: true, role: true } },
          planningSlots: { orderBy: { startsAt: "asc" } },
          teamUnavailabilities: { orderBy: { startDate: "asc" } },
        },
      }),
      prisma.cannesEvent.findMany({
        where: { date: { gte: queryStart, lt: queryEnd } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: { attendees: { select: { presenceId: true } } },
      }),
    ]);

    const dayDate = CANNES_2026_DAYS.find((d) => parisDayKey(d) === dateYmd)!;

    const eventsThatDay = eventsRaw.filter((e) => parisDayKey(e.date.toISOString()) === dateYmd);

    if (presenceIdFilter && presences.length === 0) {
      return NextResponse.json({ error: "Présence introuvable" }, { status: 404 });
    }

    const people: TeamDayPdfPerson[] = presences.map((p) =>
      mapPresenceToDayPdfPerson(p, dayDate, dateYmd, eventsThatDay)
    );

    people.sort((a, b) => {
      const order = (k: TeamDayPdfPerson["statusKey"]) => (k === "dispo" ? 0 : k === "blocked" ? 1 : 2);
      const d = order(a.statusKey) - order(b.statusKey);
      if (d !== 0) return d;
      const na = `${a.presence.user.prenom} ${a.presence.user.nom}`.toLowerCase();
      const nb = `${b.presence.user.prenom} ${b.presence.user.nom}`.toLowerCase();
      return na.localeCompare(nb, "fr");
    });

    let peopleForPdf: TeamDayPdfPerson[];
    if (presenceIdFilter) {
      if (people.length === 0) {
        return NextResponse.json({ error: "Présence introuvable" }, { status: 404 });
      }
      const one = people[0];
      if (one.statusKey !== "dispo") {
        return NextResponse.json(
          {
            error:
              "Ce collaborateur n'est pas sur place ce jour (hors fenêtre arrivée/départ ou indisponibilité).",
          },
          { status: 404 }
        );
      }
      peopleForPdf = [one];
    } else {
      peopleForPdf = people.filter((p) => p.statusKey === "dispo");
    }

    const buffer = await renderToBuffer(
      createElement(TeamDayAllIndividualsPdfDocument, {
        dateYmd,
        people: peopleForPdf,
        generatedAt: new Date(),
      }) as any
    );

    const safe = dateYmd.replace(/-/g, "");
    const filename =
      presenceIdFilter && presences[0]?.user
        ? `cannes-2026-jour-${safe}-${filenameFragmentForPresence({
            user: presences[0].user,
            talent: null,
          })}.pdf`
        : `cannes-2026-planning-jour-${safe}-sur-place.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("GET /api/cannes/team-planning-slots/pdf-day:", e);
    return NextResponse.json({ error: "Erreur lors de la génération du PDF" }, { status: 500 });
  }
}
