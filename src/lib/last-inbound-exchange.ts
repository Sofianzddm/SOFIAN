/**
 * Dernier échange entrant (inbound / demande entrante) par adresse email.
 *
 * Un flux entrant ne décale plus le compteur de recontact d'une cible outreach
 * déjà suivie (cf. `outreach-bridge.ts` : cycle de prospection et échanges
 * entrants sont deux choses distinctes). Ce badge est le garde-fou visuel qui
 * remplace ce recalage : dans les files de prospection, on voit tout de suite
 * qu'un contact nous a écrit récemment avant de lui envoyer un mail à froid.
 */

import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/normalize-email";

/** Au-delà, l'info n'aide plus à décider d'un envoi : pas de badge. */
export const INBOUND_BADGE_WINDOW_DAYS = 120;

export type LastInboundExchange = {
  /** Dernier mail reçu de ce contact. */
  receivedAt: string;
  /** Notre dernière réponse à cet échange (null = jamais répondu). */
  answeredAt: string | null;
  /** Opportunité inbound à ouvrir, si l'échange en vient. */
  inboundId: string | null;
  subject: string | null;
};

/**
 * Pour une liste d'emails de cibles outreach, renvoie le dernier échange
 * entrant de chacun (fenêtre glissante de `INBOUND_BADGE_WINDOW_DAYS`).
 * Les emails absents de la map n'ont pas d'échange récent.
 */
export async function findLastInboundExchanges(
  emails: string[]
): Promise<Map<string, LastInboundExchange>> {
  const wanted = new Set(emails.map((e) => normalizeEmail(e)).filter(Boolean));
  const result = new Map<string, LastInboundExchange>();
  if (wanted.size === 0) return result;

  const since = new Date(
    Date.now() - INBOUND_BADGE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  // Filtrage sur la fenêtre côté SQL puis match des emails en mémoire : la
  // casse des adresses n'est pas garantie en base (imports manuels) et un
  // `in` sensible à la casse raterait des échanges.
  const [inbounds, demandes] = await Promise.all([
    prisma.inboundOpportunity.findMany({
      where: { receivedAt: { gte: since } },
      select: {
        id: true,
        senderEmail: true,
        receivedAt: true,
        sentAt: true,
        subject: true,
      },
    }),
    prisma.demandeEntrante.findMany({
      where: { date: { gte: since } },
      select: { from: true, date: true, sentAt: true, subject: true },
    }),
  ]);

  const keepLatest = (email: string, entry: LastInboundExchange) => {
    if (!wanted.has(email)) return;
    const current = result.get(email);
    if (current && current.receivedAt >= entry.receivedAt) return;
    result.set(email, entry);
  };

  for (const opp of inbounds) {
    keepLatest(normalizeEmail(opp.senderEmail), {
      receivedAt: opp.receivedAt.toISOString(),
      answeredAt: opp.sentAt?.toISOString() || null,
      inboundId: opp.id,
      subject: opp.subject,
    });
  }

  for (const demande of demandes) {
    keepLatest(normalizeEmail(demande.from), {
      receivedAt: demande.date.toISOString(),
      answeredAt: demande.sentAt?.toISOString() || null,
      inboundId: null,
      subject: demande.subject,
    });
  }

  return result;
}
