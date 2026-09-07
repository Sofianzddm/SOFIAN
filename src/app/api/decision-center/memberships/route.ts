import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { DECISION_CENTER_ALLOWED_EMAILS, PHASE1_EMAIL_TO_ROLE } from "@/lib/decision-center/constants";
import { DC_ROLE_LABELS } from "@/lib/decision-center/labels";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "admin_roles");
  if (denied) return denied;

  const members = await prisma.dcMembership.findMany({
    include: {
      user: { select: { email: true, prenom: true, nom: true, role: true } },
    },
  });

  return NextResponse.json({
    phase1Emails: DECISION_CENTER_ALLOWED_EMAILS,
    mapping: PHASE1_EMAIL_TO_ROLE,
    members: members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: `${m.user.prenom} ${m.user.nom}`.trim(),
      dcRole: m.role,
      dcRoleLabel: DC_ROLE_LABELS[m.role],
      appRole: m.user.role,
      isActive: m.isActive,
    })),
    note: "Phase 1 : la whitelist e-mail reste la source d’accès. Ajouter un collaborateur plus tard = e-mail + membership, sans refonte.",
  });
}
