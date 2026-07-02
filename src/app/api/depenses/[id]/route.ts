import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteJustificatif,
  uploadEtAnalyseJustificatif,
  validateJustificatifFile,
} from "@/lib/depenses";

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

const INCLUDE = {
  transaction: {
    select: {
      id: true,
      montant: true,
      devise: true,
      libelle: true,
      emetteur: true,
      dateTransaction: true,
      statut: true,
    },
  },
  createdBy: { select: { id: true, prenom: true, nom: true } },
} as const;

/**
 * PATCH /api/depenses/[id]
 * - JSON : mise à jour des champs (fournisseur, categorie, TVA, notes,
 *   transactionId pour rapprocher une dépense hors banque…)
 * - multipart/form-data : remplace le justificatif (champ `file`)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const depense = await prisma.depense.findUnique({ where: { id } });
    if (!depense) {
      return NextResponse.json({ error: "Dépense introuvable" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    const data: Record<string, unknown> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
      }
      const invalid = validateJustificatifFile(file);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      const { url, analyse } = await uploadEtAnalyseJustificatif(file);
      await deleteJustificatif(depense.justificatifUrl);
      data.justificatifUrl = url;
      data.justificatifNom = file.name;
      data.justificatifType = file.type;
      if (analyse) {
        data.analyseIA = JSON.parse(JSON.stringify(analyse));
        // Pré-remplissage : uniquement les champs encore vides (on n'écrase
        // jamais une saisie manuelle existante).
        if (!depense.fournisseur && analyse.fournisseur) {
          data.fournisseur = analyse.fournisseur;
        }
        if (!depense.categorie && analyse.categorie) {
          data.categorie = analyse.categorie;
        }
        if (depense.montantTVA === null && analyse.montantTVA !== null) {
          data.montantTVA = analyse.montantTVA;
        }
        if (depense.tauxTVA === null && analyse.tauxTVA !== null) {
          data.tauxTVA = analyse.tauxTVA;
        }
      }
    } else {
      const body = await request.json().catch(() => ({}));

      const strFields = [
        "fournisseur",
        "libelle",
        "categorie",
        "notes",
      ] as const;
      for (const field of strFields) {
        if (field in body) {
          const v = body[field];
          data[field] = typeof v === "string" && v.trim() ? v.trim() : null;
        }
      }

      const numFields = ["montantTTC", "montantTVA", "tauxTVA"] as const;
      for (const field of numFields) {
        if (field in body) {
          const v = body[field];
          // null / "" = effacer le champ (Number(null) vaudrait 0)
          if (v === null || v === "") {
            data[field] = null;
          } else {
            const n = Number(v);
            data[field] = Number.isFinite(n) ? n : null;
          }
        }
      }
      if (
        "montantTTC" in data &&
        (data.montantTTC === null || (data.montantTTC as number) <= 0)
      ) {
        return NextResponse.json(
          { error: "Montant TTC requis (positif)" },
          { status: 400 }
        );
      }

      if ("dateDepense" in body) {
        const d = new Date(body.dateDepense);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "Date invalide" }, { status: 400 });
        }
        data.dateDepense = d;
      }

      // Rapprochement d'une dépense hors banque avec une transaction débit
      if ("transactionId" in body) {
        const transactionId = body.transactionId as string | null;
        if (transactionId) {
          const tx = await prisma.transactionQonto.findUnique({
            where: { id: transactionId },
            include: { depense: { select: { id: true } } },
          });
          if (!tx) {
            return NextResponse.json(
              { error: "Transaction introuvable" },
              { status: 404 }
            );
          }
          if (tx.side !== "debit") {
            return NextResponse.json(
              { error: "Seule une transaction débit peut être liée à une dépense" },
              { status: 400 }
            );
          }
          if (tx.depense && tx.depense.id !== id) {
            return NextResponse.json(
              { error: "Cette transaction est déjà liée à une autre dépense" },
              { status: 409 }
            );
          }
        }
        data.transactionId = transactionId;
      }
    }

    const updated = await prisma.depense.update({
      where: { id },
      data,
      include: INCLUDE,
    });

    return NextResponse.json({ success: true, depense: updated });
  } catch (error) {
    console.error("Erreur PATCH /api/depenses/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la dépense" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/depenses/[id]
 * Supprime la dépense et son justificatif. La transaction Qonto liée
 * redevient « à justifier ».
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const depense = await prisma.depense.findUnique({ where: { id } });
    if (!depense) {
      return NextResponse.json({ error: "Dépense introuvable" }, { status: 404 });
    }

    await deleteJustificatif(depense.justificatifUrl);
    await prisma.depense.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/depenses/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la dépense" },
      { status: 500 }
    );
  }
}
