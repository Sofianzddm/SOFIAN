import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { searchPolicies } from "@/lib/decision-center/matcher";
import { policyToSearchable } from "@/lib/decision-center/serialize";
import { serializePolicy } from "@/lib/decision-center/serialize";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "search_rules");
  if (denied) return denied;

  const q = new URL(request.url).searchParams.get("q") || "";
  const policies = await prisma.dcPolicy.findMany({
    where: { isActive: true },
  });
  const hits = searchPolicies(q, policies.map(policyToSearchable));
  const byCode = new Map(policies.map((p) => [p.code, p]));

  return NextResponse.json({
    query: q,
    results: hits.map((h) => ({
      policy: serializePolicy(byCode.get(h.policy.code)!),
      score: h.score,
      verdict: h.verdictOverride,
    })),
  });
}
