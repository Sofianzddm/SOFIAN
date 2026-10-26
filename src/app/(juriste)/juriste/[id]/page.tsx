import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  annotationsForClient,
  commentairesForCurrentVersionOnly,
  livrablesForClient,
} from "@/lib/serializeContratMarqueReview";
import { buildContratMarqueVersionsForClient } from "@/lib/contratMarqueVersions";
import { resolveContratMarqueClientContact } from "@/lib/contratMarqueClientContact";
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
      talent: {
        include: {
          manager: { select: { prenom: true, nom: true } },
          delegations: {
            where: { actif: true },
            select: {
              tmRelaiId: true,
              actif: true,
              tmRelai: { select: { prenom: true, nom: true } },
            },
          },
        },
      },
      marque: {
        include: {
          contacts: {
            orderBy: [{ principal: "desc" }, { nom: "asc" }],
            select: {
              prenom: true,
              nom: true,
              email: true,
              telephone: true,
              poste: true,
              principal: true,
            },
          },
        },
      },
      negociation: {
        select: { contactMarque: true, emailContact: true },
      },
      livrables: { orderBy: { createdAt: "asc" } },
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
  const juristeCanAnnotate = ["EN_ATTENTE_JURISTE", "A_MODIFIER"].includes(st);

  const serialized = JSON.parse(JSON.stringify(collaboration)) as typeof collaboration;
  const versions = buildContratMarqueVersionsForClient(collaboration);
  const initialAnnotations =
    versions.length > 0
      ? versions[versions.length - 1].annotations
      : annotationsForClient(collaboration.contratMarqueAnnotations);
  const commentaires = commentairesForCurrentVersionOnly(collaboration);
  const livrables = livrablesForClient(collaboration.livrables);
  const clientContact = resolveContratMarqueClientContact({
    collaboration,
    negociation: collaboration.negociation,
    marqueContacts: collaboration.marque.contacts,
  });

  const contactSuggestions = [
    ...(collaboration.negociation?.emailContact?.trim()
      ? [
          {
            nom:
              collaboration.negociation.contactMarque?.trim() ||
              collaboration.negociation.emailContact.trim(),
            email: collaboration.negociation.emailContact.trim(),
            telephone: null as string | null,
            sourceLabel: "Négociation",
          },
        ]
      : []),
    ...collaboration.marque.contacts
      .filter((c) => c.email?.trim())
      .map((c) => ({
        nom: [c.prenom?.trim(), c.nom.trim()].filter(Boolean).join(" ") || c.email!.trim(),
        email: c.email!.trim(),
        telephone: c.telephone,
        sourceLabel: c.principal ? "Fiche marque (principal)" : "Fiche marque",
      })),
  ];

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
      canAnnotate={juristeCanAnnotate}
      readOnly={!juristeCanAnnotate}
      initialAnnotations={initialAnnotations}
      initialCommentaires={commentaires}
      livrables={livrables}
      versions={versions}
      clientContact={clientContact}
      contactSuggestions={contactSuggestions}
      isJuristeContext
    />
  );
}
