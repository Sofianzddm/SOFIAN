import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/cannes/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const data = { ...body } as Record<string, unknown>;

  if (body.arrivalDate) data.arrivalDate = new Date(body.arrivalDate);
  if (body.departureDate) data.departureDate = new Date(body.departureDate);

  const contact = await prisma.cannesContact.update({ where: { id }, data });
  return NextResponse.json(contact);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  await prisma.cannesContact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
