"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Check, Eye, EyeOff } from "lucide-react";
import { LangSwitch, type RhLang } from "@/components/rh/chrome/shell";
import { RhButton } from "@/components/rh/ui/primitives";

type View = "login" | "forgot" | "sent" | "done" | "no_profile";

const FEATURES = [
  { label: "Congés, RTT et récupération", meta: "SOLDES EN DIRECT", dot: "#46D6C0" },
  { label: "Télétravail et article 1.6", meta: "DROIT CALCULÉ", dot: "#7C8CF8" },
  { label: "Feuilles de temps et heures supp.", meta: "25 % / 50 %", dot: "#F0C24E" },
  { label: "Notes de frais et titres-restaurant", meta: "BARÈME 2026", dot: "#E5F2B5" },
];

export function LoginScreen() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [view, setView] = useState<View>("login");
  const [lang, setLang] = useState<RhLang>("fr");
  const [showPwd, setShowPwd] = useState(false);
  const [stay, setStay] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prenom, setPrenom] = useState("");
  const [homePath, setHomePath] = useState("/rh/espace");
  const [canAccessPeople, setCanAccessPeople] = useState(false);
  const [todoCount, setTodoCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    void (async () => {
      const res = await fetch("/api/rh/me");
      if (res.status === 403) {
        setView("no_profile");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setPrenom(data.employee?.prenom || session.user?.name?.split(" ")[0] || "");
      setHomePath(data.homePath || "/rh/espace");
      setCanAccessPeople(!!data.canAccessPeople);
      setView("done");
      const home = await fetch("/api/rh/home");
      if (home.ok) {
        const h = await home.json();
        setTodoCount(h.pendingCount ?? 0);
      }
    })();
  }, [status, session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && view === "login") {
        e.preventDefault();
        void handleLogin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, email, password]);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Attendre que le cookie de session soit bien posé
      const { getSession } = await import("next-auth/react");
      await getSession();

      let me: Response | null = null;
      for (let i = 0; i < 4; i++) {
        me = await fetch("/api/rh/me", { cache: "no-store" });
        if (me.ok || me.status === 403) break;
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!me) {
        setError("Impossible de charger le profil RH");
        setLoading(false);
        return;
      }

      if (me.status === 403) {
        setView("no_profile");
        setLoading(false);
        return;
      }
      if (!me.ok) {
        const body = await me.json().catch(() => ({}));
        setError(
          typeof body.error === "string"
            ? body.error
            : "Impossible de charger le profil RH"
        );
        setLoading(false);
        return;
      }
      const data = await me.json();
      setPrenom(data.employee?.prenom || "");
      setHomePath(data.homePath || "/rh/espace");
      setCanAccessPeople(!!data.canAccessPeople);
      setView("done");
      const home = await fetch("/api/rh/home", { cache: "no-store" });
      if (home.ok) {
        const h = await home.json();
        setTodoCount(h.pendingCount ?? 0);
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-wrap"
      style={{ background: "#08090C" }}
    >
      <div
        className="relative overflow-hidden flex flex-col justify-between"
        style={{
          flex: "1 1 460px",
          minWidth: 340,
          background: "#0B0E12",
          borderRight: "1px solid #1B212A",
          padding: "38px 42px",
        }}
      >
        <div
          className="pointer-events-none absolute"
          style={{
            left: -160,
            top: -140,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(229,242,181,.07),transparent 68%)",
          }}
        />
        <img
          src="/rh/glowup-logo.svg"
          alt="Glow Up"
          className="relative"
          style={{ height: 17, width: "auto", display: "block" }}
        />

        <div
          className="relative flex flex-col gap-[26px] max-w-[440px]"
          style={{ padding: "40px 0" }}
        >
          <div
            className="inline-flex items-center gap-2 self-start"
            style={{
              border: "1px solid #232932",
              background: "#10141A",
              borderRadius: 20,
              padding: "5px 11px",
            }}
          >
            <span
              className="rh-pulse block rounded-full"
              style={{ width: 6, height: 6, background: "#E5F2B5" }}
            />
            <span
              className="rh-mono text-[9.5px] tracking-[0.12em]"
              style={{ color: "#8B95A5" }}
            >
              NOUVEL ESPACE RH
            </span>
          </div>
          <h1
            className="m-0 font-semibold"
            style={{
              fontSize: 38,
              letterSpacing: "-0.025em",
              lineHeight: 1.12,
              color: "#E7ECF2",
            }}
          >
            Absences, temps et frais
            <br />
            <span style={{ color: "#7E8998" }}>Au même endroit</span>
          </h1>
          <p
            className="m-0 text-[14px] leading-[1.6]"
            style={{ color: "#8B95A5", maxWidth: "38ch" }}
          >
            Même identifiant que la plateforme Glow Up. Connexion sécurisée pour
            poser, valider et exporter.
          </p>
          <div className="flex flex-col gap-3">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <span
                  className="shrink-0"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: f.dot,
                  }}
                />
                <span className="flex-1 text-[12.5px]" style={{ color: "#B9C2CE" }}>
                  {f.label}
                </span>
                <span
                  className="rh-mono text-[9.5px] tracking-[0.08em]"
                  style={{ color: "#5F6978" }}
                >
                  {f.meta}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="relative flex items-start gap-3 p-[15px]"
          style={{
            background: "rgba(242,135,78,.05)",
            border: "1px solid rgba(242,135,78,.28)",
            borderRadius: 13,
          }}
        >
          <span
            className="rh-mono text-[9.5px] font-bold shrink-0 px-1.5 py-0.5"
            style={{
              background: "rgba(242,135,78,.15)",
              color: "#F2874E",
              borderRadius: 4,
            }}
          >
            LUCCA
          </span>
          <p className="m-0 text-[11.5px] leading-[1.55]" style={{ color: "#B9C2CE" }}>
            Lucca résilié le 31/08/2026 — bienvenue sur Glow Up RH.
          </p>
        </div>
      </div>

      <div
        className="flex flex-col"
        style={{ flex: "1 1 520px", padding: "38px 42px" }}
      >
        <div className="flex items-center justify-between mb-8">
          <LangSwitch lang={lang} onChange={setLang} />
          <a
            href="mailto:maud@glowupagence.fr"
            className="rh-mono text-[10px] tracking-[0.1em]"
            style={{ color: "#8B95A5" }}
          >
            AIDE
          </a>
        </div>

        <div className="flex-1 flex flex-col justify-center mx-auto w-full max-w-[400px]">
          {view === "login" && (
            <div className="rh-rise flex flex-col gap-5">
              <div>
                <div
                  className="rh-mono text-[10px] tracking-[0.14em]"
                  style={{ color: "#5F6978" }}
                >
                  CONNEXION
                </div>
                <h2 className="m-0 mt-[7px] text-[24px] font-semibold tracking-[-0.02em]">
                  Content de te revoir
                </h2>
              </div>

              <button
                type="button"
                disabled
                title="SSO Google — bientôt"
                className="rh-btn-secondary w-full flex items-center justify-center gap-2.5 py-3 text-[13px] opacity-50 cursor-not-allowed"
              >
                Continuer avec Google Workspace
              </button>

              <div className="flex items-center gap-3">
                <span className="flex-1 h-px" style={{ background: "#1B212A" }} />
                <span
                  className="rh-mono text-[9.5px] tracking-[0.1em]"
                  style={{ color: "#5F6978" }}
                >
                  OU
                </span>
                <span className="flex-1 h-px" style={{ background: "#1B212A" }} />
              </div>

              <label className="flex flex-col gap-1.5">
                <span
                  className="rh-mono text-[9.5px] tracking-[0.1em]"
                  style={{ color: "#5F6978" }}
                >
                  ADRESSE PROFESSIONNELLE
                </span>
                <input
                  className="rh-input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="s.zeddam@glowupagence.fr"
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className="rh-mono text-[9.5px] tracking-[0.1em]"
                    style={{ color: "#5F6978" }}
                  >
                    MOT DE PASSE
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push("/forgot-password")}
                    className="border-0 bg-transparent p-0 text-[11.5px] font-semibold cursor-pointer"
                    style={{ color: "#E5F2B5" }}
                  >
                    Oublié ?
                  </button>
                </div>
                <div
                  className="flex items-center gap-[9px] px-[13px]"
                  style={{
                    background: "#0E1116",
                    border: "1px solid #232932",
                    borderRadius: 10,
                  }}
                >
                  <input
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 min-w-0 border-0 bg-transparent py-3 text-[13.5px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="rh-mono border-0 bg-transparent p-0 cursor-pointer text-[9.5px] font-bold shrink-0"
                    style={{ color: "#5F6978" }}
                  >
                    {showPwd ? <EyeOff size={14} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStay((v) => !v)}
                className="flex items-center gap-2.5 border-0 bg-transparent p-0 cursor-pointer text-left"
              >
                <span
                  className="grid place-items-center shrink-0 text-[10px] font-bold"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    background: stay ? "#E5F2B5" : "#12161C",
                    border: stay ? 0 : "1px solid #3A4553",
                    color: "#0A0C0F",
                  }}
                >
                  {stay ? "✓" : ""}
                </span>
                <span className="flex-1 text-[12.5px]" style={{ color: "#B9C2CE" }}>
                  Rester connectée sur cet appareil
                </span>
                <span className="rh-mono text-[9px]" style={{ color: "#5F6978" }}>
                  14 J
                </span>
              </button>

              {error && (
                <p className="m-0 text-[12.5px]" style={{ color: "#F2604E" }}>
                  {error}
                </p>
              )}

              <RhButton
                className="w-full py-[13px] text-[13.5px]"
                shortcut="⌘↵"
                disabled={loading || !email || !password}
                onClick={() => void handleLogin()}
              >
                {loading ? "Connexion…" : "Se connecter"}
              </RhButton>
            </div>
          )}

          {view === "done" && (
            <div className="rh-rise flex flex-col gap-5 items-start">
              <div
                className="grid place-items-center rounded-full"
                style={{
                  width: 46,
                  height: 46,
                  background: "#E5F2B5",
                  color: "#0A0C0F",
                }}
              >
                <Check size={22} strokeWidth={2.5} />
              </div>
              <div>
                <div
                  className="rh-mono text-[10px] tracking-[0.14em]"
                  style={{ color: "#5F6978" }}
                >
                  SESSION OUVERTE
                </div>
                <h2 className="m-0 mt-[7px] text-[24px] font-semibold tracking-[-0.02em]">
                  Bonjour {prenom || ""}
                </h2>
                <p
                  className="m-0 mt-2 text-[13px]"
                  style={{ color: "#8B95A5" }}
                >
                  {todoCount > 0
                    ? `${todoCount} demande(s) en cours`
                    : "Tout est à jour"}
                </p>
              </div>
              <RhButton
                className="w-full py-[13px]"
                onClick={() => {
                  window.location.assign(
                    canAccessPeople ? "/rh/people" : homePath
                  );
                }}
              >
                {canAccessPeople ? "Ouvrir People" : "Entrer"}
              </RhButton>
              {canAccessPeople ? (
                <button
                  type="button"
                  className="w-full rh-btn-secondary py-3 text-[13px] cursor-pointer"
                  onClick={() => window.location.assign("/rh/espace")}
                >
                  Mon espace salarié
                </button>
              ) : null}
            </div>
          )}

          {view === "no_profile" && (
            <div className="rh-rise flex flex-col gap-5">
              <h2 className="m-0 text-[24px] font-semibold">Accès RH non provisionné</h2>
              <p className="m-0 text-[13px] leading-[1.6]" style={{ color: "#8B95A5" }}>
                Ton compte plateforme est reconnu, mais aucun profil RH n&apos;est
                associé. Contacte Maud pour être ajouté à l&apos;effectif.
              </p>
              <RhButton className="w-full py-[13px]" onClick={() => router.push("/")}>
                Retour plateforme
              </RhButton>
            </div>
          )}
        </div>

        <p
          className="rh-mono text-center text-[9.5px] tracking-[0.08em] mt-8"
          style={{ color: "#5F6978" }}
        >
          GLOW UP AGENCY · AIX-EN-PROVENCE
        </p>
      </div>
    </div>
  );
}
