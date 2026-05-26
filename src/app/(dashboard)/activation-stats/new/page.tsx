"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Eye,
  EyeOff,
  Search,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface TalentRow {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  instagram: string | null;
  manager?: { prenom: string; nom: string };
}

export default function NewActivationStatsPage() {
  const router = useRouter();
  const [talents, setTalents] = useState<TalentRow[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/talents")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const list = Array.isArray(data) ? data : data.talents || [];
        setTalents(
          list.map((t: any) => ({
            id: t.id,
            prenom: t.prenom,
            nom: t.nom,
            photo: t.photo,
            instagram: t.instagram,
            manager: t.manager,
          }))
        );
      })
      .catch(() => toast.error("Impossible de charger les talents"))
      .finally(() => setLoadingTalents(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return talents;
    return talents.filter(
      (t) =>
        t.prenom.toLowerCase().includes(q) ||
        t.nom.toLowerCase().includes(q) ||
        (t.instagram || "").toLowerCase().includes(q)
    );
  }, [talents, search]);

  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  }

  function generatePassword() {
    const charset =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let p = "";
    for (let i = 0; i < 10; i++) {
      p += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setPassword(p);
    setShowPassword(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Donne un nom a l'activation");
    if (password.length < 4) return toast.error("Mot de passe trop court");
    if (selected.length === 0) return toast.error("Selectionne au moins un talent");

    setSaving(true);
    try {
      const res = await fetch("/api/activation-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password, talentIds: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Erreur creation");
      }
      const data = await res.json();
      toast.success("Rapport cree, ajoute les screenshots !");
      router.push(`/activation-stats/${data.report.id}`);
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/activation-stats"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux rapports
      </Link>

      <h1 className="text-3xl font-bold text-glowup-licorice mb-1">
        Nouveau rapport stats
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        Etape 1/2 : nomme l'activation, choisis les talents et definis le mot de passe.
      </p>

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-glowup-licorice mb-2">
              Nom de l'activation
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Sephora Cannes 2026"
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-glowup-rose/40 focus:border-glowup-rose"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-glowup-licorice">
                Mot de passe client
              </label>
              <button
                type="button"
                onClick={generatePassword}
                className="text-xs font-medium text-glowup-rose hover:underline inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Generer
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 4 caracteres"
                required
                minLength={4}
                className="w-full pr-12 px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-glowup-rose/40 focus:border-glowup-rose font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              A communiquer au client par un canal separe du lien.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-glowup-licorice">
                Talents inclus
              </h2>
              <p className="text-xs text-gray-500">
                {selected.length} talent{selected.length > 1 ? "s" : ""} selectionne
                {selected.length > 1 ? "s" : ""}
              </p>
            </div>
            <div className="relative w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un talent..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-glowup-rose/40"
              />
            </div>
          </div>

          {loadingTalents ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-glowup-rose" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              Aucun talent trouve.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-1">
              {filtered.map((t) => {
                const isSel = selected.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t.id)}
                    className={`relative text-left p-3 rounded-xl border-2 transition-all ${
                      isSel
                        ? "border-glowup-rose bg-glowup-lace/40"
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                        {t.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.photo}
                            alt={t.prenom}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-gray-500">
                            {t.prenom[0]}
                            {t.nom[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-glowup-licorice truncate">
                          {t.prenom} {t.nom}
                        </p>
                        {t.instagram && (
                          <p className="text-xs text-gray-500 truncate">@{t.instagram}</p>
                        )}
                      </div>
                    </div>
                    {isSel && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-glowup-rose text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/activation-stats"
            className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-glowup-rose text-white hover:bg-glowup-rose/90 disabled:opacity-60 text-sm font-medium"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Creer le rapport
          </button>
        </div>
      </form>
    </div>
  );
}
