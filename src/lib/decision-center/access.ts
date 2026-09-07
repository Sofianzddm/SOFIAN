import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";
import {
  capabilitiesForRole,
  hasCapability,
  type DcCapability,
} from "./capabilities";
import {
  isDecisionCenterEnabled,
  isDecisionCenterEmail,
  normalizeDcEmail,
  phase1RoleForEmail,
  type DcRole,
} from "./constants";

export type DcContext = {
  userId: string;
  email: string;
  name: string;
  dcRole: DcRole;
  appRole: string;
  capabilities: readonly DcCapability[];
};

export function isModuleAvailable(): boolean {
  return isDecisionCenterEnabled();
}

async function resolveEmailAndUser(userId: string, sessionEmail?: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      role: true,
      actif: true,
    },
  });
  if (!user?.actif) return null;
  const email = normalizeDcEmail(user.email || sessionEmail);
  return { user, email };
}

async function roleForUser(userId: string, email: string): Promise<DcRole | null> {
  const fromEmail = phase1RoleForEmail(email);
  if (!fromEmail) return null;

  try {
    const membership = await prisma.dcMembership.findUnique({
      where: { userId },
    });
    if (membership?.isActive) {
      return membership.role as DcRole;
    }
  } catch {
    // Table pas encore migrée : on tombe sur le mapping email phase 1.
  }
  return fromEmail;
}

export async function getDecisionCenterContextFromUserId(
  userId: string,
  sessionEmail?: string | null
): Promise<DcContext | null> {
  if (!isDecisionCenterEnabled()) return null;
  const resolved = await resolveEmailAndUser(userId, sessionEmail);
  if (!resolved) return null;
  if (!isDecisionCenterEmail(resolved.email)) return null;

  const dcRole = await roleForUser(userId, resolved.email);
  if (!dcRole) return null;

  const name =
    [resolved.user.prenom, resolved.user.nom].filter(Boolean).join(" ").trim() ||
    resolved.email;

  return {
    userId: resolved.user.id,
    email: resolved.email,
    name,
    dcRole,
    appRole: resolved.user.role,
    capabilities: capabilitiesForRole(dcRole),
  };
}

export async function requireDecisionCenterPage(): Promise<DcContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return getDecisionCenterContextFromUserId(
    session.user.id,
    session.user.email
  );
}

export async function requireDcApi(
  request: NextRequest
): Promise<{ ok: true; ctx: DcContext } | { ok: false; response: NextResponse }> {
  if (!isDecisionCenterEnabled()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Decision Center désactivé" },
        { status: 404 }
      ),
    };
  }

  const session = await getAppSession(request);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }

  const ctx = await getDecisionCenterContextFromUserId(
    session.user.id,
    session.user.email
  );
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Accès Decision Center refusé" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, ctx };
}

export function forbidIfMissing(
  ctx: DcContext,
  capability: DcCapability
): NextResponse | null {
  if (!hasCapability(ctx.dcRole, capability)) {
    return NextResponse.json(
      { error: "Action non autorisée pour ce rôle" },
      { status: 403 }
    );
  }
  return null;
}

export async function findCeoUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: "s.zeddam@glowupagence.fr", mode: "insensitive" } },
        { email: { equals: "sofian@glowupagence.fr", mode: "insensitive" } },
      ],
      actif: true,
    },
    orderBy: { email: "asc" }, // s.zeddam avant sofian
    select: { id: true },
  });
  return user?.id ?? null;
}
