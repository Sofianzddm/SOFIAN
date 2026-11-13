import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessCartoAiPipeline } from "@/lib/carto-ai/constants";
import { runChatDiscover, runChatPaste } from "@/lib/carto-chat-vps/discover";

export const maxDuration = 300;

/**
 * Lab expérimental Chat-style (/lab/carto-pipeline2).
 * mode=api_chat (défaut) | paste
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (
      !canAccessCartoAiPipeline({
        email: session.user.email,
        role: session.user.role,
      })
    ) {
      return NextResponse.json({ error: "Lab non disponible" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      company?: string;
      domain?: string;
      language?: string;
      mode?: string;
      chatAnswer?: string;
    };

    const company = String(body.company || "").trim();
    if (!company) {
      return NextResponse.json({ error: "Marque requise" }, { status: 400 });
    }

    const language = body.language === "en" ? "en" : "fr";
    const domain = String(body.domain || "").trim() || null;
    const mode = body.mode === "paste" ? "paste" : "api_chat";

    const result =
      mode === "paste"
        ? await runChatPaste({
            company,
            domain,
            language,
            chatAnswer: String(body.chatAnswer || ""),
          })
        : await runChatDiscover({ company, domain, language });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[carto-chat-vps] preview:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur preview Chat" },
      { status: 500 }
    );
  }
}
