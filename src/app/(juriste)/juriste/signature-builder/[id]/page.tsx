import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ContratMarqueSignatureBuilder from "@/components/contrat-marque/ContratMarqueSignatureBuilder";

export default async function JuristeSignatureBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "JURISTE") {
    redirect("/dashboard");
  }

  return <ContratMarqueSignatureBuilder collaborationId={id} />;
}
