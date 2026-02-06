import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// API de traduction simple - utilise l'API Google Translate gratuite
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { text, targetLang = "en" } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: "Texte requis" },
        { status: 400 }
      );
    }

    // Utiliser l'API Google Translate gratuite (limite de requêtes)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error("Erreur traduction");
    }

    const data = await response.json();
    
    // Extraire la traduction du format de réponse Google
    let translation = "";
    if (data && data[0]) {
      for (const part of data[0]) {
        if (part[0]) {
          translation += part[0];
        }
      }
    }

    return NextResponse.json({ translation });
  } catch (error) {
    console.error("Erreur traduction:", error);
    return NextResponse.json(
      { error: "Erreur lors de la traduction" },
      { status: 500 }
    );
  }
}