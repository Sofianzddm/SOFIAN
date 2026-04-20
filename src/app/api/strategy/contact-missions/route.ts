import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { normalizeMissionBrandKey, parseMissionPriority } from "@/lib/contact-missions";

const ALLOWED_ROLES = [
  "STRATEGY_PLANNER",
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "HEAD_OF",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
const campaignModel = (prisma as unknown as { talentProspectingCampaign: any }).talentProspectingCampaign;
const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const ADMIN_CONTACT_EMAIL = "S.zeddam@glowupagence.fr";

const VALID_STAGES = [
  "STRATEGY_DEFINED",
  "TO_DRAFT",
  "DRAFTED_FOR_VALIDATION",
  "TO_SEND",
  "SENT",
  "RESPONSE_RECEIVED",
  "IN_NEGOTIATION",
  "WON",
  "LOST",
] as const;

function isValidStage(v: string): v is (typeof VALID_STAGES)[number] {
  return (VALID_STAGES as readonly string[]).includes(v);
}

async function hasHubspotContactForBrand(brandName: string): Promise<boolean> {
  const brand = String(brandName || "").trim();
  if (!brand) return false;
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) return false;
  const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "company",
              operator: "CONTAINS_TOKEN",
              value: brand,
            },
          ],
        },
      ],
      properties: ["email"],
      limit: 1,
    }),
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { total?: number; results?: unknown[] };
  if (typeof data.total === "number") return data.total > 0;
  return Array.isArray(data.results) && data.results.length > 0;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const brandsParam = request.nextUrl.searchParams.get("brands");
    if (!brandsParam) {
      const campaignId = String(request.nextUrl.searchParams.get("campaignId") || "").trim() || null;
      const talentId = String(request.nextUrl.searchParams.get("talentId") || "").trim() || null;
      const mineParam = String(request.nextUrl.searchParams.get("mine") || "").trim().toLowerCase();
      const stageParam = String(request.nextUrl.searchParams.get("stage") || "").trim().toUpperCase();
      const mineOnly = mineParam === "1" || mineParam === "true";

      const where: Record<string, unknown> = {};
      if (campaignId) where.campaignId = campaignId;
      if (talentId) where.talentId = talentId;
      if (isValidStage(stageParam)) where.stage = stageParam;
      if (mineOnly && session.user.role === "STRATEGY_PLANNER") {
        where.campaign = { createdById: session.user.id };
      }

      const missions = await contactMissionModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          talent: { select: { id: true, prenom: true, nom: true } },
          campaign: { select: { id: true, title: true, createdById: true, isActive: true } },
        },
        take: 200,
      });
      return NextResponse.json({
        missions: missions.map((m: any) => ({
          id: m.id,
          campaignId: m.campaignId,
          campaignTitle: m.campaign?.title ?? null,
          talentId: m.talentId,
          talentName: m.talent ? `${m.talent.prenom} ${m.talent.nom}`.trim() : null,
          creatorName: m.creatorName,
          targetBrand: m.targetBrand,
          strategyReason: m.strategyReason,
          recommendedAngle: m.recommendedAngle,
          objective: m.objective,
          dos: m.dos,
          donts: m.donts,
          priority: m.priority,
          status: m.status,
          stage: m.stage,
          draftEmailSubject: m.draftEmailSubject ?? null,
          draftEmailBody: m.draftEmailBody ?? null,
          clientLanguage: m.clientLanguage ?? null,
          clientContacts: m.clientContacts ?? null,
          deadlineAt: m.deadlineAt,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
      });
    }
    const brandKeys = brandsParam.split(",").map((v) => normalizeMissionBrandKey(v)).filter(Boolean);
    if (brandKeys.length === 0) return NextResponse.json({ missionsByBrand: {} });

    const missions = await contactMissionModel.findMany({
      where: {
        targetBrandKey: { in: brandKeys },
        status: { in: ["READY_FOR_CASTING", "EMAIL_DRAFTED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        talent: { select: { id: true, prenom: true, nom: true } },
        campaign: { select: { id: true, title: true } },
      },
      take: 300,
    });

    const byBrand: Record<string, unknown> = {};
    for (const key of brandKeys) {
      const m = missions.find((mission: any) => mission.targetBrandKey === key);
      if (!m) continue;
      byBrand[key] = {
        id: m.id,
        campaignId: m.campaignId,
        campaignTitle: m.campaign?.title ?? null,
        talentId: m.talentId,
        talentName: m.talent ? `${m.talent.prenom} ${m.talent.nom}`.trim() : null,
        creatorName: m.creatorName,
        targetBrand: m.targetBrand,
        strategyReason: m.strategyReason,
        recommendedAngle: m.recommendedAngle,
        objective: m.objective,
        dos: m.dos,
        donts: m.donts,
        priority: m.priority,
        status: m.status,
        stage: m.stage,
        draftEmailSubject: m.draftEmailSubject ?? null,
        draftEmailBody: m.draftEmailBody ?? null,
        clientLanguage: m.clientLanguage ?? null,
        clientContacts: m.clientContacts ?? null,
        deadlineAt: m.deadlineAt,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    }

    return NextResponse.json({ missionsByBrand: byBrand });
  } catch (error) {
    console.error("GET /api/strategy/contact-missions:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des missions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      talentId?: string | null;
      campaignId?: string | null;
      creatorName?: string;
      targetBrand?: string;
      strategyReason?: string;
      recommendedAngle?: string | null;
      objective?: string | null;
      dos?: string | null;
      donts?: string | null;
      priority?: unknown;
      deadlineAt?: string | null;
    };

    const talentId = String(body.talentId || "").trim() || null;
    const campaignId = String(body.campaignId || "").trim() || null;
    let creatorName = String(body.creatorName || "").trim();
    if (talentId) {
      const talent = await prisma.talent.findUnique({
        where: { id: talentId },
        select: { prenom: true, nom: true },
      });
      if (!talent) return NextResponse.json({ error: "Talent introuvable." }, { status: 404 });
      creatorName = `${talent.prenom} ${talent.nom}`.trim();
    }

    const targetBrand = String(body.targetBrand || "").trim();
    const strategyReason = String(body.strategyReason || "").trim();
    if (!creatorName || !targetBrand || !strategyReason) {
      return NextResponse.json(
        { error: "creatorName, targetBrand et strategyReason sont requis." },
        { status: 400 }
      );
    }

    if (campaignId) {
      const campaign = await campaignModel.findUnique({
        where: { id: campaignId },
        select: { id: true },
      });
      if (!campaign) {
        return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
      }
    }

    const mission = await contactMissionModel.create({
      data: {
        campaignId,
        talentId,
        creatorName,
        targetBrand,
        targetBrandKey: normalizeMissionBrandKey(targetBrand),
        strategyReason,
        recommendedAngle: String(body.recommendedAngle || "").trim() || null,
        objective: String(body.objective || "").trim() || null,
        dos: String(body.dos || "").trim() || null,
        donts: String(body.donts || "").trim() || null,
        priority: parseMissionPriority(body.priority),
        // Règle métier: dès que la stratégie est créée, la carte passe immédiatement en "À rédiger".
        stage: "TO_DRAFT",
        deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : null,
        createdById: session.user.id,
      },
    });

    const resendKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (resendKey && fromEmail) {
      const resend = new Resend(resendKey);
      const baseUrl =
        (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr")
          .trim()
          .replace(/\/$/, "");
      const pipelineUrl = `${baseUrl}/strategy/projet-individuel-talent/pipeline`;
      const actorName = String((session.user as { name?: string }).name || "Strategy Planner").trim();
      await resend.emails.send({
        from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
        to: ADMIN_CONTACT_EMAIL,
        subject: `Action requise - ajouter contacts marque (${mission.targetBrand})`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937">
            <h2 style="margin:0 0 12px">Nouvelle marque ajoutée</h2>
            <p>Bonjour,</p>
            <p>
              ${actorName} vient d'ajouter la marque <strong>${mission.targetBrand}</strong>
              pour <strong>${mission.creatorName}</strong> via "Créer campagne (carte directe)".
            </p>
            <p>Merci d'ajouter le ou les contacts HubSpot pour permettre l'envoi par Head of Sales.</p>
            <p style="margin-top:16px">
              <a href="${pipelineUrl}" style="display:inline-block;background:#1A1110;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">
                Ouvrir le pipeline
              </a>
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ mission }, { status: 201 });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions:", error);
    return NextResponse.json({ error: "Erreur lors de la creation de mission" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      missionId?: string;
      status?: string;
      stage?: string;
      draftEmailSubject?: string | null;
      draftEmailBody?: string | null;
      clientLanguage?: string | null;
      clientContacts?: unknown;
    };
    const missionId = String(body.missionId || "").trim();
    const nextStatus = String(body.status || "").trim().toUpperCase();
    const nextStage = String(body.stage || "").trim().toUpperCase();
    const draftEmailSubject =
      body.draftEmailSubject === undefined ? undefined : String(body.draftEmailSubject || "").trim();
    const draftEmailBody = body.draftEmailBody === undefined ? undefined : String(body.draftEmailBody || "").trim();
    const clientLanguage =
      body.clientLanguage === undefined ? undefined : String(body.clientLanguage || "").trim().toUpperCase();
    if (!missionId) {
      return NextResponse.json({ error: "missionId requis." }, { status: 400 });
    }
    const statusProvided = nextStatus.length > 0;
    const stageProvided = nextStage.length > 0;
    const draftProvided = body.draftEmailSubject !== undefined || body.draftEmailBody !== undefined;
    const clientContextProvided = body.clientLanguage !== undefined || body.clientContacts !== undefined;
    if (!statusProvided && !stageProvided && !draftProvided && !clientContextProvided) {
      return NextResponse.json({ error: "Aucune mise à jour fournie." }, { status: 400 });
    }
    if (
      statusProvided &&
      nextStatus !== "READY_FOR_CASTING" &&
      nextStatus !== "EMAIL_DRAFTED" &&
      nextStatus !== "APPROVED_BY_SALES" &&
      nextStatus !== "SENT" &&
      nextStatus !== "RELANCED" &&
      nextStatus !== "CANCELLED"
    ) {
      return NextResponse.json({ error: "Statut mission invalide." }, { status: 400 });
    }
    if (stageProvided && !isValidStage(nextStage)) {
      return NextResponse.json({ error: "Etape pipeline invalide." }, { status: 400 });
    }

    const currentMission = await contactMissionModel.findUnique({
      where: { id: missionId },
      select: { id: true, creatorName: true, targetBrand: true },
    });
    if (!currentMission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    if (
      stageProvided &&
      (nextStage === "TO_SEND" || nextStage === "SENT") &&
      session.user.role === "HEAD_OF_SALES"
    ) {
      const hasContact = await hasHubspotContactForBrand(currentMission.targetBrand);
      if (!hasContact) {
        return NextResponse.json(
          {
            error:
              "Aucun contact HubSpot pour cette marque. Admin doit d'abord ajouter le ou les contacts.",
          },
          { status: 400 }
        );
      }
    }

    const mission = await contactMissionModel.update({
      where: { id: missionId },
      data: {
        ...(statusProvided ? { status: nextStatus } : {}),
        ...(stageProvided ? { stage: nextStage } : {}),
        ...(body.draftEmailSubject !== undefined ? { draftEmailSubject: draftEmailSubject || null } : {}),
        ...(body.draftEmailBody !== undefined ? { draftEmailBody: draftEmailBody || null } : {}),
        ...(body.clientLanguage !== undefined ? { clientLanguage: clientLanguage || null } : {}),
        ...(body.clientContacts !== undefined ? { clientContacts: body.clientContacts ?? null } : {}),
      },
    });

    if (stageProvided && nextStage === "DRAFTED_FOR_VALIDATION") {
      const salesUsers = await prisma.user.findMany({
        where: { role: "HEAD_OF_SALES", actif: true },
        select: { id: true },
      });
      if (salesUsers.length > 0) {
        await prisma.notification.createMany({
          data: salesUsers.map((u) => ({
            userId: u.id,
            type: "GENERAL",
            titre: "Nouveau mail à valider",
            message: `Une carte ${mission.creatorName} × ${mission.targetBrand} est prête pour validation.`,
            lien: "/strategy/projet-individuel-talent/pipeline",
            actorId: session.user.id,
          })),
        });
      }

      const adminContact = await prisma.user.findFirst({
        where: {
          email: { equals: ADMIN_CONTACT_EMAIL, mode: "insensitive" },
          actif: true,
        },
        select: { id: true },
      });
      if (adminContact) {
        await prisma.notification.create({
          data: {
            userId: adminContact.id,
            type: "GENERAL",
            titre: "Ajouter les contacts marque",
            message: `La carte ${mission.creatorName} × ${mission.targetBrand} est rédigée. Merci d'ajouter le ou les contacts HubSpot.`,
            lien: "/strategy/projet-individuel-talent/pipeline",
            actorId: session.user.id,
          },
        });
      }

      const resendKey = process.env.RESEND_API_KEY?.trim();
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
      if (resendKey && fromEmail) {
        const resend = new Resend(resendKey);
        const baseUrl =
          (process.env.NEXT_PUBLIC_BASE_URL || "https://app.glowupagence.fr")
            .trim()
            .replace(/\/$/, "");
        const pipelineUrl = `${baseUrl}/strategy/projet-individuel-talent/pipeline`;
        const actorName = String((session.user as { name?: string }).name || "").trim();

        await resend.emails.send({
          from: fromEmail.includes("<") ? fromEmail : `Glow Up Agence <${fromEmail}>`,
          to: ADMIN_CONTACT_EMAIL,
          subject: `Action requise - ajouter contacts marque (${mission.targetBrand})`,
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937">
              <h2 style="margin:0 0 12px">Carte prête, contacts à ajouter</h2>
              <p>Bonjour,</p>
              <p>
                La carte <strong>${mission.creatorName} × ${mission.targetBrand}</strong> est passée en
                <strong>mail prêt</strong> par ${actorName || "l'équipe Casting"}.
              </p>
              <p>Merci d'ajouter le ou les contacts HubSpot pour cette marque afin que Head of Sales puisse envoyer.</p>
              <p style="margin-top:16px">
                <a href="${pipelineUrl}" style="display:inline-block;background:#1A1110;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none">
                  Ouvrir le pipeline
                </a>
              </p>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({ mission });
  } catch (error) {
    console.error("PATCH /api/strategy/contact-missions:", error);
    return NextResponse.json({ error: "Erreur lors de la mise a jour de mission" }, { status: 500 });
  }
}
