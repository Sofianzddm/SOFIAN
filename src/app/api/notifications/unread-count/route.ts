import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { countUnreadNotificationsForRole } from "@/lib/contratMarqueNotifications";

// GET - Nombre de notifications non lues
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const count = await countUnreadNotificationsForRole(
      session.user.id,
      session.user.role as string
    );

    return NextResponse.json({ count });
  } catch (error) {
    console.error("GET /api/notifications/unread-count:", error);
    return NextResponse.json(
      { error: "Erreur lors du comptage" },
      { status: 500 }
    );
  }
}
