import { xaiResponse } from "@/lib/xai";

export type TaskBriefAiInput = {
  title: string;
  notes?: string | null;
  assigneeNames?: string[];
  priority?: string | null;
  dueAt?: string | null;
  talentName?: string | null;
  tags?: string[];
};

/**
 * Rédige un brief de tâche HUB clair et actionnable (FR) via xAI/Grok.
 * Réservé à l’usage Sofian ADMIN via la route API.
 */
export async function generateTaskBrief(
  input: TaskBriefAiInput
): Promise<string | null> {
  if (!process.env.XAI_API_KEY?.trim()) {
    console.warn("[task-brief-ai] XAI_API_KEY manquant");
    return null;
  }

  const title = input.title.trim();
  if (!title) return null;

  const notes = (input.notes || "").trim();
  const assignees = (input.assigneeNames || []).filter(Boolean);
  const tags = (input.tags || []).filter(Boolean);

  const contextLines = [
    `Titre : ${title}`,
    assignees.length ? `Assignés : ${assignees.join(", ")}` : null,
    input.priority ? `Priorité : ${input.priority}` : null,
    input.dueAt ? `Échéance : ${input.dueAt}` : null,
    input.talentName ? `Talent lié : ${input.talentName}` : null,
    tags.length ? `Tags : ${tags.join(", ")}` : null,
    notes
      ? `Notes / pistes de l’utilisateur (à structurer et enrichir, ne pas inventer de faits contradictoires) :\n${notes}`
      : "Aucune note fournie — rédige un brief professionnel à partir du titre et du contexte disponible.",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Tu rédiges des briefs de tâches internes pour l’agence Glow Up (HUB RH).

Règles :
- Français, tutoiement, ton direct et opérationnel (pas corporate)
- Structure en puces courtes, prêtes à coller dans un champ « Brief / contexte »
- Sections typiques si pertinentes : Objectif, Livrable attendu, Contexte, Points d’attention, Liens / refs (si absents, omets la section)
- Pas de salutation, pas de signature, pas de markdown lourd (#, **)
- N’invente pas de chiffres, dates ou noms absents du contexte
- 80 à 180 mots max
- Réponds UNIQUEMENT avec le brief, rien d’autre

Contexte de la tâche :
${contextLines}`;

  const text = (
    await xaiResponse(prompt, {
      model: "grok-4.20-0309-non-reasoning",
      timeoutMs: 45_000,
    })
  ).trim();

  return text || null;
}
