import { NextRequest } from "next/server";
import type { RhRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAppSession, type AppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";

export type RhEmployeeSession = {
  id: string;
  userId: string;
  matricule: string;
  jobTitle: string;
  department: string;
  managerId: string | null;
  hireDate: Date;
  weeklyHours: number;
  avatarColor: string;
  avatarUrl: string | null;
  remoteAgreement: number;
  rhRole: RhRole;
  actif: boolean;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
};

export type RhSession = {
  app: AppSession;
  employee: RhEmployeeSession;
};

const employeeSelect = {
  id: true,
  userId: true,
  matricule: true,
  jobTitle: true,
  department: true,
  managerId: true,
  hireDate: true,
  weeklyHours: true,
  avatarColor: true,
  avatarUrl: true,
  remoteAgreement: true,
  rhRole: true,
  actif: true,
  user: {
    select: {
      prenom: true,
      nom: true,
      email: true,
      telephone: true,
    },
  },
} as const;

function mapEmployee(
  row: {
    id: string;
    userId: string;
    matricule: string;
    jobTitle: string;
    department: string;
    managerId: string | null;
    hireDate: Date;
    weeklyHours: number;
    avatarColor: string;
    avatarUrl: string | null;
    remoteAgreement: number;
    rhRole: RhRole;
    actif: boolean;
    user: {
      prenom: string;
      nom: string;
      email: string;
      telephone: string | null;
    };
  }
): RhEmployeeSession {
  return {
    id: row.id,
    userId: row.userId,
    matricule: row.matricule,
    jobTitle: row.jobTitle,
    department: row.department,
    managerId: row.managerId,
    hireDate: row.hireDate,
    weeklyHours: row.weeklyHours,
    avatarColor: row.avatarColor,
    avatarUrl: row.avatarUrl ?? null,
    remoteAgreement: row.remoteAgreement,
    rhRole: row.rhRole,
    actif: row.actif,
    prenom: row.user.prenom,
    nom: row.user.nom,
    email: row.user.email,
    telephone: row.user.telephone,
  };
}

async function loadEmployeeForUserId(
  userId: string
): Promise<RhEmployeeSession | null> {
  const employee = await prisma.rhEmployee.findUnique({
    where: { userId },
    select: employeeSelect,
  });
  if (!employee?.actif) return null;
  return mapEmployee(employee);
}

export async function requireRhSessionFromRequest(
  request: NextRequest
): Promise<RhSession | null> {
  const app = await getAppSession(request);
  if (!app?.user?.id) return null;
  const employee = await loadEmployeeForUserId(app.user.id);
  if (!employee) return null;
  return { app, employee };
}

/** Pour Server Components (layout pages) sans NextRequest. */
export async function requireRhSession(): Promise<RhSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const employee = await loadEmployeeForUserId(session.user.id);
  if (!employee) return null;
  return {
    app: {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: (session.user as { role?: string }).role,
      },
    },
    employee,
  };
}

export function isRhManager(role: RhRole): boolean {
  return role === "MANAGER" || role === "HR";
}

export function isRhHr(role: RhRole): boolean {
  return role === "HR";
}

export async function requireRhManager(
  request: NextRequest
): Promise<RhSession | null> {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhManager(session.employee.rhRole)) return null;
  const { hasRhSecureSession } = await import("@/lib/rh/secure-session");
  if (!(await hasRhSecureSession(session.app.user.id, request))) return null;
  return session;
}

export async function requireRhHr(
  request: NextRequest
): Promise<RhSession | null> {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhHr(session.employee.rhRole)) return null;
  const { hasRhSecureSession } = await import("@/lib/rh/secure-session");
  if (!(await hasRhSecureSession(session.app.user.id, request))) return null;
  return session;
}

export function displayName(e: { prenom: string; nom: string }): string {
  return [e.prenom, e.nom].filter(Boolean).join(" ").trim();
}

export function initials(e: { prenom: string; nom: string }): string {
  const a = (e.prenom?.[0] || "").toUpperCase();
  const b = (e.nom?.[0] || "").toUpperCase();
  return `${a}${b}` || "??";
}

export function homePathForRole(role: RhRole): string {
  // Console People / validations = admin RH uniquement (pas les managers N+1)
  if (role === "HR") return "/rh/people";
  return "/rh/espace";
}

/** Accès UI + APIs console People (inbox, planning équipe, paie…). */
export function canAccessRhPeople(role: RhRole): boolean {
  return role === "HR";
}

/** Lecture d’un autre profil RH : soi-même, HR, ou N+1 (reports). */
export async function canViewRhEmployee(
  viewer: RhEmployeeSession,
  targetId: string
): Promise<boolean> {
  if (viewer.id === targetId) return true;
  if (viewer.rhRole === "HR") return true;
  if (viewer.rhRole === "MANAGER") {
    const target = await prisma.rhEmployee.findUnique({
      where: { id: targetId },
      select: { managerId: true },
    });
    return target?.managerId === viewer.id;
  }
  return false;
}

/**
 * Décision (approve/refuse) :
 * - HR : tout le monde
 * - MANAGER : uniquement ses reports (jamais soi-même)
 */
export async function canDecideRhRequest(
  viewer: RhEmployeeSession,
  requestEmployeeId: string
): Promise<boolean> {
  if (viewer.rhRole === "HR") return true;
  if (viewer.rhRole !== "MANAGER") return false;
  if (requestEmployeeId === viewer.id) return false;
  const target = await prisma.rhEmployee.findUnique({
    where: { id: requestEmployeeId },
    select: { managerId: true },
  });
  return target?.managerId === viewer.id;
}
