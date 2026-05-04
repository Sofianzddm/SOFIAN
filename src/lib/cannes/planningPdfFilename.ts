/** Fragment de nom de fichier PDF (ASCII, sans espaces agressifs). */
export function slugifyCannesPdfFragment(raw: string): string {
  const s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s.slice(0, 60) || "fiche";
}

export function filenameFragmentForPresence(p: {
  user: { prenom: string; nom: string } | null;
  talent: { prenom: string; nom: string } | null;
}): string {
  if (p.user) return slugifyCannesPdfFragment(`${p.user.prenom}-${p.user.nom}`);
  if (p.talent) return slugifyCannesPdfFragment(`${p.talent.prenom}-${p.talent.nom}`);
  return "presence";
}
