// src/app/api/recherche-entreprise/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * API de recherche d'entreprise via Pappers
 * GET /api/recherche-entreprise?query=Nike
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Requête trop courte (min 2 caractères)" },
        { status: 400 }
      );
    }

    // Vérifier si la clé API Pappers est configurée
    const PAPPERS_API_KEY = process.env.PAPPERS_API_KEY;
    if (!PAPPERS_API_KEY) {
      return NextResponse.json(
        { error: "API Pappers non configurée" },
        { status: 503 }
      );
    }

    // Appel à l'API Pappers
    const url = `https://api.pappers.fr/v2/recherche?api_token=${PAPPERS_API_KEY}&q=${encodeURIComponent(query)}&par_page=10`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Erreur Pappers API: ${response.status}`);
    }

    const data = await response.json();

    // Transformer les résultats pour un format plus simple
    const results = data.resultats?.map((entreprise: any) => ({
      nom_entreprise: entreprise.nom_entreprise,
      denomination: entreprise.denomination,
      siret: entreprise.siege?.siret,
      siren: entreprise.siren,
      numero_tva_intracommunautaire: entreprise.numero_tva_intracommunautaire,
      forme_juridique: entreprise.forme_juridique,
      capital: entreprise.capital,
      
      // Adresse du siège
      adresse: entreprise.siege?.adresse_ligne_1,
      complement: entreprise.siege?.adresse_ligne_2,
      code_postal: entreprise.siege?.code_postal,
      ville: entreprise.siege?.ville,
      pays: entreprise.siege?.pays || "France",
      
      // Infos supplémentaires
      code_naf: entreprise.code_naf,
      domaine_activite: entreprise.domaine_activite,
      date_creation: entreprise.date_creation,
      statut: entreprise.statut_rcs,
      
      // Contact (dirigeant principal)
      representant: entreprise.representants?.[0] ? {
        nom: entreprise.representants[0].nom_complet,
        qualite: entreprise.representants[0].qualite,
      } : null,
    })) || [];

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Erreur recherche entreprise:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la recherche" },
      { status: 500 }
    );
  }
}
