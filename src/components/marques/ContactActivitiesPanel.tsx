"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  StickyNote,
  Phone,
  Trash2,
  Plus,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  Voicemail,
} from "lucide-react";

const INK = "#16110F";
const ROSE = "#C08B8B";

export type ContactActivity = {
  id: string;
  type: "NOTE" | "CALL";
  body: string;
  callOutcome: string | null;
  occurredAt: string;
  createdByName: string | null;
  createdAt: string;
};

const CALL_OUTCOMES: {
  id: string;
  label: string;
  icon: typeof PhoneCall;
}[] = [
  { id: "CONNECTED", label: "Joint — échange", icon: PhoneCall },
  { id: "NO_ANSWER", label: "Pas de réponse", icon: PhoneMissed },
  { id: "VOICEMAIL", label: "Messagerie", icon: Voicemail },
  { id: "BUSY", label: "Occupé", icon: PhoneOff },
];

function outcomeLabel(outcome: string | null): string {
  return CALL_OUTCOMES.find((o) => o.id === outcome)?.label || outcome || "Appel";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContactActivitiesPanel({
  marqueId,
  contactId,
  contactName,
  readOnly,
  onCountChange,
}: {
  marqueId: string;
  contactId: string;
  contactName: string;
  readOnly?: boolean;
  onCountChange?: (n: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ContactActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<"NOTE" | "CALL" | null>(null);
  const [body, setBody] = useState("");
  const [callOutcome, setCallOutcome] = useState("CONNECTED");
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const apiBase = `/api/marques/${marqueId}/contacts/${contactId}/activities`;

  // Évite une boucle infinie : le parent passe souvent un callback inline
  // qui change à chaque setState → ne pas le mettre dans les deps de load.
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiBase);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger les notes");
      const list = (data.activities || []) as ContactActivity[];
      setActivities(list);
      onCountChangeRef.current?.(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetComposer = () => {
    setComposer(null);
    setBody("");
    setCallOutcome("CONNECTED");
    const d = new Date();
    d.setSeconds(0, 0);
    setOccurredAt(d.toISOString().slice(0, 16));
  };

  const submit = async () => {
    if (!composer || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: composer,
          body: body.trim(),
          callOutcome: composer === "CALL" ? callOutcome : null,
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
      resetComposer();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (activityId: string) => {
    if (!confirm("Supprimer cette entrée ?")) return;
    setDeletingId(activityId);
    try {
      const res = await fetch(`${apiBase}?activityId=${encodeURIComponent(activityId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
          Journal · {contactName}
        </p>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setComposer((c) => (c === "NOTE" ? null : "NOTE"))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ring-1 ring-black/[0.08] bg-white hover:bg-gray-50"
              style={{ color: INK }}
            >
              <StickyNote className="w-3 h-3" style={{ color: ROSE }} />
              Note
            </button>
            <button
              type="button"
              onClick={() => setComposer((c) => (c === "CALL" ? null : "CALL"))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ring-1 ring-black/[0.08] bg-white hover:bg-gray-50"
              style={{ color: INK }}
            >
              <Phone className="w-3 h-3" style={{ color: ROSE }} />
              Appel
            </button>
          </div>
        )}
      </div>

      {composer && !readOnly && (
        <div className="rounded-lg bg-white ring-1 ring-black/[0.06] p-3 space-y-2.5">
          <p className="text-[12px] font-semibold" style={{ color: INK }}>
            {composer === "CALL" ? "Logger un appel" : "Ajouter une note"}
          </p>
          {composer === "CALL" && (
            <div className="flex flex-wrap gap-1.5">
              {CALL_OUTCOMES.map((o) => {
                const active = callOutcome === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setCallOutcome(o.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ring-1 transition-colors ${
                      active ? "text-white" : "bg-white text-gray-600 ring-black/[0.08] hover:bg-gray-50"
                    }`}
                    style={active ? { backgroundColor: INK, boxShadow: "inset 0 0 0 1px transparent" } : undefined}
                  >
                    <o.icon className="w-3 h-3" />
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
          <label className="block">
            <span className="text-[11px] text-gray-400">Date</span>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="mt-1 w-full sm:w-auto px-2.5 py-1.5 rounded-md text-[12.5px] ring-1 ring-black/[0.08] bg-white focus:outline-none focus:ring-2"
            />
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={
              composer === "CALL"
                ? callOutcome === "CONNECTED"
                  ? "Ce qui s’est dit pendant l’appel…"
                  : "Contexte / prochain essai…"
                : "Note interne sur ce contact…"
            }
            className="w-full px-2.5 py-2 rounded-md text-[13px] ring-1 ring-black/[0.08] bg-white focus:outline-none focus:ring-2 resize-y min-h-[72px]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetComposer}
              className="px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !body.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: INK }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[12px] text-red-600">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: ROSE }} />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-[12px] text-gray-400 text-center py-2">
          Aucune note ni appel pour l&apos;instant.
        </p>
      ) : (
        <ul className="space-y-2">
          {activities.map((a) => (
            <li
              key={a.id}
              className="rounded-lg bg-white ring-1 ring-black/[0.05] px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 w-6 h-6 rounded-full bg-gray-50 ring-1 ring-black/[0.06] flex items-center justify-center shrink-0">
                  {a.type === "CALL" ? (
                    <Phone className="w-3 h-3 text-gray-500" />
                  ) : (
                    <StickyNote className="w-3 h-3 text-gray-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-gray-600">
                      {a.type === "CALL" ? outcomeLabel(a.callOutcome) : "Note"}
                    </span>
                    <span className="text-[11px] text-gray-400 tabular-nums">
                      {formatWhen(a.occurredAt)}
                    </span>
                    {a.createdByName && (
                      <span className="text-[11px] text-gray-400">· {a.createdByName}</span>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => void remove(a.id)}
                        disabled={deletingId === a.id}
                        className="ml-auto p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                        title="Supprimer"
                      >
                        {deletingId === a.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed">
                    {a.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
