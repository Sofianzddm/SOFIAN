import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/cannes/auth";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const contacts = await prisma.cannesContact.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const contact = await prisma.cannesContact.create({
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      company: body.company || null,
      role: body.role || null,
      phone: body.phone || null,
      email: body.email || null,
      instagram: body.instagram || null,
      hotel: body.hotel || null,
      arrivalDate: body.arrivalDate ? new Date(body.arrivalDate) : null,
      departureDate: body.departureDate ? new Date(body.departureDate) : null,
      category: body.category || "AUTRE",
      notes: body.notes || null,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
