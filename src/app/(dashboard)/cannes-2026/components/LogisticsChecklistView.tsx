"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const SETTINGS_KEY = "logistics-checklist";

const CATEGORY_OPTIONS = [
  { value: "BOISSONS", label: "Boissons" },
  { value: "HYGIENE", label: "Hygiene" },
  { value: "TECH", label: "Tech" },
  { value: "NOURRITURE", label: "Nourriture" },
  { value: "LOGISTIQUE", label: "Logistique / caisses" },
  { value: "AUTRE", label: "Autre" },
] as const;

type CategoryValue = (typeof CATEGORY_OPTIONS)[number]["value"];

/** Consommables (champagne…) vs matériel / produits Glow Up à récupérer en fin (trépied…). */
const ITEM_KIND_OPTIONS = [
  { value: "CONSUMABLE", label: "Consommable", short: "Conso", hint: "ex. champagne, courses" },
  { value: "GEAR_RETURN", label: "Matériel à récupérer en fin", short: "Fin", hint: "ex. trépied, nos équipements" },
] as const;

type ItemKind = (typeof ITEM_KIND_OPTIONS)[number]["value"];

function isItemKind(v: string): v is ItemKind {
  return (ITEM_KIND_OPTIONS as readonly { value: string }[]).some((k) => k.value === v);
}

type LogisticsItem = {
  id: string;
  name: string;
  kind: ItemKind;
  category: CategoryValue;
  lowStockThreshold: number;
  stockQty: number;
  targetQty: number;
  packedQty: number;
};

type LogisticsLogType =
  | "create"
  | "receive"
  | "pick"
  | "return"
  | "delete"
  | "category_change"
  | "threshold_change"
  | "kind_change";

type LogisticsActor = {
  id?: string;
  name?: string | null;
  email?: string | null;
};

type LogisticsLogEvent = {
  id: string;
  at: string;
  type: LogisticsLogType;
  itemId: string;
  itemName: string;
  deltaStock?: number;
  deltaPacked?: number;
  detail?: string;
  actor?: LogisticsActor;
};

type LogisticsPayload = {
  items?: LogisticsItem[];
  events?: LogisticsLogEvent[];
};

type LogisticsState = {
  items: LogisticsItem[];
  events: LogisticsLogEvent[];
};

const MAX_EVENTS = 500;
const DEFAULT_LOW_STOCK = 3;

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LOW_STOCK;
  return Math.min(999, Math.max(0, Math.floor(value)));
}

function isCategoryValue(v: string): v is CategoryValue {
  return (CATEGORY_OPTIONS as readonly { value: string }[]).some((c) => c.value === v);
}

function toValidItem(raw: unknown): LogisticsItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id : crypto.randomUUID();
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;
  const catRaw = typeof obj.category === "string" ? obj.category.trim().toUpperCase() : "AUTRE";
  const category: CategoryValue = isCategoryValue(catRaw) ? catRaw : "AUTRE";
  const kindRaw = typeof obj.kind === "string" ? obj.kind.trim().toUpperCase() : "CONSUMABLE";
  const kind: ItemKind = isItemKind(kindRaw) ? kindRaw : "CONSUMABLE";
  const lowStockThreshold = clampThreshold(Number(obj.lowStockThreshold ?? DEFAULT_LOW_STOCK));
  const stockQty = clampNonNegative(Number(obj.stockQty ?? 0));
  const targetQty = clampNonNegative(Number(obj.targetQty ?? 0));
  const packedQty = clampNonNegative(Number(obj.packedQty ?? 0));
  return { id, name, kind, category, lowStockThreshold, stockQty, targetQty, packedQty };
}

function toValidEvent(raw: unknown): LogisticsLogEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id : crypto.randomUUID();
  const at = typeof obj.at === "string" && obj.at ? obj.at : new Date().toISOString();
  const typeRaw = typeof obj.type === "string" ? obj.type : "";
  const allowed: LogisticsLogType[] = [
    "create",
    "receive",
    "pick",
    "return",
    "delete",
    "category_change",
    "threshold_change",
    "kind_change",
  ];
  const type = allowed.includes(typeRaw as LogisticsLogType) ? (typeRaw as LogisticsLogType) : null;
  if (!type) return null;
  const itemId = typeof obj.itemId === "string" ? obj.itemId : "";
  const itemName = typeof obj.itemName === "string" ? obj.itemName : "";
  if (!itemId || !itemName) return null;
  const deltaStock =
    obj.deltaStock === undefined || obj.deltaStock === null ? undefined : Number(obj.deltaStock);
  const deltaPacked =
    obj.deltaPacked === undefined || obj.deltaPacked === null ? undefined : Number(obj.deltaPacked);
  const detail = typeof obj.detail === "string" ? obj.detail : undefined;
  let actor: LogisticsActor | undefined;
  if (obj.actor && typeof obj.actor === "object") {
    const a = obj.actor as Record<string, unknown>;
    actor = {
      id: typeof a.id === "string" ? a.id : undefined,
      name: typeof a.name === "string" ? a.name : a.name === null ? null : undefined,
      email: typeof a.email === "string" ? a.email : a.email === null ? null : undefined,
    };
  }
  return {
    id,
    at,
    type,
    itemId,
    itemName,
    deltaStock: Number.isFinite(deltaStock as number) ? (deltaStock as number) : undefined,
    deltaPacked: Number.isFinite(deltaPacked as number) ? (deltaPacked as number) : undefined,
    detail,
    actor,
  };
}

function normalizeState(value: unknown): LogisticsState {
  if (!value || typeof value !== "object") return { items: [], events: [] };
  const o = value as Record<string, unknown>;
  const items = Array.isArray(o.items)
    ? o.items.map(toValidItem).filter((i): i is LogisticsItem => i !== null)
    : [];
  const events = Array.isArray(o.events)
    ? o.events.map(toValidEvent).filter((e): e is LogisticsLogEvent => e !== null)
    : [];
  return { items, events: events.slice(-MAX_EVENTS) };
}

function actorLabel(actor?: LogisticsActor): string {
  if (!actor) return "Utilisateur";
  const n = actor.name?.trim();
  if (n) return n;
  const e = actor.email?.trim();
  if (e) return e;
  return "Utilisateur";
}

function eventTypeLabel(type: LogisticsLogType): string {
  switch (type) {
    case "create":
      return "Article cree";
    case "receive":
      return "Reception stock";
    case "pick":
      return "Prelevement";
    case "return":
      return "Remise en stock";
    case "delete":
      return "Suppression";
    case "category_change":
      return "Categorie";
    case "threshold_change":
      return "Seuil stock bas";
    case "kind_change":
      return "Type article";
    default:
      return type;
  }
}

function formatEventLine(ev: LogisticsLogEvent): string {
  const who = actorLabel(ev.actor);
  const parts: string[] = [ev.itemName];
  if (ev.deltaStock !== undefined && ev.deltaStock !== 0) {
    parts.push(`stock ${ev.deltaStock > 0 ? "+" : ""}${ev.deltaStock}`);
  }
  if (ev.deltaPacked !== undefined && ev.deltaPacked !== 0) {
    parts.push(`preleve ${ev.deltaPacked > 0 ? "+" : ""}${ev.deltaPacked}`);
  }
  if (ev.detail) parts.push(ev.detail);
  return `${who} — ${parts.join(" · ")}`;
}

export default function LogisticsChecklistView() {
  const [state, setState] = useState<LogisticsState>({ items: [], events: [] });
  const [actor, setActor] = useState<LogisticsActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStockQty, setNewStockQty] = useState("0");
  const [newTargetQty, setNewTargetQty] = useState("0");
  const [newCategory, setNewCategory] = useState<CategoryValue>("AUTRE");
  const [newKind, setNewKind] = useState<ItemKind>("CONSUMABLE");
  const [categoryFilter, setCategoryFilter] = useState<CategoryValue | "TOUS">("TOUS");
  const [kindFilter, setKindFilter] = useState<ItemKind | "TOUS">("TOUS");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { id?: string; name?: string | null; email?: string | null } | null) => {
        if (u) setActor({ id: u.id, name: u.name ?? null, email: u.email ?? null });
      })
      .catch(() => setActor(null));
  }, []);

  async function persist(next: LogisticsState) {
    setSaving(true);
    setError(null);
    const trimmedEvents = next.events.slice(-MAX_EVENTS);
    const payload: LogisticsPayload = { items: next.items, events: trimmedEvents };
    try {
      const res = await fetch(`/api/cannes/shared-settings/${SETTINGS_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: payload }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || `Sauvegarde impossible (${res.status})`);
        throw new Error("SAVE_FAILED");
      }
    } catch (e) {
      if ((e as Error)?.message !== "SAVE_FAILED") {
        toast.error("Sauvegarde impossible (reseau ou session).");
      }
      setError("Sauvegarde impossible pour le moment.");
    } finally {
      setSaving(false);
    }
  }

  function pushEvent(
    prev: LogisticsState,
    ev: Omit<LogisticsLogEvent, "id" | "at" | "actor"> & { actor?: LogisticsActor }
  ): LogisticsState {
    const event: LogisticsLogEvent = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: ev.actor ?? actor ?? undefined,
      itemId: ev.itemId,
      itemName: ev.itemName,
      type: ev.type,
      deltaStock: ev.deltaStock,
      deltaPacked: ev.deltaPacked,
      detail: ev.detail,
    };
    const events = [...prev.events, event].slice(-MAX_EVENTS);
    return { ...prev, events };
  }

  function updateState(updater: (prev: LogisticsState) => LogisticsState) {
    setState((prev) => {
      const next = updater(prev);
      void persist(next);
      return next;
    });
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cannes/shared-settings/${SETTINGS_KEY}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { value?: unknown | null; error?: string };
        if (!res.ok) {
          toast.error(data.error || `Chargement impossible (${res.status})`);
          throw new Error("LOAD_FAILED");
        }
        setState(normalizeState(data.value ?? null));
      } catch (e) {
        if ((e as Error)?.message !== "LOAD_FAILED") {
          toast.error("Chargement impossible (reseau).");
        }
        setError("Chargement impossible pour le moment.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const totals = useMemo(() => {
    return state.items.reduce(
      (acc, item) => {
        acc.stock += item.stockQty;
        acc.target += item.targetQty;
        acc.packed += item.packedQty;
        return acc;
      },
      { stock: 0, target: 0, packed: 0 }
    );
  }, [state.items]);

  const lowStockItems = useMemo(
    () => state.items.filter((i) => i.stockQty <= i.lowStockThreshold),
    [state.items]
  );

  const kindCounts = useMemo(() => {
    return state.items.reduce(
      (acc, i) => {
        if (i.kind === "CONSUMABLE") acc.consumable += 1;
        else acc.gearReturn += 1;
        return acc;
      },
      { consumable: 0, gearReturn: 0 }
    );
  }, [state.items]);

  const filteredItems = useMemo(() => {
    let list = state.items;
    if (kindFilter !== "TOUS") list = list.filter((i) => i.kind === kindFilter);
    if (categoryFilter !== "TOUS") list = list.filter((i) => i.category === categoryFilter);
    return list;
  }, [state.items, kindFilter, categoryFilter]);

  const displayItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredItems;
    return filteredItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [filteredItems, searchQuery]);

  const recentEvents = useMemo(() => {
    return [...state.events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
  }, [state.events]);

  function addItem() {
    const name = newName.trim();
    if (!name) return;
    const stockQty = clampNonNegative(Number(newStockQty));
    const targetQty = clampNonNegative(Number(newTargetQty));
    const id = crypto.randomUUID();
    updateState((prev) => {
      const items = [
        ...prev.items,
        {
          id,
          name,
          kind: newKind,
          category: newCategory,
          lowStockThreshold: DEFAULT_LOW_STOCK,
          stockQty,
          targetQty,
          packedQty: 0,
        },
      ];
      let next: LogisticsState = { ...prev, items };
      next = pushEvent(next, {
        type: "create",
        itemId: id,
        itemName: name,
        detail: `type ${newKind}, categorie ${newCategory}, stock ${stockQty}, objectif ${targetQty}`,
      });
      return next;
    });
    setNewName("");
    setNewStockQty("0");
    setNewTargetQty("0");
    setNewCategory("AUTRE");
    setNewKind("CONSUMABLE");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-[Spectral] text-2xl text-[#1A1110]">Logistique Cannes</h2>
            <p className="mt-1 text-sm text-[#1A1110]/65">
              Separe les <strong className="font-medium text-[#1A1110]">consommables</strong> (champagne, courses…) du{" "}
              <strong className="font-medium text-[#1A1110]">matériel à récupérer en fin</strong> (trépied, équipement
              Glow Up…). Filtre par type pour voir chaque liste.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[#C08B8B]/40 bg-[#FDF6F6] px-3 py-1 text-xs font-medium text-[#8B3A3A]">
            Acces ADMIN uniquement
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-7">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex: Champagne / Trépied"
            className="rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm lg:col-span-2"
          />
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as ItemKind)}
            title={ITEM_KIND_OPTIONS.find((k) => k.value === newKind)?.hint}
            className="rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
          >
            {ITEM_KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as CategoryValue)}
            className="rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={newStockQty}
            onChange={(e) => setNewStockQty(e.target.value)}
            className="rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
            placeholder="Stock initial"
          />
          <input
            type="number"
            min={0}
            value={newTargetQty}
            onChange={(e) => setNewTargetQty(e.target.value)}
            className="rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
            placeholder="A prendre"
          />
          <button
            onClick={addItem}
            className="rounded-lg bg-[#1A1110] px-3 py-2 text-sm font-medium text-[#F5EBE0] hover:bg-[#C08B8B]"
          >
            Ajouter
          </button>
        </div>
      </section>

      {lowStockItems.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
          <p className="font-medium">Stock bas ({lowStockItems.length})</p>
          <ul className="mt-2 list-inside list-disc text-amber-900/90">
            {lowStockItems.map((i) => (
              <li key={i.id}>
                {i.name}{" "}
                <span className="text-amber-800/80">
                  ({i.kind === "GEAR_RETURN" ? "matériel fin" : "conso"})
                </span>{" "}
                — reste {i.stockQty} (seuil {i.lowStockThreshold})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_min(100%,380px)] xl:items-start xl:gap-8">
        <div className="min-w-0 space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-[#E5E0D8] bg-white p-3 text-sm text-[#1A1110] shadow-sm">
              <p className="text-xs uppercase tracking-wide text-[#1A1110]/55">Stock total</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.stock}</p>
            </div>
            <div className="rounded-xl border border-[#E5E0D8] bg-white p-3 text-sm text-[#1A1110] shadow-sm">
              <p className="text-xs uppercase tracking-wide text-[#1A1110]/55">Objectif a prendre</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.target}</p>
            </div>
            <div className="rounded-xl border border-[#E5E0D8] bg-white p-3 text-sm text-[#1A1110] shadow-sm">
              <p className="text-xs uppercase tracking-wide text-[#1A1110]/55">Deja preleve</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totals.packed}</p>
            </div>
            <div className="rounded-xl border border-[#E8D4F0] bg-[#FBF7FD] p-3 text-sm text-[#1A1110] shadow-sm sm:col-span-2 lg:col-span-2">
              <p className="text-xs uppercase tracking-wide text-[#1A1110]/55">Articles par type</p>
              <p className="mt-1 text-sm text-[#1A1110]/80">
                <span className="font-semibold tabular-nums text-[#1A1110]">{kindCounts.consumable}</span> consommables
                {" · "}
                <span className="font-semibold tabular-nums text-[#1A1110]">{kindCounts.gearReturn}</span> matériel fin
              </p>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-[#1A1110]/55">Type</span>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as ItemKind | "TOUS")}
                className="rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
              >
                <option value="TOUS">Tous les types</option>
                {ITEM_KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-[#1A1110]/55">Categorie</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryValue | "TOUS")}
                className="rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm"
              >
                <option value="TOUS">Toutes</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un article..."
              className="min-w-[12rem] flex-1 rounded-lg border border-[#E5E0D8] bg-white px-3 py-2 text-sm sm:max-w-md"
            />
          </div>

          {loading ? (
            <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 text-sm text-[#1A1110]/70">
              Chargement de la checklist...
            </div>
          ) : state.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E0D8] bg-white p-6 text-sm text-[#1A1110]/65">
              Aucun article pour l instant. Ajoute un article avec son stock, puis utilise{" "}
              <span className="font-medium text-[#1A1110]">Prelever 1</span> ou{" "}
              <span className="font-medium text-[#1A1110]">Prelever 5</span> — l historique enregistre qui a
              fait le mouvement.
            </div>
          ) : displayItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E0D8] bg-white p-6 text-sm text-[#1A1110]/65">
              Aucun article ne correspond a ta recherche ou au filtre categorie.
            </div>
          ) : (
            <div className="grid gap-3">
              {displayItems.map((item) => {
            const progress =
              item.targetQty <= 0 ? 0 : Math.min(100, Math.round((item.packedQty / item.targetQty) * 100));
            const low = item.stockQty <= item.lowStockThreshold;
            return (
              <article
                key={item.id}
                className={`rounded-xl border bg-white p-4 shadow-sm ${
                  low ? "border-amber-400 ring-1 ring-amber-200" : "border-[#E5E0D8]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-[#1A1110]">{item.name}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          item.kind === "GEAR_RETURN"
                            ? "bg-[#E8F0FE] text-[#1A3A5C]"
                            : "bg-[#F0E8E8] text-[#5C1A1A]"
                        }`}
                      >
                        {item.kind === "GEAR_RETURN" ? "Matériel fin" : "Conso"}
                      </span>
                      {low && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          Stock bas
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#1A1110]/65">
                      Stock: {item.stockQty} · Preleve: {item.packedQty} · Objectif: {item.targetQty}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-[#1A1110]/70">
                        Type
                        <select
                          value={item.kind}
                          onChange={(e) => {
                            const nextKind = e.target.value as ItemKind;
                            if (nextKind === item.kind) return;
                            updateState((prev) => {
                              const items = prev.items.map((p) =>
                                p.id === item.id ? { ...p, kind: nextKind } : p
                              );
                              let next: LogisticsState = { ...prev, items };
                              next = pushEvent(next, {
                                type: "kind_change",
                                itemId: item.id,
                                itemName: item.name,
                                detail: `${item.kind} -> ${nextKind}`,
                              });
                              return next;
                            });
                          }}
                          className="max-w-[11rem] rounded border border-[#E5E0D8] bg-white px-2 py-1 text-xs"
                        >
                          {ITEM_KIND_OPTIONS.map((k) => (
                            <option key={k.value} value={k.value}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-xs text-[#1A1110]/70">
                        Categorie
                        <select
                          value={item.category}
                          onChange={(e) => {
                            const nextCat = e.target.value as CategoryValue;
                            if (nextCat === item.category) return;
                            updateState((prev) => {
                              const items = prev.items.map((p) =>
                                p.id === item.id ? { ...p, category: nextCat } : p
                              );
                              let next: LogisticsState = { ...prev, items };
                              next = pushEvent(next, {
                                type: "category_change",
                                itemId: item.id,
                                itemName: item.name,
                                detail: `${item.category} -> ${nextCat}`,
                              });
                              return next;
                            });
                          }}
                          className="rounded border border-[#E5E0D8] bg-white px-2 py-1 text-xs"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-xs text-[#1A1110]/70">
                        Seuil stock bas
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={item.lowStockThreshold}
                          onChange={(e) => {
                            const v = clampThreshold(Number(e.target.value));
                            updateState((prev) => {
                              const cur = prev.items.find((p) => p.id === item.id);
                              const items = prev.items.map((p) =>
                                p.id === item.id ? { ...p, lowStockThreshold: v } : p
                              );
                              if (!cur || cur.lowStockThreshold === v) {
                                return { ...prev, items };
                              }
                              let next: LogisticsState = { ...prev, items };
                              next = pushEvent(next, {
                                type: "threshold_change",
                                itemId: item.id,
                                itemName: item.name,
                                detail: `seuil ${cur.lowStockThreshold} -> ${v}`,
                              });
                              return next;
                            });
                          }}
                          className="w-16 rounded border border-[#E5E0D8] bg-white px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        updateState((prev) => {
                          const items = prev.items.map((p) =>
                            p.id === item.id ? { ...p, stockQty: p.stockQty + 1 } : p
                          );
                          let next: LogisticsState = { ...prev, items };
                          next = pushEvent(next, {
                            type: "receive",
                            itemId: item.id,
                            itemName: item.name,
                            deltaStock: +1,
                          });
                          return next;
                        })
                      }
                      className="rounded-md border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110] hover:bg-[#F5EBE0]"
                    >
                      +1 stock
                    </button>
                    <button
                      onClick={() =>
                        updateState((prev) => {
                          const items = prev.items.map((p) =>
                            p.id === item.id ? { ...p, stockQty: p.stockQty + 5 } : p
                          );
                          let next: LogisticsState = { ...prev, items };
                          next = pushEvent(next, {
                            type: "receive",
                            itemId: item.id,
                            itemName: item.name,
                            deltaStock: +5,
                            detail: "lot +5",
                          });
                          return next;
                        })
                      }
                      className="rounded-md border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110] hover:bg-[#F5EBE0]"
                    >
                      +5 stock
                    </button>
                    <button
                      onClick={() =>
                        updateState((prev) => {
                          const cur = prev.items.find((p) => p.id === item.id);
                          if (!cur || cur.stockQty <= 0) return prev;
                          const items = prev.items.map((p) =>
                            p.id === item.id
                              ? {
                                  ...p,
                                  stockQty: p.stockQty - 1,
                                  packedQty: p.packedQty + 1,
                                }
                              : p
                          );
                          let next: LogisticsState = { ...prev, items };
                          next = pushEvent(next, {
                            type: "pick",
                            itemId: item.id,
                            itemName: item.name,
                            deltaStock: -1,
                            deltaPacked: +1,
                          });
                          return next;
                        })
                      }
                      className="rounded-md border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110] hover:bg-[#F5EBE0]"
                    >
                      Prelever 1
                    </button>
                    <button
                      onClick={() =>
                        updateState((prev) => {
                          const cur = prev.items.find((p) => p.id === item.id);
                          if (!cur || cur.stockQty <= 0) return prev;
                          const take = Math.min(5, cur.stockQty);
                          const items = prev.items.map((p) =>
                            p.id === item.id
                              ? {
                                  ...p,
                                  stockQty: p.stockQty - take,
                                  packedQty: p.packedQty + take,
                                }
                              : p
                          );
                          let next: LogisticsState = { ...prev, items };
                          next = pushEvent(next, {
                            type: "pick",
                            itemId: item.id,
                            itemName: item.name,
                            deltaStock: -take,
                            deltaPacked: take,
                            detail: take < 5 ? `demande 5, pris ${take}` : "lot 5",
                          });
                          return next;
                        })
                      }
                      className="rounded-md border border-[#E5E0D8] px-2 py-1 text-xs font-medium text-[#1A1110] hover:bg-[#F5EBE0]"
                    >
                      Prelever 5
                    </button>
                    <button
                      onClick={() =>
                        updateState((prev) => {
                          const cur = prev.items.find((p) => p.id === item.id);
                          if (!cur || cur.packedQty <= 0) return prev;
                          const items = prev.items.map((p) =>
                            p.id === item.id
                              ? {
                                  ...p,
                                  packedQty: p.packedQty - 1,
                                  stockQty: p.stockQty + 1,
                                }
                              : p
                          );
                          let next: LogisticsState = { ...prev, items };
                          next = pushEvent(next, {
                            type: "return",
                            itemId: item.id,
                            itemName: item.name,
                            deltaStock: +1,
                            deltaPacked: -1,
                          });
                          return next;
                        })
                      }
                      className="rounded-md border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110] hover:bg-[#F5EBE0]"
                    >
                      Remettre 1
                    </button>
                    <button
                      onClick={() =>
                        updateState((prev) => {
                          const cur = prev.items.find((p) => p.id === item.id);
                          if (!cur || cur.packedQty <= 0) return prev;
                          const back = Math.min(5, cur.packedQty);
                          const items = prev.items.map((p) =>
                            p.id === item.id
                              ? {
                                  ...p,
                                  packedQty: p.packedQty - back,
                                  stockQty: p.stockQty + back,
                                }
                              : p
                          );
                          let next: LogisticsState = { ...prev, items };
                          next = pushEvent(next, {
                            type: "return",
                            itemId: item.id,
                            itemName: item.name,
                            deltaStock: back,
                            deltaPacked: -back,
                            detail: "lot 5",
                          });
                          return next;
                        })
                      }
                      className="rounded-md border border-[#E5E0D8] px-2 py-1 text-xs text-[#1A1110] hover:bg-[#F5EBE0]"
                    >
                      Remettre 5
                    </button>
                    <button
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Supprimer « ${item.name} » ? L operation sera enregistree dans l historique.`
                          )
                        ) {
                          return;
                        }
                        updateState((prev) => {
                          let next: LogisticsState = pushEvent(prev, {
                            type: "delete",
                            itemId: item.id,
                            itemName: item.name,
                            detail: `type ${item.kind}, categorie ${item.category}, stock ${item.stockQty}`,
                          });
                          next = { ...next, items: next.items.filter((p) => p.id !== item.id) };
                          return next;
                        });
                      }}
                      className="rounded-md border border-[#E5E0D8] px-2 py-1 text-xs text-[#A33A3A] hover:bg-[#F5EBE0]"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F5EBE0]">
                  <div className="h-full bg-[#C8F285]" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-xs text-[#1A1110]/55">Progression objectif: {progress}%</p>
              </article>
            );
          })}
            </div>
          )}
        </div>

        <aside className="mt-8 min-h-0 xl:sticky xl:top-6 xl:mt-0">
          <section className="rounded-2xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
            <h3 className="font-[Spectral] text-xl text-[#1A1110]">Historique</h3>
            <p className="mt-1 text-xs text-[#1A1110]/55">
              Jusqu a {MAX_EVENTS} evenements conserves. Fuseau du navigateur.
            </p>
            {recentEvents.length === 0 ? (
              <p className="mt-4 text-sm text-[#1A1110]/60">Aucun mouvement pour le moment.</p>
            ) : (
              <ul className="mt-4 max-h-[min(70vh,520px)] space-y-2 overflow-y-auto text-sm">
                {recentEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-[#E5E0D8] bg-[#FDFBF8] px-3 py-2 text-[#1A1110]/85"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs text-[#1A1110]/50">
                        {new Date(ev.at).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#C08B8B]">
                        {eventTypeLabel(ev.type)}
                      </span>
                    </div>
                    <p className="mt-1 break-words">{formatEventLine(ev)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <div className="text-xs text-[#1A1110]/60">
        {saving ? "Sauvegarde en cours..." : "Sauvegarde automatique active"}
        {error ? <span className="ml-2 text-[#A33A3A]">{error}</span> : null}
      </div>
    </div>
  );
}
