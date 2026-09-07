import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type DcAuditInput = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  policyId?: string | null;
  requestId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  comment?: string | null;
};

export async function writeDcAudit(input: DcAuditInput): Promise<void> {
  await prisma.dcAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      policyId: input.policyId ?? null,
      requestId: input.requestId ?? null,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      comment: input.comment ?? null,
    },
  });
}

export async function notifyDcUser(input: {
  userId: string;
  titre: string;
  message: string;
  lien?: string;
  actorId?: string;
}): Promise<void> {
  if (!input.userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: "DECISION_CENTER",
        titre: input.titre,
        message: input.message,
        lien: input.lien ?? "/decision-center",
        actorId: input.actorId ?? null,
      },
    });
  } catch (err) {
    console.error("[decision-center] notification:", err);
  }
}
