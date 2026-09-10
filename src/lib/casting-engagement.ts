/**
 * Enregistre ouvertures / clics casting, avec ventilation par destinataire
 * quand le param `e` (email) est present dans le pixel / lien.
 *
 * Les compteurs globaux (openCount / clickCount) restent sur contact_missions ;
 * le detail par mail est stocke dans sentMessageIds[email].
 */

import { prisma } from "@/lib/prisma";

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

export type CastingRecipientEngagement = {
  messageId?: string;
  threadId?: string;
  error?: string;
  openCount?: number;
  openedAt?: string;
  lastOpenAt?: string;
  clickCount?: number;
  clickedAt?: string;
  lastClickAt?: string;
  lastClickUrl?: string;
};

function normalizeEmail(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function asEngagementMap(raw: unknown): Record<string, CastingRecipientEngagement> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, CastingRecipientEngagement> = {};
  for (const [email, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeEmail(email);
    if (!key) continue;
    out[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as CastingRecipientEngagement)
        : {};
  }
  return out;
}

export async function recordCastingOpen(missionId: string, recipientEmail?: string | null) {
  if (!missionId) return;

  const current = await contactMissionModel.findUnique({
    where: { id: missionId },
    select: { openCount: true, sentMessageIds: true },
  });
  if (!current) return;

  const email = normalizeEmail(recipientEmail);
  const now = new Date();
  const data: Record<string, unknown> = {
    openCount: { increment: 1 },
    lastOpenAt: now,
    ...(current.openCount === 0 ? { openedAt: now } : {}),
  };

  if (email) {
    const byEmail = asEngagementMap(current.sentMessageIds);
    const prev = byEmail[email] || {};
    const iso = now.toISOString();
    byEmail[email] = {
      ...prev,
      openCount: (prev.openCount || 0) + 1,
      lastOpenAt: iso,
      ...(prev.openedAt ? {} : { openedAt: iso }),
    };
    data.sentMessageIds = byEmail;
  }

  await contactMissionModel.update({ where: { id: missionId }, data });
}

export async function recordCastingClick(
  missionId: string,
  targetUrl: string,
  recipientEmail?: string | null
) {
  if (!missionId || !targetUrl) return;

  const current = await contactMissionModel.findUnique({
    where: { id: missionId },
    select: { clickedAt: true, sentMessageIds: true },
  });
  if (!current) return;

  const email = normalizeEmail(recipientEmail);
  const now = new Date();
  const url = targetUrl.slice(0, 1000);
  const data: Record<string, unknown> = {
    clickCount: { increment: 1 },
    lastClickAt: now,
    lastClickUrl: url,
    ...(current.clickedAt ? {} : { clickedAt: now }),
  };

  if (email) {
    const byEmail = asEngagementMap(current.sentMessageIds);
    const prev = byEmail[email] || {};
    const iso = now.toISOString();
    byEmail[email] = {
      ...prev,
      clickCount: (prev.clickCount || 0) + 1,
      lastClickAt: iso,
      lastClickUrl: url,
      ...(prev.clickedAt ? {} : { clickedAt: iso }),
    };
    data.sentMessageIds = byEmail;
  }

  await contactMissionModel.update({ where: { id: missionId }, data });
}

export function listRecipientEngagements(
  sentMessageIds: unknown
): Array<{ email: string } & CastingRecipientEngagement> {
  const byEmail = asEngagementMap(sentMessageIds);
  return Object.entries(byEmail)
    .filter(([, rec]) => Boolean(rec.messageId) && !rec.error)
    .map(([email, rec]) => ({ email, ...rec }))
    .sort((a, b) => a.email.localeCompare(b.email, "fr"));
}
