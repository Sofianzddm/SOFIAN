/**
 * Garantit que l'objet d'un mail cite la marque (nom littéral ou jeton
 * {{ contact.company }}). Si elle manque, on l'ajoute en suffixe.
 */
export function ensureBrandInSubject(subject: string, brandRef: string): string {
  const s = String(subject || "").trim();
  const ref = String(brandRef || "").trim();
  if (!ref) return s;
  if (!s) return ref;

  if (/\{\{\s*contact\.company\s*\}\}/i.test(s)) return s;

  const norm = (x: string) =>
    x
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normSubject = norm(s);
  const brandParts = ref
    .split(",")
    .map((p) => norm(p))
    .filter((p) => p.length >= 2);
  if (brandParts.some((p) => normSubject.includes(p))) return s;
  if (norm(ref).length >= 2 && normSubject.includes(norm(ref))) return s;

  return `${s} – ${ref}`;
}
