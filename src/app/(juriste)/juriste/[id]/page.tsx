import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { annotationsForClient, commentairesForCurrentVersionOnly } from "@/lib/serializeContratMarqueReview";
import { buildContratMarqueVersionsForClient } from "@/lib/contratMarqueVersions";
import ContratMarqueReviewClient from "@/components/contrat-marque/ContratMarqueReviewClient";

export default async function JuristeContratPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const user = session.user as { id: string; role: string; name?: string | null };
  if (user.role !== "JURISTE") {
    redirect("/dashboard");
  }

  const collaboration = await prisma.collaboration.findUnique({
    where: { id },
    include: {
      talent: true,
      marque: true,
      contratMarqueAnnotations: { orderBy: { createdAt: "asc" } },
      contratMarqueCommentaires: { orderBy: { createdAt: "asc" } },
      contratMarqueVersions: {
        orderBy: { numero: "asc" },
        include: { annotations: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!collaboration?.contratMarquePdfUrl) {
    redirect("/juriste");
  }

  const st = collaboration.contratMarqueStatut ?? "AUCUN";
  if (!["EN_ATTENTE_JURISTE", "A_MODIFIER"].includes(st)) {
    redirect("/juriste");
  }

  const serialized = JSON.parse(JSON.stringify(collaboration)) as typeof collaboration;
  const versions = buildContratMarqueVersionsForClient(collaboration);
  const initialAnnotations =
    versions.length > 0
      ? versions[versions.length - 1].annotations
      : annotationsForClient(collaboration.contratMarqueAnnotations);
  const commentaires = commentairesForCurrentVersionOnly(collaboration);

  const currentUser = {
    id: user.id,
    nom: user.name ?? "Juriste",
    role: user.role,
  };

  return (
    <ContratMarqueReviewClient
      pdfUrl={collaboration.contratMarquePdfUrl}
      collaborationId={collaboration.id}
      collaboration={serialized}
      currentUser={currentUser}
      canAnnotate
      readOnly={false}
      initialAnnotations={initialAnnotations}
      initialCommentaires={commentaires}
      versions={versions}
      isJuristeContext
    />
  );
}
