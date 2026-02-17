// src/app/api/recherche-entreprise/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Calcule le numéro TVA intracommunautaire français à partir du SIREN
 * Formule : FR + (12 + 3*(SIREN mod 97)) mod 97 + SIREN (9 chiffres)
 */
function computeTvaFromSiren(siren: string): string | null {
  const digits = siren.replace(/\D/g, "");
  if (digits.length !== 9) return null;
  const sirenNum = parseInt(digits, 10);
  const cle = (12 + 3 * (sirenNum % 97)) % 97;
  return `FR${cle.toString().padStart(2, "0")}${digits}`;
}

/**
 * API de recherche d'entreprise via API Recherche d'entreprises (api.gouv.fr)
 * Gratuite, sans clé. 7 req/s max.
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

    const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query.trim())}&per_page=10&page=1`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GlowUp-Platform/1.0 (recherche-entreprises)",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Recherche d'entreprises: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const rawResults = data.results || [];

    // Transformer au format attendu par le frontend
    const results = rawResults.map((e: any) => {
      const siege = e.siege || {};
      const siren = e.siren || siege.siret?.slice(0, 9) || "";
      const siret = siege.siret || null;

      return {
        nom_entreprise: e.nom_complet || e.nom_raison_sociale,
        denomination: e.nom_raison_sociale || e.nom_complet,
        siret,
        siren,
        numero_tva_intracommunautaire: siren ? computeTvaFromSiren(siren) : null,
        forme_juridique: e.nature_juridique || "",
        capital: null,
        adresse: siege.adresse || null,
        complement: siege.complement_adresse || null,
        code_postal: siege.code_postal || null,
        ville: siege.libelle_commune || siege.commune || null,
        pays: siege.libelle_pays_etranger || "France",
        code_naf: e.activite_principale || siege.activite_principale,
        domaine_activite: null,
        date_creation: e.date_creation || siege.date_creation,
        statut: e.etat_administratif,
        representant: e.dirigeants?.[0]
          ? {
              nom: `${e.dirigeants[0].nom || ""} ${e.dirigeants[0].prenoms || ""}`.trim(),
              qualite: e.dirigeants[0].qualite,
            }
          : null,
      };
    });

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
