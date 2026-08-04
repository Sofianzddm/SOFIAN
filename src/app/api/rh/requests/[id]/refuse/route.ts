import { NextRequest } from "next/server";
import { decide } from "../decide";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  return decide(request, ctx, false);
}
