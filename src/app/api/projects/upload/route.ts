import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadFileToS3 } from "@/lib/s3";

const PROJECT_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
] as const;

function hasProjectAccess(role: string) {
  return PROJECT_ROLES.includes(role as (typeof PROJECT_ROLES)[number]);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role || "TALENT";
    if (!hasProjectAccess(role)) {
      return NextResponse.json(
        { error: "Accès réservé" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || !file.size) {
      return NextResponse.json(
        { error: "Fichier requis" },
        { status: 400 }
      );
    }

    const url = await uploadFileToS3(file, {
      folder: "glowup-projects",
      baseName: `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      maxWidth: 1920,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Erreur upload projet:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    );
  }
}
