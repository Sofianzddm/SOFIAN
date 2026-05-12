import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { htmlToPlainTextForExport } from "@/lib/cannes/cannesTaskNotes";
import { filenameFragmentForPresence } from "@/lib/cannes/planningPdfFilename";
import {
  TeamIndividualKanbanPdfDocument,
  type TeamKanbanPdfEvent,
  type TeamKanbanPdfPresence,
  type TeamKanbanPdfSlot,
} from "@/lib/cannes/teamIndividualKanbanPdfDocument";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const presenceId = request.nextUrl.searchParams.get("presenceId")?.trim();
    if (!presenceId) {
      return NextResponse.json({ error: "presenceId requis" }, { status: 400 });
    }

    const presence = await prisma.cannesPresence.findUnique({
      where: { id: presenceId },
      include: {
        user: { select: { prenom: true, nom: true, role: true } },
        planningSlots: { orderBy: { startsAt: "asc" } },
        teamUnavailabilities: { orderBy: { startDate: "asc" } },
      },
    });

    if (!presence?.userId || !presence.user) {
      return NextResponse.json({ error: "Présence équipe introuvable" }, { status: 404 });
    }

    const eventsList = await prisma.cannesEvent.findMany({
      where: { attendees: { some: { presenceId } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        date: true,
        startTime: true,
        endTime: true,
        title: true,
        location: true,
      },
    });

    const presencePayload: TeamKanbanPdfPresence = {
      id: presence.id,
      arrivalDate: presence.arrivalDate.toISOString(),
      departureDate: presence.departureDate.toISOString(),
      hotel: presence.hotel,
      user: {
        prenom: presence.user.prenom,
        nom: presence.user.nom,
        role: presence.user.role ?? undefined,
      },
      teamUnavailabilities: presence.teamUnavailabilities.map((u) => ({
        startDate: u.startDate.toISOString(),
        endDate: u.endDate.toISOString(),
        label: u.label,
      })),
    };

    const slots: TeamKanbanPdfSlot[] = presence.planningSlots.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      title: s.title,
      location: s.location,
      notesPlain: htmlToPlainTextForExport(s.notes || ""),
    }));

    const events: TeamKanbanPdfEvent[] = eventsList.map((e) => ({
      date: e.date.toISOString(),
      startTime: e.startTime,
      endTime: e.endTime,
      title: e.title,
      location: e.location,
    }));

    const buffer = await renderToBuffer(
      createElement(TeamIndividualKanbanPdfDocument, {
        presence: presencePayload,
        slots,
        events,
        generatedAt: new Date(),
      }) as any
    );

    const dayStamp = new Date().toISOString().slice(0, 10);
    const base = filenameFragmentForPresence({
      user: presence.user,
      talent: null,
    });
    const filename = `cannes-2026-planning-kanban-${base}-${dayStamp}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("GET /api/cannes/team-planning-slots/pdf:", e);
    return NextResponse.json({ error: "Erreur lors de la génération du PDF" }, { status: 500 });
  }
}
