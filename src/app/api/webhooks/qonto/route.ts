import { NextRequest, NextResponse } from "next/server";
import {
  notifyAdminsNewQontoPayment,
  upsertQontoTransaction,
} from "@/lib/qonto/sync";
import {
  parseQontoWebhookPayload,
  verifyQontoWebhookSignature,
} from "@/lib/qonto/webhook";

/**
 * POST /api/webhooks/qonto
 * Webhook temps réel Qonto (v1/transactions — encaissements).
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-qonto-signature");

  if (!verifyQontoWebhookSignature(body, signature)) {
    console.error("Signature webhook Qonto invalide");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body) as unknown;
    const eventType =
      payload &&
      typeof payload === "object" &&
      "type" in payload
        ? String((payload as { type: string }).type)
        : (payload as { event_name?: string })?.event_name ?? "unknown";

    console.log("Webhook Qonto:", eventType);

    const input = parseQontoWebhookPayload(payload);
    if (!input) {
      return NextResponse.json({ success: true, ignored: true });
    }

    const result = await upsertQontoTransaction(input);

    if (result === "imported" && input.side === "credit") {
      await notifyAdminsNewQontoPayment(input.montant, input.libelle);
      console.log("Encaissement Qonto enregistré:", input.qontoId);
    } else if (result === "imported") {
      console.log("Dépense Qonto enregistrée:", input.qontoId);
    } else if (result === "updated") {
      console.log("Transaction Qonto passée SETTLED:", input.qontoId);
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Erreur webhook Qonto:", error);
    return NextResponse.json(
      { error: "Webhook processing error" },
      { status: 500 }
    );
  }
}
