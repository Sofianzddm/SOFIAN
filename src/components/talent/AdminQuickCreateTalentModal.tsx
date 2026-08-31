"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  X,
  Loader2,
  Mail,
  Phone,
  Instagram,
  Music2,
} from "lucide-react";

interface Manager {
  id: string;
  prenom: string;
  nom: string;
}

interface AdminQuickCreateTalentModalProps {
  open: boolean;
  onClose: () => void;
}

export function AdminQuickCreateTalentModal({
  open,
  onClose,
}: AdminQuickCreateTalentModalProps) {
  const router = useRouter();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    instagram: "",
    tiktok: "",
    managerId: "",
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      prenom: "",
      nom: "",
      email: "",
      telephone: "",
      instagram: "",
      tiktok: "",
      managerId: "",
    });
    setLoadingManagers(true);
    fetch("/api/users?role=TM")
      .then((res) => (res.ok ? res.json() : []))
      .then((users) => {
        if (Array.isArray(users)) setManagers(users);
      })
      .catch(() => setManagers([]))
      .finally(() => setLoadingManagers(false));
  }, [open]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.prenom.trim() || !form.nom.trim() || !form.email.trim() || !form.managerId) {
      setError("Prénom, nom, email et talent manager sont obligatoires.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prenom: form.prenom.trim(),
          nom: form.nom.trim(),
          email: form.email.trim(),
          telephone: form.telephone.trim() || null,
          instagram: form.instagram.trim() || null,
          tiktok: form.tiktok.trim() || null,
          managerId: form.managerId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "Erreur lors de la création");
        return;
      }

      onClose();
      router.push(`/talents/${data.id}`);
    } catch {
      setError("Erreur lors de la création du talent");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold text-glowup-licorice flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-glowup-rose" />
              Création rapide
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Réservé aux administrateurs — les autres infos pourront être
              complétées ensuite.
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Prénom *
                </label>
                <input
                  type="text"
                  name="prenom"
                  value={form.prenom}
                  onChange={handleChange}
                  placeholder="Eline"
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nom *
                </label>
                <input
                  type="text"
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  placeholder="Collange"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Mail className="w-4 h-4 inline mr-1 text-gray-400" />
                Email *
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="eline@glowupagence.fr"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Talent Manager *
              </label>
              <select
                name="managerId"
                value={form.managerId}
                onChange={handleChange}
                disabled={loadingManagers}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose appearance-none bg-white disabled:bg-gray-50"
              >
                <option value="">
                  {loadingManagers ? "Chargement…" : "Sélectionner"}
                </option>
                {managers.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.prenom} {tm.nom}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <Phone className="w-4 h-4 inline mr-1 text-gray-400" />
                  Téléphone
                </label>
                <input
                  type="tel"
                  name="telephone"
                  value={form.telephone}
                  onChange={handleChange}
                  placeholder="06 12 34 56 78"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <Instagram className="w-4 h-4 inline mr-1 text-pink-400" />
                  Instagram
                </label>
                <input
                  type="text"
                  name="instagram"
                  value={form.instagram}
                  onChange={handleChange}
                  placeholder="@handle"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Music2 className="w-4 h-4 inline mr-1 text-gray-400" />
                TikTok
              </label>
              <input
                type="text"
                name="tiktok"
                value={form.tiktok}
                onChange={handleChange}
                placeholder="@handle"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-glowup-rose focus:ring-2 focus:ring-glowup-rose/20"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <p className="text-xs text-gray-500 bg-glowup-lace/60 rounded-lg px-3 py-2">
              Seuls le prénom, le nom, l’email et le talent manager sont
              nécessaires. Stats, tarifs et infos légales pourront être ajoutés
              depuis la fiche du talent.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 p-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-glowup-rose text-white rounded-lg hover:bg-glowup-rose/90 font-medium disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Créer le talent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
