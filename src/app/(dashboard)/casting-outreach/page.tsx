"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Users, Search, ChevronRight, RefreshCw } from "lucide-react";
import type { HubSpotContactCasting } from "@/lib/hubspot";
import CastingComposer from "./CastingComposer";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

type HubSpotListOption = { id: string; name: string; contactCount: number | null };

function columnFor(contact: HubSpotContactCasting): "todo" | "progress" | "ready" {
  const body = (contact.castingEmailBody || "").trim();
  const st = (contact.castingStatus || "").trim().toLowerCase();
  if (st === "pret") return "ready";
  if (!body) return "todo";
  if (st === "en_cours") return "progress";
  return "progress";
}

function brandColumnFor(contacts: HubSpotContactCasting[]): "todo" | "progress" | "ready" {
  // "Avancé" = si au moins un contact est "pret", alors la marque est "Prêt".
  // Ensuite : s'il existe au moins un email non vide / en cours, alors "En cours".
  // Sinon : "À traiter".
  let hasProgress = false;
  for (const c of contacts) {
    const col = columnFor(c);
    if (col === "ready") return "ready";
    if (col === "progress") hasProgress = true;
  }
  return hasProgress ? "progress" : "todo";
}

function brandStatusLabel(contacts: HubSpotContactCasting[]): "Prêt" | "En cours" | "À traiter" {
  const col = brandColumnFor(contacts);
  if (col === "ready") return "Prêt";
  if (col === "progress") return "En cours";
  return "À traiter";
}

/** Clé stable pour fusionner les variantes d’écriture d’une même marque */
function normalizeBrandKey(companyName: string): string {
  const t = companyName.trim();
  if (!t) return "__sans_marque__";
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

type BrandGroup = {
  key: string;
  displayName: string;
  contacts: HubSpotContactCasting[];
};

type MissionBrief = {
  id: string;
  creatorName: string;
  targetBrand: string;
  strategyReason: string;
  recommendedAngle?: string | null;
  objective?: string | null;
  dos?: string | null;
  donts?: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  deadlineAt?: string | null;
  campaignName?: string | null;
};

/** Regroupe les contacts par marque (companyName), tri marques puis contacts */
function groupContactsByBrand(contacts: HubSpotContactCasting[]): BrandGroup[] {
  const map = new Map<string, { displayName: string; contacts: HubSpotContactCasting[] }>();
  for (const c of contacts) {
    const displayName = (c.companyName || "").trim() || "Sans marque";
    const key = normalizeBrandKey(displayName);
    let entry = map.get(key);
    if (!entry) {
      entry = { displayName, contacts: [] };
      map.set(key, entry);
    }
    entry.contacts.push(c);
  }
  for (const v of map.values()) {
    v.contacts.sort((a, b) => {
      const na = `${a.firstname} ${a.lastname}`.trim() || a.email;
      const nb = `${b.firstname} ${b.lastname}`.trim() || b.email;
      return na.localeCompare(nb, "fr", { sensitivity: "base" });
    });
  }
  return Array.from(map.values())
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" })
    )
    .map((v) => ({
      key: normalizeBrandKey(v.displayName),
      displayName: v.displayName,
      contacts: v.contacts,
    }));
}

const COL_BORDER = {
  todo: "#C08B8B",
  progress: "#C8F285",
  ready: "#1A1110",
} as const;

/** Brouillon HubSpot à rouvrir dans le compositeur (préfère un contact avec du corps, sinon objet, sinon le premier). */
function pickInitialCastingDraft(contacts: HubSpotContactCasting[]): {
  initialSubject: string;
  initialBodyHtml: string;
} {
  const withBody = contacts.find((c) => (c.castingEmailBody || "").trim());
  const withSubject = contacts.find((c) => (c.castingEmailSubject || "").trim());
  const ref = withBody || withSubject || contacts[0];
  if (!ref) {
    return { initialSubject: "", initialBodyHtml: "" };
  }
  return {
    initialSubject: (ref.castingEmailSubject || "").trim(),
    initialBodyHtml: (ref.castingEmailBody || "").trim(),
  };
}

function mapContactsForComposer(
  contacts: HubSpotContactCasting[]
): Array<Pick<HubSpotContactCasting, "id" | "firstname" | "lastname" | "email">> {
  return contacts.map((c) => ({
    id: c.id,
    firstname: c.firstname,
    lastname: c.lastname,
    email: c.email,
  }));
}

function composerStateForBrand(displayName: string, hubspotContacts: HubSpotContactCasting[]) {
  return {
    company: displayName,
    contacts: mapContactsForComposer(hubspotContacts),
    ...pickInitialCastingDraft(hubspotContacts),
  };
}

export default function CastingOutreachPage() {
  const { data: session, status } = useSession();

  /** Rôle effectif (aligné sidebar / impersonation) — évite spinner infini si useSession est incomplet */
  const [authReady, setAuthReady] = useState(false);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);

  const [lists, setLists] = useState<HubSpotListOption[]>([]);
  const [listId, setListId] = useState<string>("");
  const [searchList, setSearchList] = useState("");
  const [contacts, setContacts] = useState<HubSpotContactCasting[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeBrand, setActiveBrand] = useState<{
    company: string;
    contacts: Array<Pick<HubSpotContactCasting, "id" | "firstname" | "lastname" | "email">>;
    initialSubject?: string;
    initialBodyHtml?: string;
    missionBrief?: MissionBrief | null;
  } | null>(null);
  const [activeBrandColumn, setActiveBrandColumn] = useState<"todo" | "progress" | "ready" | null>(
    null
  );
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(
    null
  );
  const [missionsByBrand, setMissionsByBrand] = useState<Record<string, MissionBrief>>({});

  const allowed =
    effectiveRole !== null &&
    (ALLOWED_ROLES as readonly string[]).includes(effectiveRole);

  useEffect(() => {
    if (status === "loading" || status === "unauthenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { role?: string };
          if (!cancelled && typeof data.role === "string") {
            setEffectiveRole(data.role);
            return;
          }
        }
      } catch {
        /* fallback session */
      }
      if (!cancelled) {
        const r = (session?.user as { role?: string } | undefined)?.role;
        setEffectiveRole(typeof r === "string" ? r : null);
      }
    })().finally(() => {
      if (!cancelled) setAuthReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user]);

  useEffect(() => {
    if (status === "unauthenticated" && typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }, [status]);

  useEffect(() => {
    if (!authReady) return;
    if (!allowed && typeof window !== "undefined") {
      window.location.assign("/dashboard");
    }
  }, [authReady, allowed]);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    setListsError(null);
    try {
      const res = await fetch("/api/hubspot/casting/lists", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : "Impossible de charger les listes.";
        throw new Error(msg);
      }
      setLists(Array.isArray(data.lists) ? data.lists : []);
    } catch (e: unknown) {
      setListsError(e instanceof Error ? e.message : "Erreur réseau.");
      setLists([]);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !allowed) return;
    void loadLists();
  }, [authReady, allowed, loadLists]);

  const filteredLists = useMemo(
    () =>
      lists.filter((list) =>
        list.name.toLowerCase().includes(searchList.trim().toLowerCase())
      ),
    [lists, searchList]
  );

  const loadContacts = useCallback(
    async (id: string) => {
      if (!id.trim()) {
        setContacts([]);
        return;
      }
      setLoadingContacts(true);
      setContactsError(null);
      try {
        const res = await fetch(
          `/api/hubspot/casting?listId=${encodeURIComponent(id.trim())}`,
          { credentials: "include" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Chargement des contacts impossible."
          );
        }
        const raw = (data as { contacts?: HubSpotContactCasting[] }).contacts;
        setContacts(Array.isArray(raw) ? raw : []);
      } catch (e: unknown) {
        setContactsError(e instanceof Error ? e.message : "Erreur réseau.");
        setContacts([]);
      } finally {
        setLoadingContacts(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!listId) {
      setContacts([]);
      setMissionsByBrand({});
      return;
    }
    loadContacts(listId);
  }, [listId, loadContacts]);

  useEffect(() => {
    const groups = groupContactsByBrand(contacts);
    const keys = groups.map((g) => g.key).filter(Boolean);
    if (keys.length === 0) {
      setMissionsByBrand({});
      return;
    }
    const encoded = encodeURIComponent(keys.join(","));
    fetch(`/api/strategy/contact-missions?brands=${encoded}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (!data.missionsByBrand || typeof data.missionsByBrand !== "object") {
          setMissionsByBrand({});
          return;
        }
        setMissionsByBrand(data.missionsByBrand as Record<string, MissionBrief>);
      })
      .catch(() => setMissionsByBrand({}));
  }, [contacts]);

  const columns = useMemo(() => {
    // Important : une seule carte par marque.
    // La marque est classée selon le statut le plus avancé parmi ses contacts.
    const todo: BrandGroup[] = [];
    const progress: BrandGroup[] = [];
    const ready: BrandGroup[] = [];

    const groups = groupContactsByBrand(contacts);
    for (const g of groups) {
      const col = brandColumnFor(g.contacts);
      if (col === "todo") todo.push(g);
      else if (col === "progress") progress.push(g);
      else ready.push(g);
    }
    return {
      todo,
      progress,
      ready,
    };
  }, [contacts]);

  const selectedList = lists.find((l) => l.id === listId);

  if (
    status === "loading" ||
    (status === "authenticated" && !authReady) ||
    (authReady && status === "authenticated" && !allowed)
  ) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
        {authReady && !allowed && (
          <p className="text-sm text-gray-500">Redirection…</p>
        )}
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="space-y-6" style={{ fontFamily: "Switzer, system-ui, sans-serif" }}>
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-xl shadow-lg text-sm max-w-md border"
          style={{
            backgroundColor: toast.type === "success" ? TEA_GREEN : "#FEE2E2",
            color: LICORICE,
            borderColor: toast.type === "success" ? LICORICE : "#B91C1C",
          }}
        >
          {toast.message}
        </div>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "Spectral, serif", color: LICORICE }}
          >
            Casting Outreach
          </h1>
          <p className="text-sm mt-1 opacity-80" style={{ color: OLD_ROSE }}>
            Listes HubSpot et suivi des emails de casting par marque.
          </p>
        </div>
        {listId && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ backgroundColor: OLD_LACE, color: LICORICE }}
          >
            <Users className="w-4 h-4" />
            {loadingContacts ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span>
                {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
                {selectedList?.contactCount != null && (
                  <span className="opacity-70"> · HubSpot : {selectedList.contactCount}</span>
                )}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Segment HubSpot — même logique que presskit-dashboard (étape 1) */}
      <section
        className="rounded-2xl border p-5 bg-white"
        style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
      >
        <h2
          className="text-sm font-semibold mb-3"
          style={{ fontFamily: "Spectral, serif", color: LICORICE }}
        >
          Sélection du segment HubSpot
        </h2>
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40"
              style={{ color: LICORICE }}
            />
            <input
              type="text"
              placeholder="Rechercher un segment…"
              value={searchList}
              onChange={(e) => setSearchList(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm"
              style={{ borderColor: OLD_ROSE, color: LICORICE }}
            />
          </div>
          <button
            type="button"
            onClick={() => void loadLists()}
            disabled={loadingLists}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: OLD_LACE, color: LICORICE, border: `1px solid ${OLD_ROSE}` }}
          >
            {loadingLists ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Rafraîchir les listes
          </button>
        </div>

        {loadingLists ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} />
          </div>
        ) : (
          <div className="space-y-2 max-h-[min(360px,40vh)] overflow-y-auto pr-1">
            {filteredLists.length === 0 ? (
              <p className="text-sm text-center py-8 opacity-70" style={{ color: OLD_ROSE }}>
                {lists.length === 0
                  ? "Aucune liste HubSpot. Vérifiez la clé API ou rafraîchissez."
                  : "Aucun segment ne correspond à la recherche."}
              </p>
            ) : (
              filteredLists.map((list) => {
                const isSelected = listId === list.id;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setListId(list.id)}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border text-left transition-colors"
                    style={{
                      borderColor: isSelected ? TEA_GREEN : `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                      backgroundColor: isSelected ? "rgba(200, 242, 133, 0.12)" : OLD_LACE,
                    }}
                  >
                    <div>
                      <p className="font-medium text-sm" style={{ color: LICORICE }}>
                        {list.name}
                      </p>
                      <p className="text-xs mt-0.5 opacity-75" style={{ color: OLD_ROSE }}>
                        {list.contactCount ?? 0} contacts
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 shrink-0 opacity-50" style={{ color: LICORICE }} />
                  </button>
                );
              })
            )}
          </div>
        )}
        {listId && (
          <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}>
            <span className="text-xs" style={{ color: OLD_ROSE }}>
              Liste active :{" "}
              <strong style={{ color: LICORICE }}>{selectedList?.name ?? listId}</strong>
            </span>
            <button
              type="button"
              onClick={() => setListId("")}
              className="text-xs underline-offset-2 hover:underline"
              style={{ color: OLD_ROSE }}
            >
              Changer de segment
            </button>
          </div>
        )}
      </section>

      {listsError && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "#FECACA", backgroundColor: "#FEF2F2", color: "#991B1B" }}
        >
          {listsError}
        </div>
      )}

      {contactsError && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "#FECACA", backgroundColor: "#FEF2F2", color: "#991B1B" }}
        >
          {contactsError}
        </div>
      )}

      {!listId ? (
        <div
          className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm"
          style={{ borderColor: OLD_ROSE, color: OLD_ROSE, backgroundColor: OLD_LACE }}
        >
          Sélectionnez une liste pour afficher le kanban.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <KanbanColumn
            title="À traiter"
            emoji="🔴"
            hint="Sans corps d’email — regroupé par marque"
            groups={columns.todo}
            borderColor={COL_BORDER.todo}
            onComposeAll={(group) => {
              setActiveBrand({
                ...composerStateForBrand(group.displayName, group.contacts),
                missionBrief: missionsByBrand[group.key] || null,
              });
              setActiveBrandColumn(brandColumnFor(group.contacts));
              setComposerOpen(true);
            }}
            onComposeOne={(group, c) => {
              setActiveBrand({
                ...composerStateForBrand(group.displayName, [c]),
                missionBrief: missionsByBrand[group.key] || null,
              });
              setActiveBrandColumn(brandColumnFor(group.contacts));
              setComposerOpen(true);
            }}
          />
          <KanbanColumn
            title="En cours"
            emoji="🟡"
            hint="Statut « en cours » — regroupé par marque"
            groups={columns.progress}
            borderColor={COL_BORDER.progress}
            onComposeAll={(group) => {
              setActiveBrand({
                ...composerStateForBrand(group.displayName, group.contacts),
                missionBrief: missionsByBrand[group.key] || null,
              });
              setActiveBrandColumn(brandColumnFor(group.contacts));
              setComposerOpen(true);
            }}
            onComposeOne={(group, c) => {
              setActiveBrand({
                ...composerStateForBrand(group.displayName, [c]),
                missionBrief: missionsByBrand[group.key] || null,
              });
              setActiveBrandColumn(brandColumnFor(group.contacts));
              setComposerOpen(true);
            }}
          />
          <KanbanColumn
            title="Prêt"
            emoji="🟢"
            hint="Statut « prêt » — regroupé par marque"
            groups={columns.ready}
            borderColor={COL_BORDER.ready}
            onComposeAll={(group) => {
              setActiveBrand({
                ...composerStateForBrand(group.displayName, group.contacts),
                missionBrief: missionsByBrand[group.key] || null,
              });
              setActiveBrandColumn(brandColumnFor(group.contacts));
              setComposerOpen(true);
            }}
            onComposeOne={(group, c) => {
              setActiveBrand({
                ...composerStateForBrand(group.displayName, [c]),
                missionBrief: missionsByBrand[group.key] || null,
              });
              setActiveBrandColumn(brandColumnFor(group.contacts));
              setComposerOpen(true);
            }}
          />
        </div>
      )}

      <CastingComposer
        open={composerOpen}
        contact={activeBrand}
        brandColumn={activeBrandColumn}
        onClose={() => {
          setComposerOpen(false);
          setActiveBrand(null);
          setActiveBrandColumn(null);
        }}
        onSaved={() => {
          if (listId) loadContacts(listId);
        }}
        onError={(msg) => showToast(msg, "error")}
        onSuccess={(msg) => showToast(msg, "success")}
      />
    </div>
  );
}

function KanbanColumn({
  title,
  emoji,
  hint,
  groups,
  borderColor,
  onComposeAll,
  onComposeOne,
}: {
  title: string;
  emoji: string;
  hint: string;
  groups: BrandGroup[];
  borderColor: string;
  onComposeAll: (group: BrandGroup) => void;
  onComposeOne: (group: BrandGroup, contact: HubSpotContactCasting) => void;
}) {
  const contactTotal = groups.reduce((n, g) => n + g.contacts.length, 0);
  return (
    <div
      className="rounded-2xl border flex flex-col min-h-[320px] max-h-[calc(100vh-220px)]"
      style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`, backgroundColor: OLD_LACE }}
    >
      <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 25%, transparent)` }}>
        <div className="flex items-center justify-between gap-2">
          <h2
            className="text-lg font-semibold flex items-center gap-2"
            style={{ fontFamily: "Spectral, serif", color: LICORICE }}
          >
            <span aria-hidden>{emoji}</span>
            {title}
          </h2>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "white", color: LICORICE }}
            title={`${groups.length} marque(s), ${contactTotal} contact(s)`}
          >
            {groups.length} marque{groups.length !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="text-xs mt-1 opacity-75" style={{ color: OLD_ROSE }}>
          {hint}
          {contactTotal > 0 && (
            <span className="opacity-90"> · {contactTotal} contact{contactTotal !== 1 ? "s" : ""}</span>
          )}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {groups.map((group) => (
          <article
            key={group.key}
            className="rounded-xl border bg-white/90 shadow-sm overflow-hidden"
            style={{
              borderLeftWidth: 4,
              borderLeftColor: borderColor,
              borderTopColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
              borderRightColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
              borderBottomColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
            }}
          >
            <div
              className="px-3 py-2 border-b"
              style={{
                borderColor: `color-mix(in srgb, ${OLD_ROSE} 20%, transparent)`,
                backgroundColor: "rgba(245, 235, 224, 0.6)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: LICORICE }}>
                    {group.displayName}
                  </p>
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center mt-0.5 opacity-90"
                    style={{
                      backgroundColor: "rgba(245, 235, 224, 0.85)",
                      color: OLD_ROSE,
                      border: `1px solid color-mix(in srgb, ${OLD_ROSE} 45%, transparent)`,
                    }}
                    title="Nombre de contacts pour cette marque"
                  >
                    {group.contacts.length} contact{group.contacts.length !== 1 ? "s" : ""}
                  </span>
                </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          brandColumnFor(group.contacts) === "ready"
                            ? "rgba(200, 242, 133, 0.35)"
                            : brandColumnFor(group.contacts) === "progress"
                              ? "rgba(192, 139, 139, 0.18)"
                              : "rgba(192, 139, 139, 0.12)",
                        color: LICORICE,
                        border: `1px solid ${
                          brandColumnFor(group.contacts) === "ready"
                            ? TEA_GREEN
                            : `color-mix(in srgb, ${OLD_ROSE} 55%, transparent)`
                        }`,
                      }}
                      title="Statut de la marque"
                    >
                      {brandStatusLabel(group.contacts)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onComposeAll(group)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      style={{ backgroundColor: OLD_LACE, color: LICORICE }}
                    >
                      Rédiger pour tous
                    </button>
                  </div>
              </div>
            </div>
            <ul className="divide-y" style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 15%, transparent)` }}>
              {group.contacts.map((c) => (
                <li
                  key={c.id}
                  className="px-3 py-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: LICORICE }}>
                      {`${c.firstname} ${c.lastname}`.trim() || "Sans nom"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{c.email || "—"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onComposeOne(group, c)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 self-end sm:self-center"
                    style={{ backgroundColor: OLD_LACE, color: LICORICE }}
                  >
                    Rédiger
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {groups.length === 0 && (
          <p className="text-xs text-center py-8 opacity-60" style={{ color: OLD_ROSE }}>
            Aucune marque.
          </p>
        )}
      </div>
    </div>
  );
}
