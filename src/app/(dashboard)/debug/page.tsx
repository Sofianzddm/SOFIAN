"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Search, Check, X, Lock } from "lucide-react";

export default function DebugPage() {
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-lg">⛔ Page réservée aux administrateurs</p>
      </div>
    );
  }

  async function checkUser() {
    if (!email) return;
    
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/debug/check-user?email=${encodeURIComponent(email)}`);
      const data = await res.json();

      if (!res.ok) {
        setResult({ error: data.error });
      } else {
        setResult(data);
      }
    } catch (error) {
      setResult({ error: "Erreur de connexion" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-glowup-licorice">🔍 Diagnostic Utilisateur</h1>
        <p className="text-gray-600 mt-1">
          Vérifier si un utilisateur a un mot de passe défini
        </p>
      </div>

      {/* Formulaire de recherche */}
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Email de l'utilisateur
        </label>
        <div className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkUser()}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
            placeholder="email@glowup-agence.com"
          />
          <button
            onClick={checkUser}
            disabled={loading || !email}
            className="flex items-center gap-2 bg-gradient-to-r from-glowup-rose to-purple-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
          >
            <Search className="w-5 h-5" />
            {loading ? "Recherche..." : "Vérifier"}
          </button>
        </div>

        {/* Exemples rapides */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-gray-600">Exemples :</span>
          {["leyna@glowup-agence.com", "ines@glowup-agence.com", "sofian@glowup-agence.com"].map(
            (ex) => (
              <button
                key={ex}
                onClick={() => setEmail(ex)}
                className="text-xs text-glowup-rose hover:underline"
              >
                {ex}
              </button>
            )
          )}
        </div>
      </div>

      {/* Résultats */}
      {result && (
        <div className={`p-6 rounded-xl border-2 ${
          result.error 
            ? "bg-red-50 border-red-200" 
            : "bg-green-50 border-green-200"
        }`}>
          {result.error ? (
            <div className="flex items-center gap-3">
              <X className="w-6 h-6 text-red-600" />
              <div>
                <p className="text-lg font-semibold text-red-900">Erreur</p>
                <p className="text-red-700">{result.error}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Check className="w-6 h-6 text-green-600" />
                <p className="text-lg font-semibold text-green-900">
                  Utilisateur trouvé !
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-white p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">ID</p>
                  <p className="font-mono text-sm">{result.id}</p>
                </div>

                <div className="bg-white p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Nom complet</p>
                  <p className="font-semibold">{result.prenom} {result.nom}</p>
                </div>

                <div className="bg-white p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Email</p>
                  <p className="font-mono text-sm">{result.email}</p>
                </div>

                <div className="bg-white p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Rôle</p>
                  <p className="font-semibold text-glowup-rose">{result.role}</p>
                </div>

                <div className="bg-white p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Actif</p>
                  <p className={result.actif ? "text-green-600" : "text-red-600"}>
                    {result.actif ? "✅ Oui" : "❌ Non"}
                  </p>
                </div>

                <div className="bg-white p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Créé le</p>
                  <p className="text-sm">
                    {new Date(result.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>

              {/* Mot de passe */}
              <div className={`p-4 rounded-lg border-2 ${
                result.hasPassword
                  ? "bg-green-100 border-green-300"
                  : "bg-red-100 border-red-300"
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  <Lock className={`w-5 h-5 ${
                    result.hasPassword ? "text-green-700" : "text-red-700"
                  }`} />
                  <p className={`font-semibold ${
                    result.hasPassword ? "text-green-900" : "text-red-900"
                  }`}>
                    Mot de passe : {result.hasPassword ? "✅ DÉFINI" : "❌ NON DÉFINI"}
                  </p>
                </div>

                {result.hasPassword ? (
                  <div className="ml-8 space-y-1">
                    <p className="text-sm text-green-800">
                      Hash : <code className="bg-white px-2 py-0.5 rounded text-xs">
                        {result.passwordStartsWith}
                      </code>
                    </p>
                    <p className="text-sm text-green-800">
                      Longueur : {result.passwordLength} caractères
                    </p>
                    <p className="text-xs text-green-700 mt-2">
                      ✅ Cet utilisateur peut se connecter avec email/mot de passe
                    </p>
                  </div>
                ) : (
                  <div className="ml-8">
                    <p className="text-sm text-red-800">
                      ⚠️ Cet utilisateur ne peut pas se connecter avec email/mot de passe
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      Solution : Modifier l'utilisateur pour définir un mot de passe
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
