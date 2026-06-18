import { NextRequest, NextResponse } from "next/server";
import { runRelances } from "@/lib/relances";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const result = await runRelances();
  return NextResponse.json(result);
}
