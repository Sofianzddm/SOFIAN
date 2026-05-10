import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/cannes/auth";

const LOGISTICS_CHECKLIST_KEY = "logistics-checklist";

const ALLOWED_KEYS = new Set([
  "team-official-hidden-by-day",
  "room-daily-overrides",
  LOGISTICS_CHECKLIST_KEY,
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedKey(key: string): boolean {
  return ALLOWED_KEYS.has(key);
}

async function requireAccessForKey(key: string) {
  if (key === LOGISTICS_CHECKLIST_KEY) return requireAdmin();
  return requireSession();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!isAllowedKey(key)) {
    return NextResponse.json({ error: "Cle de configuration inconnue" }, { status: 404 });
  }

  const { error } = await requireAccessForKey(key);
  if (error) return error;

  const row = await prisma.cannesSharedSetting.findUnique({ where: { key } });
  return NextResponse.json({ key, value: row?.value ?? null });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!isAllowedKey(key)) {
    return NextResponse.json({ error: "Cle de configuration inconnue" }, { status: 404 });
  }

  const { error } = await requireAccessForKey(key);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const value = (body as { value?: unknown }).value;
  if (!isPlainObject(value)) {
    return NextResponse.json({ error: "Le champ value doit etre un objet JSON" }, { status: 400 });
  }
  const jsonValue = value as Prisma.InputJsonValue;

  const saved = await prisma.cannesSharedSetting.upsert({
    where: { key },
    create: { key, value: jsonValue },
    update: { value: jsonValue },
  });

  return NextResponse.json({ key: saved.key, value: saved.value });
}
