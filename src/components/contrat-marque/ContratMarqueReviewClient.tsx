'use client';

import dynamic from "next/dynamic";
import type { ContratPdfReviewerProps } from "./ContratPdfReviewer";

const ContratPdfReviewer = dynamic(
  () => import("./ContratPdfReviewer"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          background: "#f5f5f5",
          height: "100%",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Chargement du PDF...
      </div>
    ),
  }
);

export default function ContratMarqueReviewClient(props: ContratPdfReviewerProps) {
  return <ContratPdfReviewer {...props} />;
}
