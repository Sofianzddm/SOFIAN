"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  GlowUpLogin,
  type GlowUpLoginCredentials,
} from "@/components/auth/GlowUpLogin";

/**
 * Traduit le code d'erreur NextAuth en message clair. NextAuth peut renvoyer
 * "CredentialsSignin" (générique) ou, dans certains cas, un "undefined" littéral
 * lorsque l'URL de retour est polluée par un ?error=undefined. On ne montre
 * jamais ce mot brut à l'utilisateur.
 */
function messageErreurConnexion(code?: string | null): string {
  if (!code || code === "undefined" || code === "null") {
    return "Identifiants incorrects. Vérifiez votre email et votre mot de passe.";
  }
  if (code === "CredentialsSignin") {
    return "Email ou mot de passe incorrect.";
  }
  if (code === "AccessDenied" || code === "OAuthAccountNotLinked") {
    return "Aucun compte Glow Up actif n’est associé à cet e-mail Google.";
  }
  if (code === "OAuthSignin" || code === "OAuthCallback" || code === "Configuration") {
    return "Connexion Google indisponible pour le moment. Réessaie ou utilise ton mot de passe.";
  }
  return code;
}

function firstNameFromDisplayName(name?: string | null): string {
  if (!name) return "toi";
  const first = name.trim().split(/\s+/)[0];
  return first || "toi";
}

export default function LoginPage() {
  const router = useRouter();
  const [userFirstName, setUserFirstName] = useState("toi");
  const [destination, setDestination] = useState("/dashboard");
  const [initialError, setInitialError] = useState("");

  // Nettoie un éventuel ?error=… resté dans l'URL : sinon il pollue le
  // callbackUrl par défaut (window.location.href) et bloque la connexion en
  // boucle, y compris avec les bons identifiants.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const err = url.searchParams.get("error");
    if (err) {
      setInitialError(messageErreurConnexion(err));
    }
    if (url.searchParams.has("error") || url.searchParams.has("callbackUrl")) {
      url.searchParams.delete("error");
      url.searchParams.delete("callbackUrl");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const handleSubmit = async ({ email, password }: GlowUpLoginCredentials) => {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    if (result?.error) {
      throw new Error(messageErreurConnexion(result.error));
    }

    const response = await fetch("/api/auth/session");
    const session = await response.json();
    const role = session?.user?.role as string | undefined;

    setUserFirstName(firstNameFromDisplayName(session?.user?.name));

    if (role === "TALENT") {
      setDestination("/talent/dashboard");
    } else if (role === "COMMUNITY_MANAGER") {
      setDestination("/community");
    } else {
      setDestination("/dashboard");
    }
  };

  const handleEnterApp = () => {
    router.push(destination);
    router.refresh();
  };

  const handleResetRequest = async (_email: string) => {
    // Pas d'endpoint de reset côté plateforme pour l'instant :
    // on laisse le flux UI aboutir (message « envoyé ») sans révéler
    // si l'adresse existe.
    await new Promise((r) => setTimeout(r, 600));
  };

  const handleGoogle = () => {
    void signIn("google", { callbackUrl: "/dashboard" });
  };

  return (
    <GlowUpLogin
      userFirstName={userFirstName}
      initialError={initialError}
      onSubmit={handleSubmit}
      onResetRequest={handleResetRequest}
      onEnterApp={handleEnterApp}
      onGoogle={handleGoogle}
    />
  );
}
