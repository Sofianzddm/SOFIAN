import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ screenshotId: string }> }
) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  const { screenshotId } = await context.params;
  const body = (await request.json()) as { label?: string | null };

  const updated = await prisma.activationReportScreenshot.update({
    where: { id: screenshotId },
    data: { label: body.label?.trim() || null },
  });

  return NextResponse.json({ screenshot: updated });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ screenshotId: string }> }
) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  const { screenshotId } = await context.params;
  await prisma.activationReportScreenshot.delete({ where: { id: screenshotId } });
  return NextResponse.json({ success: true });
}
