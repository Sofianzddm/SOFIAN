"use client";

import {
  FileText,
  FileSpreadsheet,
  Receipt,
  Banknote,
  Percent,
  Landmark,
  BookOpen,
  Layers,
  Coins,
  Scale,
  ShieldCheck,
  FileArchive,
  Database,
} from "lucide-react";
import { usePeriode, PeriodeBar } from "@/components/comptable/periode";

interface ExportItem {
  type: string;
  title: string;
  desc: string;
  format: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  group: string;
}

const EXPORTS: ExportItem[] = [
  {
    type: "liasse",
    title: "Liasse comptable complète",
    desc: "Classeur unique : synthèse, journaux, TVA, balance, grand livre, contrôles, écritures.",
    format: "Excel (.xlsx)",
    icon: Layers,
    highlight: true,
    group: "Tout-en-un",
  },
  {
    type: "fec",
    title: "FEC — Fichier des Écritures Comptables",
    desc: "Format réglementaire (art. A47 A-1 LPF), écritures en partie double, séparateur tabulation.",
    format: "Texte (.txt)",
    icon: BookOpen,
    highlight: true,
    group: "Tout-en-un",
  },
  {
    type: "justificatifs",
    title: "Pièces justificatives (PDF)",
    desc: "Archive ZIP de tous les PDF de factures & avoirs, classés et nommés par référence.",
    format: "Archive (.zip)",
    icon: FileArchive,
    highlight: true,
    group: "Tout-en-un",
  },

  {
    type: "ventes",
    title: "Journal des ventes",
    desc: "Factures & avoirs : HT, TVA par taux, TTC, statut, lettrage.",
    format: "Excel (.xlsx)",
    icon: Receipt,
    group: "Journaux & états",
  },
  {
    type: "banque",
    title: "Journal de banque",
    desc: "Encaissements Qonto avec état de rapprochement.",
    format: "Excel (.xlsx)",
    icon: Banknote,
    group: "Journaux & états",
  },
  {
    type: "grand-livre",
    title: "Grand livre",
    desc: "Détail des mouvements compte par compte avec soldes progressifs.",
    format: "Excel (.xlsx)",
    icon: BookOpen,
    group: "Journaux & états",
  },
  {
    type: "balance",
    title: "Balance générale",
    desc: "Tous les comptes : total débit/crédit et soldes débiteurs/créditeurs.",
    format: "Excel (.xlsx)",
    icon: Scale,
    group: "Journaux & états",
  },
  {
    type: "creances",
    title: "Balance auxiliaire clients",
    desc: "Compte 411 : encours par client, restant dû et retards.",
    format: "Excel (.xlsx)",
    icon: Landmark,
    group: "Journaux & états",
  },

  {
    type: "tva",
    title: "Récap TVA (sur débits)",
    desc: "Base HT et TVA collectée par taux sur les factures émises.",
    format: "Excel (.xlsx)",
    icon: Percent,
    group: "TVA",
  },
  {
    type: "tva-encaissement",
    title: "TVA sur encaissements (CA3)",
    desc: "TVA réellement exigible à l'encaissement — régime des prestations de services.",
    format: "Excel (.xlsx)",
    icon: Coins,
    group: "TVA",
  },

  {
    type: "controles",
    title: "Contrôles de cohérence",
    desc: "Liste des anomalies : SIRET manquant, TVA incohérente, numérotation, non rapprochés.",
    format: "Excel (.xlsx)",
    icon: ShieldCheck,
    group: "Contrôles",
  },

  {
    type: "quadratus",
    title: "Cegid / Quadratus",
    desc: "Fichier ASCII à largeur fixe (enregistrements mouvements) pour import Quadra/Cegid.",
    format: "Texte (.txt)",
    icon: Database,
    group: "Formats logiciels",
  },
  {
    type: "sage",
    title: "Sage / Pennylane",
    desc: "CSV d'écritures (journal, date, compte, débit, crédit, lettrage) prêt à importer.",
    format: "CSV (.csv)",
    icon: Database,
    group: "Formats logiciels",
  },
  {
    type: "ecritures",
    title: "Écritures comptables (vue FEC)",
    desc: "Toutes les écritures en partie double, lisibles dans Excel.",
    format: "Excel (.xlsx)",
    icon: FileSpreadsheet,
    group: "Formats logiciels",
  },
  {
    type: "ecritures-csv",
    title: "Écritures comptables (CSV)",
    desc: "Les 18 colonnes FEC au format CSV pour import logiciel.",
    format: "CSV (.csv)",
    icon: FileText,
    group: "Formats logiciels",
  },
  {
    type: "ventes-csv",
    title: "Journal des ventes (CSV)",
    desc: "Import dans logiciel comptable générique (décimales virgule, séparateur point-virgule).",
    format: "CSV (.csv)",
    icon: FileText,
    group: "Formats logiciels",
  },
];

const GROUP_ORDER = [
  "Tout-en-un",
  "Journaux & états",
  "TVA",
  "Contrôles",
  "Formats logiciels",
];

export default function ExportsPage() {
  const [periode, setPeriode] = usePeriode();
  const qs = `dateDebut=${periode.dateDebut}&dateFin=${periode.dateFin}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-glowup-licorice">
          Centre d&apos;export comptable
        </h1>
        <p className="text-sm text-gray-500">
          Tous les fichiers normalisés à transmettre à votre expert-comptable ·{" "}
          {periode.label}
        </p>
      </div>

      <PeriodeBar periode={periode} onChange={setPeriode} />

      {GROUP_ORDER.map((group) => {
        const items = EXPORTS.filter((e) => e.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {group}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.type}
                    href={`/api/comptable/export?type=${item.type}&${qs}`}
                    className={`group flex flex-col rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                      item.highlight
                        ? "border-glowup-rose/40 ring-1 ring-glowup-rose/10"
                        : "border-gray-200 hover:border-glowup-rose"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-lg p-2.5 ${
                          item.highlight ? "bg-glowup-rose/10" : "bg-gray-100"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            item.highlight ? "text-glowup-rose" : "text-gray-600"
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-glowup-licorice">
                            {item.title}
                          </p>
                          {item.highlight && (
                            <span className="rounded-full bg-glowup-rose px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              Recommandé
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        {item.format}
                      </span>
                      <span className="text-sm font-medium text-glowup-rose group-hover:underline">
                        Télécharger
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="rounded-xl border border-gray-200 bg-glowup-lace/40 p-5 text-sm text-gray-600">
        <p className="font-semibold text-glowup-licorice">À propos des écritures</p>
        <p className="mt-1">
          Les écritures sont générées en partie double à partir des factures/avoirs
          validés et des encaissements bancaires. Plan comptable utilisé : 411
          (clients), 706 (prestations de services), 44571 (TVA collectée), 512
          (banque), 471 (compte d&apos;attente pour les encaissements non
          rapprochés).
        </p>
      </div>
    </div>
  );
}
