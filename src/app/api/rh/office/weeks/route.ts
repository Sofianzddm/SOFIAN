import { NextRequest, NextResponse } from "next/server";
import type { RhWorkPlace } from "@prisma/client";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  getOfficeWeek,
  nextWorkPlace,
  proposeRemotePlan,
  setWorkDay,
} from "@/lib/rh/office";
import { isoWeekInfo } from "@/lib/rh/workflow";
import prisma from "@/lib/prisma";

const PLACES = new Set<RhWorkPlace>(["OFFICE", "REMOTE", "TRAVEL", "SITE"]);

function agreementOf(n: number): 0 | 2 | 3 {
  return n === 2 || n === 3 ? n : 0;
}

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const agreement = agreementOf(session.employee.remoteAgreement);
  const info = isoWeekInfo(new Date());
  const weeks = await getOfficeWeek({
    employeeId: session.employee.id,
    agreementDays: agreement,
    weekStart: info.weekStart,
    weekCount: 4,
  });
  const e = await prisma.rhEmployee.findUnique({
    where: { id: session.employee.id },
  });
  return NextResponse.json({
    agreement,
    weeks: weeks.map((w) => ({
      ...w,
      weekStart: new Date(w.weekStart).toISOString().slice(0, 10),
      weekEnd: new Date(w.weekEnd).toISOString().slice(0, 10),
    })),
    address: {
      line1: e?.remoteAddressLine1,
      city: e?.remoteCity,
      postalCode: e?.remotePostalCode,
      insuranceExpiresOn: e?.remoteInsuranceExpiresOn?.toISOString() ?? null,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  const agreement = agreementOf(session.employee.remoteAgreement);

  const datesRaw: string[] = Array.isArray(body.dates)
    ? body.dates.map(String)
    : body.date
      ? [String(body.date)]
      : [];

  if (datesRaw.length === 0) {
    return NextResponse.json({ error: "Aucune date" }, { status: 400 });
  }

  const explicitPlace =
    typeof body.place === "string" && PLACES.has(body.place as RhWorkPlace)
      ? (body.place as RhWorkPlace)
      : null;

  // ── TT : toujours une demande d’approbation (REMOTE_PLAN) ──────────
  if (explicitPlace === "REMOTE") {
    try {
      const byWeek = new Map<
        string,
        { ref: Date; pending: Set<string>; approvedCount: number }
      >();
      for (const iso of datesRaw) {
        const ref = new Date(`${iso.slice(0, 10)}T12:00:00`);
        const info = isoWeekInfo(ref);
        const key = `${info.isoYear}-W${info.isoWeek}`;
        let bucket = byWeek.get(key);
        if (!bucket) {
          const weeks = await getOfficeWeek({
            employeeId: session.employee.id,
            agreementDays: agreement,
            weekStart: info.weekStart,
            weekCount: 1,
          });
          const w = weeks[0];
          const approved = new Set(
            Object.entries(w?.places || {})
              .filter(([, p]) => p === "REMOTE")
              .map(([d]) => d)
          );
          bucket = {
            ref,
            pending: new Set(w?.pendingRemote || []),
            approvedCount: approved.size,
          };
          // garder approved à part pour filtrer
          (bucket as { approved?: Set<string> }).approved = approved;
          byWeek.set(key, bucket);
        }
        const day = iso.slice(0, 10);
        const approved = (bucket as { approved?: Set<string> }).approved;
        if (approved?.has(day)) continue;
        bucket.pending.add(day);
      }

      const plans = [];
      for (const bucket of byWeek.values()) {
        const plan = await proposeRemotePlan({
          employeeId: session.employee.id,
          agreementDays: agreement,
          dates: [...bucket.pending],
          refDate: bucket.ref,
          alreadyApprovedCount: bucket.approvedCount,
        });
        plans.push(plan);
      }
      return NextResponse.json({
        ok: true,
        pending: true,
        plans: plans.map((p) => ({
          requestId: p.request?.id ?? null,
          reference: p.request?.reference ?? null,
          dates: p.dates,
          cancelled: p.cancelled,
        })),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur" },
        { status: 400 }
      );
    }
  }

  // ── Retrait TT / Bureau / Dépl / Site ───────────────────────────────
  if (explicitPlace === "OFFICE") {
    const byWeek = new Map<string, { ref: Date; remove: string[] }>();
    for (const iso of datesRaw) {
      const ref = new Date(`${iso.slice(0, 10)}T12:00:00`);
      const info = isoWeekInfo(ref);
      const key = `${info.isoYear}-W${info.isoWeek}`;
      const bucket = byWeek.get(key) || { ref, remove: [] as string[] };
      bucket.remove.push(iso.slice(0, 10));
      byWeek.set(key, bucket);
    }
    for (const bucket of byWeek.values()) {
      const weeks = await getOfficeWeek({
        employeeId: session.employee.id,
        agreementDays: agreement,
        weekStart: isoWeekInfo(bucket.ref).weekStart,
        weekCount: 1,
      });
      const w = weeks[0];
      if (w?.pendingRemote?.length) {
        const next = w.pendingRemote.filter((d) => !bucket.remove.includes(d));
        const approvedCount = Object.values(w.places || {}).filter(
          (p) => p === "REMOTE"
        ).length;
        await proposeRemotePlan({
          employeeId: session.employee.id,
          agreementDays: agreement,
          dates: next,
          refDate: bucket.ref,
          alreadyApprovedCount: approvedCount,
        });
      }
    }
  }

  const results: Array<{ date: string; place: RhWorkPlace }> = [];
  const errors: string[] = [];

  for (const iso of datesRaw) {
    try {
      const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
      let place: RhWorkPlace = explicitPlace ?? "OFFICE";
      if (!explicitPlace) {
        const existing = await prisma.rhWorkDay.findFirst({
          where: {
            employeeId: session.employee.id,
            date: new Date(`${iso.slice(0, 10)}T00:00:00.000Z`),
          },
        });
        const cycled = nextWorkPlace(existing?.place ?? null);
        place = cycled === "REMOTE" ? "OFFICE" : cycled;
      }
      const travelMeal =
        body.travelMeal === "SELF" ||
        body.travelMeal === "COMPANY" ||
        body.travelMeal === "REIMBURSED"
          ? body.travelMeal
          : undefined;
      const portion =
        body.portion === "AM" || body.portion === "PM" || body.portion === "FULL"
          ? body.portion
          : undefined;
      await setWorkDay({
        employeeId: session.employee.id,
        date,
        place,
        agreementDays: agreement,
        travelMeal,
        portion,
      });
      results.push({ date: iso.slice(0, 10), place });
    } catch (e) {
      errors.push(
        `${iso.slice(0, 10)}: ${e instanceof Error ? e.message : "Erreur"}`
      );
    }
  }

  if (results.length === 0 && explicitPlace !== "OFFICE") {
    return NextResponse.json(
      { error: errors[0] || "Aucune date mise à jour" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    results,
    errors: errors.length ? errors : undefined,
  });
}
