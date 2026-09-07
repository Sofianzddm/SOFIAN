import { NextRequest, NextResponse } from "next/server";
import { requireDcApi } from "@/lib/decision-center/access";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    ok: true,
    userId: auth.ctx.userId,
    email: auth.ctx.email,
    name: auth.ctx.name,
    dcRole: auth.ctx.dcRole,
    appRole: auth.ctx.appRole,
    capabilities: auth.ctx.capabilities,
  });
}
