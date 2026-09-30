import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { normalizeMissionBrandKey, parseMissionPriority, findTalentBrandLastSend, TALENT_BRAND_RECONTACT_DAYS } from "@/lib/contact-missions";
import {
  INDIV_BRAND_WAVE_DAYS,
  PIPELINE_CASTING_SCOPE,
  evaluateIndivBrandSendGuard,
} from "@/lib/contact-cooldown";
import {
  findAllMarqueIdsByName,
  findMarqueByName,
  linkMarqueFromBrandName,
  marqueSlug,
  syncMissionClientContactsToMarque,
} from "@/lib/marque-resolver";
import { normalizeEditorHtmlForEmail } from "@/lib/email-body-html";

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

/**
 * Pour les missions sans `marqueId`, retrouve le nom canonique via slug/alias
 * (ex. targetBrand « MiuMiu » → fiche « Miu Miu »).
 */
async function resolveMarqueNomsBySlug(
  missions: Array<{ marqueId?: string | null; targetBrand?: string | null; marque?: { nom?: string } | null }>
): Promise<Map<string, { marqueId: string; marqueNom: string }>> {
  const out = new Map<string, { marqueId: string; marqueNom: string }>();
  const slugs = new Set<string>();
  for (const m of missions) {
    if (m.marqueId && m.marque?.nom) continue;
    const slug = marqueSlug(m.targetBrand);
    if (slug) slugs.add(slug);
  }
  if (slugs.size === 0) return out;

  const slugList = Array.from(slugs);
  const bySlug = await prisma.marque.findMany({
    where: { slug: { in: slugList } },
    select: { id: true, nom: true, slug: true },
  });
  const resolved = new Map<string, { marqueId: string; marqueNom: string }>();
  for (const row of bySlug) {
    if (row.slug) resolved.set(row.slug, { marqueId: row.id, marqueNom: row.nom });
  }

  const missing = slugList.filter((s) => !resolved.has(s));
  if (missing.length > 0) {
    const aliases = await prisma.marqueAlias.findMany({
      where: { slug: { in: missing } },
      select: { slug: true, marqueId: true, marque: { select: { nom: true } } },
    });
    for (const a of aliases) {
      if (!resolved.has(a.slug)) {
        resolved.set(a.slug, { marqueId: a.marqueId, marqueNom: a.marque.nom });
      }
    }
  }

  for (const m of missions) {
    if (m.marqueId && m.marque?.nom) continue;
    const slug = marqueSlug(m.targetBrand);
    const hit = slug ? resolved.get(slug) : undefined;
    if (hit) out.set(slug, hit);
  }
  return out;
}

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
const campaignModel = (prisma as unknown as { talentProspectingCampaign: any }).talentProspectingCampaign;
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

/** Au moins un contact email utilisable sur la fiche marque interne (plus de HubSpot). */
async function hasInternalContactForBrand(brandName: string): Promise<boolean> {
  const brand = String(brandName || "").trim();
  if (!brand) return false;
  let marqueIds = await findAllMarqueIdsByName(brand);
  if (marqueIds.length === 0) {
    const exact = await findMarqueByName(brand);
    if (exact) marqueIds = [exact.marqueId];
  }
  if (marqueIds.length === 0) return false;
  const count = await prisma.marqueContact.count({
    where: {
      marqueId: { in: marqueIds },
      email: { not: null },
      outreachExcluded: false,
      diffusionOptOut: false,
      OR: [{ source: { not: "AO" } }, { source: null }],
    },
  });
  return count > 0;
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
      // Pipeline Casting uniquement — exclut Projets outreach talent (event CREATED).
      const pipelineScope = PIPELINE_CASTING_SCOPE;
      if (campaignId) {
        // Vue projet explicite : uniquement les missions de cette campagne.
        where.campaignId = campaignId;
      } else if (mineOnly && session.user.role === "STRATEGY_PLANNER") {
        where.AND = [
          pipelineScope,
          { campaign: { createdById: session.user.id } },
        ];
      } else {
        Object.assign(where, pipelineScope);
      }
      // Filtre talent pour les cartes ouvertes — PAS pour la vague marque
      // (sinon on rate les envois pipeline des autres talents).
      const whereOpen: Record<string, unknown> = { ...where };
      if (talentId) whereOpen.talentId = talentId;
      if (isValidStage(stageParam)) whereOpen.stage = stageParam;

      const missionInclude = {
        talent: { select: { id: true, prenom: true, nom: true } },
        campaign: { select: { id: true, title: true, createdById: true, isActive: true } },
        marque: { select: { id: true, nom: true } },
      } as const;

      // Pour le blocage marque (20 j / tous talents) il faut :
      // 1) TOUTES les cartes encore ouvertes (sinon un vieux « Rédigé » échappe au take)
      // 2) TOUS les envois PIPELINE de la fenêtre marque (pas les projets Ibiza)
      // 3) un filet de cartes récentes (SENT / réponses) pour le parcours
      const sinceBrandWave = new Date(
        Date.now() - INDIV_BRAND_WAVE_DAYS * 24 * 60 * 60 * 1000
      );
      const OPEN_STAGES = [
        "STRATEGY_DEFINED",
        "TO_DRAFT",
        "DRAFTED_FOR_VALIDATION",
        "TO_SEND",
      ] as const;

      // Vague marque = pipeline casting, tous talents (ignore filtre talent / mine)
      const brandWaveWhere: Record<string, unknown> = campaignId
        ? { campaignId }
        : { ...pipelineScope };

      let missions: any[];
      if (isValidStage(stageParam)) {
        missions = await contactMissionModel.findMany({
          where: whereOpen,
          orderBy: { createdAt: "desc" },
          include: missionInclude,
          take: 800,
        });
      } else {
        const [openMissions, sentLastWave, recentClosed] = await Promise.all([
          contactMissionModel.findMany({
            where: {
              AND: [whereOpen, { stage: { in: [...OPEN_STAGES] } }],
            },
            orderBy: { createdAt: "desc" },
            include: missionInclude,
            take: 2500,
          }),
          contactMissionModel.findMany({
            where: {
              AND: [
                brandWaveWhere,
                { sentAt: { gte: sinceBrandWave, not: null } },
              ],
            },
            orderBy: { sentAt: "desc" },
            include: missionInclude,
            take: 800,
          }),
          contactMissionModel.findMany({
            where: {
              AND: [
                whereOpen,
                {
                  stage: {
                    in: [
                      "SENT",
                      "RESPONSE_RECEIVED",
                      "IN_NEGOTIATION",
                      "WON",
                      "LOST",
                    ],
                  },
                },
              ],
            },
            orderBy: { updatedAt: "desc" },
            include: missionInclude,
            take: 400,
          }),
        ]);

        const byId = new Map<string, (typeof openMissions)[number]>();
        for (const m of openMissions) byId.set(m.id, m);
        for (const m of sentLastWave) {
          if (!byId.has(m.id)) byId.set(m.id, m);
        }
        for (const m of recentClosed) {
          if (!byId.has(m.id)) byId.set(m.id, m);
        }
        missions = [...byId.values()].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }

      const resolvedBySlug = await resolveMarqueNomsBySlug(missions);
      return NextResponse.json({
        missions: missions.map((m: any) => {
          const slugHit = !m.marque?.nom ? resolvedBySlug.get(marqueSlug(m.targetBrand)) : undefined;
          return {
            id: m.id,
            campaignId: m.campaignId,
            campaignTitle: m.campaign?.title ?? null,
            talentId: m.talentId,
            talentName: m.talent ? `${m.talent.prenom} ${m.talent.nom}`.trim() : null,
            creatorName: m.creatorName,
            targetBrand: m.targetBrand,
            marqueId: m.marqueId ?? slugHit?.marqueId ?? null,
            marqueNom: m.marque?.nom ?? slugHit?.marqueNom ?? null,
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
            draftLanguage: m.draftLanguage ?? null,
            clientLanguage: m.clientLanguage ?? null,
            clientContacts: m.clientContacts ?? null,
            deadlineAt: m.deadlineAt,
            scheduledSendAt: m.scheduledSendAt ?? null,
            sentAt: m.sentAt ?? null,
            sendError: m.sendError ?? null,
            relanceSentAt: m.relanceSentAt ?? null,
            relanceError: m.relanceError ?? null,
            relance2SentAt: m.relance2SentAt ?? null,
            relance2Error: m.relance2Error ?? null,
            relanceCancelledAt: m.relanceCancelledAt ?? null,
            replied: m.replied ?? false,
            openCount: m.openCount ?? 0,
            openedAt: m.openedAt ?? null,
            clickCount: m.clickCount ?? 0,
            clickedAt: m.clickedAt ?? null,
            awaitingContactsCompletion: Boolean(m.awaitingContactsCompletion),
            contactsCompletionRequestedAt:
              m.contactsCompletionRequestedAt?.toISOString?.() ??
              m.contactsCompletionRequestedAt ??
              null,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
          };
        }),
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
        marque: { select: { id: true, nom: true } },
      },
      take: 300,
    });

    const resolvedBySlug = await resolveMarqueNomsBySlug(missions);
    const byBrand: Record<string, unknown> = {};
    for (const key of brandKeys) {
      const m = missions.find((mission: any) => mission.targetBrandKey === key);
      if (!m) continue;
      const slugHit = !m.marque?.nom ? resolvedBySlug.get(marqueSlug(m.targetBrand)) : undefined;
      byBrand[key] = {
        id: m.id,
        campaignId: m.campaignId,
        campaignTitle: m.campaign?.title ?? null,
        talentId: m.talentId,
        talentName: m.talent ? `${m.talent.prenom} ${m.talent.nom}`.trim() : null,
        creatorName: m.creatorName,
        targetBrand: m.targetBrand,
        marqueId: m.marqueId ?? slugHit?.marqueId ?? null,
        marqueNom: m.marque?.nom ?? slugHit?.marqueNom ?? null,
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
      marqueId?: string | null;
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

    const requestedMarqueId = String(body.marqueId || "").trim() || null;
    let targetBrand = String(body.targetBrand || "").trim();
    let marqueId: string | null = null;

    if (requestedMarqueId) {
      const marque = await prisma.marque.findUnique({
        where: { id: requestedMarqueId },
        select: { id: true, nom: true },
      });
      if (!marque) {
        return NextResponse.json({ error: "Marque CRM introuvable." }, { status: 404 });
      }
      marqueId = marque.id;
      // Toujours le nom canonique CRM pour éviter fautes / doublons.
      targetBrand = marque.nom;
    } else if (targetBrand) {
      const linkedMarque = await linkMarqueFromBrandName({
        brandName: targetBrand,
        source: "CONTACT_MISSION",
      });
      marqueId = linkedMarque?.marqueId ?? null;
      if (linkedMarque?.marqueId) {
        const canon = await prisma.marque.findUnique({
          where: { id: linkedMarque.marqueId },
          select: { nom: true },
        });
        if (canon?.nom) targetBrand = canon.nom;
      }
    }

    const strategyReason =
      String(body.strategyReason || "").trim() || "À préciser";
    if (!creatorName || !targetBrand) {
      return NextResponse.json(
        { error: "creatorName et targetBrand (ou marqueId) sont requis." },
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

    if (talentId) {
      const prior = await findTalentBrandLastSend({
        talentId,
        marqueId,
        targetBrand,
      });
      if (prior?.blocked) {
        const sentLabel = new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(prior.sentAt);
        return NextResponse.json(
          {
            error:
              `« ${prior.targetBrand} » a déjà été envoyée pour ce talent le ${sentLabel}. ` +
              `Bloqué encore ${prior.daysLeft} j (fenêtre ${TALENT_BRAND_RECONTACT_DAYS} j).`,
            code: "TALENT_BRAND_RECONTACT",
            prior: {
              targetBrand: prior.targetBrand,
              sentAt: prior.sentAt.toISOString(),
              daysLeft: prior.daysLeft,
              daysAgo: prior.daysAgo,
            },
          },
          { status: 409 }
        );
      }
    }

    // Vague marque indiv (tous talents) — même règle qu'à l'envoi
    const brandWave = await evaluateIndivBrandSendGuard({
      id: "__new__",
      talentId,
      creatorName,
      marqueId,
      targetBrandKey: normalizeMissionBrandKey(targetBrand),
      targetBrand,
    });
    if (!brandWave.allowed) {
      return NextResponse.json(
        {
          error: brandWave.message,
          code: "INDIV_BRAND_WAVE",
          canForce: false,
          prior: {
            targetBrand: brandWave.prior.targetBrand,
            sentAt: brandWave.prior.sentAt.toISOString(),
            creatorName: brandWave.prior.creatorName,
            nextAllowedAt: brandWave.nextAllowedAt?.toISOString() ?? null,
          },
        },
        { status: 409 }
      );
    }

    const mission = await contactMissionModel.create({
      data: {
        campaignId,
        talentId,
        creatorName,
        targetBrand,
        targetBrandKey: normalizeMissionBrandKey(targetBrand),
        marqueId,
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
      targetBrand?: string;
      draftEmailSubject?: string | null;
      draftEmailBody?: string | null;
      draftLanguage?: string | null;
      clientLanguage?: string | null;
      clientContacts?: unknown;
    };
    const missionId = String(body.missionId || "").trim();
    const nextTargetBrand =
      body.targetBrand === undefined ? undefined : String(body.targetBrand || "").trim();
    const nextStatus = String(body.status || "").trim().toUpperCase();
    const nextStage = String(body.stage || "").trim().toUpperCase();
    const draftEmailSubject =
      body.draftEmailSubject === undefined ? undefined : String(body.draftEmailSubject || "").trim();
    const draftEmailBody =
      body.draftEmailBody === undefined
        ? undefined
        : normalizeEditorHtmlForEmail(String(body.draftEmailBody || ""));
    const clientLanguage =
      body.clientLanguage === undefined ? undefined : String(body.clientLanguage || "").trim().toUpperCase();
    const draftLanguage =
      body.draftLanguage === undefined
        ? undefined
        : String(body.draftLanguage || "").trim().toLowerCase() === "en"
        ? "en"
        : "fr";
    if (!missionId) {
      return NextResponse.json({ error: "missionId requis." }, { status: 400 });
    }
    const statusProvided = nextStatus.length > 0;
    const stageProvided = nextStage.length > 0;
    const draftProvided =
      body.draftEmailSubject !== undefined ||
      body.draftEmailBody !== undefined ||
      body.draftLanguage !== undefined;
    const clientContextProvided = body.clientLanguage !== undefined || body.clientContacts !== undefined;
    const brandProvided = nextTargetBrand !== undefined;
    if (!statusProvided && !stageProvided && !draftProvided && !clientContextProvided && !brandProvided) {
      return NextResponse.json({ error: "Aucune mise à jour fournie." }, { status: 400 });
    }
    if (brandProvided && !nextTargetBrand) {
      return NextResponse.json({ error: "Le nom de la marque ne peut pas être vide." }, { status: 400 });
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
      select: { id: true, creatorName: true, targetBrand: true, marqueId: true },
    });
    if (!currentMission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    // Vague Strategy en cours → Casting ne peut ni rédiger ni avancer l'envoi.
    const castingMutation =
      draftProvided ||
      (stageProvided &&
        (nextStage === "TO_DRAFT" ||
          nextStage === "DRAFTED_FOR_VALIDATION" ||
          nextStage === "TO_SEND" ||
          nextStage === "SENT")) ||
      (statusProvided &&
        (nextStatus === "EMAIL_DRAFTED" ||
          nextStatus === "APPROVED_BY_SALES" ||
          nextStatus === "SENT" ||
          nextStatus === "RELANCED"));
    if (castingMutation) {
      const { getMissionCastingGate, promoteCondensationSender } = await import(
        "@/lib/brand-condensation"
      );
      const gate = await getMissionCastingGate(missionId, {
        role: session.user.role,
      });
      if (gate.blocked) {
        return NextResponse.json(
          { error: gate.message, code: gate.code, waveId: gate.waveId },
          { status: 400 }
        );
      }
      // Rédaction depuis Alix (MEMBER) → elle devient PRIMARY du groupe.
      if (draftProvided) {
        await promoteCondensationSender(missionId);
      }
    }

    if (
      stageProvided &&
      (nextStage === "TO_SEND" || nextStage === "SENT") &&
      session.user.role === "HEAD_OF_SALES"
    ) {
      const hasContact = await hasInternalContactForBrand(currentMission.targetBrand);
      if (!hasContact) {
        return NextResponse.json(
          {
            error:
              "Aucun contact en base pour cette marque. Ajoute d'abord un contact sur la fiche marque (carto / CRM interne).",
          },
          { status: 400 }
        );
      }
    }

    // Si le nom de marque change (correction de faute), on relie la mission à
    // la bonne fiche marque (ou on en crée une nouvelle au besoin).
    const brandChanged =
      brandProvided && nextTargetBrand !== currentMission.targetBrand;
    const effectiveBrand = brandChanged ? (nextTargetBrand as string) : currentMission.targetBrand;
    let marqueIdForUpdate: string | null | undefined = currentMission.marqueId;
    if (brandChanged) {
      const relinked = await linkMarqueFromBrandName({
        brandName: effectiveBrand,
        source: "CONTACT_MISSION",
      });
      marqueIdForUpdate = relinked?.marqueId ?? null;
    }

    // Sync contacts pipeline → fiche marque (onglet Contacts sur /marques/[id])
    let awaitingResolved: {
      resolvedCount: number;
      sourceLabel: string;
      message: string;
    } | null = null;
    if (body.clientContacts !== undefined) {
      marqueIdForUpdate = await syncMissionClientContactsToMarque(
        effectiveBrand,
        marqueIdForUpdate ?? null,
        body.clientContacts
      );
      if (marqueIdForUpdate) {
        const { resolveAwaitingEnrichissementForMarque } = await import(
          "@/lib/resolve-awaiting-enrichissement"
        );
        const resolved = await resolveAwaitingEnrichissementForMarque({
          marqueId: marqueIdForUpdate,
          actorId: session.user.id,
        });
        if (resolved.resolvedCount > 0) {
          awaitingResolved = {
            resolvedCount: resolved.resolvedCount,
            sourceLabel: resolved.sourceLabel,
            message: `Contacts enregistrés — ${resolved.resolvedCount} demande(s) débloquée(s) (${resolved.sourceLabel}).`,
          };
        }
      }
    }

    const mission = await contactMissionModel.update({
      where: { id: missionId },
      data: {
        ...(statusProvided ? { status: nextStatus } : {}),
        ...(stageProvided ? { stage: nextStage } : {}),
        ...(brandChanged
          ? { targetBrand: effectiveBrand, targetBrandKey: normalizeMissionBrandKey(effectiveBrand) }
          : {}),
        ...(body.draftEmailSubject !== undefined ? { draftEmailSubject: draftEmailSubject || null } : {}),
        ...(body.draftEmailBody !== undefined ? { draftEmailBody: draftEmailBody || null } : {}),
        ...(body.draftLanguage !== undefined ? { draftLanguage } : {}),
        ...(body.clientLanguage !== undefined ? { clientLanguage: clientLanguage || null } : {}),
        ...(body.clientContacts !== undefined ? { clientContacts: body.clientContacts ?? null } : {}),
        ...(brandChanged ? { marqueId: marqueIdForUpdate } : marqueIdForUpdate ? { marqueId: marqueIdForUpdate } : {}),
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

    return NextResponse.json({ mission, awaitingResolved });
  } catch (error) {
    console.error("PATCH /api/strategy/contact-missions:", error);
    return NextResponse.json({ error: "Erreur lors de la mise a jour de mission" }, { status: 500 });
  }
}
