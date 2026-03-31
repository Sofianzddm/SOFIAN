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
    where: { contratMarqueStatut: "EN_ATTENTE_JURISTE" },
    orderBy: { contratMarqueEnvoyeJuristeAt: "desc" },
    include: {
      talent: { select: { prenom: true, nom: true } },
      marque: { select: { nom: true } },
      _count: { select: { contratMarqueAnnotations: true } },
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-[#1A1110] mb-6">Contrats en attente de relecture</h1>
      {collabs.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun contrat en attente.</p>
      ) : (
        <ul className="space-y-3">
          {collabs.map((c) => (
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
                    Envoyé le{" "}
                    {c.contratMarqueEnvoyeJuristeAt
                      ? new Date(c.contratMarqueEnvoyeJuristeAt).toLocaleDateString("fr-FR")
                      : "—"}{" "}
                    · {c._count.contratMarqueAnnotations} annotation(s)
                  </p>
                </div>
                <span className="text-sm font-medium text-[#1A1110] shrink-0">Annoter →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
