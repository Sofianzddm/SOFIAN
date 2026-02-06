"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, UserCog } from "lucide-react";

interface User {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
}

const roleOptions = [
  { value: "ADMIN", label: "Administrateur" },
  { value: "HEAD_OF", label: "Head of" },
  { value: "HEAD_OF_INFLUENCE", label: "Head of Influence" },
  { value: "HEAD_OF_SALES", label: "Head of Sales" },
  { value: "TM", label: "Talent Manager" },
  { value: "CM", label: "Community Manager" },
  { value: "TALENT", label: "Talent" },
];

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    prenom: "",
    nom: "",
    email: "",
    role: "",
    actif: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const isAdmin = session?.user?.role === "ADMIN";
  const isOwnProfile = session?.user?.id === params.id;

  useEffect(() => {
    fetchUser();
  }, [params.id]);

  async function fetchUser() {
    try {
      const res = await fetch(`/api/users/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setFormData({
          prenom: data.prenom,
          nom: data.nom,
          email: data.email,
          role: data.role,
          actif: data.actif,
        });
      } else {
        alert("❌ Erreur lors du chargement de l'utilisateur");
        router.push("/users");
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);

    try {
      const res = await fetch(`/api/users/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`❌ Erreur : ${data.error}`);
        return;
      }

      alert(`✅ Utilisateur mis à jour avec succès !`);
      router.push("/users");
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-lg">Utilisateur non trouvé</p>
        <Link href="/users" className="text-glowup-rose hover:underline mt-4 inline-block">
          Retour à la liste
        </Link>
      </div>
    );
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
            <UserCog className="w-8 h-8" />
            Modifier l'utilisateur
          </h1>
          <p className="text-gray-600 mt-1">
            {user.prenom} {user.nom}
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
          />
          {errors.email && (
            <p className="text-red-600 text-sm mt-1">{errors.email}</p>
          )}
        </div>

        {/* Rôle et Statut - ADMIN uniquement */}
        {isAdmin && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rôle
              </label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            {!isOwnProfile && (
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.actif}
                    onChange={(e) =>
                      setFormData({ ...formData, actif: e.target.checked })
                    }
                    className="rounded text-glowup-rose focus:ring-glowup-rose"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Compte actif
                  </span>
                </label>
                <p className="text-gray-500 text-sm mt-1">
                  Un compte inactif ne peut pas se connecter
                </p>
              </div>
            )}
          </div>
        )}

        {/* Warning si modif son propre profil */}
        {isOwnProfile && !isAdmin && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              ℹ️ Vous modifiez votre propre profil. Seul un administrateur peut modifier votre
              rôle et l'état de votre compte.
            </p>
          </div>
        )}

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
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Enregistrer
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
