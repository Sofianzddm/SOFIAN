import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canManageDepensesMobile,
  getMobileUser,
} from "@/lib/mobile-auth";
import {
  DepenseError,
  createDepense,
  listDepenses,
  uploadJustificatif,
  validateJustificatifFile,
} from "@/lib/depenses";

async function requireMobileUser(request: NextRequest) {
  const user = await getMobileUser(request);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Token invalide ou expiré" }, { status: 401 }),
    };
  }
  if (!canManageDepensesMobile(user)) {
    return {
      error: NextResponse.json({ error: "Accès non autorisé" }, { status: 403 }),
    };
  }
  return { user };
}

/**
 * GET /api/mobile/depenses?periodDays=90
 * Écran principal de l'app : dépenses à justifier en premier.
 * Retour : { aJustifier: [...], justifiees: [...], horsBanque: [...] }
 */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const periodDays = Math.min(
      Math.max(Number(searchParams.get("periodDays")) || 90, 1),
      730
    );

    const { transactions, horsBanque } = await listDepenses(periodDays);

    const serialize = (tx: (typeof transactions)[number]) => ({
      transactionId: tx.id,
      montant: Math.abs(Number(tx.montant)),
      devise: tx.devise,
      libelle: tx.libelle,
      emetteur: tx.emetteur,
      date: tx.dateTransaction,
      depense: tx.depense
        ? {
            id: tx.depense.id,
            categorie: tx.depense.categorie,
            justificatifUrl: tx.depense.justificatifUrl,
          }
        : null,
    });

    return NextResponse.json({
      success: true,
      aJustifier: transactions
        .filter((t) => !t.depense?.justificatifUrl)
        .map(serialize),
      justifiees: transactions
        .filter((t) => t.depense?.justificatifUrl)
        .map(serialize),
      horsBanque: horsBanque.map((d) => ({
        id: d.id,
        montant: Math.abs(Number(d.montantTTC)),
        devise: d.devise,
        fournisseur: d.fournisseur,
        libelle: d.libelle,
        categorie: d.categorie,
        date: d.dateDepense,
        justificatifUrl: d.justificatifUrl,
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/mobile/depenses:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des dépenses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mobile/depenses (multipart/form-data)
 * La photo du reçu prise depuis l'app.
 * Champs :
 *   - file          : photo / PDF du justificatif (requis)
 *   - transactionId : transaction Qonto débit à justifier (optionnel —
 *                     sans transactionId, crée un reçu « hors banque »
 *                     rapproché ensuite depuis le dashboard)
 *   - montantTTC, dateDepense : requis si pas de transactionId
 *   - fournisseur, libelle, categorie, notes : optionnels
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Photo du justificatif requise" },
        { status: 400 }
      );
    }
    const invalid = validateJustificatifFile(file);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
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
    const transactionId = str("transactionId");

    // Cas : la transaction a déjà une dépense (catégorisée depuis le web)
    // mais sans justificatif → on attache simplement la photo.
    if (transactionId) {
      const existing = await prisma.depense.findUnique({
        where: { transactionId },
      });
      if (existing?.justificatifUrl) {
        return NextResponse.json(
          { error: "Un justificatif existe déjà pour cette transaction" },
          { status: 409 }
        );
      }
      if (existing) {
        const justificatifUrl = await uploadJustificatif(file);
        const depense = await prisma.depense.update({
          where: { id: existing.id },
          data: {
            justificatifUrl,
            justificatifNom: file.name,
            justificatifType: file.type,
            categorie: str("categorie") ?? existing.categorie,
            notes: str("notes") ?? existing.notes,
          },
        });
        return NextResponse.json({ success: true, depense });
      }
    }

    const justificatifUrl = await uploadJustificatif(file);

    const depense = await createDepense({
      transactionId,
      fournisseur: str("fournisseur"),
      libelle: str("libelle"),
      categorie: str("categorie"),
      notes: str("notes"),
      montantTTC: num("montantTTC"),
      montantTVA: num("montantTVA"),
      tauxTVA: num("tauxTVA"),
      dateDepense: dateRaw ? new Date(dateRaw) : null,
      justificatifUrl,
      justificatifNom: file.name,
      justificatifType: file.type,
      source: "MOBILE",
      createdById: auth.user.id,
    });

    return NextResponse.json({ success: true, depense });
  } catch (error) {
    if (error instanceof DepenseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Erreur POST /api/mobile/depenses:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de la dépense" },
      { status: 500 }
    );
  }
}
