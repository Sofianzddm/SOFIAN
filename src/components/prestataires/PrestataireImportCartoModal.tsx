"use client";

/**
 * Import cartographie prestataires :
 * - Depuis la liste : bulk multi-hôtels (colonne Hôtel) → fusionne les fiches.
 * - Depuis une fiche : import contacts sur cette fiche seule.
 */

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { parseCartoText, type CartoParsedRow } from "@/lib/parse-carto";
import { cartoFileToSheets } from "@/components/outreach/ImportCartoModal";
import {
  PRESTATAIRE_CATEGORIE_LABEL,
  PRESTATAIRE_IMPORT_ENTITY_COLUMN,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";

const INK = "#16110F";

export type PrestataireCartoImportResult = {
  created: number;
  skipped: number;
  fileSaved: boolean;
  prestataireId: string;
  hotelsCreated?: number;
  hotelsMerged?: number;
};

function normHotel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function PrestataireImportCartoModal({
  prestataireId: lockedId,
  prestataireNom: lockedNom,
  categorie,
  onClose,
  onImported,
  onError,
  initialFile,
}: {
  prestataireId?: string;
  prestataireNom?: string;
  categorie?: PrestataireCategorie;
  onClose: () => void;
  onImported: (result: PrestataireCartoImportResult) => void;
  onError: (message: string) => void;
  initialFile?: File | null;
}) {
  const bulkMode = !lockedId && Boolean(categorie);

  const [parsed, setParsed] = useState<CartoParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);

  const hotelGroups = useMemo(() => {
    const map = new Map<
      string,
      { nom: string; ville: string; contacts: CartoParsedRow[] }
    >();
    for (const r of parsed) {
      const hotel = (r.hotel || "").trim();
      if (!hotel) continue;
      const key = normHotel(hotel);
      const cur = map.get(key);
      if (cur) {
        if (!cur.ville && r.ville) cur.ville = r.ville;
        cur.contacts.push(r);
      } else {
        map.set(key, {
          nom: hotel,
          ville: (r.ville || "").trim(),
          contacts: [r],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [parsed]);

  const rowsWithoutHotel = useMemo(
    () => (bulkMode ? parsed.filter((r) => !(r.hotel || "").trim()).length : 0),
    [parsed, bulkMode]
  );

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setFileLoading(true);
    setParseError(null);
    try {
      const sheets = await cartoFileToSheets(file);
      const influence = parseCartoText(sheets.influence);
      const aoRows = sheets.ao
        ? parseCartoText(sheets.ao).rows.map((r) => ({
            ...r,
            source: "AO" as const,
          }))
        : [];
      const rows = [...influence.rows, ...aoRows];
      setFileName(file.name);
      setFileObj(file);
      setParsed(rows);
      if (rows.length === 0) {
        setParseError(influence.error);
      } else if (bulkMode && rows.every((r) => !(r.hotel || "").trim())) {
        setParseError(
          `Ajoute une colonne « ${entityCol} » (ou Établissement) dans le CSV pour importer plusieurs fiches.`
        );
      } else {
        setParseError(null);
      }
    } catch (e) {
      setFileName(null);
      setFileObj(null);
      setParsed([]);
      setParseError(
        e instanceof Error ? e.message : "Impossible de lire ce fichier."
      );
    } finally {
      setFileLoading(false);
    }
  };

  useEffect(() => {
    if (initialFile) void handleFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const encodeFile = async (file: File): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  };

  const canSubmit = bulkMode
    ? hotelGroups.length > 0 && !saving
    : parsed.length > 0 && Boolean(lockedId) && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const filePayload =
        fileObj && fileObj.size <= 10 * 1024 * 1024
          ? {
              name: fileObj.name,
              type: fileObj.type,
              base64: await encodeFile(fileObj),
            }
          : undefined;

      if (bulkMode && categorie) {
        const res = await fetch("/api/prestataires/import-bulk", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categorie,
            rows: parsed
              .filter((r) => (r.hotel || "").trim())
              .map((r) => ({
                hotel: r.hotel,
                ville: r.ville,
                prenom: r.prenom,
                nom: r.nom,
                poste: r.poste,
                email: r.email,
                telephone: r.telephone,
                localisation: r.localisation,
                linkedinUrl: r.linkedinUrl,
                note: r.note,
                source: r.source,
              })),
            file: filePayload,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Import impossible."
          );
        }
        const firstId =
          Array.isArray(data.hotels) && data.hotels[0]?.id
            ? String(data.hotels[0].id)
            : "";
        onImported({
          created: Number(data.contactsCreated) || 0,
          skipped: Number(data.contactsSkipped) || 0,
          fileSaved: true,
          prestataireId: firstId,
          hotelsCreated: Number(data.hotelsCreated) || 0,
          hotelsMerged: Number(data.hotelsMerged) || 0,
        });
        onClose();
        return;
      }

      if (!lockedId) throw new Error("Fiche manquante.");

      const res = await fetch(`/api/prestataires/${lockedId}/import-carto`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: parsed.map((r) => ({
            prenom: r.prenom,
            nom: r.nom,
            poste: r.poste,
            email: r.email,
            localisation: r.localisation,
            linkedinUrl: r.linkedinUrl,
            note: r.note,
            source: r.source,
          })),
          file: filePayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Import impossible."
        );
      }
      onImported({
        created: Number(data.created) || 0,
        skipped: Number(data.skipped) || 0,
        fileSaved: Boolean(data.fileSaved),
        prestataireId: lockedId,
      });
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur import");
    } finally {
      setSaving(false);
    }
  };

  const catLabel = categorie
    ? PRESTATAIRE_CATEGORIE_LABEL[categorie]
    : lockedNom || "Fiche";
  const entityCol = categorie
    ? PRESTATAIRE_IMPORT_ENTITY_COLUMN[categorie]
    : "Établissement";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h2
              className="text-[16px] font-bold tracking-tight"
              style={{ color: INK }}
            >
              {bulkMode
                ? `Importer des ${catLabel.toLowerCase()}`
                : "Importer une cartographie"}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-gray-400">
              {bulkMode
                ? "CSV / Excel — 1 ligne = établissement + contact · même nom → 1 fiche fusionnée"
                : `${lockedNom} — CSV ou Excel (.xlsx)`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div
            className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              dragOver
                ? "border-gray-900 bg-gray-50"
                : "border-gray-200 bg-[#FAF9F7]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            {fileLoading ? (
              <div className="flex items-center justify-center gap-2 text-[13px] text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Lecture…
              </div>
            ) : (
              <>
                <FileSpreadsheet className="mx-auto h-7 w-7 text-gray-300" />
                <p
                  className="mt-2 text-[13px] font-semibold"
                  style={{ color: INK }}
                >
                  Glisse un CSV / Excel ici
                </p>
                <p className="mt-1 text-[12px] text-gray-400">
                  {bulkMode
                    ? `Colonnes : ${entityCol}, Ville, Prénom, Nom, Email, Rôle…`
                    : "Colonnes : Prénom, Nom, Email, Rôle / Poste, LinkedIn…"}
                </p>
                {bulkMode && categorie ? (
                  <a
                    href={`/api/prestataires/modele-import?categorie=${categorie}`}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Télécharger le modèle Excel {catLabel.toLowerCase()}
                  </a>
                ) : null}
                <label
                  className="mt-3 inline-flex cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                  style={{ backgroundColor: INK }}
                >
                  Choisir un fichier
                  <input
                    type="file"
                    accept=".csv,.tsv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                  />
                </label>
                {fileName ? (
                  <p className="mt-2 text-[12px] font-medium text-gray-600">
                    {fileName}
                  </p>
                ) : null}
              </>
            )}
          </div>

          {parseError ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700 ring-1 ring-red-100">
              {parseError}
            </div>
          ) : null}

          {bulkMode && hotelGroups.length > 0 ? (
            <div>
              <p className="mb-2 text-[12px] font-semibold text-gray-500">
                Aperçu · {hotelGroups.length} fiche
                {hotelGroups.length > 1 ? "s" : ""} ·{" "}
                {parsed.filter((r) => (r.hotel || "").trim()).length} ligne
                {parsed.length > 1 ? "s" : ""}
                {rowsWithoutHotel > 0
                  ? ` · ${rowsWithoutHotel} sans « ${entityCol.toLowerCase()} » ignorée${rowsWithoutHotel > 1 ? "s" : ""}`
                  : ""}
              </p>
              <div className="max-h-56 overflow-auto rounded-lg ring-1 ring-black/[0.06]">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-[#FAF9F7] text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{entityCol}</th>
                      <th className="px-3 py-2 font-semibold">Ville</th>
                      <th className="px-3 py-2 font-semibold">Contacts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotelGroups.map((g) => (
                      <tr
                        key={g.nom}
                        className="border-t border-black/[0.04]"
                        style={{ color: INK }}
                      >
                        <td className="px-3 py-1.5 font-medium">{g.nom}</td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {g.ville || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {g.contacts.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {!bulkMode && parsed.length > 0 ? (
            <div>
              <p className="mb-2 text-[12px] font-semibold text-gray-500">
                Aperçu · {parsed.length} contact
                {parsed.length > 1 ? "s" : ""}
              </p>
              <div className="max-h-48 overflow-auto rounded-lg ring-1 ring-black/[0.06]">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-[#FAF9F7] text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Nom</th>
                      <th className="px-3 py-2 font-semibold">Rôle</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 40).map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-black/[0.04]"
                        style={{ color: INK }}
                      >
                        <td className="px-3 py-1.5 font-medium">
                          {[r.prenom, r.nom].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {r.poste || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {r.email || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: INK }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {bulkMode
              ? `Importer ${hotelGroups.length > 0 ? `(${hotelGroups.length} fiches)` : ""}`
              : `Importer ${parsed.length > 0 ? `(${parsed.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
