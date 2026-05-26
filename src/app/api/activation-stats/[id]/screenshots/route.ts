import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as {
    reportTalentId?: string;
    imageUrl?: string;
    label?: string;
  };

  if (!body.reportTalentId || !body.imageUrl) {
    return NextResponse.json(
      { error: "reportTalentId et imageUrl requis" },
      { status: 400 }
    );
  }

  // Verifie que ce reportTalent appartient bien au rapport demande
  const rt = await prisma.activationReportTalent.findUnique({
    where: { id: body.reportTalentId },
    select: { reportId: true },
  });
  if (!rt || rt.reportId !== id) {
    return NextResponse.json({ error: "Talent introuvable dans ce rapport" }, { status: 404 });
  }

  const last = await prisma.activationReportScreenshot.findFirst({
    where: { reportTalentId: body.reportTalentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const screenshot = await prisma.activationReportScreenshot.create({
    data: {
      reportTalentId: body.reportTalentId,
      imageUrl: body.imageUrl,
      label: body.label?.trim() || null,
      position: (last?.position ?? -1) + 1,
    },
  });

  await prisma.activationReport.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ screenshot }, { status: 201 });
}
