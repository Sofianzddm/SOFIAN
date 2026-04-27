import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export default async function JuristeListePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if ((session.user as { role?: string }).role !== "JURISTE") {
    redirect("/dashboard");
  }

  const collabs = await prisma.collaboration.findMany({
    where: {
      contratMarquePdfUrl: { not: null },
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      talent: { select: { prenom: true, nom: true } },
      marque: { select: { nom: true } },
      _count: { select: { contratMarqueAnnotations: true } },
    },
  });

  const aRelire = collabs.filter((c) =>
    ["EN_ATTENTE_JURISTE", "A_MODIFIER"].includes(c.contratMarqueStatut ?? "")
  );
  const aSigner = collabs.filter((c) => c.contratMarqueStatut === "APPROUVE");
  const signesSansDepot = collabs.filter(
    (c) => c.contratMarqueStatut === "SIGNE" && !c.contratMarquePdfOfficielSigneDeposeAt
  );
  const archive = collabs.filter(
    (c) =>
      !["EN_ATTENTE_JURISTE", "A_MODIFIER", "APPROUVE"].includes(c.contratMarqueStatut ?? "") &&
      !(c.contratMarqueStatut === "SIGNE" && !c.contratMarquePdfOfficielSigneDeposeAt)
  );

  function renderList(items: typeof collabs, emptyLabel: string) {
    if (items.length === 0) {
      return <p className="text-sm text-gray-500">{emptyLabel}</p>;
    }
    return (
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/juriste/${c.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-[#1A1110]">
                  {c.talent.prenom} {c.talent.nom} × {c.marque.nom}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Statut: {c.contratMarqueStatut ?? "AUCUN"} · {c._count.contratMarqueAnnotations} annotation(s)
                </p>
              </div>
              <span className="text-sm font-medium text-[#1A1110] shrink-0">Ouvrir →</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[#1A1110]">Dashboard juriste</h1>
        <p className="text-sm text-gray-500 mt-1">Acces a tous les contrats + suivi signature et depot des PDF signes.</p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">A relire</p>
          <p className="text-xl font-semibold text-[#1A1110]">{aRelire.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">A lancer en signature</p>
          <p className="text-xl font-semibold text-[#1A1110]">{aSigner.length}</p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-xs text-amber-900">Signes sans PDF final</p>
          <p className="text-xl font-semibold text-amber-950">{signesSansDepot.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Total contrats</p>
          <p className="text-xl font-semibold text-[#1A1110]">{collabs.length}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#1A1110]">A relire en priorite</h2>
        {renderList(aRelire, "Aucun contrat a relire.")}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#1A1110]">A envoyer en signature</h2>
        {renderList(aSigner, "Aucun contrat en attente de lancement signature.")}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#1A1110]">Signes - PDF final manquant</h2>
        {renderList(signesSansDepot, "Aucun contrat signe sans depot PDF final.")}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#1A1110]">Historique</h2>
        {renderList(archive, "Aucun autre contrat pour le moment.")}
      </section>
    </div>
  );
}
