import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/cannes/auth";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const talents = await prisma.talent.findMany({
    select: { id: true, prenom: true, nom: true, photo: true },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  return NextResponse.json(
    talents.map((t) => ({
      id: t.id,
      name: `${t.prenom} ${t.nom}`.trim(),
      photoUrl: t.photo,
    }))
  );
}
