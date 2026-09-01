import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getAppSession } from "@/lib/getAppSession";
import prisma from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const EXCEL_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

function isMissingPrimeTableError(error: unknown): boolean {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const metaCode =
    typeof error === "object" &&
    error !== null &&
    "meta" in error &&
    typeof (error as { meta?: { code?: unknown } }).meta?.code === "string"
      ? (error as { meta: { code: string } }).meta.code
      : "";
  return code === "P2010" && metaCode === "42P01";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
    }

    const { id } = await params;
    const rows = (await prisma.$queryRaw`
      SELECT "id", "excelUrl", "statut"
      FROM "PrimeSalaire"
      WHERE "id" = ${id}
      LIMIT 1
    `) as Array<{ id: string; excelUrl: string | null; statut: string }>;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "Prime introuvable." }, { status: 404 });
    if (row.statut !== "SOUMIS" && row.statut !== "REFUSE" && row.statut !== "VALIDE") {
      return NextResponse.json({ error: "Upload impossible pour ce statut." }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier Excel requis." }, { status: 400 });
    }

    const name = file.name || "primes.xlsx";
    const isExcelExt = /\.(xlsx|xls)$/i.test(name);
    if (!isExcelExt && !EXCEL_MIME.has(file.type)) {
      return NextResponse.json({ error: "Format non accepté. Utilisez un fichier .xlsx ou .xls." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mime = file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-primes",
      public_id: `prime-${id}-${Date.now()}`,
      resource_type: "raw",
      format: name.toLowerCase().endsWith(".xls") ? "xls" : "xlsx",
    });

    if (row.excelUrl && row.excelUrl.includes("cloudinary.com")) {
      try {
        const parts = row.excelUrl.split("/");
        const filename = parts[parts.length - 1]?.split("?")[0] ?? "";
        const folder = parts[parts.length - 2] ?? "glowup-primes";
        const publicId = `${folder}/${filename.replace(/\.[^.]+$/, "")}`;
        await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
      } catch (err) {
        console.error("Ancien excel prime non supprimé:", err);
      }
    }

    await prisma.$executeRaw`
      UPDATE "PrimeSalaire"
      SET "excelUrl" = ${uploaded.secure_url},
          "excelFileName" = ${name},
          "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;

    return NextResponse.json({
      success: true,
      excelUrl: uploaded.secure_url,
      excelFileName: name,
    });
  } catch (e) {
    if (isMissingPrimeTableError(e)) {
      return NextResponse.json(
        { error: "Table PrimeSalaire absente ou colonnes manquantes. Exécutez le SQL Neon." },
        { status: 503 }
      );
    }
    console.error("POST /api/primes/[id]/excel:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
