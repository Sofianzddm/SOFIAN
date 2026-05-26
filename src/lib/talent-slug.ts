/**
 * Génère un slug stable pour un talent depuis son prénom et son nom.
 * Exemple: "Manon", "Delsol" -> "manon-delsol"
 * "Léa-Marie", "O'Connor" -> "lea-marie-o-connor"
 */
export function talentSlug(prenom: string, nom: string): string {
  return [prenom, nom]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
