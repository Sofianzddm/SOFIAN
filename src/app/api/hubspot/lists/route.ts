import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLists } from "@/lib/hubspot";

/**
 * GET /api/hubspot/lists
 * Récupère les listes de contacts depuis HubSpot
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      console.log('❌ GET /api/hubspot/lists: Non authentifié');
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    console.log(`✅ GET /api/hubspot/lists: Utilisateur ${session.user.email} (${session.user.role})`);
    
    const lists = await getLists();
    
    console.log(`✅ ${lists.length} listes HubSpot récupérées`);
    
    return NextResponse.json({ lists });
  } catch (error) {
    console.error("❌ Erreur GET HubSpot lists:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des listes" },
      { status: 500 }
    );
  }
}
