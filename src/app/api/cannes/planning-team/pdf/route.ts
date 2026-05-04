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
    const teamPresences = raw.filter((p) => p.user);
    const talentPresences = raw.filter((p) => p.talent);

    const sectionFlags = parseCannesPdfSectionsParam(request.nextUrl.searchParams.get("sections"));

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
        includeTeam: sectionFlags.team,
        includeTalents: sectionFlags.talents,
        includeEvents: sectionFlags.events,
      }) as any
    );

    const filename = `cannes-2026-${filenameSlugForFlags(sectionFlags)}-${new Date().toISOString().slice(0, 10)}.pdf`;
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
