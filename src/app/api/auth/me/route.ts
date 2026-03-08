import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { message: "Non authentifié" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      impersonating: session.impersonating ?? false,
      realUser: session.realUser ?? undefined,
    });
  } catch (error) {
    console.error("Erreur GET auth/me:", error);
    return NextResponse.json(
      { message: "Erreur serveur" },
      { status: 500 }
    );
  }
}