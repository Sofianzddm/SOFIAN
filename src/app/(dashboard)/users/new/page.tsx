"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, UserPlus, Eye, EyeOff, Lock } from "lucide-react";

const roleOptions = [
  { value: "ADMIN", label: "Administrateur", description: "Accès complet à toutes les fonctionnalités" },
  { value: "HEAD_OF", label: "Head of", description: "Gestion complète de l'agence" },
  { value: "HEAD_OF_INFLUENCE", label: "Head of Influence", description: "Gestion du pôle Influence" },
  { value: "HEAD_OF_SALES", label: "Head of Sales", description: "Gestion du pôle Sales" },
  { value: "TM", label: "Talent Manager", description: "Gestion des talents et négociations" },
  { value: "CM", label: "Community Manager", description: "Gestion des contenus" },
  { value: "TALENT", label: "Talent", description: "Accès limité au portail talent" },
];

export default function NewUserPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    prenom: "",
    nom: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "TM",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Vérifier les permissions
  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-lg">
          ⛔ Seuls les administrateurs peuvent créer des utilisateurs
        </p>
        <Link href="/users" className="text-glowup-rose hover:underline mt-4 inline-block">
          Retour à la liste
        </Link>
      </div>
    );
  }

  function validateForm() {
    const newErrors: Record<string, string> = {};

    if (!formData.prenom.trim()) newErrors.prenom = "Le prénom est requis";
    if (!formData.nom.trim()) newErrors.nom = "Le nom est requis";
    if (!formData.email.trim()) {
      newErrors.email = "L'email est requis";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "L'email n'est pas valide";
    }
    if (!formData.password.trim()) {
      newErrors.password = "Le mot de passe est requis";
    } else if (formData.password.length < 8) {
      newErrors.password = "Le mot de passe doit contenir au moins 8 caractères";
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Les mots de passe ne correspondent pas";
    }
    if (!formData.role) newErrors.role = "Le rôle est requis";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`❌ Erreur : ${data.error}`);
        return;
      }

      alert(`✅ Utilisateur ${formData.prenom} ${formData.nom} créé avec succès !`);
      router.push("/users");
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur lors de la création de l'utilisateur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/users"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-glowup-licorice flex items-center gap-3">
            <UserPlus className="w-8 h-8" />
            Nouvel Utilisateur
          </h1>
          <p className="text-gray-600 mt-1">
            Créer un nouveau compte utilisateur
          </p>
        </div>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl border border-gray-200 space-y-6">
        {/* Informations personnelles */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Informations personnelles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Prénom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prénom *
              </label>
              <input
                type="text"
                value={formData.prenom}
                onChange={(e) =>
                  setFormData({ ...formData, prenom: e.target.value })
                }
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent ${
                  errors.prenom ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="Jean"
              />
              {errors.prenom && (
                <p className="text-red-600 text-sm mt-1">{errors.prenom}</p>
              )}
            </div>

            {/* Nom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom *
              </label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) =>
                  setFormData({ ...formData, nom: e.target.value })
                }
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent ${
                  errors.nom ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="Dupont"
              />
              {errors.nom && (
                <p className="text-red-600 text-sm mt-1">{errors.nom}</p>
              )}
            </div>
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email *
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent ${
              errors.email ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="jean.dupont@glowupagence.fr"
          />
          {errors.email && (
            <p className="text-red-600 text-sm mt-1">{errors.email}</p>
          )}
        </div>

        {/* Mot de passe */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Mot de passe
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className={`w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent ${
                    errors.password ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-600 text-sm mt-1">{errors.password}</p>
              )}
              <p className="text-gray-500 text-xs mt-1">
                Minimum 8 caractères
              </p>
            </div>

            {/* Confirmation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirmer le mot de passe *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  className={`w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent ${
                    errors.confirmPassword ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>
              )}
            </div>
          </div>
        </div>

        {/* Rôle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rôle *
          </label>
          <div className="space-y-3">
            {roleOptions.map((role) => (
              <label
                key={role.value}
                className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-all ${
                  formData.role === role.value
                    ? "border-glowup-rose bg-pink-50"
                    : "border-gray-300 hover:border-glowup-rose hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  checked={formData.role === role.value}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  className="mt-1 text-glowup-rose focus:ring-glowup-rose"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{role.label}</div>
                  <div className="text-sm text-gray-600">{role.description}</div>
                </div>
              </label>
            ))}
          </div>
          {errors.role && (
            <p className="text-red-600 text-sm mt-2">{errors.role}</p>
          )}
        </div>

        {/* Note sécurité */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>ℹ️ Information :</strong> L'utilisateur pourra se connecter immédiatement avec l'email et le mot de passe définis ci-dessus.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-6 border-t">
          <Link
            href="/users"
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-gradient-to-r from-glowup-rose to-purple-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Création...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Créer l'utilisateur
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
