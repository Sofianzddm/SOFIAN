export type InboundCategory =
  | "COLLAB_PAID"
  | "COLLAB_GIFTING"
  | "PRESS_KIT"
  | "EVENT_INVITE"
  | "OTHER";

export const INBOUND_CATEGORY_LABELS: Record<InboundCategory, string> = {
  COLLAB_PAID: "Collab payée",
  COLLAB_GIFTING: "Gifting",
  PRESS_KIT: "Press kit",
  EVENT_INVITE: "Événement",
  OTHER: "Autre",
};

export function inboundCategoryLabel(category: string): string {
  return (
    INBOUND_CATEGORY_LABELS[category as InboundCategory] || category || "Autre"
  );
}
