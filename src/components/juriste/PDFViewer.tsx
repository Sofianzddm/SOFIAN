"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PDFViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 16px",
          background: "white",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
        }}
      >
        <button onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}>
          ←
        </button>
        <span style={{ fontSize: "13px" }}>
          Page {pageNumber} / {numPages || 1}
        </span>
        <button
          onClick={() => setPageNumber((p) => Math.min(numPages || 1, p + 1))}
          disabled={pageNumber >= (numPages || 1)}
        >
          →
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" download style={{ marginLeft: "12px", fontSize: "13px" }}>
          Télécharger ↓
        </a>
      </div>

      <Document file={url} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
        <Page pageNumber={pageNumber} width={600} renderTextLayer renderAnnotationLayer />
      </Document>
    </div>
  );
}
