"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bell, CheckCircle2, AlertCircle, Loader2, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  titre: string;
  message: string;
  lien: string | null;
  lu: boolean;
  luAt: string | null;
  createdAt: string;
  collabId: string | null;
}

export default function NotificationsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "nonLues">("all");
  const [countNonLues, setCountNonLues] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      const url = filter === "nonLues" ? "/api/notifications?nonLues=true" : "/api/notifications";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur fetch");
      const data = await res.json();
      setNotifications(data.notifications);
      setCountNonLues(data.countNonLues);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  const marquerLue = async (notifId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notifId}`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Erreur");
      fetchNotifications();
    } catch (error) {
      console.error("Erreur marquer lue:", error);
    }
  };

  const marquerConforme = async (notif: Notification) => {
    if (!notif.collabId) return;
    
    setActionLoading(notif.id);
    try {
      // Marquer la facture comme validée
      const res = await fetch(`/api/collaborations/${notif.collabId}/valider-facture`, {
        method: "POST",
      });
      
      if (!res.ok) throw new Error("Erreur validation");
      
      // Marquer la notification comme lue
      await marquerLue(notif.id);
      
      alert("✅ Facture validée comme conforme !");
    } catch (error) {
      console.error("Erreur validation:", error);
      alert("❌ Erreur lors de la validation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleClickNotif = (notif: Notification) => {
    if (!notif.lu) {
      marquerLue(notif.id);
    }
    if (notif.lien) {
      router.push(notif.lien);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "FACTURE_RECUE":
        return "💰";
      case "NOUVEAU_TALENT":
        return "🎉";
      case "COLLAB_PUBLIE":
        return "📢";
      default:
        return "🔔";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-glowup-lace via-white to-glowup-lace/30 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-glowup-rose to-glowup-rose-dark rounded-2xl flex items-center justify-center">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-glowup-licorice">Notifications</h1>
              <p className="text-gray-600">
                {countNonLues > 0 ? `${countNonLues} notification(s) non lue(s)` : "Toutes les notifications sont lues"}
              </p>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex gap-3">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                filter === "all"
                  ? "bg-glowup-rose text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Toutes ({notifications.length})
            </button>
            <button
              onClick={() => setFilter("nonLues")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                filter === "nonLues"
                  ? "bg-glowup-rose text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Non lues ({countNonLues})
            </button>
          </div>
        </div>

        {/* Liste des notifications */}
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Aucune notification</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md ${
                  notif.lu ? "border-gray-100" : "border-glowup-rose/30 bg-glowup-rose/5"
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Icône */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl ${
                      notif.lu ? "bg-gray-100" : "bg-glowup-rose/10"
                    }`}>
                      {getTypeIcon(notif.type)}
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className="font-semibold text-glowup-licorice">{notif.titre}</h3>
                        {!notif.lu && (
                          <span className="w-3 h-3 bg-glowup-rose rounded-full flex-shrink-0 mt-1"></span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{notif.message}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(notif.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-2 mt-4">
                        {/* Bouton Voir */}
                        {notif.lien && (
                          <button
                            onClick={() => handleClickNotif(notif)}
                            className="px-4 py-2 bg-glowup-rose text-white rounded-lg text-sm font-medium hover:bg-glowup-rose-dark transition-colors"
                          >
                            Voir
                          </button>
                        )}

                        {/* Bouton Marquer conforme (uniquement pour FACTURE_RECUE et ADMIN) */}
                        {notif.type === "FACTURE_RECUE" && 
                         session?.user?.role === "ADMIN" && 
                         notif.collabId && (
                          <button
                            onClick={() => marquerConforme(notif)}
                            disabled={actionLoading === notif.id}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {actionLoading === notif.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            Marquer conforme
                          </button>
                        )}

                        {/* Bouton Marquer comme lu */}
                        {!notif.lu && (
                          <button
                            onClick={() => marquerLue(notif.id)}
                            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
                          >
                            <Check className="w-4 h-4" />
                            Marquer comme lu
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
