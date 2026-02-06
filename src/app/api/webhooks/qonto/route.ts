import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * 🏦 WEBHOOK QONTO
 * Reçoit les événements de Qonto en temps réel
 */

export async function POST(request: NextRequest) {
  try {
    // 1. Récupérer le body brut
    const body = await request.text();
    const signature = request.headers.get("x-qonto-signature");

    // 2. Vérifier la signature du webhook
    if (!verifyQontoSignature(body, signature)) {
      console.error("❌ Signature webhook Qonto invalide");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 3. Parser le payload
    const payload = JSON.parse(body);
    console.log("📡 Webhook Qonto reçu:", payload.event_name);

    // 4. Gérer l'événement
    if (payload.event_name === "transaction.created" || payload.event_name === "transaction.updated") {
      const transaction = payload.transaction;

      // Enregistrer uniquement les CRÉDITS (encaissements) COMPLÉTÉS
      if (transaction.side === "credit" && transaction.status === "completed") {
        console.log("💰 Nouvel encaissement:", {
          id: transaction.id,
          amount: transaction.amount_cents / 100,
          label: transaction.label,
        });

        // Vérifier si transaction existe déjà
        const existing = await prisma.transactionQonto.findUnique({
          where: { qontoId: transaction.id },
        });

        if (!existing) {
          // Créer la transaction
          await prisma.transactionQonto.create({
            data: {
              qontoId: transaction.id,
              montant: transaction.amount_cents / 100, // Convertir centimes en euros
              devise: transaction.currency,
              libelle: transaction.label || "",
              reference: transaction.reference || null,
              dateTransaction: new Date(transaction.settled_at || transaction.emitted_at),
              emetteur: transaction.counterparty?.name || "Inconnu",
              emetteurIban: transaction.counterparty?.iban || null,
              statut: "SETTLED",
              metadata: transaction as any,
            },
          });

          // Créer notification pour les ADMIN
          const admins = await prisma.user.findMany({
            where: { role: "ADMIN", actif: true },
            select: { id: true },
          });

          const montantFormate = (transaction.amount_cents / 100).toFixed(2);

          for (const admin of admins) {
            await prisma.notification.create({
              data: {
                userId: admin.id,
                type: "PAIEMENT_RECU",
                titre: "💰 Nouveau paiement Qonto",
                message: `Encaissement de ${montantFormate}€ - ${transaction.label || "Sans libellé"}`,
                lien: "/reconciliation",
              },
            });
          }

          console.log("✅ Transaction Qonto enregistrée + notifications envoyées");
        } else {
          // Mettre à jour le statut
          await prisma.transactionQonto.update({
            where: { qontoId: transaction.id },
            data: {
              statut: "SETTLED",
              metadata: transaction as any,
            },
          });
          console.log("✅ Transaction Qonto mise à jour");
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Erreur webhook Qonto:", error);
    return NextResponse.json(
      { error: "Webhook processing error" },
      { status: 500 }
    );
  }
}

/**
 * Vérifier la signature HMAC du webhook Qonto
 */
function verifyQontoSignature(body: string, signature: string | null): boolean {
  if (!signature) {
    console.warn("⚠️ Pas de signature dans le webhook");
    // En dev, on peut accepter sans signature
    return process.env.NODE_ENV === "development" || !process.env.QONTO_WEBHOOK_SECRET;
  }

  const secret = process.env.QONTO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("⚠️ QONTO_WEBHOOK_SECRET non configuré");
    return process.env.NODE_ENV === "development";
  }

  try {
    const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return hash === signature;
  } catch (error) {
    console.error("Erreur vérification signature:", error);
    return false;
  }
}
