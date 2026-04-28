import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ContratMarqueApprouveEmail } from "@/lib/emails/ContratMarqueApprouveEmail";

const DOCUSEAL_SUBMISSIONS = "https://api.docuseal.com/submissions";

type StatutPayload = {
  statut?: "APPROUVE" | "A_MODIFIER" | "SIGNE";
  mode?: "DOCUSEAL" | "EXTERNE";
  versionId?: string;
};

function baseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr").replace(/\/$/, "");
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
    const isAdmin = role === "ADMIN";
    const isJuriste = role === "JURISTE";
    const isHoI = role === "HEAD_OF_INFLUENCE";

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as StatutPayload;
    const statut = body.statut;
    if (!statut || !["APPROUVE", "A_MODIFIER", "SIGNE"].includes(statut)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }

    const juristeCanLaunchDocuseal = isJuriste && body.mode === "DOCUSEAL";
    if (statut === "SIGNE" && !isAdmin && !isHoI && !juristeCanLaunchDocuseal) {
      return NextResponse.json(
        { error: "Seuls ADMIN/HEAD_OF_INFLUENCE peuvent signer en externe ; la juriste peut lancer DocuSeal." },
        { status: 403 }
      );
    }

    if ((statut === "APPROUVE" || statut === "A_MODIFIER") && !isAdmin && !isJuriste && !isHoI) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    if (isJuriste && statut === "A_MODIFIER") {
      const collabCheck = await prisma.collaboration.findUnique({
        where: { id },
        select: { contratMarqueVersionActuelle: true },
      });
      const currentVer = collabCheck?.contratMarqueVersionActuelle
        ? await prisma.contratMarqueVersion.findFirst({
            where: { collaborationId: id, numero: collabCheck.contratMarqueVersionActuelle },
          })
        : null;
      const whereAnnot: {
        collaborationId: string;
        OR?: ({ versionId: string | null } | { versionId: string })[];
        versionId?: string;
      } = { collaborationId: id };
      if (currentVer) {
        if (currentVer.numero === 1) {
          whereAnnot.OR = [{ versionId: currentVer.id }, { versionId: null }];
        } else {
          whereAnnot.versionId = currentVer.id;
        }
      }
      const n = await prisma.contratMarqueAnnotation.count({ where: whereAnnot });
      if (n === 0) {
        return NextResponse.json(
          { error: "Ajoutez au moins une annotation avant de demander des modifications." },
          { status: 400 }
        );
      }
    }

    let docusealSubmissionId: string | undefined;
    if (statut === "SIGNE" && body.mode === "DOCUSEAL") {
      const templateIdRaw = process.env.DOCUSEAL_CONTRAT_TALENT_TEMPLATE_ID?.trim();
      const templateId = templateIdRaw ? parseInt(templateIdRaw, 10) : NaN;
      const docusealKey = process.env.DOCUSEAL_API_KEY?.trim();
      const agenceEmail = process.env.AGENCE_SIGNATURE_EMAIL?.trim();
      if (!Number.isInteger(templateId) || !docusealKey || !agenceEmail) {
        return NextResponse.json(
          { error: "Configuration DocuSeal incomplète (template/apiKey/agenceEmail)" },
          { status: 503 }
        );
      }

      const collabDs = await prisma.collaboration.findUnique({
        where: { id },
        include: {
          talent: {
            select: {
              prenom: true,
              nom: true,
              raisonSociale: true,
              siret: true,
              adresse: true,
              codePostal: true,
              ville: true,
              pays: true,
            },
          },
          marque: { select: { nom: true } },
          livrables: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!collabDs) {
        return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
      }

      const talentNom = `${collabDs.talent.prenom} ${collabDs.talent.nom}`.trim();
      const values = {
        talent_nom: talentNom,
        societe_nom: collabDs.talent.raisonSociale ?? "",
        siret: collabDs.talent.siret ?? "",
        adresse_talent: [collabDs.talent.adresse, collabDs.talent.codePostal, collabDs.talent.ville, collabDs.talent.pays]
          .filter(Boolean)
          .join(", "),
        marque: collabDs.marque.nom,
        livrables: collabDs.livrables
          .map((l) => `${l.quantite}× ${l.typeContenu}${l.description ? ` — ${l.description}` : ""}`)
          .join("\n"),
        montant_net_talent: collabDs.montantNet.toString(),
      };

      const docusealRes = await fetch(DOCUSEAL_SUBMISSIONS, {
        method: "POST",
        headers: {
          "X-Auth-Token": docusealKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: templateId,
          send_email: false,
          submitters: [
            {
              email: agenceEmail,
              role: "Agence",
              name: "Sofian Ayad-Zeddam",
              order: 1,
              readonly: true,
              values,
            },
          ],
        }),
      });
      if (!docusealRes.ok) {
        const err = await docusealRes.text();
        return NextResponse.json({ error: `DocuSeal: ${err || docusealRes.statusText}` }, { status: 502 });
      }
      const d = await docusealRes.json();
      const first = Array.isArray(d) ? d[0] : null;
      docusealSubmissionId =
        first?.submission_id != null ? String(first.submission_id) : undefined;
      if (!docusealSubmissionId) {
        return NextResponse.json({ error: "Réponse DocuSeal invalide" }, { status: 502 });
      }
    }

    const data: {
      contratMarqueStatut: string;
      contratMarqueApprouveAt?: Date;
      contratMarqueSigneAt?: Date;
      contratMarqueMode?: string;
      contratSubmissionId?: string;
    } = { contratMarqueStatut: statut };
    if (statut === "APPROUVE") {
      data.contratMarqueApprouveAt = new Date();
    }
    if (statut === "SIGNE") {
      data.contratMarqueSigneAt = new Date();
      data.contratMarqueMode = body.mode ?? "EXTERNE";
      if (docusealSubmissionId) data.contratSubmissionId = docusealSubmissionId;
    }

    const collabBefore = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true, managerId: true } },
        marque: { select: { nom: true } },
      },
    });
    if (!collabBefore) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    if (body.versionId) {
      const ver = await prisma.contratMarqueVersion.findFirst({
        where: { id: body.versionId, collaborationId: id },
      });
      if (!ver) {
        return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
      }
      await prisma.contratMarqueVersion.update({
        where: { id: body.versionId },
        data: {
          statut,
          ...(statut === "APPROUVE" ? { approuveAt: new Date() } : {}),
          ...(statut === "A_MODIFIER" ? { modifDemandeAt: new Date() } : {}),
        },
      });
    }

    await prisma.collaboration.update({
      where: { id },
      data,
    });

    const label = `${collabBefore.talent.prenom} ${collabBefore.talent.nom} x ${collabBefore.marque.nom}`;
    const reviewPath = `/collaborations/${id}/contrat-marque`;

    if (statut === "APPROUVE") {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN", actif: true },
        select: { id: true, email: true },
      });
      const notifs = admins.map((a) =>
        prisma.notification.create({
          data: {
            userId: a.id,
            type: "CONTRAT_MARQUE_APPROUVE",
            titre: "✅ Contrat approuvé — signature requise",
            message: `${label} — Contrat approuvé par le juriste, signature requise.`,
            lien: reviewPath,
            collabId: id,
          },
        })
      );
      await Promise.all(notifs);

      const resendKey = process.env.RESEND_API_KEY?.trim();
      if (resendKey) {
        const resend = new Resend(resendKey);
        const reviewUrl = `${baseUrl()}${reviewPath}`;
        const html = await render(
          React.createElement(ContratMarqueApprouveEmail, {
            talentMarqueLabel: label,
            reviewUrl,
          })
        );
        await Promise.all(
          admins
            .filter((a) => a.email)
            .map((a) =>
              resend.emails.send({
                from: "Glow Up <contrat@glowupagence.fr>",
                to: a.email!,
                subject: `✅ Contrat approuvé — ${label}`,
                html,
              })
            )
        );
      }
    }

    if (statut === "A_MODIFIER") {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN", actif: true },
        select: { id: true },
      });
      const tmId = collabBefore.talent.managerId;
      const recipients = new Map<string, string>();
      admins.forEach((a) => recipients.set(a.id, a.id));
      if (tmId) recipients.set(tmId, tmId);

      const notifs = [...recipients.keys()].map((userId) =>
        prisma.notification.create({
          data: {
            userId,
            type: "CONTRAT_MARQUE_MODIFICATIONS",
            titre: "⚠️ Modifications demandées sur le contrat marque",
            message: `${label} — Le juriste demande des modifications.`,
            lien: reviewPath,
            collabId: id,
          },
        })
      );
      await Promise.all(notifs);
    }

    return NextResponse.json({ success: true, submissionId: docusealSubmissionId ?? null });
  } catch (error) {
    console.error("POST contrat-marque/statut:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour du statut" }, { status: 500 });
  }
}
