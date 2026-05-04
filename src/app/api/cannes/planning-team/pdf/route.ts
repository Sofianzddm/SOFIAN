import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CannesPlanningPdfDocument,
  type CannesPlanningPdfEvent,
  type CannesPlanningPdfPresence,
} from "@/lib/cannes/planningCannesPdfDocument";
import { filenameFragmentForPresence } from "@/lib/cannes/planningPdfFilename";
import { filenameSlugForFlags, parseCannesPdfSectionsParam } from "@/lib/cannes/planningPdfSections";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const [presences, eventsList] = await Promise.all([
      prisma.cannesPresence.findMany({
        orderBy: [{ arrivalDate: "asc" }],
        include: {
          user: { select: { prenom: true, nom: true, role: true } },
          talent: { select: { prenom: true, nom: true } },
          teamUnavailabilities: { orderBy: { startDate: "asc" } },
        },
      }),
      prisma.cannesEvent.findMany({
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: { _count: { select: { attendees: true } } },
      }),
    ]);

    const raw = JSON.parse(JSON.stringify(presences)) as CannesPlanningPdfPresence[];
    const presenceIdParam = request.nextUrl.searchParams.get("presenceId")?.trim();

    let teamPresences = raw.filter((p) => p.user);
    let talentPresences = raw.filter((p) => p.talent);

    const sectionFlags = parseCannesPdfSectionsParam(request.nextUrl.searchParams.get("sections"));

    let includeTeam = sectionFlags.team;
    let includeTalents = sectionFlags.talents;
    let includeEvents = sectionFlags.events;

    if (presenceIdParam) {
      const solo = raw.find((p) => p.id === presenceIdParam);
      if (!solo) {
        return NextResponse.json({ error: "Présence introuvable" }, { status: 404 });
      }
      if (!solo.user && !solo.talent) {
        return NextResponse.json({ error: "Présence invalide" }, { status: 400 });
      }
      teamPresences = solo.user ? [solo] : [];
      talentPresences = solo.talent ? [solo] : [];
      includeTeam = !!solo.user && sectionFlags.team;
      includeTalents = !!solo.talent && sectionFlags.talents;
      includeEvents = sectionFlags.events;
      if (!includeTeam && !includeTalents) {
        if (solo.user) includeTeam = true;
        else if (solo.talent) includeTalents = true;
      }
    }
    let teamHiddenByDay: Record<string, true> = {};
    const rawTeamHidden = request.nextUrl.searchParams.get("teamHidden");
    if (rawTeamHidden) {
      try {
        const parsed = JSON.parse(rawTeamHidden) as string[];
        if (Array.isArray(parsed)) {
          for (const key of parsed) {
            if (typeof key === "string" && key.includes(":")) teamHiddenByDay[key] = true;
          }
        }
      } catch {
        teamHiddenByDay = {};
      }
    }

    const events: CannesPlanningPdfEvent[] = eventsList.map((e) => ({
      id: e.id,
      date: e.date.toISOString(),
      startTime: e.startTime,
      endTime: e.endTime,
      title: e.title,
      type: e.type,
      location: e.location,
      address: e.address,
      description: e.description,
      notes: e.notes,
      attendeesCount: e._count.attendees,
    }));

    const buffer = await renderToBuffer(
      createElement(CannesPlanningPdfDocument, {
        teamPresences,
        talentPresences,
        events,
        generatedAt: new Date(),
        includeTeam,
        includeTalents,
        includeEvents,
        teamHiddenByDay,
      }) as any
    );

    const dayStamp = new Date().toISOString().slice(0, 10);
    const filename = presenceIdParam
      ? `cannes-2026-${filenameFragmentForPresence(teamPresences[0] ?? talentPresences[0]!)}-${dayStamp}.pdf`
      : `cannes-2026-${filenameSlugForFlags(sectionFlags)}-${dayStamp}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("GET /api/cannes/planning-team/pdf:", e);
    return NextResponse.json({ error: "Erreur lors de la génération du PDF" }, { status: 500 });
  }
}
