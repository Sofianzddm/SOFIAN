"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { cartoFileToSheets } from "@/components/outreach/ImportCartoModal";
import { parseCartoText, type CartoParsedRow } from "@/lib/parse-carto";
import { FW_VILLES, type FwVille } from "@/lib/fw-villes";

export type FwImportCartoResult = {
  company: string;
  clientId: string;
  created: number;
  skipped: number;
  withEmail: number;
  queued: number;
};

async function encodeFwFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function FwImportCartoModal({
  onClose,
  onImported,
  onError,
  lockedClient,
  clients,
  initialFile,
  defaultVille = "PARIS",
}: {
  onClose: () => void;
  onImported: (result: FwImportCartoResult) => void;
  onError: (message: string) => void;
  lockedClient?: { id: string; nom: string } | null;
  clients: Array<{ id: string; nom: string }>;
  initialFile?: File | null;
  defaultVille?: FwVille;
}) {
  const [parsed, setParsed] = useState<CartoParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState(lockedClient?.nom || "");
  const [selectedId, setSelectedId] = useState<string | null>(lockedClient?.id || null);
  const [ville, setVille] = useState<FwVille>(defaultVille);

  const applyText = (text: string, sourceFileName?: string) => {
    if (!text.trim()) {
      setParsed([]);
      setParseError(null);
      return;
    }
    const result = parseCartoText(text);
    setParsed(result.rows);
    setParseError(result.error);
    if (lockedClient) return;
    const suggestion =
      result.suggestedCompany ||
      (sourceFileName
        ? sourceFileName.replace(/\.[^.]+$/, "").split(/—|–|_|-/)[0].trim()
        : "");
    if (suggestion && !query.trim()) setQuery(suggestion);
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setFileLoading(true);
    setParseError(null);
    try {
      const sheets = await cartoFileToSheets(file);
      applyText(sheets.influence, file.name);
      setFileName(file.name);
      setFileObj(file);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Impossible de lire le fichier.");
      setParsed([]);
    } finally {
      setFileLoading(false);
    }
  };

  useEffect(() => {
    if (initialFile) void handleFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matched = selectedId
    ? clients.find((c) => c.id === selectedId)
    : clients.find((c) => c.nom.trim().toLowerCase() === query.trim().toLowerCase());

  const submit = async () => {
    if (parsed.length === 0 || saving) return;
    const nom = matched?.nom || query.trim();
    if (!lockedClient && !nom) {
      setParseError("Indique la maison Fashion Week.");
      return;
    }
    setSaving(true);
    try {
      const filePayload =
        fileObj && fileObj.size <= 10 * 1024 * 1024
          ? {
              name: fileObj.name,
              type: fileObj.type,
              base64: await encodeFwFile(fileObj),
            }
          : undefined;
      const res = await fetch("/api/strategy/fw/import-carto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: lockedClient?.id || matched?.id,
          nom: lockedClient ? undefined : nom,
          ville,
          rows: parsed,
          file: filePayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur d'import");
      onImported(data as FwImportCartoResult);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur d'import");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[min(92vh,820px)] overflow-y-auto rounded-2xl bg-white p-5 space-y-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {lockedClient
                ? `Importer une carto — ${lockedClient.nom}`
                : "Importer une cartographie Fashion Week"}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Excel ou tableau collé. Seule la première feuille est lue. Les mails
              présents sont notés ; les contacts sans mail partent dans Enrichissement
              → Fashion Week.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`block cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center ${
            dragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-gray-50"
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {fileLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" />
          ) : (
            <>
              <FileSpreadsheet className="mx-auto h-6 w-6 text-gray-400" />
              <p className="mt-2 text-sm font-medium text-gray-800">
                {fileName || "Glisse le fichier ou clique"}
              </p>
            </>
          )}
        </label>

        <textarea
          rows={4}
          placeholder="Ou colle le tableau (avec la ligne d’en-tête Nom / Rôle / Email…)"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          onChange={(e) => applyText(e.target.value)}
        />

        {!lockedClient ? (
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <div>
              <label className="text-xs font-medium text-gray-500">Maison</label>
              <input
                value={query}
                onChange={(e) => {
                  setSelectedId(null);
                  setQuery(e.target.value);
                }}
                list="fw-carto-clients"
                placeholder="Chanel, Dior…"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
              <datalist id="fw-carto-clients">
                {clients.map((c) => (
                  <option key={c.id} value={c.nom} />
                ))}
              </datalist>
              {matched ? (
                <p className="mt-1 text-[11px] text-emerald-700">Déjà dans la base FW</p>
              ) : query.trim() ? (
                <p className="mt-1 text-[11px] text-gray-500">Créera la maison si besoin</p>
              ) : null}
            </div>
            {!matched ? (
              <div>
                <label className="text-xs font-medium text-gray-500">Ville</label>
                <select
                  value={ville}
                  onChange={(e) => setVille(e.target.value as FwVille)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {FW_VILLES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        {parseError ? <p className="text-sm text-red-600">{parseError}</p> : null}

        {parsed.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">Nom</th>
                  <th className="px-2 py-1.5">Rôle</th>
                  <th className="px-2 py-1.5">Email</th>
                  <th className="px-2 py-1.5">LinkedIn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parsed.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 text-gray-800">
                      {[r.prenom, r.nom].filter(Boolean).join(" ")}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{r.poste || "—"}</td>
                    <td className="px-2 py-1.5">
                      {r.email ? (
                        r.email
                      ) : (
                        <span className="text-amber-700">à noter</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-gray-400">
                      {r.linkedinUrl ? "oui" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 30 ? (
              <p className="px-2 py-1.5 text-[11px] text-gray-400">
                + {parsed.length - 30} autres — {parsed.length} contacts au total
              </p>
            ) : (
              <p className="px-2 py-1.5 text-[11px] text-gray-400">
                {parsed.length} contact{parsed.length > 1 ? "s" : ""} détecté
                {parsed.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || parsed.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-glowup-rose px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Importer {parsed.length > 0 ? `${parsed.length} contact${parsed.length > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
