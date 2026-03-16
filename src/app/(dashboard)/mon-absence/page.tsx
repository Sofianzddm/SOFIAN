 "use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type DelegationEmise = {
  id: string;
  actif: boolean;
  createdAt?: string;
  updatedAt?: string;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
  };
  tmRelai: {
    id: string;
    prenom: string;
    nom: string;
    email: string | null;
  };
};

type TalentLite = {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
};

type DelegationActivite = {
  id: string;
  type: string;
  entiteType: "NEGO" | "COLLAB" | "GIFT" | string;
  entiteId: string;
  entiteRef: string | null;
  detail: string | null;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  createdAt: string;
  auteur: { prenom: string; nom: string };
  talent: { id?: string; prenom: string; nom: string; photo: string | null };
  delegation: {
    tmRelai: { prenom: string; nom: string };
    actif: boolean;
  };
};

type ModePage = "absence" | "retour" | "aucun";

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = daysSince(dateStr);
  if (diff <= 0) return "Aujourd'hui";
  if (diff === 1) return "Il y a 1 jour";
  if (diff < 7) return `Il y a ${diff} jours`;
  return d.toLocaleDateString("fr-FR");
}

export default function MonAbsencePage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [delegations, setDelegations] = useState<DelegationEmise[]>([]);
  const [talentsPropres, setTalentsPropres] = useState<TalentLite[]>([]);
  const [activites, setActivites] = useState<DelegationActivite[]>([]);
  const [mode, setMode] = useState<ModePage>("aucun");
  const [activeTab, setActiveTab] = useState<"delegations" | "activite">(
    "delegations"
  );

  // Redirection si pas TM / HEAD_OF_INFLUENCE
  useEffect(() => {
    const role = (session?.user as { role?: string })?.role;
    if (role && role !== "TM" && role !== "HEAD_OF_INFLUENCE") {
      router.push("/dashboard");
    }
  }, [session, router]);

  // Chargement des données
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [delegRes, talentsRes, activitesRes] = await Promise.all([
          fetch("/api/delegations/mes-delegations-emises?includeRecent=true"),
          fetch("/api/talents"),
          fetch("/api/delegations/activites"),
        ]);

        // Délégations émises
        if (delegRes.ok) {
          const dJson = await delegRes.json();
          setDelegations(dJson.delegations || []);
        } else {
          setDelegations([]);
        }

        // Talents propres de la TM
        if (talentsRes.ok && session?.user) {
          const tJson = await talentsRes.json();
          const meId = (session.user as { id?: string }).id;
          const list = (Array.isArray(tJson) ? tJson : tJson.talents || []) as any[];
          setTalentsPropres(
            list
              .filter((t) => t.managerId === meId && !t.isArchived)
              .map((t) => ({
                id: t.id,
                prenom: t.prenom,
                nom: t.nom,
                photo: t.photo ?? null,
              }))
          );
        } else {
          setTalentsPropres([]);
        }

        // Activités pendant l'absence
        if (activitesRes.ok) {
          const aJson = await activitesRes.json();
          setActivites(Array.isArray(aJson) ? aJson : []);
        } else {
          setActivites([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [session]);

  // Dérivés : délégations actives / récentes
  const delegationsActives = delegations.filter((d) => d.actif);
  const delegationsInactivesRecents = delegations.filter(
    (d) =>
      !d.actif &&
      daysSince(d.updatedAt || d.createdAt || new Date().toISOString()) <= 7
  );

  const talentsDeleguesIds = new Set(delegationsActives.map((d) => d.talent.id));
  const talentsNonDelegues = talentsPropres.filter(
    (t) => !talentsDeleguesIds.has(t.id)
  );

  // Détermination du mode : absence ou retour
  useEffect(() => {
    if (delegationsActives.length > 0) {
      setMode("absence");
    } else if (delegationsInactivesRecents.length > 0 || activites.length > 0) {
      setMode("retour");
    } else {
      setMode("aucun");
    }
  }, [delegationsActives.length, delegationsInactivesRecents.length, activites.length]);

  const nbDelegues = delegationsActives.length;
  const nbNonDelegues = talentsNonDelegues.length;
  const totalTalents = nbDelegues + nbNonDelegues || 1;
  const couverturePct = Math.round((nbDelegues / totalTalents) * 100);

  // Grouper les talents délégués par TM relai (mode A)
  const parRelai = useMemo(() => {
    const map = new Map<
      string,
      { tm: DelegationEmise["tmRelai"]; talents: TalentLite[] }
    >();
    for (const d of delegationsActives) {
      const key = d.tmRelai.id;
      if (!map.has(key)) {
        map.set(key, { tm: d.tmRelai, talents: [] });
      }
      const group = map.get(key)!;
      group.talents.push({
        id: d.talent.id,
        prenom: d.talent.prenom,
        nom: d.talent.nom,
        photo: d.talent.photo,
      });
    }
    return Array.from(map.values());
  }, [delegationsActives]);

  // Regrouper les activités par talent (mode B)
  const talentsAvecActivite = useMemo(() => {
    const acc: Record<
      string,
      {
        id: string;
        prenom: string;
        nom: string;
        photo: string | null;
        tmRelaiNom: string;
        activites: DelegationActivite[];
      }
    > = {};

    for (const a of activites) {
      const talentId = (a.talent.id || "") as string;
      if (!talentId) continue;
      if (!acc[talentId]) {
        acc[talentId] = {
          id: talentId,
          prenom: a.talent.prenom,
          nom: a.talent.nom,
          photo: a.talent.photo,
          tmRelaiNom: `${a.delegation.tmRelai.prenom} ${a.delegation.tmRelai.nom}`,
          activites: [],
        };
      }
      acc[talentId].activites.push(a);
    }

    return Object.values(acc);
  }, [activites]);

  const nbCollabsCreees = activites.filter(
    (a) => a.type === "COLLAB_CREEE"
  ).length;
  const nbNegosValidees = activites.filter(
    (a) => a.type === "STATUT_NEGO" && a.nouvelleValeur === "VALIDEE"
  ).length;

  // TODO: urgences nécessiteraient des routes dédiées négos/collabs.
  const urgences: any[] = [];

  const renderTalentNonDelegue = (t: TalentLite) => (
    <div key={t.id} className="flex items-center gap-2 py-1.5">
      <div className="w-8 h-8 rounded-full bg-[#F5EBE0] flex items-center justify-center overflow-hidden">
        {t.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photo} alt={t.prenom} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-[#1A1110]">
            {t.prenom.charAt(0)}
            {t.nom.charAt(0)}
          </span>
        )}
      </div>
      <span className="text-sm text-red-700">
        {t.prenom} {t.nom}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin text-[#C08B8B]" />
          <span>Chargement de tes informations d&apos;absence...</span>
        </div>
      </div>
    );
  }

  if (mode === "aucun") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#F5EBE0] flex items-center justify-center text-3xl">
          📋
        </div>
        <div className="text-center max-w-md">
          <p
            className="text-base font-semibold text-[#1A1110]"
            style={{ fontFamily: "Spectral, serif" }}
          >
            Aucune absence en cours
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Quand un admin déclarera ton absence et délèguera tes talents à une TM
            relai, le détail apparaîtra ici.
          </p>
        </div>
      </div>
    );
  }

  // ============================
  // MODE A — PENDANT L'ABSENCE
  // ============================
  if (mode === "absence") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1
              className="text-2xl font-bold text-[#1A1110]"
              style={{ fontFamily: "Spectral, serif" }}
            >
              Ton absence
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Voilà comment tes talents sont pris en charge.
            </p>
          </div>
          <span
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{
              background: "#F5EBE0",
              color: "#C08B8B",
              border: "1px solid #C08B8B",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: "#C08B8B" }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: "#C08B8B" }}
              />
            </span>
            Absence active
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
          {[
            {
              label: "Talents couverts",
              value: nbDelegues,
              color: "#C08B8B",
              bg: "#F5EBE0",
            },
            {
              label: "Sans relai",
              value: nbNonDelegues,
              color: "#ef4444",
              bg: "#FFF5F5",
            },
            {
              label: "TMs relai",
              value: parRelai.length,
              color: "#1A1110",
              bg: "#F9FAFB",
            },
            {
              label: "Couverture",
              value: `${couverturePct}%`,
              color: "#1A1110",
              bg: "#F9FAFB",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-4 text-center"
              style={{ background: stat.bg, border: "1px solid #e5e7eb" }}
            >
              <p
                className="text-2xl font-bold"
                style={{ color: stat.color, fontFamily: "Spectral, serif" }}
              >
                {stat.value}
              </p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Barre de couverture */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>Couverture de tes talents</span>
            <span className="font-medium text-[#1A1110]">
              {nbDelegues}/{totalTalents} couverts
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full">
            <div
              className="h-2 rounded-full transition-all duration-700"
              style={{
                width: `${couverturePct}%`,
                background: nbNonDelegues === 0 ? "#C8F285" : "#C08B8B",
              }}
            />
          </div>
        </div>

        {/* Alerte talents non délégués */}
        {nbNonDelegues > 0 && (
          <div
            className="rounded-xl p-4 mb-2 flex items-start gap-3"
            style={{ background: "#FFF5F5", border: "1px solid #fca5a5" }}
          >
            <span className="text-base mt-0.5">⚠️</span>
            <div>
              <p
                className="font-medium text-red-700 text-sm mb-1"
                style={{ fontFamily: "Spectral, serif" }}
              >
                {nbNonDelegues} talent{nbNonDelegues > 1 ? "s" : ""} sans relai
              </p>
              {talentsNonDelegues.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-1">
                  <div className="w-7 h-7 rounded-full bg-[#F5EBE0] flex items-center justify-center overflow-hidden">
                    {t.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.photo}
                        alt={t.prenom}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-[#1A1110]">
                        {t.prenom.charAt(0)}
                        {t.nom.charAt(0)}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-red-600">
                    {t.prenom} {t.nom}
                  </span>
                </div>
              ))}
              <p className="text-xs text-red-500 mt-2">
                → Contacte un admin pour les déléguer.
              </p>
            </div>
          </div>
        )}

        {/* Onglets style app */}
        <div className="bg-white rounded-2xl border border-gray-100 p-1 mb-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("delegations")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "delegations"
                  ? "bg-[#1A1110] text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Mes talents en délégation
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("activite")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "activite"
                  ? "bg-[#1A1110] text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Activité pendant mon absence ({activites.length})
            </button>
          </div>
        </div>

        {/* Tab : Mes talents en délégation */}
        {activeTab === "delegations" && (
          <div className="space-y-4">
            {parRelai.map(({ tm, talents }) => (
              <div
                key={tm.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-2 overflow-hidden"
              >
                {/* Header TM relai */}
                <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{ background: "#F5EBE0", color: "#C08B8B" }}
                    >
                      {tm.prenom.charAt(0)}
                      {tm.nom.charAt(0)}
                    </div>
                    <div>
                      <p
                        className="font-medium text-sm text-[#1A1110]"
                        style={{ fontFamily: "Spectral, serif" }}
                      >
                        {tm.prenom} {tm.nom}
                      </p>
                      <p className="text-xs text-gray-500">
                        {talents.length} talent
                        {talents.length > 1 ? "s" : ""} en charge
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-1 rounded-full font-medium"
                    style={{
                      background: "#F0FDF4",
                      color: "#16a34a",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    Actif
                  </span>
                </div>

                {/* Talents */}
                <div className="divide-y divide-gray-50">
                  {talents.map((t) => (
                    <div
                      key={t.id}
                      className="px-5 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#F5EBE0] flex items-center justify-center overflow-hidden">
                          {t.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.photo}
                              alt={t.prenom}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-semibold text-[#1A1110]">
                              {t.prenom.charAt(0)}
                              {t.nom.charAt(0)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#1A1110]">
                          {t.prenom} {t.nom}
                        </p>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: "#F5EBE0",
                          color: "#C08B8B",
                          border: "1px solid #C08B8B",
                        }}
                      >
                        Relai · {tm.prenom}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Helper pour lien entité */}
        {/* Tab : Activité pendant mon absence */}
        {activeTab === "activite" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            {activites.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">📋</p>
                <p
                  className="font-medium text-[#1A1110]"
                  style={{ fontFamily: "Spectral, serif" }}
                >
                  Aucune activité enregistrée
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Les actions de tes TMs relai apparaîtront ici.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activites.map((a) => {
                  const icon = a.type.includes("STATUT")
                    ? "🔄"
                    : a.type.includes("COMMENTAIRE")
                    ? "💬"
                    : a.type.includes("CREEE")
                    ? "✨"
                    : "📌";
                  const badgeClass =
                    a.entiteType === "NEGO"
                      ? "bg-blue-50 text-blue-600 border-blue-200"
                      : a.entiteType === "COLLAB"
                      ? "bg-[#F5EBE0] text-[#C08B8B] border-[#C08B8B]"
                      : a.entiteType === "GIFT"
                      ? "bg-green-50 text-green-600 border-green-200"
                      : "bg-gray-50 text-gray-600 border-gray-200";

                  const getEntiteHref = () => {
                    if (!a.entiteId) return "#";
                    if (a.entiteType === "NEGO") return `/negociations/${a.entiteId}`;
                    if (a.entiteType === "COLLAB")
                      return `/collaborations/${a.entiteId}`;
                    if (a.entiteType === "GIFT") return `/gifts/${a.entiteId}`;
                    return "#";
                  };

                  const href = getEntiteHref();
                  const clickable = href !== "#";

                  const content = (
                    <div className="flex gap-3">
                      <div className="pt-1 text-lg">{icon}</div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#F5EBE0] flex items-center justify-center overflow-hidden">
                            {a.talent.photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.talent.photo}
                                alt={a.talent.prenom}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-semibold text-[#1A1110]">
                                {a.talent.prenom.charAt(0)}
                                {a.talent.nom.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#1A1110] truncate">
                              {a.talent.prenom} {a.talent.nom}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeClass}`}
                              >
                                {a.entiteType}
                              </span>
                              {a.entiteRef && (
                                <span className="text-xs text-gray-500">
                                  {a.entiteRef}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-[#1A1110]">
                          {a.delegation.tmRelai.prenom} {a.delegation.tmRelai.nom} →{" "}
                          {a.detail || "Action enregistrée"}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {formatRelativeDate(a.createdAt)}
                        </p>
                      </div>
                    </div>
                  );

                  return (
                    <div
                      key={a.id}
                      className="border-b last:border-b-0 border-gray-100 pb-3"
                    >
                      {clickable ? (
                        <Link
                          href={href}
                          className="block hover:bg-gray-50 rounded-xl -mx-3 px-3 py-2 transition-colors"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============================
  // MODE B — AU RETOUR
  // ============================
  return (
    <div className="space-y-6">
      {/* Header retour */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: "#F0FDF4",
                  color: "#16a34a",
                  border: "1px solid #bbf7d0",
                }}
              >
                Bienvenue de retour
              </span>
            </div>
            <h1
              className="text-2xl font-bold text-[#1A1110]"
              style={{ fontFamily: "Spectral, serif" }}
            >
              Ce qui s&apos;est passé pendant ton absence
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {activites.length} action
              {activites.length > 1 ? "s" : ""} effectuée
              {activites.length > 1 ? "s" : ""} par ton équipe relai.
            </p>
          </div>
        </div>
      </div>

      {/* Stats retour */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        {[
          {
            label: "Collabs créées",
            value: nbCollabsCreees,
            bg: "#F5EBE0",
            color: "#C08B8B",
          },
          {
            label: "Négos validées",
            value: nbNegosValidees,
            bg: "#F0FDF4",
            color: "#16a34a",
          },
          {
            label: "Actions totales",
            value: activites.length,
            bg: "#F9FAFB",
            color: "#1A1110",
          },
          {
            label: "À traiter",
            value: urgences.length,
            bg: urgences.length > 0 ? "#FFF5F5" : "#F9FAFB",
            color: urgences.length > 0 ? "#ef4444" : "#9ca3af",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-4 text-center"
            style={{ background: stat.bg, border: "1px solid #e5e7eb" }}
          >
            <p
              className="text-2xl font-bold"
              style={{ color: stat.color, fontFamily: "Spectral, serif" }}
            >
              {stat.value}
            </p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Timeline par talent */}
      <div className="space-y-4">
        {talentsAvecActivite.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-12 px-6 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p
              className="font-medium text-[#1A1110]"
              style={{ fontFamily: "Spectral, serif" }}
            >
              Aucune activité à afficher
            </p>
            <p className="text-sm mt-1 text-gray-600">
              Tes TMs relai n&apos;ont pas encore effectué d&apos;actions pendant ton
              absence.
            </p>
          </div>
        ) : (
          talentsAvecActivite.map((talent) => (
            <div
              key={talent.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden"
            >
              {/* Header talent */}
              <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-50">
                <div className="w-9 h-9 rounded-full bg-[#F5EBE0] flex items-center justify-center overflow-hidden">
                  {talent.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={talent.photo}
                      alt={talent.prenom}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-[#1A1110]">
                      {talent.prenom.charAt(0)}
                      {talent.nom.charAt(0)}
                    </span>
                  )}
                </div>
                <div>
                  <p
                    className="font-medium text-sm text-[#1A1110]"
                    style={{ fontFamily: "Spectral, serif" }}
                  >
                    {talent.prenom} {talent.nom}
                  </p>
                  <p className="text-xs text-gray-500">
                    {talent.activites.length} action
                    {talent.activites.length > 1 ? "s" : ""} · {talent.tmRelaiNom}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              <div className="px-5 py-4 space-y-3">
                {talent.activites.map((a) => {
                  const icon =
                    a.entiteType === "NEGO"
                      ? "↺"
                      : a.type.includes("COMMENTAIRE")
                      ? "✎"
                      : a.type.includes("CREEE")
                      ? "+"
                      : "·";

                  const bgCircle =
                    a.entiteType === "NEGO"
                      ? "#EFF6FF"
                      : a.entiteType === "COLLAB"
                      ? "#F5EBE0"
                      : "#F0FDF4";

                  const badgeClass =
                    a.entiteType === "NEGO"
                      ? "bg-blue-50 text-blue-600"
                      : a.entiteType === "COLLAB"
                      ? "bg-[#F5EBE0] text-[#C08B8B]"
                      : "bg-green-50 text-green-600";

                  const getEntiteHref = () => {
                    if (!a.entiteId) return "#";
                    if (a.entiteType === "NEGO") return `/negociations/${a.entiteId}`;
                    if (a.entiteType === "COLLAB")
                      return `/collaborations/${a.entiteId}`;
                    if (a.entiteType === "GIFT") return `/gifts/${a.entiteId}`;
                    return "#";
                  };

                  const href = getEntiteHref();
                  const clickable = href !== "#";

                  const content = (
                    <div className="flex gap-3">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs"
                        style={{ background: bgCircle }}
                      >
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeClass}`}
                          >
                            {a.entiteType}
                          </span>
                          {a.entiteRef && (
                            <span className="text-xs font-mono text-gray-400">
                              {a.entiteRef}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#1A1110] mt-0.5">
                          {a.auteur.prenom} {a.auteur.nom} ·{" "}
                          {a.detail || "Action enregistrée"}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatRelativeDate(a.createdAt)}
                        </p>
                      </div>
                    </div>
                  );

                  return clickable ? (
                    <Link
                      key={a.id}
                      href={href}
                      className="block hover:bg-gray-50 rounded-xl -mx-3 px-3 py-2 transition-colors"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={a.id}>{content}</div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bouton "J'ai tout lu" */}
      <div className="flex justify-center mt-4 pb-4">
        <button
          className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
          style={{ background: "#1A1110", color: "white" }}
          type="button"
        >
          J&apos;ai tout lu · retour à la normale
        </button>
      </div>
    </div>
  );
}

