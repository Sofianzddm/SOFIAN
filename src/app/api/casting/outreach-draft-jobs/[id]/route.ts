import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  getOutreachDraftJobForUser,
  requestCancelOutreachDraftJob,
} from "@/lib/casting-outreach-draft-job";
import prisma from "@/lib/prisma";

export const maxDuration = 30;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES", "BUSINESS_DEVELOPER",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

function chatVpsFromSnapshot(snap: unknown) {
  if (!snap || typeof snap !== "object") return null;
  const chatVps = (snap as { chatVps?: unknown }).chatVps;
  if (!chatVps || typeof chatVps !== "object") return null;
  return chatVps as Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { id } = await ctx.params;
    const job = await getOutreachDraftJobForUser(id, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }

    // Inclut running / done / skipped : le scan Leyna peut déjà être sur le
    // snapshot même si le job a été annulé après Tour 1.
    const withTargets = job.items.filter(
      (it) =>
        (it.status === "done" ||
          it.status === "running" ||
          it.status === "skipped" ||
          it.status === "failed") &&
        (it.targetIds || []).length > 0
    );
    const frIds = withTargets
      .filter((it) => it.pipeline !== "BENELUX")
      .flatMap((it) => it.targetIds.slice(0, 1));
    const beIds = withTargets
      .filter((it) => it.pipeline === "BENELUX")
      .flatMap((it) => it.targetIds.slice(0, 1));
    const [frRows, beRows] = await Promise.all([
      frIds.length
        ? prisma.outreachTarget.findMany({
            where: { id: { in: frIds } },
            select: { id: true, castingResearchSnapshot: true },
          })
        : Promise.resolve([]),
      beIds.length
        ? prisma.beneluxOutreachTarget.findMany({
            where: { id: { in: beIds } },
            select: { id: true, castingResearchSnapshot: true },
          })
        : Promise.resolve([]),
    ]);
    const snapByTarget = new Map<string, unknown>();
    for (const row of [...frRows, ...beRows]) {
      snapByTarget.set(row.id, row.castingResearchSnapshot);
    }

    function leynaFromSnapshot(snap: unknown) {
      if (!snap || typeof snap !== "object") return null;
      const leyna = (snap as { leynaExchange?: unknown }).leynaExchange;
      if (!leyna || typeof leyna !== "object") return null;
      return leyna as Record<string, unknown>;
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      market: job.market,
      totalBrands: job.totalBrands,
      completed: job.completed,
      failed: job.failed,
      currentBrandName: job.currentBrandName,
      cancelRequested: job.cancelRequested,
      items: job.items.map((it) => {
        const tid = (it.targetIds || [])[0];
        const snap = tid ? snapByTarget.get(tid) : null;
        const fromItemVps =
          it.brandResearch &&
          typeof it.brandResearch === "object" &&
          (it.brandResearch as { _vps?: { leynaExchange?: unknown } })._vps
            ? (it.brandResearch as { _vps?: { leynaExchange?: unknown } })._vps
            : null;
        const chatVps = snap ? chatVpsFromSnapshot(snap) : null;
        const leynaExchange =
          leynaFromSnapshot(snap) ||
          (fromItemVps?.leynaExchange &&
          typeof fromItemVps.leynaExchange === "object"
            ? (fromItemVps.leynaExchange as Record<string, unknown>)
            : null);
        return {
          groupKey: it.groupKey,
          brandName: it.brandName,
          company: it.company,
          status: it.status,
          error: it.error,
          draftSubject: it.draftSubject,
          draftBodyHtml: it.draftBodyHtml,
          chatVps,
          leynaExchange,
        };
      }),
    });
  } catch (e) {
    console.error("GET /api/casting/outreach-draft-jobs/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { id } = await ctx.params;
    const job = await requestCancelOutreachDraftJob(id, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: job.status });
  } catch (e) {
    console.error("DELETE /api/casting/outreach-draft-jobs/[id]:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
