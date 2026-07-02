import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  DepenseError,
  createDepense,
  listDepenses,
  uploadEtAnalyseJustificatif,
  validateJustificatifFile,
} from "@/lib/depenses";
import type { AnalyseJustificatif } from "@/lib/depenses-analyse";

// Upload + analyse IA du justificatif : laisser le temps à Claude de lire le reçu
export const maxDuration = 60;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      ),
    };
  }
  return { userId: session.user.id };
}

/**
 * GET /api/depenses?periodDays=90
 * Transactions Qonto débit de la période (avec dépense éventuelle)
 * + dépenses hors banque (photo mobile avant passage en banque).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const periodDays = Math.min(
      Math.max(Number(searchParams.get("periodDays")) || 90, 1),
      730
    );

    const { transactions, horsBanque } = await listDepenses(periodDays);
    return NextResponse.json({ success: true, transactions, horsBanque });
  } catch (error) {
    console.error("Erreur GET /api/depenses:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des dépenses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/depenses (multipart/form-data)
 * Crée une dépense, avec justificatif optionnel.
 * Champs : file?, transactionId?, fournisseur?, libelle?, categorie?, notes?,
 *          montantTTC?, montantTVA?, tauxTVA?, dateDepense?
 * Si transactionId est fourni, montant / date / fournisseur sont pré-remplis
 * depuis la transaction bancaire.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    let justificatifUrl: string | null = null;
    let justificatifNom: string | null = null;
    let justificatifType: string | null = null;
    let analyse: AnalyseJustificatif | null = null;

    if (file instanceof File && file.size > 0) {
      const invalid = validateJustificatifFile(file);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      const uploaded = await uploadEtAnalyseJustificatif(file);
      justificatifUrl = uploaded.url;
      analyse = uploaded.analyse;
      justificatifNom = file.name;
      justificatifType = file.type;
    }

    const str = (key: string) => {
      const v = formData.get(key);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const num = (key: string) => {
      const v = str(key);
      if (v === null) return null;
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };

    const dateRaw = str("dateDepense");

    const depense = await createDepense({
      transactionId: str("transactionId"),
      fournisseur: str("fournisseur"),
      libelle: str("libelle"),
      categorie: str("categorie"),
      notes: str("notes"),
      montantTTC: num("montantTTC"),
      montantTVA: num("montantTVA"),
      tauxTVA: num("tauxTVA"),
      dateDepense: dateRaw ? new Date(dateRaw) : null,
      justificatifUrl,
      justificatifNom,
      justificatifType,
      analyse,
      source: "WEB",
      createdById: auth.userId,
    });

    return NextResponse.json({ success: true, depense });
  } catch (error) {
    if (error instanceof DepenseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Erreur POST /api/depenses:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la dépense" },
      { status: 500 }
    );
  }
}
