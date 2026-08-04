"use client";

/**
 * Modal d'import Excel / collage de contacts d'agence.
 * Partagé entre /agency-outreach et /enrichissement (onglet Agences).
 *
 * Si un contact existe déjà ailleurs (autre agence / marque) mais pas sur la
 * fiche cible, on propose un rattachement batch avant de créer le reste.
 */

import { useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const OLD_LACE = "#F5EBE0";

export type AgencyImportPartnerOption = {
  id: string;
  name: string;
};

type ImportRow = {
  prenom: string;
  nom: string;
  poste: string;
  email: string;
  language?: "fr" | "en";
  linkedinUrl?: string;
};

type LinkCandidate = {
  email: string;
  prenom: string;
  nom: string | null;
  poste: string | null;
  linkedinUrl: string | null;
  language: "fr" | "en";
  sourceLabel: string;
  alreadyOnFiche: boolean;
  alreadyInCycle: boolean;
};

export type AgencyImportResult = {
  company: string;
  created: number;
  skipped: number;
  addedToCycle: number;
  queued: number;
  linked: number;
};

type Market = "FR" | "BENELUX";

function parseLanguageValue(raw: string): "fr" | "en" | undefined {
  const v = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!v) return undefined;
  if (v.startsWith("en") || v.startsWith("an") || v.startsWith("uk") || v.startsWith("us"))
    return "en";
  if (v.startsWith("fr")) return "fr";
  return undefined;
}

function excelCellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/[\t\r\n]+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.hyperlink === "string") {
      return o.hyperlink.startsWith("mailto:") ? o.hyperlink.slice(7) : o.hyperlink;
    }
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text || "").join("").trim();
    }
    if (o.text != null) return excelCellToText(o.text);
    if (o.result != null) return excelCellToText(o.result);
  }
  return "";
}

async function importFileToText(file: File): Promise<{
  text: string;
  sheetName: string | null;
  ignoredSheets: number;
}> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("Le fichier Excel ne contient aucune feuille.");
    const ignoredSheets = Math.max(0, workbook.worksheets.length - 1);
    const lines: string[] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as unknown[];
      const cells: string[] = [];
      for (let col = 1; col < Math.max(values.length, 2); col++) {
        cells.push(excelCellToText(values[col]));
      }
      lines.push(cells.join("\t"));
    });
    return {
      text: lines.join("\n"),
      sheetName: worksheet.name?.trim() || "Feuille 1",
      ignoredSheets,
    };
  }
  if (/\.(xls|numbers)$/i.test(file.name)) {
    throw new Error("Format non géré — enregistre en .xlsx ou .csv et réessaie.");
  }
  return { text: await file.text(), sheetName: null, ignoredSheets: 0 };
}

function parseImportText(text: string): {
  rows: ImportRow[];
  suggestedAgency: string;
  error: string | null;
} {
  const lines = text.split(/\r?\n/);
  const splitLine = (line: string): string[] =>
    line.includes("\t") ? line.split("\t") : line.split(";");
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map(norm);
    const prenomIdx = cells.findIndex(
      (c) => c === "prenom" || c === "firstname" || c === "first name"
    );
    const nomIdx = cells.findIndex(
      (c) => c === "nom" || c === "lastname" || c === "last name"
    );
    if (prenomIdx >= 0 && nomIdx >= 0) {
      headerIdx = i;
      cols = { prenom: prenomIdx, nom: nomIdx };
      cells.forEach((c, idx) => {
        if (c.includes("role") || c === "poste" || c === "titre" || c === "fonction")
          cols.poste = idx;
        else if (c.includes("mail")) cols.email = idx;
        else if (c === "langue" || c === "language" || c === "lang" || c.startsWith("langue"))
          cols.language = idx;
        else if (c.includes("linkedin")) cols.linkedinUrl = idx;
      });
      break;
    }
  }

  if (headerIdx === -1) {
    return {
      rows: [],
      suggestedAgency: "",
      error:
        "Impossible de trouver la ligne d'en-tête (colonnes « Prénom » et « Nom »). Garde les titres de colonnes.",
    };
  }

  let suggestedAgency = "";
  for (let i = 0; i < headerIdx; i++) {
    const first = splitLine(lines[i])[0]?.trim();
    if (first) {
      suggestedAgency = first.split(/—|–|-{2,}/)[0].trim();
      break;
    }
  }

  const cell = (cells: string[], key: string): string =>
    cols[key] !== undefined ? (cells[cols[key]] || "").trim() : "";

  const rows: ImportRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const prenom = cell(cells, "prenom");
    const nom = cell(cells, "nom");
    if (!prenom && !nom) continue;
    rows.push({
      prenom,
      nom,
      poste: cell(cells, "poste"),
      email: cell(cells, "email"),
      language: parseLanguageValue(cell(cells, "language")),
      linkedinUrl: cell(cells, "linkedinUrl"),
    });
  }

  return {
    rows,
    suggestedAgency,
    error: rows.length === 0 ? "Aucun contact trouvé sous la ligne d'en-tête." : null,
  };
}

export function ImportAgencyModal({
  partners,
  market,
  onClose,
  onImported,
  onError,
}: {
  partners: AgencyImportPartnerOption[];
  market: Market;
  onClose: () => void;
  onImported: (r: AgencyImportResult) => void;
  onError: (message: string) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetInfo, setSheetInfo] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [rowLangs, setRowLangs] = useState<Record<number, "fr" | "en">>({});
  const [saving, setSaving] = useState(false);

  // Étape 2 : proposition de rattachement / enrôlement batch.
  const [step, setStep] = useState<"form" | "review">("form");
  const [linkCandidates, setLinkCandidates] = useState<LinkCandidate[]>([]);
  const [enrollCandidates, setEnrollCandidates] = useState<LinkCandidate[]>([]);
  const [selectedLink, setSelectedLink] = useState<Set<string>>(new Set());
  const [selectedEnroll, setSelectedEnroll] = useState<Set<string>>(new Set());
  const [previewMeta, setPreviewMeta] = useState<{
    toCreate: number;
    alreadyOnFicheSkipped: number;
    company: string;
  } | null>(null);

  const handleText = (text: string, sourceFileName?: string) => {
    setRawText(text);
    setStep("form");
    setLinkCandidates([]);
    setEnrollCandidates([]);
    setPreviewMeta(null);
    if (!text.trim()) {
      setRows([]);
      setRowLangs({});
      setParseError(null);
      return;
    }
    const result = parseImportText(text);
    setRows(result.rows);
    const detected: Record<number, "fr" | "en"> = {};
    result.rows.forEach((r, i) => {
      if (r.language) detected[i] = r.language;
    });
    setRowLangs(detected);
    setParseError(result.error);
    const suggestion =
      result.suggestedAgency ||
      (sourceFileName
        ? sourceFileName.replace(/\.[^.]+$/, "").split(/—|–|_|-/)[0].trim()
        : "");
    if (suggestion && !partnerName.trim()) setPartnerName(suggestion);
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setFileLoading(true);
    setParseError(null);
    setSheetInfo(null);
    try {
      const { text, sheetName, ignoredSheets } = await importFileToText(file);
      setFileName(file.name);
      if (sheetName) {
        setSheetInfo(
          ignoredSheets > 0
            ? `1ʳᵉ feuille « ${sheetName} » uniquement — ${ignoredSheets} autre${ignoredSheets > 1 ? "s" : ""} ignorée${ignoredSheets > 1 ? "s" : ""} (pas d’AO)`
            : `Feuille « ${sheetName} »`
        );
      }
      handleText(text, file.name);
    } catch (e) {
      setFileName(null);
      setSheetInfo(null);
      setParseError(e instanceof Error ? e.message : "Impossible de lire ce fichier.");
    } finally {
      setFileLoading(false);
    }
  };

  const withEmail = rows.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()));
  const withoutEmail = rows.filter(
    (r) =>
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()) &&
      (r.prenom.trim() || r.nom.trim())
  );
  const canSubmit =
    partnerName.trim().length > 0 &&
    (withEmail.length > 0 || withoutEmail.length > 0) &&
    !saving;

  const rowsWithLang = () =>
    rows.map((r, i) => ({
      ...r,
      language: rowLangs[i] ?? r.language ?? language,
    }));

  const runPreview = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agency-outreach/import-carto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerName: partnerName.trim(),
          language,
          market,
          rows: rowsWithLang(),
          preview: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur d'analyse");

      const links = (data.linkCandidates || []) as LinkCandidate[];
      const enrolls = (data.enrollCandidates || []) as LinkCandidate[];
      setLinkCandidates(links);
      setEnrollCandidates(enrolls);
      setSelectedLink(new Set(links.map((c) => c.email)));
      setSelectedEnroll(new Set(enrolls.map((c) => c.email)));
      setPreviewMeta({
        toCreate: data.toCreate || 0,
        alreadyOnFicheSkipped: data.alreadyOnFicheSkipped || 0,
        company: data.company || partnerName.trim(),
      });

      if (links.length === 0 && enrolls.length === 0) {
        await runCommit([], []);
        return;
      }
      setStep("review");
      setSaving(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur d'analyse");
      setSaving(false);
    }
  };

  const runCommit = async (linkEmails: string[], enrollEmails: string[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/agency-outreach/import-carto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerName: partnerName.trim(),
          language,
          market,
          rows: rowsWithLang(),
          linkEmails,
          enrollEmails,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur d'import");
      onImported({
        company: data.company,
        created: data.created,
        skipped: data.skipped,
        addedToCycle: data.addedToCycle || 0,
        queued: data.queued || 0,
        linked: data.linked || 0,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erreur d'import");
      setSaving(false);
    }
  };

  const toggleAll = (kind: "link" | "enroll", on: boolean) => {
    if (kind === "link") {
      setSelectedLink(on ? new Set(linkCandidates.map((c) => c.email)) : new Set());
    } else {
      setSelectedEnroll(on ? new Set(enrollCandidates.map((c) => c.email)) : new Set());
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/45 overflow-y-auto">
      <div
        className="w-full max-w-2xl rounded-2xl shadow-xl border bg-white my-4"
        style={{ borderColor: "#E8DED0" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{
            borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
            backgroundColor: OLD_LACE,
          }}
        >
          <h2
            className="text-lg font-semibold flex items-center gap-2"
            style={{ fontFamily: "Spectral, serif", color: LICORICE }}
          >
            <FileSpreadsheet className="w-5 h-5" style={{ color: "#3D8B40" }} />
            {step === "review" ? "Contacts déjà connus" : "Importer des contacts d'agence"}
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: LICORICE, color: "white" }}
            >
              {market === "FR" ? "🇫🇷 France" : "🇧🇪 BENELUX"}
            </span>
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-black/5">
            <X className="w-5 h-5" style={{ color: LICORICE }} />
          </button>
        </div>

        {step === "form" ? (
          <>
            <div className="p-5 space-y-4">
              <p className="text-xs opacity-70" style={{ color: LICORICE }}>
                Glisse un fichier Excel (.xlsx) ou CSV avec au minimum <strong>Prénom</strong> /{" "}
                <strong>Nom</strong> (colonnes <strong>Email</strong>, <strong>Poste</strong>,{" "}
                <strong>URL LinkedIn</strong> et <strong>Langue</strong> — FR/EN — optionnelles).
                Avec email → « À contacter » ; sans email → file{" "}
                <a href="/enrichissement" className="underline font-semibold">
                  /enrichissement
                </a>{" "}
                (onglet Agences).
                <br />
                <strong>Contrairement aux marques</strong> : seule la <strong>1ʳᵉ feuille</strong> du
                classeur est importée — les suivantes (AO, etc.) sont ignorées.
              </p>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
                  Agence <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  list="agency-import-partners"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Nom de l'agence (existante ou nouvelle)"
                  className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                  style={{ borderColor: OLD_ROSE, color: LICORICE }}
                />
                <datalist id="agency-import-partners">
                  {partners.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: LICORICE }}>
                  Langue des contacts
                </label>
                <select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value === "en" ? "en" : "fr");
                    setRowLangs({});
                  }}
                  className="w-40 rounded-xl border px-3 py-2 text-sm bg-white"
                  style={{ borderColor: OLD_ROSE, color: LICORICE }}
                >
                  <option value="fr">Tous en français</option>
                  <option value="en">Tous en anglais</option>
                </select>
                <p className="text-xs opacity-60 mt-1" style={{ color: LICORICE }}>
                  Langue par défaut, détectée automatiquement depuis la colonne{" "}
                  <strong>Langue</strong> (FR/EN) du fichier si présente, et ajustable contact par
                  contact ci-dessous.
                </p>
              </div>

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
                <span className="text-sm font-semibold" style={{ color: LICORICE }}>
                  {fileName || "Glisse le fichier ici, ou clique pour le choisir"}
                </span>
                {sheetInfo ? (
                  <span className="text-xs font-medium" style={{ color: "#3D8B40" }}>
                    {sheetInfo}
                  </span>
                ) : (
                  <span className="text-xs opacity-60" style={{ color: LICORICE }}>
                    Excel (.xlsx) ou CSV — 1ʳᵉ feuille uniquement
                  </span>
                )}
              </label>

              <details>
                <summary
                  className="text-xs opacity-70 cursor-pointer select-none"
                  style={{ color: LICORICE }}
                >
                  …ou colle le tableau à la main
                </summary>
                <textarea
                  value={rawText}
                  onChange={(e) => {
                    setFileName(null);
                    setSheetInfo(null);
                    handleText(e.target.value);
                  }}
                  placeholder={"Prénom\tNom\tPoste\tEmail\tURL LinkedIn\tLangue"}
                  rows={5}
                  className="w-full mt-2 px-3 py-2 rounded-xl border text-xs font-mono"
                  style={{ borderColor: OLD_ROSE, color: LICORICE }}
                />
              </details>

              {parseError && <p className="text-xs text-red-600">{parseError}</p>}

              {rows.length > 0 && (
                <div
                  className="rounded-xl border p-3 text-sm"
                  style={{
                    borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)`,
                  }}
                >
                  <p style={{ color: LICORICE }}>
                    <strong>{rows.length}</strong> ligne(s) détectée(s) —{" "}
                    <strong>{withEmail.length}</strong> avec email (cycle),{" "}
                    <strong>{withoutEmail.length}</strong> sans email (enrichissement)
                    {rows.filter((r) => r.linkedinUrl?.trim()).length > 0
                      ? ` · ${rows.filter((r) => r.linkedinUrl?.trim()).length} LinkedIn`
                      : ""}
                    .
                  </p>
                  <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                    {rows.slice(0, 50).map((r, i) => {
                      const rowLang = rowLangs[i] ?? r.language ?? language;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs"
                          style={{ color: LICORICE }}
                        >
                          <span className="font-medium shrink-0">
                            {r.prenom} {r.nom}
                          </span>
                          <span className="opacity-60 truncate">{r.poste}</span>
                          <span className="ml-auto opacity-60 shrink-0">
                            {r.email || "(sans email)"}
                          </span>
                          {r.linkedinUrl?.trim() ? (
                            <span className="shrink-0 font-medium" style={{ color: "#0A66C2" }}>
                              in
                            </span>
                          ) : null}
                          <span
                            className="inline-flex rounded-md overflow-hidden border shrink-0"
                            style={{ borderColor: "#E5E0DA" }}
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-2 px-5 py-3 border-t"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-xl hover:bg-black/5"
                style={{ color: LICORICE }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void runPreview()}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50"
                style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Importer{" "}
                {withEmail.length + withoutEmail.length > 0
                  ? `(${withEmail.length + withoutEmail.length})`
                  : ""}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <p className="text-sm" style={{ color: LICORICE }}>
                Pour <strong>{previewMeta?.company}</strong> :{" "}
                <strong>{previewMeta?.toCreate ?? 0}</strong> nouveau(x) contact(s) à créer
                {previewMeta && previewMeta.alreadyOnFicheSkipped > 0
                  ? ` · ${previewMeta.alreadyOnFicheSkipped} déjà sur la fiche (ignorés)`
                  : ""}
                .
              </p>
              <p className="text-xs opacity-70" style={{ color: LICORICE }}>
                Coche ceux à rattacher à la fiche agence (ou à ajouter au cycle) — tout est
                proposé d&apos;un coup, plus besoin de le faire un par un.
              </p>

              {linkCandidates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                      Connus ailleurs — rattacher à la fiche
                    </p>
                    <button
                      type="button"
                      className="text-xs underline opacity-70"
                      style={{ color: LICORICE }}
                      onClick={() =>
                        toggleAll("link", selectedLink.size < linkCandidates.length)
                      }
                    >
                      {selectedLink.size < linkCandidates.length
                        ? "Tout cocher"
                        : "Tout décocher"}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border p-2" style={{ borderColor: "#E8DED0" }}>
                    {linkCandidates.map((c) => {
                      const checked = selectedLink.has(c.email);
                      return (
                        <label
                          key={c.email}
                          className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => {
                              setSelectedLink((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.email)) next.delete(c.email);
                                else next.add(c.email);
                                return next;
                              });
                            }}
                          />
                          <span className="min-w-0 text-xs" style={{ color: LICORICE }}>
                            <span className="font-medium">
                              {c.prenom} {c.nom || ""}
                            </span>{" "}
                            <span className="opacity-60">{c.email}</span>
                            <br />
                            <span className="opacity-60">
                              {c.sourceLabel}
                              {c.alreadyInCycle ? " · déjà en cycle" : " · + cycle si possible"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {enrollCandidates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: LICORICE }}>
                      Déjà sur la fiche — ajouter au cycle
                    </p>
                    <button
                      type="button"
                      className="text-xs underline opacity-70"
                      style={{ color: LICORICE }}
                      onClick={() =>
                        toggleAll("enroll", selectedEnroll.size < enrollCandidates.length)
                      }
                    >
                      {selectedEnroll.size < enrollCandidates.length
                        ? "Tout cocher"
                        : "Tout décocher"}
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border p-2" style={{ borderColor: "#E8DED0" }}>
                    {enrollCandidates.map((c) => {
                      const checked = selectedEnroll.has(c.email);
                      return (
                        <label
                          key={c.email}
                          className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => {
                              setSelectedEnroll((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.email)) next.delete(c.email);
                                else next.add(c.email);
                                return next;
                              });
                            }}
                          />
                          <span className="min-w-0 text-xs" style={{ color: LICORICE }}>
                            <span className="font-medium">
                              {c.prenom} {c.nom || ""}
                            </span>{" "}
                            <span className="opacity-60">{c.email}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-between gap-2 px-5 py-3 border-t"
              style={{ borderColor: `color-mix(in srgb, ${OLD_ROSE} 35%, transparent)` }}
            >
              <button
                type="button"
                onClick={() => setStep("form")}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-xl hover:bg-black/5"
                style={{ color: LICORICE }}
              >
                Retour
              </button>
              <button
                type="button"
                onClick={() =>
                  void runCommit(Array.from(selectedLink), Array.from(selectedEnroll))
                }
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50"
                style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmer
                {selectedLink.size + selectedEnroll.size + (previewMeta?.toCreate || 0) > 0
                  ? ` (${selectedLink.size + selectedEnroll.size + (previewMeta?.toCreate || 0)})`
                  : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
