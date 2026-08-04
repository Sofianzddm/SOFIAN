import { NextRequest, NextResponse } from "next/server";
import type { RhLeaveAccount } from "@prisma/client";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  createLeaveRequest,
  getBalancesForEmployee,
} from "@/lib/rh/leave";
import prisma from "@/lib/prisma";

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
  const body = await request.json();
  try {
    const result = await createLeaveRequest({
      employeeId: session.employee.id,
      hireDate: session.employee.hireDate,
      department: session.employee.department,
      accountCode: body.accountCode as RhLeaveAccount,
      from: new Date(body.from),
      to: new Date(body.to),
      halfDay: !!body.halfDay,
      half: body.half,
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
