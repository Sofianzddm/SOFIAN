import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  createLeaveRequest,
  getBalancesForEmployee,
} from "@/lib/rh/leave";
import prisma from "@/lib/prisma";

const leaveBodySchema = z.object({
  accountCode: z.enum([
    "CP",
    "RECUP",
    "RTT",
    "SS",
    "UNPAID",
    "SCHOOL",
    "AUTHORIZED",
  ]),
  from: z.string().min(8),
  to: z.string().min(8),
  halfDay: z.boolean().optional(),
  half: z.enum(["AM", "PM"]).optional(),
  /** Récup / autorisée : 15–420 min */
  minutes: z.number().int().min(15).max(420).optional(),
  comment: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const balances = await getBalancesForEmployee(
    session.employee.id,
    session.employee.hireDate
  );
  const mine = await prisma.rhRequest.findMany({
    where: {
      employeeId: session.employee.id,
      type: { in: ["LEAVE", "UNPAID_LEAVE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ balances, requests: mine });
}

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const raw = await request.json().catch(() => null);
  const parsed = leaveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const from = new Date(body.from);
  const to = new Date(body.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return NextResponse.json(
      { error: "Dates invalides (vérifie du / au)" },
      { status: 400 }
    );
  }
  try {
    const result = await createLeaveRequest({
      employeeId: session.employee.id,
      hireDate: session.employee.hireDate,
      department: session.employee.department,
      accountCode: body.accountCode,
      from,
      to: body.minutes != null ? from : to,
      halfDay: body.minutes != null ? false : !!body.halfDay,
      half: body.half,
      minutes: body.minutes,
      comment: body.comment,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
