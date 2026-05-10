"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { GlowUpLogo } from "@/components/ui/logo";

type Props = {
  displayName: string;
  rememberDays: number;
};

export default function CoiffeurConsolePasswordGate({ displayName, rememberDays }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/cannes/coiffeur/console-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error || "Accès refusé");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh min-h-screen flex-col bg-gradient-login px-[max(1rem,env(safe-area-inset-left,0px))] py-[max(2rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex justify-center sm:mb-10">
          <GlowUpLogo className="h-auto w-40 shrink-0 sm:w-48" variant="light" />
        </div>

        <div className="glass-dark rounded-2xl p-5 shadow-2xl sm:p-7">
          <p className="text-center text-xs uppercase tracking-[0.22em] text-glowup-lace/50">Glow Up · Coiffeur agence · Cannes</p>
          <h1 className="mt-3 text-center font-[Spectral] text-2xl text-glowup-lace">Accès réservé</h1>
          <p className="mt-3 text-center text-sm text-glowup-lace/65">
            Bonjour {displayName}. Saisis le <strong className="text-glowup-lace">mot de passe planning coiffeur</strong> communiqué
            par Glow Up.
          </p>
          <p className="mt-2 text-center text-xs text-glowup-lace/45">
            Après validation, ce navigateur reste reconnu environ <strong className="text-glowup-lace/65">{rememberDays}</strong>{" "}
            jour{rememberDays > 1 ? "s" : ""} sans redemande (cookie sécurisé sur cet appareil).
          </p>

          <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
            <label className="block text-sm text-glowup-lace/80">
              Mot de passe
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-glowup-rose/35 bg-black/35 px-4 py-3 text-glowup-lace outline-none placeholder:text-glowup-lace/35 focus:ring-2 focus:ring-glowup-rose/50"
                placeholder="········"
              />
            </label>
            {err && (
              <p className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-center text-sm text-red-100">
                {err}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-glowup-rose py-3 text-sm font-semibold text-white transition hover:bg-glowup-rose-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Accéder à la console
            </button>
          </form>

          <div className="mt-8 border-t border-glowup-rose/25 pt-6 text-center text-sm">
            <Link href="/cannes-2026" className="text-glowup-rose-light hover:underline">
              Retour espace Cannes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
