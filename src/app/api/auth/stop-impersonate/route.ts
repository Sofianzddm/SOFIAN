import { NextRequest, NextResponse } from "next/server";
import { getImpersonateCookieName } from "@/lib/getAppSession";

export async function POST(request: NextRequest) {
  const cookieName = getImpersonateCookieName();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, "", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });
  return res;
}
