export type TalentDemoCollaboration = {
  id: string;
  reference: string;
  marque: string;
  marqueId: string;
  secteur: string | null;
  montant: number;
  montantBrut: number;
  commission: number;
  statut: "PUBLIE";
  source: string;
  datePublication: string;
  lienPublication: string;
  factureTalentUrl: string | null;
  factureTalentRecueAt: string | null;
  factureValidee: boolean;
  paidAt: string | null;
  createdAt: string;
  livrables: Array<{
    typeContenu: string;
    quantite: number;
    prixUnitaire: number;
    description: string | null;
  }>;
};

export function getTalentDemoPublishedCollaborations(): TalentDemoCollaboration[] {
  return [
    {
      id: "demo-collab-001",
      reference: "COLL-2026-041",
      marque: "Sephora",
      marqueId: "demo-brand-sephora",
      secteur: "Beauty",
      montant: 1800,
      montantBrut: 2250,
      commission: 450,
      statut: "PUBLIE",
      source: "DEMO",
      datePublication: "2026-04-04T10:00:00.000Z",
      lienPublication: "https://instagram.com/p/demo-sephora",
      factureTalentUrl: null,
      factureTalentRecueAt: null,
      factureValidee: false,
      paidAt: null,
      createdAt: "2026-03-28T10:00:00.000Z",
      livrables: [
        { typeContenu: "REEL", quantite: 1, prixUnitaire: 1300, description: "Routine make-up" },
        { typeContenu: "STORY", quantite: 3, prixUnitaire: 316.67, description: "Reminder + swipe" },
      ],
    },
    {
      id: "demo-collab-002",
      reference: "COLL-2026-033",
      marque: "Nike",
      marqueId: "demo-brand-nike",
      secteur: "Sport",
      montant: 2400,
      montantBrut: 3000,
      commission: 600,
      statut: "PUBLIE",
      source: "DEMO",
      datePublication: "2026-03-22T10:00:00.000Z",
      lienPublication: "https://tiktok.com/@demo/video/123",
      factureTalentUrl: "https://example.com/demo-facture-nike.pdf",
      factureTalentRecueAt: "2026-03-26T12:00:00.000Z",
      factureValidee: true,
      paidAt: "2026-04-02T09:00:00.000Z",
      createdAt: "2026-03-10T10:00:00.000Z",
      livrables: [
        { typeContenu: "TIKTOK_VIDEO", quantite: 1, prixUnitaire: 1800, description: "Performance training" },
        { typeContenu: "STORY", quantite: 2, prixUnitaire: 300, description: null },
      ],
    },
    {
      id: "demo-collab-003",
      reference: "COLL-2026-019",
      marque: "Polene",
      marqueId: "demo-brand-polene",
      secteur: "Mode",
      montant: 1200,
      montantBrut: 1500,
      commission: 300,
      statut: "PUBLIE",
      source: "DEMO",
      datePublication: "2026-02-14T15:00:00.000Z",
      lienPublication: "https://instagram.com/p/demo-polene",
      factureTalentUrl: null,
      factureTalentRecueAt: null,
      factureValidee: false,
      paidAt: null,
      createdAt: "2026-02-06T10:00:00.000Z",
      livrables: [{ typeContenu: "POST", quantite: 1, prixUnitaire: 1200, description: "Editorial feed post" }],
    },
  ];
}
