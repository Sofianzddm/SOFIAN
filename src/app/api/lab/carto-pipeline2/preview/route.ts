import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessCartoAiPipeline } from "@/lib/carto-ai/constants";
import {
  runChatDiscover,
  runChatPaste,
  runChatReadScreen,
  runChatVps,
  startChatVps,
} from "@/lib/carto-chat-vps/discover";

/** High + recherches web : souvent 5–9 min */
export const maxDuration = 600;

/**
 * Lab expérimental Chat VPS (/lab/carto-pipeline2).
 * mode=vps_start (async) | read_screen | vps | api_chat | paste
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
      chatPrompt?: string;
    };

    const company = String(body.company || "").trim();
    if (!company) {
      return NextResponse.json({ error: "Marque requise" }, { status: 400 });
    }

    const language = body.language === "en" ? "en" : "fr";
    const domain = String(body.domain || "").trim() || null;
    const mode =
      body.mode === "paste"
        ? "paste"
        : body.mode === "api_chat"
          ? "api_chat"
          : body.mode === "read_screen"
            ? "read_screen"
            : body.mode === "vps_start"
              ? "vps_start"
              : "vps";

    if (mode === "vps_start") {
      const started = await startChatVps({
        company,
        chatPrompt: body.chatPrompt ? String(body.chatPrompt) : undefined,
      });
      return NextResponse.json(started, { status: 202 });
    }

    const result =
      mode === "paste"
        ? await runChatPaste({
            company,
            domain,
            language,
            chatAnswer: String(body.chatAnswer || ""),
          })
        : mode === "api_chat"
          ? await runChatDiscover({ company, domain, language })
          : mode === "read_screen"
            ? await runChatReadScreen({ company, domain, language })
            : await runChatVps({
                company,
                domain,
                language,
                chatPrompt: body.chatPrompt
                  ? String(body.chatPrompt)
                  : undefined,
              });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[carto-chat-vps] preview:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur preview Chat" },
      { status: 500 }
    );
  }
}
