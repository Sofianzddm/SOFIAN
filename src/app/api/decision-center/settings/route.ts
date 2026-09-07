import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { writeDcAudit } from "@/lib/decision-center/audit";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const row = await prisma.dcSettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    settings: row
      ? {
          ...row,
          travelThresholdTtc: Number(row.travelThresholdTtc),
          smallPurchaseThresholdTtc: Number(row.smallPurchaseThresholdTtc),
        }
      : null,
  });
}

const schema = z.object({
  travelThresholdTtc: z.number().positive().optional(),
  smallPurchaseThresholdTtc: z.number().positive().optional(),
  receivableOrangeDays: z.number().int().positive().optional(),
  receivableRedDays: z.number().int().positive().optional(),
  saasRenewalAlertDays: z.number().int().positive().optional(),
  changeReason: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "edit_policy");
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { changeReason, ...fields } = parsed.data;
  const existing = await prisma.dcSettings.findUnique({ where: { id: "default" } });
  const updated = await prisma.dcSettings.upsert({
    where: { id: "default" },
    update: { ...fields, updatedById: auth.ctx.userId },
    create: { id: "default", ...fields, updatedById: auth.ctx.userId },
  });

  await writeDcAudit({
    actorId: auth.ctx.userId,
    action: "SETTINGS_UPDATE",
    entityType: "settings",
    entityId: "default",
    oldValue: existing as object | null,
    newValue: fields,
    comment: changeReason ?? "Modification des seuils (nouvelle version des règles à publier si besoin)",
  });

  return NextResponse.json({
    settings: {
      ...updated,
      travelThresholdTtc: Number(updated.travelThresholdTtc),
      smallPurchaseThresholdTtc: Number(updated.smallPurchaseThresholdTtc),
    },
  });
}
