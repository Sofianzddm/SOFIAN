export const DC_PHILOSOPHY = {
  tagline: "Les bonnes décisions, au bon niveau.",
  homeLead: "Le bon niveau de décision, sans validation inutile.",
  decideVsExecute:
    "Une décision déjà approuvée ne doit pas nécessiter une nouvelle validation au moment de son exécution, sauf si les conditions ont changé.",
  autonomy:
    "Si une décision entre clairement dans ton autonomie, tu es responsable de la prendre. Il n’est pas nécessaire de demander une validation supplémentaire à Sofian.",
  recommendation:
    "Toute escalade doit comporter une recommandation.",
} as const;

export const DC_PRINCIPLES: { id: number; title: string; body: string }[] = [
  {
    id: 1,
    title: "Un seuil n’est pas une autorisation de dépenser",
    body: "Être sous un seuil financier n’est jamais une autorisation automatique de dépenser. Toute dépense doit rester justifiée, nécessaire, cohérente, proportionnée et dans l’intérêt de Glow Up.",
  },
  {
    id: 2,
    title: "Informer n’est pas demander une validation",
    body: "Un point d’information n’appelle pas un « ok » du CEO. On informe, on n’attend pas de feu vert.",
  },
  {
    id: 3,
    title: "Qui a le droit décide vraiment",
    body: "Une personne qui possède le droit de décision doit réellement prendre la décision. Pas de demande à Sofian « par sécurité ».",
  },
  {
    id: 4,
    title: "Toute escalade porte une recommandation",
    body: "Si tu remontes un sujet, tu dis clairement quelle option tu recommandes et pourquoi.",
  },
  {
    id: 5,
    title: "Un engagement récurrent se juge sur le total",
    body: "Un abonnement ou un prestataire récurrent s’évalue sur sa valeur totale, pas uniquement sur le coût mensuel.",
  },
  {
    id: 6,
    title: "Les exceptions importantes remontent",
    body: "Une exception importante à une règle standard remonte au niveau supérieur.",
  },
  {
    id: 7,
    title: "Irréversible = escalade",
    body: "Toute décision irréversible ou engageant fortement l’entreprise doit être escaladée.",
  },
  {
    id: 8,
    title: "Risques qui entraînent une escalade",
    body: "Juridique, RH, réputation, gros client, talent stratégique, financier significatif, sécurité, données, investissement structurant.",
  },
];

export const CEO_RESERVED_TOPICS: string[] = [
  "Stratégie annuelle",
  "Stratégie trimestrielle",
  "Objectifs CA",
  "Objectifs marge",
  "Allocation importante de capital",
  "Investissement significatif",
  "Nouveau business",
  "Changement organisationnel majeur",
  "Création de poste structurel",
  "Recrutement clé",
  "Salaire final",
  "Augmentation",
  "Prime exceptionnelle importante",
  "Sanction RH",
  "Rupture salarié",
  "Litige juridique important",
  "Procédure judiciaire",
  "Contrat-cadre structurant",
  "Risque contractuel important",
  "Pricing global",
  "Deal sous prix plancher",
  "Modification des commissions",
  "Signature talent stratégique",
  "Risque départ talent",
  "Fin de représentation sensible",
  "Client stratégique en crise",
  "Impayé arrivé à escalade importante",
  "Abandon de créance",
  "Partenariat stratégique",
  "Réputation",
  "Cyber / data critique",
  "Décision fortement irréversible",
];
