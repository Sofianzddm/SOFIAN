"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { RhButton } from "@/components/rh/ui/primitives";
import { EMP_COLORS } from "@/components/rh/employee/parts";

export function TimesheetSignModal({
  open,
  weekLabel,
  defaultName,
  pdfHref,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  weekLabel: string;
  defaultName: string;
  pdfHref?: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    signatureName: string;
    signatureImageDataUrl: string | null;
  }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [name, setName] = useState(defaultName);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1A1110";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasStroke(false);
  }, [open]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasStroke(true);
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clearPad() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    setHasStroke(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.7)" }}
      role="dialog"
      aria-label="Signature électronique"
    >
      <div
        className="w-full max-w-[480px] rounded-[18px] overflow-hidden"
        style={{
          background: EMP_COLORS.surface,
          border: `1px solid ${EMP_COLORS.border}`,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${EMP_COLORS.borderSubtle}` }}
        >
          <div>
            <div
              className="text-[13px] font-semibold"
              style={{ color: EMP_COLORS.text }}
            >
              Signature électronique
            </div>
            <div className="text-[12px]" style={{ color: EMP_COLORS.muted }}>
              {weekLabel}
            </div>
          </div>
          <button
            type="button"
            className="border-0 bg-transparent cursor-pointer p-1"
            style={{ color: EMP_COLORS.dim }}
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {pdfHref ? (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[13px] no-underline rounded-[12px] px-3 py-2.5"
              style={{
                background: "rgba(229,242,181,.1)",
                color: EMP_COLORS.accent,
                border: `1px solid ${EMP_COLORS.border}`,
              }}
            >
              <FileText size={15} />
              Voir le PDF de la feuille
            </a>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px]" style={{ color: EMP_COLORS.muted }}>
              Nom complet (attestation)
            </span>
            <input
              className="rh-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              autoComplete="name"
            />
          </label>

          <div>
            <div
              className="flex items-center justify-between mb-1.5"
            >
              <span className="text-[12px]" style={{ color: EMP_COLORS.muted }}>
                Dessine ta signature
              </span>
              <button
                type="button"
                className="border-0 bg-transparent cursor-pointer text-[12px]"
                style={{ color: EMP_COLORS.dim }}
                onClick={clearPad}
              >
                Effacer
              </button>
            </div>
            <canvas
              ref={canvasRef}
              className="w-full rounded-[12px] touch-none"
              style={{
                height: 140,
                background: "#fff",
                border: `1px solid ${EMP_COLORS.borderControl}`,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          <p
            className="m-0 text-[11.5px] leading-[1.4]"
            style={{ color: EMP_COLORS.dim }}
          >
            En signant, tu attestes l’exactitude des temps déclarés pour cette
            semaine. La signature est apposée sur le PDF officiel.
          </p>

          <RhButton
            className="w-full"
            disabled={busy || name.trim().length < 2}
            onClick={() =>
              onConfirm({
                signatureName: name.trim(),
                signatureImageDataUrl: hasStroke
                  ? canvasRef.current?.toDataURL("image/png") || null
                  : null,
              })
            }
          >
            Signer et clôturer
          </RhButton>
        </div>
      </div>
    </div>
  );
}
