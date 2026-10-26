// POST — Crée un template DocuSeal vide depuis le PDF contrat marque → builder
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  validateSignatairesInput,
  type ContratSignataire,
} from "@/lib/collab-contrat-upload";
import { getAgenceSignatureEmail } from "@/lib/agence-signature";
import {
  hasStoredContratMarqueClientContact,
  parseContratMarqueContactInput,
  resolveContratMarqueClientContact,
} from "@/lib/contratMarqueClientContact";

const DOCUSEAL_TEMPLATES_PDF = "https://api.docuseal.com/templates/pdf";

function canPrepare(role: string): boolean {
  return ["ADMIN", "JURISTE", "HEAD_OF_INFLUENCE"].includes(role);
}

function defaultSignataires(collab: {
  contratMarqueContactNom: string | null;
  contratMarqueContactEmail: string | null;
}): ContratSignataire[] {
  const out: ContratSignataire[] = [];
  const clientEmail = collab.contratMarqueContactEmail?.trim();
  const clientNom = collab.contratMarqueContactNom?.trim();
  if (clientEmail) {
    out.push({
      name: clientNom || clientEmail.split("@")[0] || "Client",
      email: clientEmail,
      role: "Signataire 1",
    });
  }
  out.push({
    name: "Glow Up Agence",
    email: getAgenceSignatureEmail(),
    role: `Signataire ${out.length + 1}`,
  });
  return out;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role as string;
    if (!canPrepare(role)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      signataires?: unknown;
      forceNewTemplate?: boolean;
      contact?: {
        nom?: string | null;
        email?: string | null;
        telephone?: string | null;
      };
    };

    const collab = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: {
          select: {
            nom: true,
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
      },
    });
    if (!collab) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }
    if (collab.contratMarqueStatut !== "APPROUVE") {
      return NextResponse.json(
        { error: "Le contrat doit être approuvé avant la préparation de signature." },
        { status: 400 }
      );
    }
    if (!collab.contratMarquePdfUrl?.trim()) {
      return NextResponse.json({ error: "Aucun PDF contrat marque disponible." }, { status: 400 });
    }

    let contactNom = collab.contratMarqueContactNom;
    let contactEmail = collab.contratMarqueContactEmail;
    let contactTelephone = collab.contratMarqueContactTelephone;
    let contactPersisted = false;

    if (body.contact) {
      const parsed = parseContratMarqueContactInput(body.contact);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      contactNom = parsed.value.nom;
      contactEmail = parsed.value.email;
      contactTelephone = parsed.value.telephone;
      contactPersisted = true;
    } else if (!hasStoredContratMarqueClientContact(collab)) {
      // Fallback : contact négo / fiche marque (même logique que l’UI juriste)
      const resolved = resolveContratMarqueClientContact({
        collaboration: collab,
        negociation: collab.negociation,
        marqueContacts: collab.marque.contacts,
      });
      const parsed = parseContratMarqueContactInput({
        nom: resolved?.nom,
        email: resolved?.email,
        telephone: resolved?.telephone,
      });
      if (!parsed.ok) {
        return NextResponse.json(
          {
            error:
              "Contact client manquant — indiquez le nom et l’email du destinataire avant d’envoyer en signature.",
          },
          { status: 400 }
        );
      }
      contactNom = parsed.value.nom;
      contactEmail = parsed.value.email;
      contactTelephone = parsed.value.telephone;
      contactPersisted = true;
    }

    const collabForSigners = {
      contratMarqueContactNom: contactNom,
      contratMarqueContactEmail: contactEmail,
    };

    let signataires: ContratSignataire[];
    if (body.signataires !== undefined) {
      const validated = validateSignatairesInput(body.signataires);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      signataires = validated.signataires;
    } else {
      const validated = validateSignatairesInput(defaultSignataires(collabForSigners));
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      signataires = validated.signataires;
    }

    const docusealKey = process.env.DOCUSEAL_API_KEY?.trim();
    if (!docusealKey) {
      return NextResponse.json({ error: "DocuSeal n'est pas configuré" }, { status: 503 });
    }

    let templateId = collab.contratMarqueDocusealTemplateId ?? null;
    const needNewTemplate =
      body.forceNewTemplate === true || templateId == null;

    if (needNewTemplate) {
      const pdfRes = await fetch(collab.contratMarquePdfUrl);
      if (!pdfRes.ok) {
        return NextResponse.json(
          { error: "Impossible de récupérer le PDF contrat pour DocuSeal." },
          { status: 502 }
        );
      }
      const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
      const titre = `Contrat marque ${collab.reference} — ${collab.talent.prenom} ${collab.talent.nom} x ${collab.marque.nom}`;

      const templateRes = await fetch(DOCUSEAL_TEMPLATES_PDF, {
        method: "POST",
        headers: {
          "X-Auth-Token": docusealKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: titre,
          documents: [
            {
              name: "contrat-marque",
              file: pdfBuffer.toString("base64"),
              fields: [],
            },
          ],
        }),
      });
      if (!templateRes.ok) {
        const errText = await templateRes.text();
        console.error("DocuSeal templates/pdf (contrat marque):", templateRes.status, errText);
        return NextResponse.json(
          { error: `Erreur DocuSeal (template): ${errText || templateRes.statusText}` },
          { status: 502 }
        );
      }
      const templateData = (await templateRes.json()) as { id?: number };
      if (templateData.id == null) {
        return NextResponse.json({ error: "Réponse DocuSeal invalide" }, { status: 502 });
      }
      templateId = Number(templateData.id);
    }

    await prisma.collaboration.update({
      where: { id },
      data: {
        contratMarqueDocusealTemplateId: templateId,
        contratMarqueSignataires: signataires,
        contratMarqueSubmissionId: null,
        contratMarqueMode: null,
        contratMarqueSigneAt: null,
        ...(contactPersisted
          ? {
              contratMarqueContactNom: contactNom,
              contratMarqueContactEmail: contactEmail,
              contratMarqueContactTelephone: contactTelephone,
            }
          : {}),
      },
    });

    return NextResponse.json({
      success: true,
      templateId,
      signatairesCount: signataires.length,
      builderPath:
        role === "JURISTE"
          ? `/juriste/signature-builder/${id}`
          : `/collaborations/${id}/contrat-marque/builder`,
    });
  } catch (error) {
    console.error("POST contrat-marque/prepare-signature:", error);
    return NextResponse.json(
      { error: "Erreur lors de la préparation de la signature" },
      { status: 500 }
    );
  }
}
