import { Calendar, FileText, Handshake, Clock3 } from "lucide-react";
import Link from "next/link";
import { getTalentDemoPublishedCollaborations } from "@/lib/talent-demo";

type DemoCollab = {
  id: string;
  marque: string;
  reference: string;
  montant: number;
  statut: string;
  datePublication?: string;
  factureTalentUrl?: string | null;
  factureTalentRecueAt?: string | null;
  paidAt?: string | null;
  createdAt?: string;
};

type DemoFacture = {
  id: string;
  marque: string;
  reference: string;
  montant: number;
  statut: string;
  dateEmission?: string;
};

function monthKey(dateLike?: string): string {
  const d = new Date(dateLike || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function buildFacturesFromCollabs(collabs: DemoCollab[]): DemoFacture[] {
  return collabs.map((c) => ({
    id: c.id,
    marque: c.marque,
    reference: `Facture ${c.marque}`,
    montant: c.montant,
    statut: c.paidAt ? "PAYE" : c.factureTalentUrl ? "FACTURE_RECUE" : "EN_ATTENTE",
    dateEmission: c.factureTalentRecueAt || c.createdAt || c.datePublication,
  }));
}

export default function TalentDemoInPortalPage() {
  const collabs = getTalentDemoPublishedCollaborations() as unknown as DemoCollab[];
  const factures = buildFacturesFromCollabs(collabs);
  const facturesEnAttente = collabs.filter((c) => !c.factureTalentUrl).length;

  const collabsByMonth = collabs.reduce<Record<string, DemoCollab[]>>((acc, c) => {
    const k = monthKey(c.datePublication);
    if (!acc[k]) acc[k] = [];
    acc[k].push(c);
    return acc;
  }, {});

  const facturesByMonth = factures.reduce<Record<string, DemoFacture[]>>((acc, f) => {
    const k = monthKey(f.dateEmission);
    if (!acc[k]) acc[k] = [];
    acc[k].push(f);
    return acc;
  }, {});

  const collabMonths = Object.keys(collabsByMonth).sort((a, b) => b.localeCompare(a));
  const factureMonths = Object.keys(facturesByMonth).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Espace Talent - Demo
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Vue opérationnelle centrée sur les collaborations publiées et le suivi facture.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              Mode démonstration
            </span>
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              /talent/demo
            </span>
          </div>
        </div>
      </div>

      <nav className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <Link href="/talent/dashboard?demo=1" className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">Dashboard</Link>
          <Link href="/talent/collaborations?demo=1" className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">Collaborations publiees</Link>
          <Link href="/talent/factures?demo=1" className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">Factures</Link>
        </div>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Collaborations publiées</p>
            <Handshake className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-semibold text-slate-900 mt-2">{collabs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Factures totales</p>
            <FileText className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-semibold text-slate-900 mt-2">{factures.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">En attente</p>
            <Clock3 className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-semibold text-slate-900 mt-2">{facturesEnAttente}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Collaborations publiées</h2>
          </div>
          <div className="space-y-4">
            {collabMonths.map((mk) => (
              <div key={mk}>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">{monthLabel(mk)}</p>
                <div className="space-y-2">
                  {collabsByMonth[mk].map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{c.marque}</p>
                          <p className="text-xs text-slate-500">{c.reference}</p>
                        </div>
                        <span className="text-xs rounded-full px-2 py-1 bg-indigo-50 text-indigo-700">
                          {c.statut}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-2 font-medium">
                        {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(c.montant)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-900">Factures</h2>
          </div>
          <div className="space-y-4">
            {factureMonths.map((mk) => (
              <div key={mk}>
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">{monthLabel(mk)}</p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Marque</th>
                        <th className="text-right px-3 py-2 font-medium">Montant</th>
                        <th className="text-right px-3 py-2 font-medium">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {facturesByMonth[mk].map((f) => (
                        <tr key={f.id}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-900">{f.marque}</p>
                            <p className="text-xs text-slate-500">{f.reference}</p>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">
                            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                              f.montant
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-1 ${
                              f.statut === "PAYE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                            }`}>
                              {f.statut}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 flex items-center gap-2">
        <Calendar className="w-4 h-4" />
        Vue statique de démo rendue serveur (affichage garanti).
      </div>
    </div>
  );
}
