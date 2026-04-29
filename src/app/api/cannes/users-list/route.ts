import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/cannes/auth";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: { id: true, prenom: true, nom: true, role: true },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: `${u.prenom} ${u.nom}`.trim(),
      image: null,
      role: u.role,
    }))
  );
}
