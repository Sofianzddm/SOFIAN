'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import "react-pdf-highlighter/dist/style.css";
import {
  AreaHighlight,
  Highlight,
  PdfHighlighter,
  Popup,
  type IHighlight,
  type LTWH,
  type LTWHP,
  type Scaled,
  type ScaledPosition,
  type ViewportHighlight,
} from "react-pdf-highlighter";
import type { T_ViewportHighlight } from "react-pdf-highlighter/dist/components/PdfHighlighter";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ContratMarqueVersionClient } from "@/lib/contratMarqueVersions";
import { FixedPdfLoader } from "@/components/contrat-marque/FixedPdfLoader";
import { PDFJS_DIST_WORKER_SRC } from "@/lib/pdfjsWorkerSrc";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

const COLORS = [
  { label: "Jaune", value: "#FFE28F" },
  { label: "Rouge", value: "#FFB3B3" },
  { label: "Vert", value: "#B3FFB3" },
  { label: "Bleu", value: "#B3D9FF" },
];

type AnnotationRow = {
  id: string;
  auteurId?: string;
  auteurNom: string;
  auteurRole: string;
  content: { text?: string; comment?: string };
  position: object;
  color: string;
  type: string;
  resolved: boolean;
  createdAt: string;
};

type CommentRow = {
  id: string;
  auteur: string;
  auteurRole: string;
  contenu: string;
  createdAt: string;
};

type CollabShape = {
  id: string;
  reference: string;
  montantNet: unknown;
  contratMarqueStatut?: string | null;
  contratMarquePdfUrl?: string | null;
  contratSubmissionId?: string | null;
  contratMarqueMode?: string | null;
  contratMarqueSigneAt?: string | Date | null;
  /** Renseigné quand le PDF officiellement signé a été déposé (upload « version finale signée »). */
  contratMarquePdfOfficielSigneDeposeAt?: string | Date | null;
  talent: { prenom: string; nom: string; managerId?: string | null };
  marque: { nom: string };
};

export interface ContratPdfReviewerProps {
  pdfUrl: string;
  collaborationId: string;
  collaboration: CollabShape;
  currentUser: { id: string; nom: string; role: string };
  canAnnotate: boolean;
  readOnly?: boolean;
  initialAnnotations: AnnotationRow[];
  initialCommentaires: CommentRow[];
  /** Vide si pas encore de versioning (rétrocompat). */
  versions?: ContratMarqueVersionClient[];
  showBackToCollab?: boolean;
  isJuristeContext?: boolean;
  onStatutChange?: () => void;
}

function formatDateTimeFr(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function positionPage(p: object): number {
  const pos = p as { pageNumber?: number; boundingRect?: { pageNumber?: number } };
  return pos?.pageNumber ?? pos?.boundingRect?.pageNumber ?? 1;
}

/** Assure rects non vide (JSON / vieux enregistrements) pour que le highlighter dessine les zones. */
function normalizeScaledPosition(raw: unknown): ScaledPosition {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object") {
    return {
      pageNumber: 1,
      boundingRect: { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 },
      rects: [],
    };
  }
  const pageNumber =
    typeof p.pageNumber === "number"
      ? p.pageNumber
      : typeof (p.boundingRect as Record<string, unknown> | undefined)?.pageNumber === "number"
        ? ((p.boundingRect as Record<string, unknown>).pageNumber as number)
        : 1;
  const br = p.boundingRect as ScaledPosition["boundingRect"];
  let rects = Array.isArray(p.rects) ? ([...p.rects] as ScaledPosition["rects"]) : [];
  if (rects.length === 0 && br && typeof br === "object") {
    rects = [br];
  }
  return {
    pageNumber,
    boundingRect: br,
    rects,
    usePdfCoordinates: typeof p.usePdfCoordinates === "boolean" ? p.usePdfCoordinates : undefined,
  };
}

function annotationToHighlight(a: AnnotationRow): IHighlight & { color?: string } {
  return {
    id: a.id,
    content: { text: a.content?.text ?? "" },
    position: normalizeScaledPosition(a.position),
    comment: { text: a.content?.comment ?? "", emoji: "" },
    color: a.color ?? "#FFE28F",
  };
}

type Meta = {
  comment: string;
  auteurNom: string;
  auteurRole: string;
  auteurId?: string;
  resolved: boolean;
  color: string;
};

function SelectionTip({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (color: string, comment: string) => void;
}) {
  const [color, setColor] = useState(COLORS[0].value);
  const [comment, setComment] = useState("");
  return (
    <div className="w-[260px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl text-left">
      <p className="text-xs font-medium text-gray-700 mb-2">Nouvelle annotation</p>
      <div className="flex gap-1.5 mb-2">
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            className={`h-7 w-7 rounded-full border-2 ${color === c.value ? "border-gray-900 scale-110" : "border-transparent"}`}
            style={{ backgroundColor: c.value }}
            onClick={() => setColor(c.value)}
          />
        ))}
      </div>
      <textarea
        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-800 min-h-[64px]"
        placeholder="Votre observation sur ce passage…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="text-xs text-gray-500 px-2 py-1" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="text-xs font-medium rounded-lg bg-[#1A1110] text-white px-3 py-1.5 disabled:opacity-50"
          disabled={!comment.trim()}
          onClick={() => onConfirm(color, comment.trim())}
        >
          Sauvegarder
        </button>
      </div>
    </div>
  );
}

/**
 * Attend qu’au moins une page PDF soit rendue dans le viewer avant d’autoriser les highlights
 * (sinon getPageView peut être undefined → crash dans scaledPositionToViewport).
 * Ensuite, force le rendu des surlignages (hideTipAndSelection → renderHighlightLayers).
 */
function PdfLoadedHighlightScrollKick({
  pdfDocument,
  highlighterRef,
  pdfPagesReady,
  setPdfPagesReady,
  children,
}: {
  pdfDocument: PDFDocumentProxy;
  highlighterRef: RefObject<PdfHighlighter<IHighlight> | null>;
  pdfPagesReady: boolean;
  setPdfPagesReady: (ready: boolean) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    setPdfPagesReady(false);
    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      if (document.querySelector(".PdfHighlighter .pdfViewer .page")) {
        setPdfPagesReady(true);
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    return () => {
      cancelled = true;
    };
  }, [pdfDocument, setPdfPagesReady]);

  useEffect(() => {
    if (!pdfPagesReady) return;
    const kick = () => {
      highlighterRef.current?.hideTipAndSelection();
      const inner = document.querySelector(".PdfHighlighter .pdfViewer");
      const el = (inner?.parentElement ?? document.querySelector(".PdfHighlighter")) as HTMLElement | null;
      el?.dispatchEvent(new Event("scroll", { bubbles: true }));
    };
    const delays = [100, 400, 900, 1800];
    const timers = delays.map((ms) => setTimeout(kick, ms));
    return () => timers.forEach(clearTimeout);
  }, [pdfDocument, highlighterRef, pdfPagesReady]);
  return <>{children}</>;
}

export default function ContratPdfReviewer({
  pdfUrl,
  collaborationId,
  collaboration,
  currentUser,
  canAnnotate,
  readOnly = false,
  initialAnnotations,
  initialCommentaires,
  showBackToCollab,
  isJuristeContext,
  onStatutChange,
  versions: versionsProp,
}: ContratPdfReviewerProps) {
  const versions = versionsProp ?? [];
  const [selectedVersion, setSelectedVersion] = useState<ContratMarqueVersionClient | null>(() =>
    versions.length > 0 ? versions[versions.length - 1]! : null
  );
  const [annotations, setAnnotations] = useState<AnnotationRow[]>(initialAnnotations);
  const [commentaires, setCommentaires] = useState<CommentRow[]>(initialCommentaires);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const highlighterRef = useRef<PdfHighlighter<IHighlight> | null>(null);
  const scrollToHighlightRef = useRef<((h: IHighlight) => void) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pdfPagesReady, setPdfPagesReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [signedDropActive, setSignedDropActive] = useState(false);

  useEffect(() => {
    console.log("ContratPdfReviewer monté côté client, pdfUrl:", pdfUrl);
  }, []);

  /** Sans versioning, les annotations viennent du parent ; avec des versions, le fetch par `versionId` fait foi. */
  useEffect(() => {
    if (versions.length === 0) {
      setAnnotations(initialAnnotations);
    }
  }, [initialAnnotations, versions.length]);

  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersion(null);
      return;
    }
    setSelectedVersion((prev) => {
      if (prev && versions.some((v) => v.id === prev.id)) return prev;
      return versions[versions.length - 1]!;
    });
  }, [versions]);

  useEffect(() => {
    if (!selectedVersion?.id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/collaborations/${collaborationId}/contrat-marque/annotations?versionId=${encodeURIComponent(selectedVersion.id)}`
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as AnnotationRow[];
      if (!cancelled) setAnnotations(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [collaborationId, selectedVersion?.id]);

  useEffect(() => {
    setCommentaires(initialCommentaires);
  }, [initialCommentaires]);

  const proxyUrl = useMemo(() => {
    const base = `/api/collaborations/${collaborationId}/contrat-marque/proxy-pdf`;
    if (selectedVersion?.id) return `${base}?versionId=${encodeURIComponent(selectedVersion.id)}`;
    return base;
  }, [collaborationId, selectedVersion?.id]);

  const latestVersionId = versions.length > 0 ? versions[versions.length - 1]?.id : null;
  const isArchivedVersion =
    Boolean(selectedVersion && latestVersionId && selectedVersion.id !== latestVersionId);
  const effectiveCanAnnotate = canAnnotate && !readOnly && !isArchivedVersion;
  /** Décisions juriste / admin uniquement sur la version courante (ou mode sans versioning). */
  const canActOnCurrentVersion = !isArchivedVersion;

  const canShowUploadButton =
    currentUser.role === "ADMIN" || currentUser.role === "HEAD_OF_INFLUENCE" || currentUser.role === "JURISTE";
  /** Barre avec sélecteur de versions et/ou upload (upload visible aussi sans lignes `ContratMarqueVersion`). */
  const showViewerToolbar = versions.length > 0 || canShowUploadButton;

  /** PDF sans `ContratMarqueVersion` = V1 implicite ; prochain upload affiché comme V2. */
  const nextUploadNumero = useMemo(() => {
    if (versions.length > 0) return versions[versions.length - 1]!.numero + 1;
    return 2;
  }, [versions]);

  /** Toujours lier une nouvelle annotation à la version affichée (ou la dernière), pour le POST. */
  const versionIdForNewAnnotation = useMemo(
    () => selectedVersion?.id ?? (versions.length > 0 ? versions[versions.length - 1]!.id : undefined),
    [selectedVersion?.id, versions]
  );

  useEffect(() => {
    console.log("pdfUrl source (Cloudinary):", pdfUrl);
    console.log("PdfLoader document (proxyUrl):", typeof proxyUrl, proxyUrl);
    console.log("workerSrc:", PDFJS_DIST_WORKER_SRC);
  }, [pdfUrl, proxyUrl]);

  const metaById = useMemo(() => {
    const m: Record<string, Meta> = {};
    for (const a of annotations) {
      m[a.id] = {
        comment: a.content?.comment ?? "",
        auteurNom: a.auteurNom,
        auteurRole: a.auteurRole,
        auteurId: a.auteurId,
        resolved: a.resolved,
        color: a.color,
      };
    }
    return m;
  }, [annotations]);

  const highlights: IHighlight[] = useMemo(
    () => annotations.map((a) => annotationToHighlight(a) as IHighlight),
    [annotations]
  );

  useEffect(() => {
    console.log("highlights:", JSON.stringify(highlights, null, 2));
  }, [highlights]);

  const highlightTransform = useCallback(
    (
      highlight: T_ViewportHighlight<IHighlight>,
      index: number,
      setTip: (
        h: T_ViewportHighlight<IHighlight>,
        cb: (h: T_ViewportHighlight<IHighlight>) => ReactElement
      ) => void,
      hideTip: () => void,
      _viewportToScaled: (rect: LTWHP) => Scaled,
      _screenshot: (position: LTWH) => string,
      isScrolledTo: boolean
    ) => {
      console.log(
        "highlightTransform appelé pour:",
        highlight.id,
        "page:",
        highlight.position?.pageNumber,
        "index:",
        index
      );
      const meta = metaById[highlight.id];
      const isTextHighlight = !highlight.content?.image;

      const component = isTextHighlight ? (
        <Highlight
          key={highlight.id}
          position={highlight.position}
          comment={{
            text: meta?.comment ?? highlight.comment?.text ?? "",
            emoji: "",
          }}
          isScrolledTo={isScrolledTo}
        />
      ) : (
        <AreaHighlight
          key={highlight.id}
          highlight={highlight as unknown as ViewportHighlight}
          isScrolledTo={isScrolledTo}
          onChange={() => {}}
        />
      );

      return (
        <Popup
          key={`${highlight.id}-${index}`}
          popupContent={
            <div
              style={{
                background: "white",
                border: "1px solid #eee",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "13px",
                maxWidth: "200px",
              }}
            >
              {meta?.comment ?? highlight.comment?.text ?? ""}
            </div>
          }
          onMouseOver={(popupContent) => setTip(highlight, () => popupContent)}
          onMouseOut={hideTip}
        >
          {component}
        </Popup>
      );
    },
    [metaById]
  );

  const annotationsByPage = useMemo(() => {
    const map = new Map<number, AnnotationRow[]>();
    for (const a of annotations) {
      const p = positionPage(a.position as object);
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(a);
    }
    const pages = [...map.keys()].sort((a, b) => a - b);
    return pages.map((page) => ({ page, items: map.get(page)! }));
  }, [annotations]);

  const resolvedCount = annotations.filter((a) => a.resolved).length;
  const statut = collaboration.contratMarqueStatut ?? "AUCUN";
  const isAdmin = currentUser.role === "ADMIN";
  const isJuriste = currentUser.role === "JURISTE";
  const isHeadOfInfluence = currentUser.role === "HEAD_OF_INFLUENCE";
  /** Même droits métier que l’API statut (juriste + admin + HoI). */
  const canUseReviewDecisions = isJuriste || isAdmin || isHeadOfInfluence;
  const showDecisionJuriste =
    canUseReviewDecisions &&
    (statut === "EN_ATTENTE_JURISTE" || statut === "A_MODIFIER") &&
    canActOnCurrentVersion;
  const canLaunchDocuseal = isAdmin || isHeadOfInfluence || isJuriste;
  const showDecisionAdminSign =
    canLaunchDocuseal && statut === "APPROUVE" && canActOnCurrentVersion;
  const showDecisionSigne = statut === "SIGNE" && Boolean(collaboration.contratMarqueSigneAt) && canActOnCurrentVersion;
  const officielSigneManquant =
    statut === "SIGNE" && !collaboration.contratMarquePdfOfficielSigneDeposeAt;

  const scrollToAnnotation = useCallback((a: AnnotationRow) => {
    const scrollTo = scrollToHighlightRef.current;
    if (!scrollTo) return;
    scrollTo(annotationToHighlight(a));
  }, []);

  const handleResolve = async (id: string, resolved: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/collaborations/${collaborationId}/contrat-marque/annotations/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved }),
        }
      );
      if (!res.ok) {
        alert("Mise à jour impossible.");
        return;
      }
      const updated = (await res.json()) as AnnotationRow;
      setAnnotations((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    if (!confirm("Supprimer cette annotation ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collaborations/${collaborationId}/contrat-marque/annotations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("Suppression impossible.");
        return;
      }
      setAnnotations((prev) => prev.filter((x) => x.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleStatut = useCallback(
    async (nextStatut: string, mode?: string) => {
      if (nextStatut === "A_MODIFIER") {
        if (annotations.filter((a) => !a.resolved).length === 0) {
          alert("Ajoutez au moins une annotation avant de demander des modifications.");
          return;
        }
      }
      const currentVersion = versions.length > 0 ? versions[versions.length - 1]! : null;
      setBusy(true);
      try {
        const res = await fetch(`/api/collaborations/${collaborationId}/contrat-marque/statut`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statut: nextStatut,
            mode,
            ...(currentVersion?.id ? { versionId: currentVersion.id } : {}),
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          alert((j as { error?: string }).error || "Erreur");
          return;
        }
        onStatutChange?.();
        window.location.reload();
      } finally {
        setBusy(false);
      }
    },
    [annotations, collaborationId, onStatutChange, versions]
  );

  const postComment = async () => {
    const contenu = commentText.trim();
    if (!contenu) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/collaborations/${collaborationId}/contrat-marque/commentaire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu }),
      });
      if (!res.ok) {
        alert("Envoi impossible.");
        return;
      }
      const c = (await res.json()) as CommentRow;
      setCommentaires((prev) => [...prev, c]);
      setCommentText("");
      router.refresh();
    } finally {
      setPosting(false);
    }
  };

  const uploadPdfFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        alert("Le fichier doit être un PDF.");
        return;
      }
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (statut === "SIGNE") {
          formData.append("signedFinal", "true");
        }
        const res = await fetch(`/api/collaborations/${collaborationId}/contrat-marque/upload`, {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok) {
          alert(data.error || "Erreur lors de l’upload");
          return;
        }
        if (data.success) {
          window.location.reload();
        }
      } catch (err) {
        console.error("Upload error:", err);
        alert("Erreur lors de l’upload");
      } finally {
        setIsUploading(false);
        if (uploadRef.current) uploadRef.current.value = "";
      }
    },
    [collaborationId, statut]
  );

  const handleUploadNewVersion = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadPdfFile(file);
      e.currentTarget.value = "";
    },
    [uploadPdfFile]
  );

  const handleExportPdf = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/collaborations/${collaborationId}/contrat-marque/export-pdf`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert((j as { error?: string }).error || "Export impossible");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contrat-avec-annotations.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const montant =
    typeof collaboration.montantNet === "object" && collaboration.montantNet !== null && "toString" in collaboration.montantNet
      ? String((collaboration.montantNet as { toString(): string }).toString())
      : String(collaboration.montantNet ?? "");

  if (!pdfUrl?.trim()) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden bg-[#fafafa] p-6 text-center text-sm text-gray-600">
        Aucun PDF uploadé sur cette collaboration.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fafafa]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {showBackToCollab ? (
            <Link
              href={`/collaborations/${collaborationId}`}
              className="text-sm font-medium text-gray-600 hover:text-[#1A1110]"
            >
              ← Fiche collaboration
            </Link>
          ) : null}
          <h1 className="text-sm font-semibold text-[#1A1110] truncate">
            {collaboration.talent.prenom} {collaboration.talent.nom} × {collaboration.marque.nom}
          </h1>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {statut}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pdfUrl?.trim() ? (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={busy}
              className="text-xs font-medium text-gray-600 hover:text-[#1A1110] disabled:opacity-50"
            >
              Télécharger le PDF (version actuelle) ↓
            </button>
          ) : null}
        </div>
      </header>

      {officielSigneManquant ? (
        <div
          className="shrink-0 border-b border-amber-400/80 bg-amber-50 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-semibold text-amber-950">PDF officiel signé — manquant</p>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-950/90">
            Le contrat est en statut <strong>signé</strong> dans le workflow, mais le{" "}
            <strong>PDF officiel</strong> (scan ou fichier signé par les parties) n’a{" "}
            <strong>pas encore été déposé</strong>. C’est une étape indispensable : déposez-le via la
            zone « glisser-déposer » ou le bouton d’upload sous les versions.
          </p>
        </div>
      ) : null}

      {statut === "SIGNE" && collaboration.contratMarquePdfOfficielSigneDeposeAt ? (
        <div className="shrink-0 border-b border-emerald-200 bg-emerald-50/90 px-4 py-2 text-xs text-emerald-900">
          <span className="font-semibold">PDF officiel signé déposé</span>
          {" — "}
          {new Date(collaboration.contratMarquePdfOfficielSigneDeposeAt as string | Date).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-0">
        <div className="relative flex h-full min-h-0 min-w-0 flex-[1_1_62%] flex-col p-3">
          {showViewerToolbar ? (
            <div className="mb-2 flex w-full min-w-0 shrink-0 flex-col gap-2">
            <div
              className="flex w-full min-w-0 flex-wrap items-center gap-1.5 px-1"
              style={{
                padding: "8px 12px",
                borderBottom: "0.5px solid var(--color-border-tertiary, #e8e4df)",
                background: "var(--color-background-secondary, #f3f4f6)",
                borderRadius: "8px",
              }}
            >
              {versions.length > 0 ? (
                <>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary, #6b7280)",
                  marginRight: "4px",
                }}
              >
                Version :
              </span>
              {versions.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVersion(v)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 500,
                    border: "0.5px solid",
                    borderColor:
                      selectedVersion?.id === v.id ? "#1A1110" : "var(--color-border-tertiary, #e8e4df)",
                    background: selectedVersion?.id === v.id ? "#1A1110" : "white",
                    color: selectedVersion?.id === v.id ? "white" : "var(--color-text-secondary, #6b7280)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  V{v.numero}
                  {v.statut === "APPROUVE" ? (
                    <span
                      style={{
                        color: selectedVersion?.id === v.id ? "#C8F285" : "#3B6D11",
                      }}
                    >
                      ✓
                    </span>
                  ) : null}
                  {v.statut === "A_MODIFIER" ? (
                    <span
                      style={{
                        color: selectedVersion?.id === v.id ? "#FFB3B3" : "#E24B4A",
                      }}
                    >
                      !
                    </span>
                  ) : null}
                  {i === versions.length - 1 ? (
                    <span
                      style={{
                        fontSize: "9px",
                        background: "#C8F285",
                        color: "#1A1110",
                        padding: "0 4px",
                        borderRadius: "4px",
                      }}
                    >
                      actuelle
                    </span>
                  ) : null}
                </button>
              ))}
              {selectedVersion && isArchivedVersion ? (
                <span
                  style={{
                    marginLeft: "8px",
                    fontSize: "11px",
                    background: "var(--color-background-warning, #fef3c7)",
                    color: "var(--color-text-warning, #92400e)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                }}
                >
                  Lecture seule — version archivée
                </span>
              ) : null}
                </>
              ) : null}
              {canShowUploadButton && (
                <>
                  <input
                    type="file"
                    accept=".pdf"
                    ref={uploadRef}
                    style={{ display: "none" }}
                    onChange={handleUploadNewVersion}
                  />
                  <button
                    type="button"
                    onClick={() => uploadRef.current?.click()}
                    disabled={isUploading}
                    style={{
                      marginLeft: "auto",
                      padding: "4px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      border: "0.5px solid var(--color-border-tertiary)",
                      background: "var(--color-background-primary)",
                      color: "var(--color-text-primary)",
                      cursor: isUploading ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      opacity: isUploading ? 0.6 : 1,
                    }}
                  >
                    {isUploading ? (
                      <>⏳ Upload en cours...</>
                    ) : (
                      <>↑ Uploader V{nextUploadNumero}</>
                    )}
                  </button>
                </>
              )}
            </div>
            {canShowUploadButton ? (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    uploadRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSignedDropActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSignedDropActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (e.currentTarget === e.target) setSignedDropActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSignedDropActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void uploadPdfFile(f);
                }}
                onClick={() => !isUploading && uploadRef.current?.click()}
                style={{
                  border: `2px dashed ${
                    signedDropActive
                      ? "#1A1110"
                      : officielSigneManquant
                        ? "#d97706"
                        : "var(--color-border-tertiary, #e8e4df)"
                  }`,
                  borderRadius: "10px",
                  padding: "14px 16px",
                  textAlign: "center",
                  fontSize: "12px",
                  fontWeight: 500,
                  lineHeight: 1.45,
                  background: signedDropActive
                    ? "rgba(26, 17, 16, 0.06)"
                    : officielSigneManquant
                      ? "rgba(217, 119, 6, 0.09)"
                      : "var(--color-background-primary, #fff)",
                  color: "var(--color-text-secondary, #4b5563)",
                  cursor: isUploading ? "not-allowed" : "pointer",
                  opacity: isUploading ? 0.65 : 1,
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {statut === "SIGNE" ? (
                  <>
                    <span style={{ color: "var(--color-text-primary, #1A1110)" }}>
                      Glissez-déposez ici le PDF définitif signé
                    </span>
                    <span style={{ display: "block", marginTop: "4px", fontSize: "11px", fontWeight: 400 }}>
                      (scan ou fichier signé électroniquement) — ou cliquez pour choisir un fichier
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ color: "var(--color-text-primary, #1A1110)" }}>
                      Glissez-déposez un PDF pour une nouvelle version
                    </span>
                    <span style={{ display: "block", marginTop: "4px", fontSize: "11px", fontWeight: 400 }}>
                      ou cliquez pour parcourir — V{nextUploadNumero}
                    </span>
                  </>
                )}
              </div>
            ) : null}
            </div>
          ) : null}
          <div
            ref={containerRef}
            className="min-h-0 flex-1 rounded-xl bg-gray-100"
            style={{
              position: "relative",
              overflow: "auto",
              minHeight: 400,
            }}
          >
            <FixedPdfLoader
              key={proxyUrl}
              document={proxyUrl}
              workerSrc={PDFJS_DIST_WORKER_SRC}
              beforeLoad={() => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "400px",
                  }}
                >
                  Chargement du PDF...
                </div>
              )}
              onError={(e) => console.error("PdfLoader error:", e)}
            >
              {(pdfDocument) => (
                <PdfLoadedHighlightScrollKick
                  pdfDocument={pdfDocument}
                  highlighterRef={highlighterRef}
                  pdfPagesReady={pdfPagesReady}
                  setPdfPagesReady={setPdfPagesReady}
                >
                  <div
                    className="PdfHighlighter"
                    style={{
                      height: "100%",
                      minHeight: 480,
                      position: "relative",
                    }}
                  >
                    <PdfHighlighter
                      ref={highlighterRef}
                      pdfDocument={pdfDocument}
                      highlights={pdfPagesReady ? highlights : []}
                      highlightTransform={highlightTransform}
                      scrollRef={(scrollTo) => {
                        scrollToHighlightRef.current = scrollTo;
                      }}
                      onScrollChange={() => {
                        highlighterRef.current?.hideTipAndSelection();
                      }}
                      pdfScaleValue="auto"
                      onSelectionFinished={(scaledPosition, content, hideTipAndSelection, _transformSelection) => {
                        if (!effectiveCanAnnotate) {
                          hideTipAndSelection();
                          return null;
                        }
                        return (
                          <SelectionTip
                            onCancel={hideTipAndSelection}
                            onConfirm={async (color, comment) => {
                              const id = nanoid();
                              const res = await fetch(
                                `/api/collaborations/${collaborationId}/contrat-marque/annotations`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    id,
                                    content: {
                                      text: content.text ?? "",
                                      comment,
                                    },
                                    position: scaledPosition,
                                    color,
                                    type: "text",
                                    ...(versionIdForNewAnnotation
                                      ? { versionId: versionIdForNewAnnotation }
                                      : {}),
                                  }),
                                }
                              );
                              if (!res.ok) {
                                alert("Impossible d’enregistrer l’annotation.");
                                return;
                              }
                              const row = (await res.json()) as AnnotationRow;
                              setAnnotations((prev) => [...prev, row]);
                              hideTipAndSelection();
                              onStatutChange?.();
                              router.refresh();
                            }}
                          />
                        );
                      }}
                      enableAreaSelection={(e: MouseEvent) =>
                        !effectiveCanAnnotate ? false : e.altKey
                      }
                    />
                  </div>
                </PdfLoadedHighlightScrollKick>
              )}
            </FixedPdfLoader>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-500">
            Astuce : maintenez Alt pour sélectionner une zone rectangulaire.
          </p>
        </div>

        <aside className="flex min-h-0 w-full min-w-[min(100%,320px)] flex-[1_1_38%] flex-col border-l border-gray-200 bg-white lg:max-w-[min(100%,520px)]">
          <div className="min-h-0 w-full flex-1 overflow-y-auto p-4 space-y-4 box-border">
            <section className="rounded-xl border border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-[#1A1110]"
                onClick={() => setInfoOpen(!infoOpen)}
              >
                Infos collaboration
                {infoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {infoOpen ? (
                <div className="space-y-1 px-3 pb-3 text-xs text-gray-700">
                  <p>
                    <span className="text-gray-500">Talent :</span> {collaboration.talent.prenom}{" "}
                    {collaboration.talent.nom}
                  </p>
                  <p>
                    <span className="text-gray-500">Marque :</span> {collaboration.marque.nom}
                  </p>
                  <p>
                    <span className="text-gray-500">Montant net :</span> {montant} €
                  </p>
                  <p>
                    <span className="text-gray-500">Réf. :</span> {collaboration.reference}
                  </p>
                </div>
              ) : null}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#1A1110]">Annotations</h2>
                <span className="text-[11px] text-gray-500">
                  {annotations.length} annotation(s) · {resolvedCount} résolue(s)
                </span>
              </div>
              <div className="space-y-3 max-h-[32vh] overflow-y-auto pr-1">
                {annotationsByPage.length === 0 ? (
                  <p className="text-xs text-gray-500">Aucune annotation.</p>
                ) : (
                  annotationsByPage.map(({ page, items }) => (
                    <div key={page}>
                      <p className="text-[11px] font-semibold text-gray-500 mb-1">Page {page}</p>
                      <div className="space-y-2">
                        {items.map((a) => {
                          const excerpt = (a.content?.text ?? "").slice(0, 120);
                          const excerptTruncated = (a.content?.text ?? "").length > 120;
                          const juristeComment = (a.content?.comment ?? "").trim();
                          return (
                            <div
                              key={a.id}
                              style={{
                                background: "var(--color-background-primary, #ffffff)",
                                border: "0.5px solid var(--color-border-tertiary, #e8e4df)",
                                borderRadius: "8px",
                                padding: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              <div
                                style={{
                                  borderLeft: `3px solid ${a.color ?? "#FFE28F"}`,
                                  paddingLeft: "8px",
                                  fontSize: "12px",
                                  color: "var(--color-text-secondary, #6b7280)",
                                  fontStyle: "italic",
                                  lineHeight: 1.5,
                                }}
                              >
                                « {excerpt}
                                {excerptTruncated ? "..." : ""} »
                              </div>
                              {juristeComment ? (
                                <div
                                  style={{
                                    fontSize: "13px",
                                    color: "var(--color-text-primary, #1A1110)",
                                    lineHeight: 1.5,
                                    fontWeight: 500,
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {juristeComment}
                                </div>
                              ) : null}
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--color-text-secondary, #6b7280)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    background: "var(--color-background-secondary, #f3f4f6)",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    fontWeight: 500,
                                  }}
                                >
                                  {a.auteurRole}
                                </span>
                                {a.auteurNom} ·{" "}
                                {new Date(a.createdAt).toLocaleString("fr-FR", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => scrollToAnnotation(a)}
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--color-text-info, #2563eb)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  Voir dans le doc
                                </button>
                                {!a.resolved && effectiveCanAnnotate ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleResolve(a.id, true)}
                                    style={{
                                      fontSize: "12px",
                                      color: "#3B6D11",
                                      background: "none",
                                      border: "none",
                                      cursor: busy ? "not-allowed" : "pointer",
                                      padding: 0,
                                    }}
                                  >
                                    Résoudre ✓
                                  </button>
                                ) : null}
                                {a.resolved ? (
                                  <span style={{ fontSize: "12px", color: "#3B6D11" }}>Résolu ✓</span>
                                ) : null}
                                {effectiveCanAnnotate &&
                                (isAdmin ||
                                  (["JURISTE", "HEAD_OF_INFLUENCE"].includes(currentUser.role) &&
                                    a.auteurId === currentUser.id)) ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleDeleteAnnotation(a.id)}
                                    style={{
                                      fontSize: "12px",
                                      color: "var(--color-text-danger, #dc2626)",
                                      background: "none",
                                      border: "none",
                                      cursor: busy ? "not-allowed" : "pointer",
                                      padding: 0,
                                    }}
                                  >
                                    Supprimer
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#1A1110]">
                <MessageSquare className="h-4 w-4" />
                Discussion
              </h2>
              <div className="max-h-40 space-y-2 overflow-y-auto mb-2">
                {commentaires.length === 0 ? (
                  <p className="text-xs text-gray-500">Aucun message.</p>
                ) : (
                  commentaires.map((c) => (
                    <div key={c.id} className="rounded-lg bg-gray-50 border border-gray-100 p-2 text-xs">
                      <p className="text-[10px] text-gray-500">
                        {c.auteurRole} · {c.auteur} · {formatDateTimeFr(c.createdAt)}
                      </p>
                      <p className="mt-1 text-gray-800 whitespace-pre-wrap">{c.contenu}</p>
                    </div>
                  ))
                )}
              </div>
              {!readOnly && !isArchivedVersion ? (
                <>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    placeholder="Message au fil général…"
                  />
                  <button
                    type="button"
                    onClick={postComment}
                    disabled={posting || !commentText.trim()}
                    className="mt-2 rounded-lg bg-[#1A1110] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {posting ? "Envoi…" : "Envoyer"}
                  </button>
                </>
              ) : null}
            </section>
          </div>

          {(showDecisionJuriste || showDecisionAdminSign || showDecisionSigne) && (
            <div className="shrink-0 w-full box-border border-t border-gray-200 bg-[#fafafa] px-4 py-4">
              {showDecisionJuriste ? (
                <div className="flex flex-col gap-2">
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--color-text-primary, #1A1110)",
                      marginBottom: "4px",
                    }}
                  >
                    Décision
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleStatut("APPROUVE")}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#1A1110",
                      color: "white",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: busy ? "not-allowed" : "pointer",
                      width: "100%",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    ✓ Approuver — prêt pour signature
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleStatut("A_MODIFIER")}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "0.5px solid var(--color-border-tertiary, #e8e4df)",
                      background: "var(--color-background-primary, #fff)",
                      color: "var(--color-text-primary, #1A1110)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: busy ? "not-allowed" : "pointer",
                      width: "100%",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    ⚠ Demander des modifications
                  </button>
                </div>
              ) : null}

              {showDecisionAdminSign ? (
                <div className="flex flex-col gap-2">
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--color-text-primary, #1A1110)",
                      marginBottom: "4px",
                    }}
                  >
                    Signature requise
                  </div>
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--color-background-success, #ecfdf5)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--color-text-success, #047857)",
                      marginBottom: "4px",
                    }}
                  >
                    ✓ Approuvé par le juriste — en attente de votre signature
                  </div>
                  {(isAdmin || isHeadOfInfluence) ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleStatut("SIGNE", "EXTERNE")}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: "none",
                        background: "#1A1110",
                        color: "white",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: busy ? "not-allowed" : "pointer",
                        width: "100%",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Marquer comme signé (externe) ✓
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleStatut("SIGNE", "DOCUSEAL")}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "0.5px solid var(--color-border-tertiary, #e8e4df)",
                      background: "var(--color-background-primary, #fff)",
                      color: "var(--color-text-primary, #1A1110)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: busy ? "not-allowed" : "pointer",
                      width: "100%",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    Envoyer en signature electronique (DocuSeal)
                  </button>
                </div>
              ) : null}

              {showDecisionSigne ? (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "var(--color-background-success, #ecfdf5)",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--color-text-success, #047857)",
                    textAlign: "center",
                  }}
                >
                  ✓ Contrat signé le{" "}
                  {new Date(collaboration.contratMarqueSigneAt as string | Date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              ) : null}
            </div>
          )}

          <div className="shrink-0 border-t border-gray-200 bg-gray-50/80 p-4">
            {isJuristeContext ? (
              <p className="text-[11px] text-gray-500 text-center">
                Espace juriste — relecture et validation du contrat marque.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
