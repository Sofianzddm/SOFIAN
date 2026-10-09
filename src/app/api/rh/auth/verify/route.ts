import { NextRequest, NextResponse } from "next/server";
import {
  isRhHr,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import {
  attachSecureCookie,
  verifyLoginChallenge,
} from "@/lib/rh/secure-session";
import { writeRhAudit } from "@/lib/rh/workflow";

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!isRhHr(session.employee.rhRole)) {
    return NextResponse.json({ error: "Non requis" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const challengeId = String(body.challengeId || "");
  const code = String(body.code || "");
  if (!challengeId || !code) {
    return NextResponse.json(
      { error: "challengeId et code requis" },
      { status: 400 }
    );
  }

  const result = await verifyLoginChallenge({
    userId: session.app.user.id,
    challengeId,
    code,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await writeRhAudit({
    actorId: session.employee.id,
    targetId: session.employee.id,
    action: "auth.secure",
    detail: { challengeId },
  });

  const res = NextResponse.json({ ok: true });
  return attachSecureCookie(res, session.app.user.id);
}
