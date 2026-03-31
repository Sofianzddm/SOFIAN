import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canAnnotateContratMarque, canReadContratMarqueReview } from "@/lib/contratMarqueAccess";
import { annotationsForClient, commentairesForCurrentVersionOnly } from "@/lib/serializeContratMarqueReview";
import { buildContratMarqueVersionsForClient } from "@/lib/contratMarqueVersions";
import ContratMarqueReviewClient from "@/components/contrat-marque/ContratMarqueReviewClient";

export default async function ContratMarqueReviewPage({
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
    redirect(`/collaborations/${id}`);
  }

  if (!canReadContratMarqueReview(user.id, user.role, collaboration)) {
    redirect(`/collaborations/${id}`);
  }

  const isTm = user.role === "TM" && collaboration.talent.managerId === user.id;
  const readOnly = isTm;
  const canAnnot = canAnnotateContratMarque(user.role) && !readOnly;

  const serialized = JSON.parse(JSON.stringify(collaboration)) as typeof collaboration;
  const versions = buildContratMarqueVersionsForClient(collaboration);
  const initialAnnotations =
    versions.length > 0
      ? versions[versions.length - 1].annotations
      : annotationsForClient(collaboration.contratMarqueAnnotations);
  const commentaires = commentairesForCurrentVersionOnly(collaboration);

  const currentUser = {
    id: user.id,
    nom: user.name ?? "Utilisateur",
    role: user.role,
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ContratMarqueReviewClient
        pdfUrl={collaboration.contratMarquePdfUrl}
        collaborationId={collaboration.id}
        collaboration={serialized}
        currentUser={currentUser}
        canAnnotate={canAnnot}
        readOnly={readOnly}
        initialAnnotations={initialAnnotations}
        initialCommentaires={commentaires}
        versions={versions}
        showBackToCollab
      />
    </div>
  );
}
