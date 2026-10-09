import { NextRequest, NextResponse } from "next/server";
import { requireRhHr, requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  getRhSettings,
  updateRhSettings,
  type RhSettingsData,
} from "@/lib/rh/settings";

/** Lecture : tout utilisateur RH authentifié (pour horaires UI). */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const settings = await getRhSettings();
  return NextResponse.json({ settings, canEdit: session.employee.rhRole === "HR" });
}

/** Écriture : HR uniquement. */
export async function PUT(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const patch = (body.settings ?? body) as Partial<RhSettingsData>;
  try {
    const settings = await updateRhSettings({
      data: patch,
      actorId: session.employee.id,
    });
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
