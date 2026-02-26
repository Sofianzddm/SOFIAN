/**
 * Notification Slack quand un contact consulte un presskit (session_end, durée > 10s).
 * Variable d'environnement : SLACK_WEBHOOK_URL
 */

export async function notifyPressKitVisit(params: {
  refParam: string | null;
  brandName: string;
  durationSeconds: number;
  talentNames: string[];
}): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;

  try {
    const refLabel = params.refParam || "—";
    const creators = params.talentNames.length > 0
      ? params.talentNames.join(", ")
      : "—";

    const text = `👀 *${refLabel}* vient de voir le presskit *${params.brandName}* — Durée: ${params.durationSeconds}s — Créateurs vus: ${creators}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.warn("Slack webhook error:", res.status, await res.text());
    }
  } catch (err) {
    console.warn("Slack notifyPressKitVisit error:", err);
  }
}
