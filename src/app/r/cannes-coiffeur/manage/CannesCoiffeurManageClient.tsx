"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GlowUpLogo } from "@/components/ui/logo";

type BookingState =
  | { kind: "loading" }
  | { kind: "not_found" | "cancelled" }
  | {
      kind: "active";
      startsAt: string;
      endsAt: string;
      guestName: string;
      guestEmail: string;
      displayStartParis: string;
    }
  | { kind: "cancel_done" };

export default function CannesCoiffeurManageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("t")?.trim() || "";
  const [state, setState] = useState<BookingState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const bookingLink = useMemo(() => "/r/cannes-coiffeur", []);

  useEffect(() => {
    if (!token) {
      setState({ kind: "not_found" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/pub/cannes-coiffeur/booking?t=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as
          | {
              status?: "active" | "cancelled" | "not_found";
              startsAt?: string;
              endsAt?: string;
              guestName?: string;
              guestEmail?: string;
              displayStartParis?: string;
            };
        if (cancelled) return;
        if (!res.ok || data.status === "not_found") {
          setState({ kind: "not_found" });
          return;
        }
        if (data.status === "cancelled") {
          setState({ kind: "cancelled" });
          return;
        }
        if (data.status === "active" && data.startsAt && data.endsAt && data.displayStartParis) {
          setState({
            kind: "active",
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            guestName: data.guestName ?? "",
            guestEmail: data.guestEmail ?? "",
            displayStartParis: data.displayStartParis,
          });
          return;
        }
        setState({ kind: "not_found" });
      } catch {
        if (!cancelled) setState({ kind: "not_found" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const cancelBooking = async (redirectToBooking: boolean) => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/pub/cannes-coiffeur/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (data.error) {
          alert(data.error);
        }
        return;
      }
      if (redirectToBooking) {
        router.push(bookingLink);
        return;
      }
      setState({ kind: "cancel_done" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-dvh min-h-screen flex-col overflow-x-hidden bg-gradient-login px-[max(1rem,env(safe-area-inset-left))] pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 sm:gap-8">
        <div className="flex justify-center pt-2 sm:pt-0">
          <GlowUpLogo className="h-auto w-40 shrink-0 sm:w-52 md:w-64" variant="light" />
        </div>

        <div className="glass-dark rounded-2xl p-5 shadow-2xl sm:p-7">
          {state.kind === "loading" && (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-glowup-lace/75">
              <Loader2 className="h-9 w-9 animate-spin text-glowup-rose-light" />
              <p className="text-sm">Chargement de ta réservation…</p>
            </div>
          )}

          {(state.kind === "not_found" || state.kind === "cancelled") && (
            <div className="space-y-4 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-glowup-lace/50">Cannes 2026</p>
              <h1 className="text-xl font-semibold text-glowup-lace">Réservation indisponible</h1>
              <p className="text-sm leading-relaxed text-glowup-lace/75">
                Cette réservation n&apos;existe plus ou a déjà été annulée.
              </p>
              <Link
                href={bookingLink}
                className="inline-block rounded-lg bg-glowup-rose px-4 py-2.5 text-sm font-medium text-white"
              >
                Retour au calendrier
              </Link>
            </div>
          )}

          {state.kind === "active" && (
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.2em] text-glowup-lace/50">Cannes 2026</p>
              <h1 className="text-xl font-semibold text-glowup-lace">Gérer ma réservation</h1>
              <div className="rounded-xl border border-glowup-rose/30 bg-black/20 p-4 text-sm text-glowup-lace/90">
                <p className="font-medium">{state.displayStartParis} (Paris)</p>
                {state.guestName ? <p className="mt-2 text-glowup-lace/70">Nom : {state.guestName}</p> : null}
                {state.guestEmail ? <p className="text-glowup-lace/70">Email : {state.guestEmail}</p> : null}
              </div>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void cancelBooking(false)}
                  className="min-h-[46px] rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {submitting ? "Annulation en cours…" : "Annuler ma réservation"}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void cancelBooking(true)}
                  className="min-h-[46px] rounded-lg border border-glowup-rose/45 px-4 py-2.5 text-sm font-medium text-glowup-lace disabled:opacity-70"
                >
                  Choisir un autre créneau
                </button>
              </div>
            </div>
          )}

          {state.kind === "cancel_done" && (
            <div className="space-y-4 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-glowup-lace/50">Cannes 2026</p>
              <h1 className="text-xl font-semibold text-glowup-lace">Réservation annulée</h1>
              <p className="text-sm leading-relaxed text-glowup-lace/75">
                Ton créneau a bien été annulé. Tu peux maintenant sélectionner un nouveau créneau.
              </p>
              <Link
                href={bookingLink}
                className="inline-block rounded-lg bg-glowup-rose px-4 py-2.5 text-sm font-medium text-white"
              >
                Ouvrir le calendrier
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
