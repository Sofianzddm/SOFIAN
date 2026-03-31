import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy, getOrCreateVillaProject } from "@/app/api/strategy/_utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const projetSlug = (searchParams.get("projetSlug") || "villa-cannes").trim();
    const projet = await getOrCreateVillaProject(projetSlug);

    const [talentsConfirmes, talentsPressentis, opps] = await Promise.all([
      prisma.participantVilla.count({ where: { projetId: projet.id, statut: "CONFIRME" } }),
      prisma.participantVilla.count({ where: { projetId: projet.id, statut: "PRESSENTI" } }),
      prisma.opportuniteMarque.findMany({ where: { projetId: projet.id } }),
    ]);

    const pipeline = opps.filter((o) => o.statut !== "A_QUALIFIER");
    const marquesEnNego = opps.filter((o) => o.statut === "EN_NEGO").length;
    const dealsSignes = opps.filter((o) => o.statut === "SIGNEE").length;
    const caPotentiel = pipeline.reduce((sum, o) => sum + (o.budgetEstime ?? 0), 0);
    const caConfirme = opps
      .filter((o) => o.statut === "SIGNEE")
      .reduce((sum, o) => sum + (o.montantFinal ?? 0), 0);

    return NextResponse.json({
      talentsConfirmes,
      talentsPressentis,
      pipelineMarques: pipeline.length,
      marquesEnNego,
      caPotentiel,
      caConfirme,
      dealsSignes,
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/kpis:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des KPIs" }, { status: 500 });
  }
}
