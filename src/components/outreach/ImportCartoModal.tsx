"use client";

/**
 * Modal d'import d'une cartographie de contacts (fichier Excel généré par
 * Claude, ou tableau collé). Partagé entre la page Outreach (où l'on choisit
 * la marque) et la fiche marque (où la marque est déjà connue → `lockedMarque`).
 *
 * Toute la logique serveur vit dans POST /api/outreach/import-carto, agnostique
 * du point d'entrée : il suffit de lui passer `marqueId` (ou `company`).
 */

import { useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, Plus, X } from "lucide-react";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";

type MarqueOption = {
  id: string;
  nom: string;
  secteur: string | null;
  ville: string | null;
};

export type CartoParsedRow = {
  priorite: string;
  prenom: string;
  nom: string;
  poste: string;
  perimetre: string;
  localisation: string;
  linkedinUrl: string;
  email: string;
  /** Feuille d'origine : 1 = influence (CARTO), 2 = achats/appel d'offre (AO). */
  source: "CARTO" | "AO";
};

/** Valeur de cellule ExcelJS → texte (gère liens, texte riche, formules). */
function excelCellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/[\t\r\n]+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.hyperlink === "string") {
      const link = o.hyperlink;
      // Les emails sont souvent des liens mailto: dans Excel
      return link.startsWith("mailto:") ? link.slice(7) : link;
    }
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((r) => r.text || "")
        .join("")
        .replace(/[\t\r\n]+/g, " ")
        .trim();
    }
    if (o.text != null) return excelCellToText(o.text);
    if (o.result != null) return excelCellToText(o.result);
  }
  return "";
}

function worksheetToTsv(worksheet: import("exceljs").Worksheet): string {
  const lines: string[] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[]; // index 1-based
    const cells: string[] = [];
    for (let col = 1; col < Math.max(values.length, 2); col++) {
      cells.push(excelCellToText(values[col]));
    }
    lines.push(cells.join("\t"));
  });
  return lines.join("\n");
}

/**
 * Lit un fichier de carto et renvoie le texte tabulé de ses feuilles.
 *
 * Convention multi-feuilles :
 * - Feuille 1 → influence (contacts carto)
 * - Feuille 2 → AO / Appel d'offre
 *
 * Les deux feuilles sont lues ici et affichées dans l'aperçu ; l'AO n'est plus
 * ré-extraite côté serveur (le client envoie déjà ses contacts).
 */
export async function cartoFileToSheets(
  file: File
): Promise<{ influence: string; ao: string | null }> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const s0 = workbook.worksheets[0];
    if (!s0) throw new Error("Le fichier Excel ne contient aucune feuille.");
    const s1 = workbook.worksheets[1];
    return {
      influence: worksheetToTsv(s0),
      ao: s1 ? worksheetToTsv(s1) : null,
    };
  }
  if (/\.(xls|numbers)$/i.test(file.name)) {
    throw new Error(
      "Format non géré — enregistre le fichier en .xlsx ou .csv et réessaie."
    );
  }
  return { influence: await file.text(), ao: null };
}

/**
 * Parse un tableau collé depuis Excel / Google Sheets (TSV) ou un CSV.
 * Détecte la ligne d'en-tête (Priorité, Prénom, Nom, Rôle, Périmètre,
 * Localisation, Statut, URL LinkedIn…) et propose le nom de la marque
 * depuis la ligne de titre (« Bonsoirs — Top Contacts Influence »).
 */
export function parseCartoText(text: string): {
  rows: CartoParsedRow[];
  suggestedCompany: string;
  error: string | null;
} {
  const lines = text.split(/\r?\n/);
  const splitLine = (line: string): string[] =>
    line.includes("\t") ? line.split("\t") : line.split(";");

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map(norm);
    const prenomIdx = cells.findIndex((c) => c === "prenom" || c === "firstname" || c === "first name");
    const nomIdx = cells.findIndex((c) => c === "nom" || c === "lastname" || c === "last name");
    if (prenomIdx >= 0 && nomIdx >= 0) {
      headerIdx = i;
      cols = { prenom: prenomIdx, nom: nomIdx };
      cells.forEach((c, idx) => {
        if (c.startsWith("prior")) cols.priorite = idx;
        else if (c.includes("role") || c === "poste" || c === "titre") cols.poste = idx;
        else if (c.startsWith("perim")) cols.perimetre = idx;
        else if (c.startsWith("local")) cols.localisation = idx;
        else if (c.includes("linkedin")) cols.linkedinUrl = idx;
        else if (c.includes("mail")) cols.email = idx;
      });
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      rows: [],
      suggestedCompany: "",
      error:
        "Impossible de trouver la ligne d'en-tête (colonnes « Prénom » et « Nom »). Colle le tableau avec ses titres de colonnes.",
    };
  }

  // Nom de marque suggéré depuis le titre au-dessus du tableau
  let suggestedCompany = "";
  for (let i = 0; i < headerIdx; i++) {
    const first = splitLine(lines[i])[0]?.trim();
    if (first) {
      suggestedCompany = first.split(/—|–|-{2,}/)[0].trim();
      break;
    }
  }

  const cell = (cells: string[], key: string): string =>
    cols[key] !== undefined ? (cells[cols[key]] || "").trim() : "";

  const rows: CartoParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const prenom = cell(cells, "prenom");
    const nom = cell(cells, "nom");
    if (!prenom && !nom) continue;
    rows.push({
      priorite: cell(cells, "priorite"),
      prenom,
      nom,
      poste: cell(cells, "poste"),
      perimetre: cell(cells, "perimetre"),
      localisation: cell(cells, "localisation"),
      linkedinUrl: cell(cells, "linkedinUrl"),
      email: cell(cells, "email"),
      source: "CARTO",
    });
  }

  return {
    rows,
    suggestedCompany,
    error: rows.length === 0 ? "Aucun contact trouvé sous la ligne d'en-tête." : null,
  };
}

type Market = "FR" | "BENELUX";
type RowMarket = Market | "BOTH";

export type ImportCartoResult = {
  company: string;
  created: number;
  skipped: number;
  addedToCycle: number;
  /** Compat : premier marché importé (FR en priorité). */
  marqueId: string;
  markets: Array<{ market: Market; id: string; company: string }>;
};

export function ImportCartoModal({
  onClose,
  onImported,
  onError,
  lockedMarque,
  initialFile,
  defaultMarket = "FR",
  showMarket = true,
}: {
  onClose: () => void;
  onImported: (result: ImportCartoResult) => void;
  onError: (message: string) => void;
  lockedMarque?: { id: string; nom: string };
  initialFile?: File | null;
  defaultMarket?: Market;
  /** Afficher FR / BENELUX / FR+BE (désactivé sur fiche marque). */
  showMarket?: boolean;
}) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<CartoParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** Une 2e feuille (AO) a été lue → le serveur ne doit pas la ré-extraire. */
  const [aoSheetPresent, setAoSheetPresent] = useState(false);

  const allowMarket = showMarket && !lockedMarque;
  // Marché GLOBAL appliqué à tous par défaut (FR / BENELUX / FR+BE). Le tag PAR
  // CONTACT (rowMarkets) prime : il permet de répartir chaque contact sur son
  // marché. « BOTH » (global ou par contact) → le contact part dans les 2 fiches.
  const [importMarket, setImportMarket] = useState<RowMarket>(
    lockedMarque ? "FR" : defaultMarket
  );

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MarqueOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMarque, setSelectedMarque] = useState<MarqueOption | null>(
    lockedMarque
      ? { id: lockedMarque.id, nom: lockedMarque.nom, secteur: null, ville: null }
      : null
  );
  const [createMode, setCreateMode] = useState(false);
  const [language, setLanguage] = useState<"fr" | "en" | null>(null);
  const [rowLangs, setRowLangs] = useState<Record<number, "fr" | "en">>({});
  // Marché par contact : override individuel, sinon le marché global appliqué à
  // tous (`importMarket`). « BOTH » = le contact part dans FR ET BENELUX.
  const [rowMarkets, setRowMarkets] = useState<Record<number, RowMarket>>({});
  const marketForRow = (i: number): RowMarket => rowMarkets[i] ?? importMarket;
  const [saving, setSaving] = useState(false);

  const searchApi =
    importMarket === "BENELUX" ? "/api/benelux-outreach/marques" : "/api/outreach/marques";

  useEffect(() => {
    if (lockedMarque || selectedMarque || createMode) return;
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${searchApi}?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (res.ok) setOptions(data.marques || []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selectedMarque, createMode, lockedMarque, searchApi]);

  const applyMarket = (m: RowMarket) => {
    // Le toggle global applique le marché à TOUS → on efface les overrides.
    setRowMarkets({});
    if (m === importMarket) return;
    setImportMarket(m);
    if (!lockedMarque) {
      setSelectedMarque(null);
      setCreateMode(false);
      setOptions([]);
    }
  };

  const handlePaste = (text: string, sourceFileName?: string) => {
    setRawText(text);
    setRowLangs({});
    setRowMarkets({});
    setAoSheetPresent(false);
    if (!text.trim()) {
      setParsed([]);
      setParseError(null);
      return;
    }
    const result = parseCartoText(text);
    setParsed(result.rows);
    setParseError(result.error);
    if (lockedMarque) return;
    const suggestion =
      result.suggestedCompany ||
      (sourceFileName
        ? sourceFileName
            .replace(/\.[^.]+$/, "")
            .split(/—|–|_|-/)[0]
            .trim()
        : "");
    if (suggestion && !selectedMarque && !query.trim()) {
      setQuery(suggestion);
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setFileLoading(true);
    setParseError(null);
    setRawText("");
    setRowLangs({});
    setRowMarkets({});
    try {
      const sheets = await cartoFileToSheets(file);
      const influence = parseCartoText(sheets.influence);
      const aoRows = sheets.ao
        ? parseCartoText(sheets.ao).rows.map((r) => ({ ...r, source: "AO" as const }))
        : [];
      const rows = [...influence.rows, ...aoRows];
      setFileName(file.name);
      setFileObj(file);
      setAoSheetPresent(sheets.ao !== null);
      setParsed(rows);
      setParseError(rows.length === 0 ? influence.error : null);
      if (!lockedMarque) {
        const suggestion =
          influence.suggestedCompany ||
          file.name
            .replace(/\.[^.]+$/, "")
            .split(/—|–|-/)[0]
            .trim();
        if (suggestion && !selectedMarque && !query.trim()) {
          setQuery(suggestion);
        }
      }
    } catch (e) {
      setFileName(null);
      setFileObj(null);
      setAoSheetPresent(false);
      setParseError(e instanceof Error ? e.message : "Impossible de lire ce fichier.");
    } finally {
      setFileLoading(false);
    }
  };

  useEffect(() => {
    if (initialFile) {
      void handleFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyChosen =
    Boolean(selectedMarque) || (createMode && query.trim()) || Boolean(lockedMarque);
  const canSubmit =
    Boolean(companyChosen) && parsed.length > 0 && language !== null && !saving;

  const encodeFile = async (file: File): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  };

  const submit = async () => {
    if (!canSubmit || !language) return;
    setSaving(true);
    try {
      const filePayload =
        fileObj && fileObj.size <= 10 * 1024 * 1024
          ? { name: fileObj.name, type: fileObj.type, base64: await encodeFile(fileObj) }
          : undefined;

      const companyName = selectedMarque?.nom ?? query.trim();

      // Répartition PAR CONTACT selon son marché (toggle par ligne, défaut =
      // marché global). « BOTH » → le contact est envoyé dans FR ET BENELUX.
      type EnrichedRow = CartoParsedRow & { language: "fr" | "en" };
      const groups: Record<Market, EnrichedRow[]> = { FR: [], BENELUX: [] };
      parsed.forEach((row, i) => {
        const mkt = allowMarket ? marketForRow(i) : "FR";
        const enriched: EnrichedRow = { ...row, language: rowLangs[i] ?? language };
        if (mkt === "FR" || mkt === "BOTH") groups.FR.push(enriched);
        if (mkt === "BENELUX" || mkt === "BOTH") groups.BENELUX.push(enriched);
      });

      let totalCreated = 0;
      let totalSkipped = 0;
      let totalCycle = 0;
      const markets: ImportCartoResult["markets"] = [];

      for (const m of ["FR", "BENELUX"] as const) {
        const rows = groups[m];
        if (rows.length === 0) continue;
        const api =
          m === "BENELUX"
            ? "/api/benelux-outreach/import-carto"
            : "/api/outreach/import-carto";
        const useId =
          Boolean(selectedMarque?.id) &&
          ((m === "FR" &&
            (importMarket === "FR" || importMarket === "BOTH" || Boolean(lockedMarque))) ||
            (m === "BENELUX" && importMarket === "BENELUX"));

        const res = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marqueId: useId ? selectedMarque?.id : undefined,
            company: useId ? undefined : companyName,
            rows,
            language,
            file: m === "FR" ? filePayload : undefined,
            // Le client a déjà lu la feuille AO → le serveur ne la ré-extrait pas.
            aoRowsIncluded: aoSheetPresent,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur d'import");
        totalCreated += data.created || 0;
        totalSkipped += data.skipped || 0;
        totalCycle += data.addedToCycle || 0;
        const id = (data.marqueId || data.companyId) as string | undefined;
        if (id) {
          markets.push({ market: m, id, company: data.company || companyName });
        }
      }

      onImported({
        company: companyName,
        created: totalCreated,
        skipped: totalSkipped,
        addedToCycle: totalCycle,
        marqueId: markets[0]?.id || "",
        markets,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur d'import");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-2xl z-10" style={{ borderColor: "#F0EBE4" }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: LICORICE }}>
            <FileSpreadsheet className="w-4 h-4" style={{ color: "#3D8B40" }} />
            {lockedMarque
              ? `Importer une cartographie — ${lockedMarque.nom}`
              : "Importer une cartographie de contacts"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            Importe directement le fichier Excel généré par Claude (ou colle le tableau).
            Les contacts sont rattachés à la fiche marque — visible par toute
            l&apos;équipe — et apparaissent dans « À contacter » : il ne reste qu&apos;à
            noter l&apos;email de chacun pour lancer le cycle.
          </p>

          {/* ---------- 1. Le fichier ---------- */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
              1. Le fichier
            </label>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition"
              style={{
                borderColor: dragOver ? "#3D8B40" : fileName ? TEA_GREEN : "#E5E0DA",
                backgroundColor: dragOver ? "#F2FAF2" : fileName ? "#F8FCEF" : "#FBF8F4",
              }}
            >
              <input
                type="file"
                accept=".xlsx,.csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {fileLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#3D8B40" }} />
              ) : (
                <FileSpreadsheet className="w-6 h-6" style={{ color: "#3D8B40" }} />
              )}
              {fileName ? (
                <>
                  <span className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {fileName}
                  </span>
                  <span className="text-xs text-gray-500">
                    Clique ou glisse un autre fichier pour remplacer
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold" style={{ color: LICORICE }}>
                    Glisse le fichier ici, ou clique pour le choisir
                  </span>
                  <span className="text-xs text-gray-500">Excel (.xlsx) ou CSV</span>
                </>
              )}
            </label>

            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer select-none">
                …ou colle le tableau à la main
              </summary>
              <textarea
                value={rawText}
                onChange={(e) => {
                  setFileName(null);
                  setFileObj(null);
                  handlePaste(e.target.value);
                }}
                placeholder={"Colle ici le tableau…\nPriorité\tPrénom\tNom\tRôle\tPérimètre\tLocalisation\tStatut\tURL LinkedIn"}
                rows={5}
                className="w-full mt-2 px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2"
                style={{ borderColor: "#E5E0DA" }}
              />
            </details>

            {parseError && (rawText.trim() || fileName) && (
              <p className="text-xs text-red-600 mt-1">{parseError}</p>
            )}
            {parsed.length > 0 && (
              <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: "#E5E0DA" }}>
                <div className="px-3 py-2 text-xs font-semibold border-b" style={{ backgroundColor: "#FBF8F4", borderColor: "#F0EBE4", color: LICORICE }}>
                  {parsed.length} contact{parsed.length > 1 ? "s" : ""} détecté{parsed.length > 1 ? "s" : ""}
                  {(() => {
                    const inf = parsed.filter((r) => r.source !== "AO").length;
                    const ao = parsed.length - inf;
                    return ao > 0 ? ` · ${inf} influence + ${ao} AO` : "";
                  })()}
                </div>
                <div className="max-h-44 overflow-y-auto divide-y" style={{ borderColor: "#F5F1EB" }}>
                  {parsed.map((row, i) => {
                    const rowLang = rowLangs[i] ?? language;
                    return (
                    <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                      {row.priorite && (
                        <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-gray-100 text-gray-600 shrink-0">
                          {row.priorite}
                        </span>
                      )}
                      <span className="font-medium shrink-0" style={{ color: LICORICE }}>
                        {row.prenom} {row.nom}
                      </span>
                      {row.source === "AO" && (
                        <span
                          className="px-1.5 py-0.5 rounded font-bold text-[10px] shrink-0"
                          style={{ backgroundColor: "#FBE5D6", color: "#9A5B1E" }}
                          title="Contact issu de la 2e feuille (Achats / Appel d'offre)"
                        >
                          AO
                        </span>
                      )}
                      <span className="text-gray-500 truncate">{row.poste}</span>
                      <span className="ml-auto shrink-0 flex items-center gap-2">
                        {row.email ? (
                          <span className="font-medium" style={{ color: "#3D8B40" }} title="Email présent → entre directement dans « À contacter »">
                            {row.email}
                          </span>
                        ) : (
                          <span className="text-gray-400" title="Sans email : restera en attente, à compléter dans /outreach">
                            email à noter
                          </span>
                        )}
                        {row.linkedinUrl && (
                          <span style={{ color: "#2563A8" }}>LinkedIn ✓</span>
                        )}
                        <span
                          className="inline-flex rounded-md overflow-hidden border shrink-0"
                          style={{ borderColor: "#E5E0DA" }}
                          title="Langue de ce contact"
                        >
                          {(["fr", "en"] as const).map((lang) => {
                            const active = rowLang === lang;
                            return (
                              <button
                                key={lang}
                                type="button"
                                onClick={() =>
                                  setRowLangs((prev) => ({ ...prev, [i]: lang }))
                                }
                                className="px-1.5 py-0.5 text-[10px] font-bold uppercase transition"
                                style={
                                  active
                                    ? { backgroundColor: LICORICE, color: "white" }
                                    : { backgroundColor: "white", color: "#9CA3AF" }
                                }
                              >
                                {lang === "fr" ? "🇫🇷" : "🇬🇧"} {lang}
                              </button>
                            );
                          })}
                        </span>
                        {allowMarket && (
                          <span
                            className="inline-flex rounded-md overflow-hidden border shrink-0"
                            style={{ borderColor: "#E5E0DA" }}
                            title="Marché de ce contact : FR, BENELUX, ou les deux"
                          >
                            {(["FR", "BENELUX", "BOTH"] as const).map((m) => {
                              const active = marketForRow(i) === m;
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() =>
                                    setRowMarkets((prev) => ({ ...prev, [i]: m }))
                                  }
                                  className="px-1.5 py-0.5 text-[10px] font-bold uppercase transition"
                                  style={
                                    active
                                      ? { backgroundColor: LICORICE, color: "white" }
                                      : { backgroundColor: "white", color: "#9CA3AF" }
                                  }
                                >
                                  {m === "FR" ? "🇫🇷 FR" : m === "BENELUX" ? "🇧🇪 BE" : "FR+BE"}
                                </button>
                              );
                            })}
                          </span>
                        )}
                      </span>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ---------- 2. Marché ---------- */}
          {allowMarket && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
                2. Marché · tous <span className="text-red-500">*</span>
              </label>
              <div className="inline-flex rounded-lg overflow-hidden border" style={{ borderColor: "#E5E0DA" }}>
                {(["FR", "BENELUX", "BOTH"] as const).map((m) => {
                  const active = importMarket === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => applyMarket(m)}
                      className="px-3 py-2 text-xs font-semibold transition"
                      style={
                        active
                          ? { backgroundColor: LICORICE, color: "white" }
                          : { backgroundColor: "white", color: "#9CA3AF" }
                      }
                    >
                      {m === "FR" ? "🇫🇷 France" : m === "BENELUX" ? "🇧🇪 BENELUX" : "FR + BENELUX"}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Marché appliqué à tous par défaut — ajustable contact par contact
                (boutons FR / BE / FR+BE dans la liste ci-dessus) pour répartir chacun
                sur son marché. « FR+BE » envoie le contact dans les deux fiches.
              </p>
            </div>
          )}

          {/* ---------- 3. La marque ---------- */}
          {!lockedMarque && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
              {allowMarket ? "3" : "2"}. {importMarket === "BENELUX" ? "L'entreprise" : "La marque"}
            </label>
            {selectedMarque ? (
              <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: TEA_GREEN, backgroundColor: "#F8FCEF" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {selectedMarque.nom}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[selectedMarque.secteur, selectedMarque.ville].filter(Boolean).join(" · ") || "Fiche CRM existante"}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedMarque(null);
                    setCreateMode(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Changer
                </button>
              </div>
            ) : createMode ? (
              <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "#E5E0DA", backgroundColor: "#FBF8F4" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: LICORICE }}>
                    {query.trim() || "—"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Nouvelle marque — sera créée dans le CRM</div>
                </div>
                <button onClick={() => setCreateMode(false)} className="text-xs text-gray-500 hover:text-gray-800 underline">
                  Changer
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cherche la marque dans le CRM…"
                  className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: "#E5E0DA" }}
                />
                {searching && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-2.5 text-gray-400" />
                )}
                {query.trim().length >= 2 && !searching && (
                  <div className="mt-1.5 rounded-xl border divide-y overflow-hidden" style={{ borderColor: "#E5E0DA" }}>
                    {options.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMarque(m)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium" style={{ color: LICORICE }}>
                          {m.nom}
                        </span>
                        <span className="text-xs text-gray-400">
                          {[m.secteur, m.ville].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => setCreateMode(true)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                      style={{ color: OLD_ROSE }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Créer « {query.trim()} »
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* ---------- Langue ---------- */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: OLD_ROSE }}>
              {lockedMarque ? "2" : allowMarket ? "4" : "3"}. Langue des contacts{" "}
              <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1.5">
              {(["fr", "en"] as const).map((lang) => {
                const active = language === lang;
                return (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang);
                      // « Appliquer à tous » : on efface les choix individuels.
                      setRowLangs({});
                    }}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition"
                    style={
                      active
                        ? { borderColor: LICORICE, backgroundColor: LICORICE, color: "white" }
                        : { borderColor: "#E5E0DA", backgroundColor: "white", color: LICORICE }
                    }
                  >
                    {lang === "fr" ? "Tous en français" : "Tous en anglais"}
                  </button>
                );
              })}
            </div>
            {language === null ? (
              <p className="text-xs mt-1" style={{ color: OLD_ROSE }}>
                Choix obligatoire : applique une langue à tous, puis ajuste contact par
                contact dans la liste ci-dessus si certains parlent l&apos;autre langue.
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Langue appliquée à tous par défaut — modifiable individuellement (boutons
                🇫🇷/🇬🇧 sur chaque contact). Mails et relances auto adaptés.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white rounded-b-2xl" style={{ borderColor: "#F0EBE4" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: LICORICE }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Importer {parsed.length > 0 ? `${parsed.length} contact${parsed.length > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
