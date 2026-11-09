/** Rôles autorisés à contacter les marques / envoyer des mails gift. */
export function canContactGiftMarques(role: string | null | undefined): boolean {
  return role === "CM" || role === "ASSISTANTE_TM" || role === "ADMIN";
}
