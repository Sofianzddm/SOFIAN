"use client";

import Link from "next/link";
import { MailOpen } from "lucide-react";

/**
 * « Nous a écrit il y a X j » dans les files de prospection.
 *
 * Un flux entrant ne décale plus le compteur de recontact d'une cible déjà
 * suivie : ce badge est le signal visuel qui évite d'envoyer un mail de
 * prospection à froid à quelqu'un avec qui un échange est en cours.
 */

export type LastInboundExchange = {
  receivedAt: string;
  answeredAt: string | null;
  inboundId: string | null;
  subject: string | null;
};

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function ago(iso: string): string {
  const days = daysSince(iso);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

export default function InboundExchangeBadge({
  exchange,
}: {
  exchange: LastInboundExchange | null | undefined;
}) {
  if (!exchange) return null;

  // Sans réponse de notre part, l'échange est encore ouvert : signal plus fort.
  const pending = !exchange.answeredAt;
  const label = `Nous a écrit ${ago(exchange.receivedAt)}`;
  const title = [
    `Mail reçu le ${new Date(exchange.receivedAt).toLocaleDateString("fr-FR")}`,
    exchange.subject ? `Objet : ${exchange.subject}` : null,
    exchange.answeredAt
      ? `Répondu le ${new Date(exchange.answeredAt).toLocaleDateString("fr-FR")}`
      : "Pas encore répondu",
  ]
    .filter(Boolean)
    .join("\n");

  const className = `ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
    pending ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
  }`;

  const content = (
    <>
      <MailOpen className="h-3 w-3" />
      {label}
    </>
  );

  if (exchange.inboundId) {
    return (
      <Link
        href={`/inbound/${exchange.inboundId}`}
        title={title}
        className={`${className} hover:underline`}
      >
        {content}
      </Link>
    );
  }

  return (
    <span title={title} className={className}>
      {content}
    </span>
  );
}
