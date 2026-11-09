const TYPE_LABELS: Record<string, string> = {
  PRODUIT: "Produit",
  EXPERIENCE: "Expérience",
  SERVICE: "Service",
  HOTEL: "Hôtel",
  AUTRE: "Autre",
};

const CONTREPARTIE_LABELS: Record<string, string> = {
  STORY: "Story Instagram",
  POST_FEED: "Post feed",
  REEL_TIKTOK: "Reel / TikTok",
  MENTION_STORY: "Mention story",
  CHOIX_TALENT: "Au choix du talent",
};

export function giftTypeLabel(typeGift: string) {
  return TYPE_LABELS[typeGift] || typeGift;
}

export function contrepartieLabels(contreparties: unknown): string | null {
  if (!Array.isArray(contreparties) || contreparties.length === 0) return null;
  return contreparties
    .map((c) => CONTREPARTIE_LABELS[String(c)] || String(c))
    .join(", ");
}

export function isUsableEmail(value: string | null | undefined): boolean {
  const email = (value || "").trim();
  return email.includes("@") && !email.includes(" ");
}

export type GiftDraftSource = {
  reference: string;
  typeGift: string;
  description?: string | null;
  contreparties?: unknown;
  dateArrivee?: Date | string | null;
  dateDepart?: Date | string | null;
  destination?: string | null;
  adresseHotel?: string | null;
  talent?: { prenom?: string | null; nom?: string | null } | null;
  accountManager?: { prenom?: string | null; nom?: string | null } | null;
};

function formatFrDate(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildGiftContactDraft(source: GiftDraftSource): {
  subject: string;
  bodyText: string;
  typeGiftLabel: string;
  talentName: string;
  amName: string;
  contrepartieLabel: string | null;
  hotelDates: string | null;
  hotelVille: string | null;
  isHotel: boolean;
} {
  const talentName =
    [source.talent?.prenom, source.talent?.nom].filter(Boolean).join(" ") ||
    "notre talent";
  const amName =
    [source.accountManager?.prenom, source.accountManager?.nom]
      .filter(Boolean)
      .join(" ") || "l'équipe Glow Up";
  const typeLabel = giftTypeLabel(source.typeGift);
  const contrepartieLabel = contrepartieLabels(source.contreparties);
  const isHotel = source.typeGift === "HOTEL";
  const debut = formatFrDate(source.dateArrivee);
  const fin = formatFrDate(source.dateDepart);
  const hotelDates =
    debut && fin ? `du ${debut} au ${fin}` : debut || fin || null;
  const hotelVille =
    source.destination?.trim() || source.adresseHotel?.trim() || null;

  const subject = `Proposition partnership — ${talentName} × Glow Up (${source.reference})`;

  const lines: string[] = [
    `Je me permets de vous contacter de la part de Glow Up Agence au sujet d'une proposition de gift pour ${talentName}.`,
    "",
    `Nous souhaiterions proposer un ${typeLabel.toLowerCase()} en partenariat avec votre maison.`,
  ];

  if (source.description?.trim()) {
    lines.push("", `Contexte / besoin : ${source.description.trim()}`);
  }
  if (isHotel && hotelDates) {
    lines.push("", `Dates envisagées : ${hotelDates}`);
  }
  if (isHotel && hotelVille) {
    lines.push(`Lieu : ${hotelVille}`);
  }
  if (contrepartieLabel) {
    lines.push(
      "",
      `Contrepartie envisagée côté talent : ${contrepartieLabel}.`
    );
  }
  lines.push(
    "",
    "Seriez-vous ouverts à en discuter ? Je peux vous transmettre plus de détails (audience, usages, timing) dès que vous le souhaitez."
  );

  return {
    subject,
    bodyText: lines.join("\n"),
    typeGiftLabel: typeLabel,
    talentName,
    amName,
    contrepartieLabel,
    hotelDates,
    hotelVille,
    isHotel,
  };
}
