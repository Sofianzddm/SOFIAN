"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Glow Up — écran de connexion
 * Palette : Licorice #220101 · Old rose #B06F70 · Old lace #F5EDE0 · Tea green #E5F2B5
 * Polices  : Space Grotesk (interface) · JetBrains Mono (micro-labels)
 */

const MONO = "var(--font-login-mono), 'JetBrains Mono', monospace";
const SANS = "var(--font-login-sans), 'Space Grotesk', system-ui, sans-serif";
const LACE = "#F5EDE0";
const GREEN = "#E5F2B5";
const LICORICE = "#220101";
const ROSE = "#E8C4BE";
const BORDER = "rgba(245,237,224,.15)";
const BORDER_HOVER = "rgba(245,237,224,.26)";
const FIELD_BG_SOLID = "#2c1413";

const loginStyles = `
@keyframes glowup-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes glowup-spin{to{transform:rotate(360deg)}}
.glowup-login{color-scheme:dark}
.glowup-login input,
.glowup-login input:-webkit-autofill,
.glowup-login input:-webkit-autofill:hover,
.glowup-login input:-webkit-autofill:focus,
.glowup-login input:-webkit-autofill:active{
  -webkit-text-fill-color:${LACE} !important;
  caret-color:${LACE};
  color:${LACE} !important;
  background-color:transparent !important;
  background-image:none !important;
  box-shadow:0 0 0 1000px ${FIELD_BG_SOLID} inset !important;
  transition:background-color 99999s ease-out 0s;
  border-radius:inherit;
}
.glowup-login .glowup-login-field-wrap input,
.glowup-login .glowup-login-field-wrap input:-webkit-autofill,
.glowup-login .glowup-login-field-wrap input:-webkit-autofill:hover,
.glowup-login .glowup-login-field-wrap input:-webkit-autofill:focus,
.glowup-login .glowup-login-field-wrap input:-webkit-autofill:active{
  box-shadow:0 0 0 1000px ${FIELD_BG_SOLID} inset !important;
  background-color:transparent !important;
}
`;

const microLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: ".1em",
  color: "rgba(245,237,224,.46)",
};

const fieldBase: CSSProperties = {
  width: "100%",
  background: FIELD_BG_SOLID,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: "13px 14px",
  fontSize: 13.5,
  color: LACE,
  WebkitTextFillColor: LACE,
  caretColor: LACE,
  font: "inherit",
  outline: "none",
  transition: "border-color .22s",
};

const primaryButton: CSSProperties = {
  width: "100%",
  background: GREEN,
  color: LICORICE,
  border: 0,
  borderRadius: 12,
  padding: 14,
  fontSize: 13.5,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  transition: "filter .16s",
};

const ghostButton: CSSProperties = {
  width: "100%",
  background: "rgba(245,237,224,.07)",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 13,
  fontSize: 13,
  fontWeight: 600,
  color: LACE,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  transition: "border-color .16s",
};

const heading: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: "-.02em",
};
const eyebrow: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: ".14em",
  color: "rgba(245,237,224,.46)",
};
const bodyText: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: "rgba(245,237,224,.6)",
  lineHeight: 1.55,
};

export type GlowUpLoginCredentials = {
  email: string;
  password: string;
};

export type GlowUpLoginProps = {
  onSubmit?: (credentials: GlowUpLoginCredentials) => Promise<void> | void;
  onGoogle?: () => void;
  onResetRequest?: (email: string) => Promise<void> | void;
  onEnterApp?: () => void;
  userFirstName?: string;
  initialError?: string;
};

type View = "login" | "forgot" | "sent" | "done";

function Spinner() {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid rgba(34,1,1,.25)",
        borderTopColor: LICORICE,
        animation: "glowup-spin .7s linear infinite",
        display: "block",
      }}
    />
  );
}

function GlowUpLogo({ height = 19 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 1314 230"
      style={{ height, width: "auto", display: "block" }}
      role="img"
      aria-label="Glow Up"
    >
      <path
        fill="#FFFFFF"
        d="M211.638 134.51L212.167 188.968C160.631 212.839 104.647 183.284 102 110.903C99.1152 35.534 183.5 2.91218 245.81 90.2298L246.604 89.9919L237.657 45.7118C168.783 9.62689 68.3574 36.7236 68.3574 123.301C68.3574 214.848 190.356 241.469 248.192 167.581V107.387H198.456C203.988 114.842 211.664 125.31 211.664 134.51H211.638Z"
      />
      <path
        fill="#FFFFFF"
        d="M309.47 197.401V32.9962H272.915V207.129H410.134L410.478 173.529C390.414 189.47 350.709 197.401 320.746 197.401H309.443H309.47Z"
      />
      <path
        fill="#FFFFFF"
        d="M572.049 50.9197C531.312 18.8266 472.417 25.039 439.277 63.371C406.931 102.443 412.728 158.408 453.2 190.501C493.937 220.849 553.626 215.139 587.004 176.569C618.821 137.999 611.992 81.5324 572.022 50.9461L572.049 50.9197ZM558.126 158.381C526.309 195.444 492.693 211.121 459.023 184.5C434.301 164.858 434.301 122.085 465.853 85.4978C496.875 48.6726 538.909 36.0099 566.781 56.4183C599.127 80.2899 588.883 121.821 558.126 158.408V158.381Z"
      />
      <path
        fill="#FFFFFF"
        d="M1063.03 34.0007V125.046C1063.03 217.598 945.006 230.525 945.006 126.288V32.9962H907.684V128.773C907.684 237.002 1071.74 238.746 1071.74 126.05V32.9962H1063.06V34.0007H1063.03Z"
      />
      <path
        fill="#FFFFFF"
        d="M1169.71 32.9962H1094.24V207.129H1130.8V136.73L1169.71 136.492C1213.62 136.255 1244.64 115.106 1244.64 83.4886C1244.64 54.1449 1213.62 32.9962 1169.71 32.9962ZM1152.87 127.504H1130.8V39.7373H1152.87C1189.16 39.7373 1205.71 52.1357 1205.71 80.5014C1205.71 112.357 1189.14 127.504 1152.87 127.504Z"
      />
      <path
        fill="#FFFFFF"
        d="M870.362 13.1693L850.51 32.9962L857.18 39.658C868.456 51.5013 864.062 64.8514 855.751 81.2416L813.161 166.074L755.854 57.8723L743.228 34.4766L742.434 32.9962H702.2L702.465 33.4985L714.297 54.885L740.846 105.378L710.353 165.836L650.955 57.37L637.799 34.2387L637.005 32.9962H597.036L597.83 34.2387L611.224 58.1102L697.197 210.116H697.727L746.616 113.837L799.714 210.116H800.244L890.161 33.472L890.426 32.9697H890.188L870.336 13.1429L870.362 13.1693Z"
      />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 48 48"
      style={{ flex: "0 0 17px", display: "block" }}
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

export function GlowUpLogin({
  onSubmit,
  onGoogle,
  onResetRequest,
  onEnterApp,
  userFirstName = "Leyna",
  initialError = "",
}: GlowUpLoginProps) {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [stay, setStay] = useState(true);
  const submitRef = useRef(() => {});

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);

  const submit = async () => {
    if (loading) return;
    if (view === "login") {
      setLoading(true);
      setError("");
      try {
        await onSubmit?.({ email, password });
        setView("done");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Une erreur est survenue. Réessaie."
        );
      } finally {
        setLoading(false);
      }
    } else if (view === "forgot") {
      setLoading(true);
      setError("");
      try {
        await onResetRequest?.(resetEmail);
        setView("sent");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible d'envoyer le lien. Réessaie."
        );
      } finally {
        setLoading(false);
      }
    }
  };
  submitRef.current = submit;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goLogin = () => {
    setView("login");
    setCaps(false);
    setError("");
  };

  return (
    <div
      className="glowup-login"
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        background:
          "linear-gradient(180deg,#220101 0%,#220101 44%,#7A3F3D 70%,#C08D89 89%,#F2E6E1 100%)",
        fontFamily: SANS,
        color: LACE,
        fontSize: 13.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <style>{loginStyles}</style>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(62% 34% at 50% 104%,rgba(255,255,255,.5),rgba(255,255,255,0) 68%)",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 404,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          animation: "glowup-rise .34s ease both",
        }}
      >
        <GlowUpLogo />

        <div
          style={{
            width: "100%",
            background: "rgba(46,14,13,.72)",
            backdropFilter: "blur(26px) saturate(130%)",
            WebkitBackdropFilter: "blur(26px) saturate(130%)",
            border: "1px solid rgba(245,237,224,.2)",
            borderRadius: 18,
            boxShadow:
              "0 48px 96px -44px rgba(14,1,1,.92), inset 0 1px 0 rgba(245,237,224,.14)",
            padding: "26px 26px 22px",
          }}
        >
          {view === "login" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={eyebrow}>CONNEXION</span>
                <h1 style={heading}>Content de te revoir</h1>
              </div>

              <button
                type="button"
                onClick={onGoogle}
                style={ghostButton}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,237,224,.32)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = BORDER)
                }
              >
                <GoogleMark />
                Continuer avec Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background: "rgba(245,237,224,.12)",
                  }}
                />
                <span style={microLabel}>OU</span>
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background: "rgba(245,237,224,.12)",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={microLabel}>ADRESSE PROFESSIONNELLE</span>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom@glowupagence.fr"
                    autoComplete="email"
                    style={{
                      ...fieldBase,
                      padding: "13px 38px 13px 14px",
                      borderColor:
                        email && emailValid ? "rgba(229,242,181,.5)" : BORDER,
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LACE)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor =
                        email && emailValid
                          ? "rgba(229,242,181,.5)"
                          : BORDER)
                    }
                  />
                  {emailValid && (
                    <span
                      style={{
                        position: "absolute",
                        right: 13,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: GREEN,
                        color: LICORICE,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                        fontWeight: 800,
                        pointerEvents: "none",
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span style={microLabel}>MOT DE PASSE</span>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setView("forgot");
                      setError("");
                    }}
                    style={{
                      border: 0,
                      background: "none",
                      padding: 0,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: ROSE,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    Oublié ?
                  </button>
                </div>
                <div
                  className="glowup-login-field-wrap"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    background: FIELD_BG_SOLID,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    padding: "0 14px",
                    transition: "border-color .16s",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = BORDER_HOVER)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = BORDER)
                  }
                >
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) =>
                      setCaps(
                        typeof e.getModifierState === "function" &&
                          e.getModifierState("CapsLock")
                      )
                    }
                    autoComplete="current-password"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "transparent",
                      border: 0,
                      padding: "12px 0",
                      fontSize: 13.5,
                      letterSpacing: ".12em",
                      color: LACE,
                      WebkitTextFillColor: LACE,
                      font: "inherit",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    style={{
                      border: 0,
                      background: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: MONO,
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: "rgba(245,237,224,.46)",
                      flex: "0 0 auto",
                    }}
                  >
                    {showPw ? "MASQUER" : "VOIR"}
                  </button>
                </div>
                {caps && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      paddingTop: 4,
                      animation: "glowup-rise .2s ease both",
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: ROSE,
                        flex: "0 0 5px",
                      }}
                    />
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 9.5,
                        letterSpacing: ".06em",
                        color: ROSE,
                      }}
                    >
                      VERROUILLAGE MAJUSCULES ACTIVÉ
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStay((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: 0,
                  background: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    background: stay ? LACE : "transparent",
                    border: stay ? 0 : `1px solid ${BORDER}`,
                    color: LICORICE,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    flex: "0 0 16px",
                  }}
                >
                  {stay ? "✓" : ""}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    color: "rgba(245,237,224,.74)",
                  }}
                >
                  Rester connectée sur cet appareil
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    color: "rgba(245,237,224,.46)",
                  }}
                >
                  30 J
                </span>
              </button>

              {error && (
                <div
                  style={{
                    padding: "11px 13px",
                    borderRadius: 12,
                    background: "rgba(232,100,100,.12)",
                    border: "1px solid rgba(232,100,100,.35)",
                    color: "#F5C4C0",
                    fontSize: 12.5,
                    lineHeight: 1.45,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={loading}
                style={{ ...primaryButton, gap: 9, opacity: loading ? 0.85 : 1 }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.filter = "brightness(1.06)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
              >
                {loading ? (
                  <>
                    <Spinner />
                    Connexion…
                  </>
                ) : (
                  <>
                    Se connecter
                    <span
                      style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.5 }}
                    >
                      ⌘↵
                    </span>
                  </>
                )}
              </button>

            </div>
          )}

          {view === "forgot" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              <button
                type="button"
                onClick={goLogin}
                style={{
                  alignSelf: "flex-start",
                  border: 0,
                  background: "none",
                  padding: 0,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".08em",
                  color: "rgba(245,237,224,.6)",
                  cursor: "pointer",
                }}
              >
                ← RETOUR
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={eyebrow}>MOT DE PASSE OUBLIÉ</span>
                <h1 style={heading}>On te renvoie un lien</h1>
                <p style={{ ...bodyText, lineHeight: 1.5 }}>
                  Valable une heure, sur ton adresse professionnelle.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={microLabel}>ADRESSE PROFESSIONNELLE</span>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="prenom@glowupagence.fr"
                  autoComplete="email"
                  style={fieldBase}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LACE)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
                />
              </div>
              {error && (
                <div
                  style={{
                    padding: "11px 13px",
                    borderRadius: 12,
                    background: "rgba(232,100,100,.12)",
                    border: "1px solid rgba(232,100,100,.35)",
                    color: "#F5C4C0",
                    fontSize: 12.5,
                    lineHeight: 1.45,
                  }}
                >
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                style={{ ...primaryButton, opacity: loading ? 0.85 : 1 }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.filter = "brightness(1.06)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
              >
                {loading && <Spinner />}
                Envoyer le lien
              </button>
            </div>
          )}

          {view === "sent" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                textAlign: "center",
                padding: "6px 0",
              }}
            >
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: "rgba(245,237,224,.1)",
                  border: "1px solid rgba(245,237,224,.28)",
                  color: LACE,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                ✓
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h1 style={heading}>C&apos;est envoyé</h1>
                <p style={bodyText}>
                  Regarde ta boîte professionnelle. Sans réception d&apos;ici
                  deux minutes, vérifie tes indésirables.
                </p>
              </div>
              <button
                type="button"
                onClick={goLogin}
                style={ghostButton}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,237,224,.32)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = BORDER)
                }
              >
                Revenir à la connexion
              </button>
            </div>
          )}

          {view === "done" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                textAlign: "center",
                padding: "6px 0",
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  background: GREEN,
                  color: LICORICE,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 19,
                  fontWeight: 700,
                }}
              >
                ✓
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={eyebrow}>SESSION OUVERTE</span>
                <h1 style={heading}>Bonjour {userFirstName}</h1>
              </div>
              <button type="button" onClick={onEnterApp} style={primaryButton}>
                Entrer dans mon espace
              </button>
              <button
                type="button"
                onClick={goLogin}
                style={{
                  border: 0,
                  background: "none",
                  padding: 0,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".08em",
                  color: "rgba(245,237,224,.46)",
                  cursor: "pointer",
                }}
              >
                REVOIR L&apos;ÉCRAN DE CONNEXION
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            paddingTop: 4,
          }}
        >
          <span
            style={{
              width: 28,
              height: 1,
              background: "rgba(34,1,1,.28)",
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.16em",
              color: "rgba(34,1,1,.78)",
              textTransform: "uppercase",
            }}
          >
            © 2026 Glow Up Agency
          </span>
        </div>
      </div>
    </div>
  );
}
