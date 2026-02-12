import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getContactsFromList } from "@/lib/hubspot";

/**
 * GET /api/hubspot/lists/[listId]/contacts
 * Récupère les contacts d'une liste HubSpot
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const { listId } = await params;
    const contacts = await getContactsFromList(listId);
    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("Erreur GET HubSpot contacts:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des contacts" },
      { status: 500 }
    );
  }
}
