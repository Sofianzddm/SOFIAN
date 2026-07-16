"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Sparkles,
  Copy,
  Check,
  Eraser,
  MailQuestion,
  Wand2,
} from "lucide-react";

/**
 * Assistant Réponses Sales : on colle un mail reçu, Grok rédige une réponse
 * avenante et vendeuse, prête à copier-coller dans Gmail.
 * Accès : HEAD_OF_SALES + ADMIN (contrôle strict côté API).
 */

const ALLOWED = ["HEAD_OF_SALES", "ADMIN"];

type Language = "auto" | "fr" | "en";
type Tone = "vous" | "tu";
type Length = "court" | "normal" | "detaille";

export default function SalesReplyPage() {
  const { data: session, status } = useSession();

  const [emailContent, setEmailContent] = useState("");
  const [instructions, setInstructions] = useState("");
  const [language, setLanguage] = useState<Language>("auto");
  const [tone, setTone] = useState<Tone>("vous");
  const [length, setLength] = useState<Length>("normal");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [copied, setCopied] = useState<"reply" | "subject" | null>(null);

  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const forbidden = status !== "loading" && !ALLOWED.includes(role);

  const generate = async (regenerate = false) => {
    if (!emailContent.trim() || generating) return;
    setGenerating(true);
    setError(null);
    if (!regenerate) {
      setReply("");
      setSubject("");
    }
    try {
      const res = await fetch("/api/sales/reply-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailContent, instructions, language, tone, length }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la génération.");
      }
      setReply(String(data.reply || ""));
      setSubject(String(data.subject || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la génération.");
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (what: "reply" | "subject") => {
    const text = what === "reply" ? reply : subject;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard indisponible */
    }
  };

  const clearAll = () => {
    setEmailContent("");
    setInstructions("");
    setReply("");
    setSubject("");
    setError(null);
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">
        Accès réservé à la Head of Sales et aux administrateurs.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Sparkles className="h-6 w-6 text-glowup-rose" />
          Assistant Réponses Sales
        </h1>
        <p className="text-sm text-slate-500">
          Collez un mail reçu, Grok rédige une réponse avenante et vendeuse, prête à
          copier-coller dans Gmail.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Colonne gauche : mail reçu + options */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="email-content"
                className="flex items-center gap-2 text-sm font-medium text-slate-800"
              >
                <MailQuestion className="h-4 w-4 text-glowup-rose" />
                Mail reçu
              </label>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <Eraser className="h-3.5 w-3.5" />
                Tout effacer
              </button>
            </div>
            <textarea
              id="email-content"
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              placeholder={
                "Collez ici le mail auquel vous devez répondre…\n\nEx. : « Bonjour, nous préparons une campagne pour le lancement de notre nouvelle gamme et cherchons des créateurs lifestyle… »"
              }
              rows={12}
              className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-glowup-rose focus:outline-none focus:ring-1 focus:ring-glowup-rose"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <label
              htmlFor="instructions"
              className="mb-2 block text-sm font-medium text-slate-800"
            >
              Consigne particulière{" "}
              <span className="font-normal text-slate-400">(optionnel)</span>
            </label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ex. : « Propose un call mardi ou mercredi », « Décline poliment mais garde la porte ouverte », « Mets en avant nos créatrices beauté »…"
              rows={2}
              className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-glowup-rose focus:outline-none focus:ring-1 focus:ring-glowup-rose"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
                title="Langue de la réponse"
              >
                <option value="auto">Langue : auto</option>
                <option value="fr">Langue : français</option>
                <option value="en">Langue : anglais</option>
              </select>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
                title="Tutoiement ou vouvoiement (français)"
              >
                <option value="vous">Vouvoiement</option>
                <option value="tu">Tutoiement</option>
              </select>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value as Length)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
                title="Longueur de la réponse"
              >
                <option value="court">Réponse courte</option>
                <option value="normal">Longueur normale</option>
                <option value="detaille">Réponse détaillée</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void generate(false)}
            disabled={!emailContent.trim() || generating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-glowup-rose px-4 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-glowup-rose-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Grok rédige la réponse…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Générer la réponse
              </>
            )}
          </button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Colonne droite : réponse générée */}
        <div className="space-y-4">
          <div className="flex min-h-[400px] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Wand2 className="h-4 w-4 text-glowup-rose" />
                Réponse proposée
              </span>
              {reply && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void generate(true)}
                    disabled={generating}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Regénérer
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy("reply")}
                    className="inline-flex items-center gap-1 rounded-md bg-glowup-licorice px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                  >
                    {copied === "reply" ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copier
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {subject && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-glowup-lace px-3 py-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Objet
                </span>
                <span className="flex-1 truncate text-sm text-slate-800">{subject}</span>
                <button
                  type="button"
                  onClick={() => void copy("subject")}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-slate-600 hover:bg-white"
                  title="Copier l'objet"
                >
                  {copied === "subject" ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}

            {reply ? (
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={18}
                className="flex-1 resize-y rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm leading-relaxed text-slate-800 focus:border-glowup-rose focus:bg-white focus:outline-none focus:ring-1 focus:ring-glowup-rose"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
                {generating ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-glowup-rose" />
                    <span>Analyse du mail et rédaction en cours…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-6 w-6 text-slate-300" />
                    <span>
                      La réponse générée s&apos;affichera ici.
                      <br />
                      Vous pourrez la retoucher avant de la copier.
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Astuce : la réponse est modifiable directement dans le cadre avant d&apos;être
            copiée. Les informations que Grok ne connaît pas (tarifs, créneaux…) sont
            laissées entre crochets, pensez à les compléter.
          </p>
        </div>
      </div>
    </div>
  );
}
