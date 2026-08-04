/**
 * Règles métier RH — réexport + helpers serveur.
 * Source unique partagée avec les tests UI.
 */
export {
  RH,
  remoteEntitlement,
  splitOvertime,
  bookableBalance,
  mealVoucherCount,
  mileageAllowance,
  minutesToLabel,
  coverageAfter,
} from "@/components/rh/lib/calculations";
