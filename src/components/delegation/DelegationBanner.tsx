import { ArrowRightLeft } from "lucide-react";

type Personne = { prenom: string; nom: string } | null | undefined;

export type DelegationBannerTalent = {
  managerId?: string | null;
  manager?: Personne;
  delegations?:
    | {
        tmRelaiId?: string | null;
        actif?: boolean;
        tmRelai?: Personne;
      }[]
    | null;
};

function nomComplet(p: Personne): string | null {
  if (!p) return null;
  return `${p.prenom} ${p.nom}`.trim() || null;
}

/**
 * Rappelle qui pilote réellement un talent pendant une délégation : le relai
 * reçoit les notifications, la TM d'origine garde la consultation. Sans ce
 * rappel, chacun croit que l'autre n'est pas au courant.
 */
export default function DelegationBanner({
  talent,
  userId,
  contexte = "ce talent",
}: {
  talent: DelegationBannerTalent | null | undefined;
  userId: string;
  contexte?: string;
}) {
  if (!talent || !userId) return null;

  const delegation = (talent.delegations ?? []).find(
    (d) => d.actif !== false && d.tmRelaiId
  );
  if (!delegation) return null;

  const suisOrigine = talent.managerId === userId;
  const suisRelai = delegation.tmRelaiId === userId;
  if (!suisOrigine && !suisRelai) return null;

  const relai = nomComplet(delegation.tmRelai);
  const origine = nomComplet(talent.manager);

  const message = suisOrigine
    ? `${relai ?? "Une autre TM"} a le relais sur ${contexte} pendant ton absence : les notifications lui sont envoyées, pas à toi. Tu gardes l'accès pour suivre.`
    : `Tu as le relais sur ${contexte}${origine ? ` (TM : ${origine})` : ""} : tu reçois les notifications à sa place.`;

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
      style={{ borderColor: "#fde68a", background: "#fffbeb", color: "#78350f" }}
    >
      <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-medium">Délégation active — </span>
        {message}
      </p>
    </div>
  );
}
