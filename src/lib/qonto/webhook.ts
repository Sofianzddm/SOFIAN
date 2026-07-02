/**
 * Parsing et vérification des webhooks Qonto (API v2).
 * @see https://docs.qonto.com/api-reference/business-api/webhooks/setup
 */

import crypto from "crypto";
import type { QontoTransactionUpsertInput } from "@/lib/qonto/sync";

/** Payload v2 — type `v1/transactions` */
export interface QontoWebhookV2Payload {
  id: string;
  type: string;
  created_at: string;
  data: {
    event: "created" | "updated" | string;
    id: string;
    transaction_id?: string;
    amount: number;
    currency: string;
    side: "credit" | "debit";
    status: string;
    label?: string;
    clean_counterparty_name?: string;
    reference?: string;
    settled_at?: string | null;
    emitted_at?: string;
    updated_at?: string;
    transfer?: {
      counterparty_account_number?: string;
      counterparty_account_number_format?: string;
    };
  };
}

/** Ancien format (legacy) */
interface QontoWebhookLegacyPayload {
  event_name?: string;
  transaction?: {
    id: string;
    amount_cents: number;
    currency: string;
    label?: string;
    reference?: string;
    settled_at?: string | null;
    emitted_at?: string;
    status: string;
    side: string;
    counterparty?: { name?: string; iban?: string };
  };
}

/**
 * Vérifie `X-Qonto-Signature` au format `t={timestamp},v1={hmac}`.
 * Fallback : comparaison hex directe (anciennes intégrations).
 */
export function verifyQontoWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.QONTO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }

  if (!signatureHeader) {
    return false;
  }

  // Format officiel v2 : t=1704110400,v1=abc123...
  const tMatch = signatureHeader.match(/t=(\d+)/);
  const v1Match = signatureHeader.match(/v1=([a-f0-9]+)/i);

  if (tMatch && v1Match) {
    const timestamp = tMatch[1];
    const expected = v1Match[1];
    const signedPayload = `${timestamp}.${rawBody}`;
    const computed = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch {
      return false;
    }
  }

  // Legacy : signature = hex(body) seul
  const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(signatureHeader, "hex")
    );
  } catch {
    return hash === signatureHeader;
  }
}

function ibanFromTransfer(
  transfer?: QontoWebhookV2Payload["data"]["transfer"]
): string | null {
  if (!transfer?.counterparty_account_number) return null;
  if (transfer.counterparty_account_number_format === "iban") {
    return transfer.counterparty_account_number;
  }
  return null;
}

/** Normalise v2 `v1/transactions` ou legacy vers un upsert */
export function parseQontoWebhookPayload(
  payload: unknown
): QontoTransactionUpsertInput | null {
  if (!payload || typeof payload !== "object") return null;

  const p = payload as QontoWebhookV2Payload & QontoWebhookLegacyPayload;

  // —— API v2 ——
  if (p.type === "v1/transactions" && p.data) {
    const d = p.data;
    if (d.side !== "credit" && d.side !== "debit") return null;
    if (d.status === "declined" || d.status === "reversed") return null;

    const qontoId = d.id || d.transaction_id;
    if (!qontoId) return null;

    return {
      qontoId,
      side: d.side,
      montant: Math.abs(Number(d.amount)),
      devise: d.currency || "EUR",
      libelle: d.label || d.clean_counterparty_name || "",
      reference: d.reference || null,
      dateTransaction: new Date(d.settled_at || d.emitted_at || Date.now()),
      emetteur: d.clean_counterparty_name || d.label || "Inconnu",
      emetteurIban: ibanFromTransfer(d.transfer),
      statut: d.status === "completed" ? "SETTLED" : "PENDING",
      metadata: p as unknown as object,
    };
  }

  // —— Legacy ——
  const legacyEvent = p.event_name;
  if (
    (legacyEvent === "transaction.created" ||
      legacyEvent === "transaction.updated") &&
    p.transaction
  ) {
    const t = p.transaction;
    if (t.side !== "credit" && t.side !== "debit") return null;
    if (t.status === "declined" || t.status === "reversed") return null;

    return {
      qontoId: t.id,
      side: t.side === "debit" ? "debit" : "credit",
      montant: Math.abs(t.amount_cents / 100),
      devise: t.currency || "EUR",
      libelle: t.label || "",
      reference: t.reference || null,
      dateTransaction: new Date(t.settled_at || t.emitted_at || Date.now()),
      emetteur: t.counterparty?.name || "Inconnu",
      emetteurIban: t.counterparty?.iban || null,
      statut: t.status === "completed" ? "SETTLED" : "PENDING",
      metadata: p as unknown as object,
    };
  }

  return null;
}
