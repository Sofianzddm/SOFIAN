"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { GlowUpLogo } from "@/components/ui/logo";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      // Récupérer la session pour vérifier le rôle
      const response = await fetch("/api/auth/session");
      const session = await response.json();

      // Redirection selon le rôle
      if (session?.user?.role === "TALENT") {
        router.push("/talent/dashboard");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch (err) {
      setError("Une erreur est survenue");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-login">
      {/* Container */}
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <GlowUpLogo className="w-64 h-auto" variant="light" />
        </div>

        {/* Card */}
        <div className="glass-dark p-8 rounded-2xl shadow-2xl">
          <h2 className="text-2xl font-semibold text-center mb-2 text-glowup-lace">
            Bienvenue
          </h2>
          <p className="text-center mb-8 text-sm text-glowup-lace/60">
            Connectez-vous à votre espace
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2 text-glowup-lace">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className="w-full px-4 py-3 rounded-lg bg-glowup-lace/10 border border-glowup-rose/50 text-glowup-lace placeholder:text-glowup-lace/40 focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/30 transition-all duration-200"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2 text-glowup-lace">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-glowup-lace/10 border border-glowup-rose/50 text-glowup-lace placeholder:text-glowup-lace/40 focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/30 transition-all duration-200 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-glowup-lace/60 hover:text-glowup-lace transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex justify-end">
              <a href="/forgot-password" className="text-sm text-glowup-rose hover:underline transition-colors">
                Mot de passe oublié ?
              </a>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-500/20 text-red-300 border border-red-500/30">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-glowup-rose hover:bg-glowup-rose-dark transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connexion...
                </>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-sm text-glowup-lace/40">
          © 2025 Glow Up Agence. Tous droits réservés.
        </p>
      </div>
    </div>
  );
}
