"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { RhButton } from "@/components/rh/ui/primitives";

type Props = {
  taskId: string;
  attachmentId: string;
  fileName: string;
  onClose: () => void;
  onSaved?: () => void;
};

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        id: string,
        config: Record<string, unknown>
      ) => { destroyEditor?: () => void };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-onlyoffice="1"]`
    );
    if (existing && window.DocsAPI) {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Script OnlyOffice"))
      );
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.onlyoffice = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger OnlyOffice"));
    document.head.appendChild(s);
  });
}

export function ExcelOfficeEditor({
  taskId,
  attachmentId,
  fileName,
  onClose,
  onSaved,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const placeholderId = useRef(
    `oo-editor-${attachmentId.replace(/[^a-zA-Z0-9]/g, "")}`
  ).current;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/rh/tasks/${taskId}/attachments/${attachmentId}/office`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Config Office impossible");
        if (cancelled) return;

        await loadScript(data.scriptUrl as string);
        if (cancelled) return;
        if (!window.DocsAPI) {
          throw new Error("DocsAPI OnlyOffice indisponible");
        }

        const config = {
          ...(data.config as Record<string, unknown>),
          width: "100%",
          height: "100%",
          events: {
            onDocumentStateChange: (event: { data?: boolean }) => {
              // data === false → document saved / clean
              if (event?.data === false) onSaved?.();
            },
            onError: (event: { data?: string }) => {
              console.error("[onlyoffice]", event);
              setError(
                typeof event?.data === "string"
                  ? event.data
                  : "Erreur éditeur OnlyOffice"
              );
            },
          },
        };

        editorRef.current = new window.DocsAPI.DocEditor(
          placeholderId,
          config
        );
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        editorRef.current?.destroyEditor?.();
      } catch {
        /* ignore */
      }
      editorRef.current = null;
    };
  }, [taskId, attachmentId, placeholderId, onSaved]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: "var(--rh-bg-panel)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--rh-border)", background: "var(--rh-bg-panel)" }}
      >
        <div className="min-w-0">
          <div className="rh-micro" style={{ color: "var(--rh-accent)" }}>
            ONLYOFFICE
          </div>
          <div className="text-[14px] font-medium truncate">{fileName}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] hidden sm:inline"
            style={{ color: "var(--rh-text-muted)" }}
          >
            Enregistrement auto · Fichier mis à jour sur la tâche
          </span>
          <RhButton variant="secondary" onClick={onClose}>
            <X size={14} /> Fermer
          </RhButton>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {loading ? (
          <div
            className="absolute inset-0 grid place-items-center gap-2 text-[13px]"
            style={{ color: "var(--rh-text-muted)" }}
          >
            <Loader2 size={22} className="animate-spin" />
            Ouverture de l’éditeur…
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 grid place-items-center px-6">
            <div
              className="max-w-md rounded-2xl border p-5 text-center"
              style={{
                borderColor: "var(--rh-border)",
                background: "var(--rh-surface)",
              }}
            >
              <div className="text-[14px] font-medium mb-2">Éditeur indisponible</div>
              <p
                className="text-[12.5px] mb-4"
                style={{ color: "var(--rh-text-muted)" }}
              >
                {error}
              </p>
              <p
                className="text-[11px] mb-4"
                style={{ color: "var(--rh-text-dim)" }}
              >
                Vérifie ONLYOFFICE_URL + JWT, et que le Document Server tourne
                (Docker).
              </p>
              <RhButton onClick={onClose}>Fermer</RhButton>
            </div>
          </div>
        ) : (
          <div id={placeholderId} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
