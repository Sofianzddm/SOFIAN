import { NextRequest } from "next/server";

export function verifyInboundAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.replace("Bearer ", "");
  const expected = process.env.INBOUND_API_SECRET;

  if (!expected) {
    console.error("INBOUND_API_SECRET non defini");
    return false;
  }

  return token === expected;
}
