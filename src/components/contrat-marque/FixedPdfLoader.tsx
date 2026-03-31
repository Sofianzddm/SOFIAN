"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";

type Progress = { loaded: number; total: number };

/**
 * Remplace le PdfLoader de react-pdf-highlighter-plus, qui peut ne jamais
 * re-rendre après chargement si `setLoadingProgress(null)` ne déclenche pas
 * d’update (état déjà null) — le canvas PDF ne s’affiche alors pas.
 */
export function FixedPdfLoader({
  document: docSrc,
  workerSrc,
  beforeLoad,
  onError,
  children,
}: {
  document: string | URL;
  workerSrc: string;
  beforeLoad?: (progress?: Progress) => ReactNode;
  onError?: (error: Error) => void;
  children: (pdfDocument: PDFDocumentProxy) => ReactNode;
}) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const onErrorRef = useRef(onError);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  onErrorRef.current = onError;

  useEffect(() => {
    GlobalWorkerOptions.workerSrc = workerSrc;
    setPdfDoc(null);
    setLoadError(null);
    setProgress(null);
    setLoading(true);

    const resolvedSrc =
      typeof docSrc === "string" && docSrc.startsWith("/")
        ? new URL(docSrc, window.location.origin).href
        : docSrc;

    const task = getDocument(resolvedSrc);
    let cancelled = false;

    task.onProgress = (p: Progress) => {
      if (!cancelled) setProgress(p.loaded > p.total ? null : p);
    };

    task.promise
      .then((pdf) => {
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        void pdfRef.current?.destroy();
        pdfRef.current = pdf;
        setPdfDoc(pdf);
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        if (cancelled) return;
        setLoadError(e);
        onErrorRef.current?.(e);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setProgress(null);
        }
      });

    return () => {
      cancelled = true;
      task.destroy();
      void pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [docSrc, workerSrc]);

  if (loadError) {
    return <div className="p-4 text-sm text-red-600">{loadError.message}</div>;
  }

  if (loading || !pdfDoc) {
    return <>{beforeLoad?.(progress ?? undefined) ?? <div className="p-4 text-gray-500">Chargement du PDF…</div>}</>;
  }

  return <>{children(pdfDoc)}</>;
}
