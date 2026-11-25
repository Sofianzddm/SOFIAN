import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  runChatPaste,
  runChatReadScreen,
  runChatVps,
  startChatVps,
} from "@/lib/carto-chat-vps/discover";
import { buildCannesCartoResearchPrompt } from "@/lib/cannes-partenaires/carto-prompt";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";

/** High + recherches web : souvent 5–9 min */
export const maxDuration = 600;

/**
 * Carto Cannes Partenaires — même moteur VPS que carto-pipeline2,
 * mais TOUJOURS le prompt CANNES_CARTO (jamais le prompt générique).
 * Ne modifie pas /api/lab/carto-pipeline2/*.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      company?: string;
      domain?: string;
      language?: string;
      market?: string;
      mode?: string;
      chatAnswer?: string;
      chatPrompt?: string;
      endMarker?: string;
    };

    const company = String(body.company || "").trim();
    if (!company) {
      return NextResponse.json({ error: "Marque requise" }, { status: 400 });
    }

    const language = body.language === "en" ? "en" : "fr";
    const market = body.market === "BENELUX" ? "BENELUX" : "FR";
    const domain = String(body.domain || "").trim() || null;
    const mode =
      body.mode === "paste"
        ? "paste"
        : body.mode === "read_screen"
          ? "read_screen"
          : body.mode === "vps_start"
            ? "vps_start"
            : "vps";

    // Prompt Cannes forcé (tag CANNES_CARTO) — override client optionnel
    // seulement s'il contient déjà le tag (évite d'envoyer le prompt générique).
    const clientPrompt = body.chatPrompt ? String(body.chatPrompt) : "";
    const cannesPrompt =
      clientPrompt.includes("CANNES_CARTO")
        ? clientPrompt
        : buildCannesCartoResearchPrompt({ marque: company, market });

    if (mode === "vps_start") {
      const started = await startChatVps({
        company,
        chatPrompt: cannesPrompt,
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
        : mode === "read_screen"
          ? await runChatReadScreen({
              company,
              domain,
              language,
              market,
              endMarker: body.endMarker
                ? String(body.endMarker)
                : undefined,
            })
          : await runChatVps({
              company,
              domain,
              language,
              market,
              chatPrompt: cannesPrompt,
            });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[cannes-partenaires/carto] preview:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur preview Chat" },
      { status: 500 }
    );
  }
}
