import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";

export type CartoChatVpsMode = "api_chat" | "paste";

export type CartoChatVpsPreviewResult = {
  company: string;
  domain: string | null;
  language: "fr" | "en";
  mode: CartoChatVpsMode;
  /** Réponse narrative style ChatGPT web (étape recherche). */
  chatAnswer: string;
  contacts: CartoAiContactCandidate[];
  /** Agences / partenaires cités (debug UI). */
  agencies: Array<{
    name: string;
    role: string | null;
    note: string | null;
  }>;
  meta: {
    model: string | null;
    usedWebSearch: boolean;
    elapsedMs: number;
  };
};
