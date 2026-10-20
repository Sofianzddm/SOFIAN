import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ContratMarqueSignatureBuilder from "@/components/contrat-marque/ContratMarqueSignatureBuilder";

export default async function CollabContratMarqueBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as { role?: string }).role;
  if (!role || !["ADMIN", "JURISTE", "HEAD_OF_INFLUENCE"].includes(role)) {
    redirect(`/collaborations/${id}/contrat-marque`);
  }

  return <ContratMarqueSignatureBuilder collaborationId={id} />;
}
