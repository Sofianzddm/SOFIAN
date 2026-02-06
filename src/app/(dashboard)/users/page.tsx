"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  UserX,
  UserCheck,
  Filter,
  Download,
  Shield,
  Users,
  Loader2,
} from "lucide-react";

interface User {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
  createdAt: string;
}

const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  HEAD_OF: "Head of",
  HEAD_OF_INFLUENCE: "Head of Influence",
  HEAD_OF_SALES: "Head of Sales",
  TM: "Talent Manager",
  CM: "Community Manager",
  TALENT: "Talent",
};

const roleColors: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700",
  HEAD_OF: "bg-purple-100 text-purple-700",
  HEAD_OF_INFLUENCE: "bg-blue-100 text-blue-700",
  HEAD_OF_SALES: "bg-green-100 text-green-700",
  TM: "bg-yellow-100 text-yellow-700",
  CM: "bg-pink-100 text-pink-700",
  TALENT: "bg-gray-100 text-gray-700",
};

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    fetchUsers();
  }, [showInactive, roleFilter]);

  async function fetchUsers() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (showInactive) params.append("showAll", "true");
      if (roleFilter !== "all") params.append("role", roleFilter);

      const res = await fetch(`/api/users?${params.toString()}`);
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (error) {
      console.error("Erreur chargement users:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleUserStatus(userId: string, currentStatus: boolean) {
    const action = currentStatus ? "désactiver" : "réactiver";
    if (!confirm(`Voulez-vous vraiment ${action} cet utilisateur ?`)) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !currentStatus }),
      });

      if (res.ok) {
        alert(`✅ Utilisateur ${action === "désactiver" ? "désactivé" : "réactivé"} avec succès`);
        fetchUsers();
      } else {
        const data = await res.json();
        alert(`❌ Erreur : ${data.error}`);
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur lors de l'opération");
    }
  }

  async function deleteUser(userId: string, userName: string) {
    const confirmMessage = `⚠️ ATTENTION : Supprimer définitivement ${userName} ?\n\nCette action est IRRÉVERSIBLE.\n\nSi l'utilisateur a des négociations ou collaborations, la suppression sera refusée.\n\nRecommandation : Utilisez plutôt la désactivation.`;

    if (!confirm(confirmMessage)) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`❌ ${data.error}`);
        return;
      }

      alert(`✅ ${userName} supprimé avec succès`);
      fetchUsers();
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur lors de la suppression");
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchSearch =
      user.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    return matchSearch;
  });

  const activeUsers = filteredUsers.filter((u) => u.actif).length;
  const inactiveUsers = filteredUsers.filter((u) => !u.actif).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-glowup-licorice flex items-center gap-3">
            <Users className="w-8 h-8" />
            Gestion des Utilisateurs
          </h1>
          <p className="text-gray-600 mt-1">
            {activeUsers} actif{activeUsers > 1 ? "s" : ""} • {inactiveUsers} inactif
            {inactiveUsers > 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/users/new"
            className="flex items-center gap-2 bg-gradient-to-r from-glowup-rose to-purple-600 text-white px-6 py-3 rounded-xl hover:shadow-lg transition-all"
          >
            <Plus className="w-5 h-5" />
            Nouvel utilisateur
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-sm text-gray-600">Total</div>
          <div className="text-2xl font-bold text-glowup-licorice">{users.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-sm text-gray-600">Actifs</div>
          <div className="text-2xl font-bold text-green-600">{activeUsers}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-sm text-gray-600">Inactifs</div>
          <div className="text-2xl font-bold text-gray-400">{inactiveUsers}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-sm text-gray-600">Administrateurs</div>
          <div className="text-2xl font-bold text-red-600">
            {users.filter((u) => u.role === "ADMIN").length}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Recherche */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher par nom, prénom ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
            />
          </div>

          {/* Filtre Rôle */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-glowup-rose focus:border-transparent"
          >
            <option value="all">Tous les rôles</option>
            <option value="ADMIN">Administrateurs</option>
            <option value="HEAD_OF">Head of</option>
            <option value="HEAD_OF_INFLUENCE">Head of Influence</option>
            <option value="HEAD_OF_SALES">Head of Sales</option>
            <option value="TM">Talent Managers</option>
            <option value="CM">Community Managers</option>
            <option value="TALENT">Talents</option>
          </select>

          {/* Afficher inactifs */}
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded text-glowup-rose focus:ring-glowup-rose"
            />
            <span className="text-sm text-gray-700">Afficher inactifs</span>
          </label>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
                  Utilisateur
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
                  Email
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-700">
                  Rôle
                </th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-gray-700">
                  Statut
                </th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    !user.actif ? "bg-gray-50 opacity-60" : ""
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-glowup-rose to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                        {user.prenom[0]}
                        {user.nom[0]}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {user.prenom} {user.nom}
                        </div>
                        <div className="text-xs text-gray-500">
                          Créé le {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-700">{user.email}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                        roleColors[user.role] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {user.role === "ADMIN" && <Shield className="w-3 h-3" />}
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {user.actif ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <UserCheck className="w-3 h-3" />
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-600 rounded-full text-xs font-medium">
                        <UserX className="w-3 h-3" />
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      {/* Modifier */}
                      <Link
                        href={`/users/${user.id}/edit`}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>

                      {/* Désactiver/Réactiver - ADMIN uniquement */}
                      {isAdmin && user.id !== session?.user?.id && (
                        <button
                          onClick={() => toggleUserStatus(user.id, user.actif)}
                          className={`p-2 rounded-lg transition-colors ${
                            user.actif
                              ? "text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                              : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                          }`}
                          title={user.actif ? "Désactiver" : "Réactiver"}
                        >
                          {user.actif ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Supprimer - ADMIN uniquement */}
                      {isAdmin && user.id !== session?.user?.id && (
                        <button
                          onClick={() =>
                            deleteUser(user.id, `${user.prenom} ${user.nom}`)
                          }
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer définitivement"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
