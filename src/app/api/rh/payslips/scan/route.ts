import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireRhHr } from "@/lib/rh/auth";
import { ingestPayslipFile } from "@/lib/rh/payslip";

/**
 * Upload + OCR d’un PDF de bulletins.
 * FormData: file, year?, month?, employeeId? (recommandé pour 1 bulletin)
 * mode=batch → matching auto par matricule (PDF multi-salariés)
 */
export async function POST(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Fichier trop lourd (max 25 Mo)" },
      { status: 400 }
    );
  }
  const mime = file.type || "application/pdf";
  if (mime && mime !== "application/pdf" && !mime.startsWith("image/")) {
    return NextResponse.json(
      { error: "PDF ou image attendu" },
      { status: 400 }
    );
  }

  const yearRaw = formData.get("year");
  const monthRaw = formData.get("month");
  const employeeIdRaw = formData.get("employeeId");
  const modeRaw = formData.get("mode");
  const forceYear =
    typeof yearRaw === "string" && yearRaw ? Number(yearRaw) : undefined;
  const forceMonth =
    typeof monthRaw === "string" && monthRaw ? Number(monthRaw) : undefined;
  const employeeId =
    typeof employeeIdRaw === "string" && employeeIdRaw
      ? employeeIdRaw
      : undefined;
  const mode = typeof modeRaw === "string" ? modeRaw : "single";

  if (mode !== "batch" && !employeeId) {
    return NextResponse.json(
      { error: "Choisis le salarié concerné avant d’uploader" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-rh-payslips",
      public_id: `payslip-${Date.now()}`,
      resource_type: "auto",
    });

    const result = await ingestPayslipFile({
      buffer,
      fileUrl: uploaded.secure_url,
      fileName: file.name,
      forceYear:
        forceYear && Number.isFinite(forceYear) ? forceYear : undefined,
      forceMonth:
        forceMonth && Number.isFinite(forceMonth) ? forceMonth : undefined,
      employeeId: mode === "batch" ? undefined : employeeId,
    });

    return NextResponse.json({
      ok: true,
      url: uploaded.secure_url,
      ...result,
    });
  } catch (e) {
    console.error("Scan bulletin paie:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan impossible" },
      { status: 500 }
    );
  }
}
