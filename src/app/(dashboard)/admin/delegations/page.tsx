"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  UserCheck,
  Loader2,
  Plus,
  X,
  ArrowRight,
} from "lucide-react";

type Delegation = {
  id: string;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
  };
  tmOrigine: {
    id: string;
    prenom: string;
    nom: string;
  };
  tmRelai: {
    id: string;
    prenom: string;
    nom: string;
  };
};

type UserTM = {
  id: string;
  prenom: string;
  nom: string;
  role: string;
};

type TalentLite = {
  id: string;
  prenom: string;
  nom: string;
};

export default function AdminDelegationsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tms, setTms] = useState<UserTM[]>([]);
  const [talents, setTalents] = useState<TalentLite[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [tmAbsenteId, setTmAbsenteId] = useState<string>("");
  const [tmRelaiId, setTmRelaiId] = useState<string>("");
  const [selectedTalentIds, setSelectedTalentIds] = useState<string[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const role = (session?.user as { role?: string })?.role;
    if (role && role !== "ADMIN" && role !== "HEAD_OF_INFLUENCE") {
      router.push("/dashboard");
    }
  }, [session, router]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setError(null);

        const [delegRes, usersRes] = await Promise.all([
          fetch("/api/admin/delegations"),
          fetch("/api/users?role=TM"),
        ]);

        if (!delegRes.ok) {
          throw new Error("Impossible de charger les délégations");
        }
        const delegData = (await delegRes.json()) as Delegation[];
        setDelegations(delegData);

        if (usersRes.ok) {
          const users = (await usersRes.json()) as UserTM[];
          setTms(users.filter((u) => u.role === "TM" || u.role === "HEAD_OF_INFLUENCE"));
        }
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const delegationsActives = useMemo(
    () => delegations.filter((d) => d.actif),
    [delegations]
  );
  const delegationsInactives = useMemo(
    () => delegations.filter((d) => !d.actif),
    [delegations]
  );

  const openModal = () => {
    setTmAbsenteId("");
    setTmRelaiId("");
    setSelectedTalentIds([]);
    setTalents([]);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving || loadingModal) return;
    setModalOpen(false);
  };

  const loadTalentsForTmAbsente = async (tmId: string) => {
    setTmAbsenteId(tmId);
    setSelectedTalentIds([]);
    setTalents([]);
    if (!tmId) return;

    try {
      setLoadingModal(true);
      const res = await fetch(`/api/talents?presskit=false`);
      if (!res.ok) {
        throw new Error("Impossible de charger les talents");
      }
      const data = await res.json();
      const list = (Array.isArray(data) ? data : data.talents || []) as any[];
      const filtered = list.filter((t) => t.managerId === tmId);
      setTalents(
        filtered.map((t) => ({
          id: t.id,
          prenom: t.prenom,
          nom: t.nom,
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingModal(false);
    }
  };

  const toggleTalent = (id: string) => {
    setSelectedTalentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateDelegations = async () => {
    if (!tmAbsenteId || !tmRelaiId || selectedTalentIds.length === 0) return;
    try {
      setSaving(true);
      const created: Delegation[] = [];
      for (const talentId of selectedTalentIds) {
        const res = await fetch("/api/admin/delegations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talentId, tmRelaiId }),
        });
        if (res.ok) {
          const d = (await res.json()) as Delegation;
          created.push(d);
        }
      }
      if (created.length > 0) {
        setDelegations((prev) => {
          const map = new Map(prev.map((d) => [d.id, d]));
          for (const d of created) {
            map.set(d.id, d);
          }
          return Array.from(map.values());
        });
      }
      setModalOpen(false);
    } catch (e) {
      console.error("Erreur création délégations", e);
    } finally {
      setSaving(false);
    }
  };

  const updateActif = async (id: string, actif: boolean) => {
    try {
      const res = await fetch(`/api/admin/delegations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif }),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as Delegation;
      setDelegations((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
    } catch (e) {
      console.error("Erreur mise à jour délégation", e);
    }
  };

  const destroyDelegation = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/delegations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setDelegations((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.error("Erreur suppression délégation", e);
    }
  };

  const formatUserName = (u: { prenom: string; nom: string }) =>
    `${u.prenom} ${u.nom}`.trim();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Chargement des délégations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1110] font-['Spectral',serif]">
            Délégations de talents
          </h1>
          <p className="text-sm text-gray-600">
            Gérez les talents confiés temporairement à des TM relai pendant les absences.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-full bg-[#C8F285] px-4 py-2 text-sm font-medium text-[#1A1110] shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          Nouvelle délégation
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#1A1110] flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          Délégations actives
          <span className="text-xs text-gray-500">
            ({delegationsActives.length})
          </span>
        </h2>
        {delegationsActives.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#F5EBE0] bg-[#F5EBE0]/40 px-4 py-6 text-sm text-gray-500">
            Aucune délégation active pour le moment.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-[#F5EBE0] text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">Talent</th>
                  <th className="px-4 py-2 text-left">TM origine</th>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2 text-left">TM relai</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {delegationsActives.map((d) => (
                  <tr key={d.id} className="border-t border-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-[#F5EBE0] flex items-center justify-center overflow-hidden">
                          {d.talent.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={d.talent.photo}
                              alt={d.talent.prenom}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-medium text-[#1A1110]">
                              {d.talent.prenom.charAt(0)}
                              {d.talent.nom.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1A1110]">
                            {d.talent.prenom} {d.talent.nom}
                          </p>
                          <p className="text-xs text-gray-500">
                            Délégué
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-[#1A1110] font-medium">
                          {formatUserName(d.tmOrigine)}
                        </span>
                        <span className="inline-flex w-fit items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200">
                          ABSENT
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center align-middle">
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="text-sm font-medium text-[#1A1110]">
                        {formatUserName(d.tmRelai)}
                      </p>
                      <p className="text-xs text-gray-500">TM relai</p>
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <button
                        type="button"
                        onClick={() => updateActif(d.id, false)}
                        className="inline-flex items-center rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Désactiver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#1A1110] flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" />
          Délégations inactives
          <span className="text-xs text-gray-500">
            ({delegationsInactives.length})
          </span>
        </h2>
        {delegationsInactives.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
            Aucune délégation inactive.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">Talent</th>
                  <th className="px-4 py-2 text-left">TM origine</th>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2 text-left">TM relai</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {delegationsInactives.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-gray-50 opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-[#F5EBE0] flex items-center justify-center overflow-hidden">
                          {d.talent.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={d.talent.photo}
                              alt={d.talent.prenom}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-[11px] font-medium text-[#1A1110]">
                              {d.talent.prenom.charAt(0)}
                              {d.talent.nom.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1A1110]">
                            {d.talent.prenom} {d.talent.nom}
                          </p>
                          <p className="text-xs text-gray-500">
                            Délégation désactivée
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="text-sm text-[#1A1110] font-medium">
                        {formatUserName(d.tmOrigine)}
                      </p>
                    </td>
                    <td className="px-2 py-3 text-center align-middle">
                      <ArrowRight className="w-4 h-4 text-gray-300" />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="text-sm font-medium text-[#1A1110]">
                        {formatUserName(d.tmRelai)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right align-middle space-x-2">
                      <button
                        type="button"
                        onClick={() => updateActif(d.id, true)}
                        className="inline-flex items-center rounded-full border border-[#C8F285] bg-[#C8F285]/10 px-3 py-1 text-xs font-medium text-[#1A1110] hover:bg-[#C8F285]/30"
                      >
                        Réactiver
                      </button>
                      <button
                        type="button"
                        onClick={() => destroyDelegation(d.id)}
                        className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1A1110] font-['Spectral',serif]">
                  Nouvelle délégation
                </h2>
                <p className="text-xs text-gray-500">
                  Sélectionnez la TM absente, ses talents, puis la TM relai.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    TM absente
                  </label>
                  <select
                    value={tmAbsenteId}
                    onChange={(e) => loadTalentsForTmAbsente(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285]"
                  >
                    <option value="">Sélectionner une TM</option>
                    {tms.map((tm) => (
                      <option key={tm.id} value={tm.id}>
                        {tm.prenom} {tm.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    TM relai
                  </label>
                  <select
                    value={tmRelaiId}
                    onChange={(e) => setTmRelaiId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8F285]"
                  >
                    <option value="">Sélectionner une TM relai</option>
                    {tms
                      .filter((tm) => tm.id !== tmAbsenteId)
                      .map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.prenom} {tm.nom}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="mt-2">
                <p className="text-xs font-medium text-gray-600 mb-1">
                  Talents de la TM absente
                </p>
                {loadingModal ? (
                  <div className="flex items-center justify-center py-6 text-xs text-gray-500">
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Chargement des talents...
                  </div>
                ) : talents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500">
                    Sélectionnez une TM absente pour voir ses talents.
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-100 bg-[#F5EBE0]/40 px-3 py-2 space-y-1">
                    {talents.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-gray-300 text-[#C08B8B] focus:ring-[#C08B8B]"
                          checked={selectedTalentIds.includes(t.id)}
                          onChange={() => toggleTalent(t.id)}
                        />
                        <span className="text-xs text-[#1A1110]">
                          {t.prenom} {t.nom}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateDelegations}
                disabled={
                  saving ||
                  !tmAbsenteId ||
                  !tmRelaiId ||
                  selectedTalentIds.length === 0
                }
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C08B8B] text-xs font-medium text-white shadow-sm hover:shadow-md disabled:opacity-60"
              >
                {saving && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                Créer la délégation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

