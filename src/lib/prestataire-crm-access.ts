/**
 * Accès CRM Prestataires — volontairement fermé pour tout le monde.
 * (Réouvrir en restaurant les rôles autorisés.)
 */

export function canAccessPrestataireCrm(_role?: string | null): boolean {
  return false;
}

export function canWritePrestataireCrm(_role?: string | null): boolean {
  return false;
}
