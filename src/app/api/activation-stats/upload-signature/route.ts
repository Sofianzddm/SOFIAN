import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { buildKey, createPresignedUpload, extFromContentType } from "@/lib/s3";

export async function POST(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const { reportTalentId, contentType } = (await request.json()) as {
    reportTalentId?: string;
    contentType?: string;
  };
  if (!reportTalentId) {
    return NextResponse.json({ error: "reportTalentId requis" }, { status: 400 });
  }

  const ct = contentType || "image/jpeg";
  const timestamp = Math.round(new Date().getTime() / 1000);
  const key = buildKey(
    "glowup-activation-stats",
    `${reportTalentId}-${timestamp}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${extFromContentType(ct)}`
  );

  const { uploadUrl, publicUrl } = await createPresignedUpload({
    key,
    contentType: ct,
  });

  return NextResponse.json({ uploadUrl, publicUrl, key });
}
