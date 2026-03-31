import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PDFPage, PDFFont } from "pdf-lib";
import { canReadContratMarqueReview } from "@/lib/contratMarqueAccess";
import { buildContratMarqueVersionsForClient } from "@/lib/contratMarqueVersions";
import { annotationsForClient, type AnnotationRow } from "@/lib/serializeContratMarqueReview";

type RawRect = {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  pageNumber?: number;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16) / 255;
    const g = parseInt(h[1]! + h[1]!, 16) / 255;
    const b = parseInt(h[2]! + h[2]!, 16) / 255;
    return { r, g, b };
  }
  if (h.length === 6) {
    const n = parseInt(h, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  return { r: 1, g: 0.89, b: 0.56 };
}

function rectToBox(r: RawRect): { x1: number; y1: number; x2: number; y2: number } | null {
  if (
    typeof r.x1 === "number" &&
    typeof r.y1 === "number" &&
    typeof r.x2 === "number" &&
    typeof r.y2 === "number"
  ) {
    return { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };
  }
  if (
    typeof r.left === "number" &&
    typeof r.top === "number" &&
    typeof r.width === "number" &&
    typeof r.height === "number"
  ) {
    return {
      x1: r.left,
      y1: r.top,
      x2: r.left + r.width,
      y2: r.top + r.height,
    };
  }
  return null;
}

/** Meme logique que normalizeScaledPosition cote viewer (react-pdf-highlighter). */
function parseAnnotationPosition(raw: unknown): {
  pageNumber: number;
  rects: RawRect[];
  vw: number;
  vh: number;
  usePdfCoordinates: boolean;
} {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object") {
    return { pageNumber: 1, rects: [], vw: 0, vh: 0, usePdfCoordinates: false };
  }
  const pageNumber =
    typeof p.pageNumber === "number"
      ? p.pageNumber
      : typeof (p.boundingRect as Record<string, unknown> | undefined)?.pageNumber === "number"
        ? ((p.boundingRect as Record<string, unknown>).pageNumber as number)
        : 1;
  const usePdfCoordinates = typeof p.usePdfCoordinates === "boolean" ? p.usePdfCoordinates : false;
  const br = p.boundingRect as RawRect | undefined;
  let rects: RawRect[] = Array.isArray(p.rects) ? ([...p.rects] as RawRect[]) : [];
  if (rects.length === 0 && br && typeof br === "object") {
    rects = [br];
  }
  // react-pdf-highlighter met width/height (dimensions page viewport) sur boundingRect/rects, pas à la racine.
  const sample = rects[0] ?? br;
  const vw =
    typeof p.width === "number"
      ? (p.width as number)
      : sample && typeof sample.width === "number"
        ? sample.width
        : 0;
  const vh =
    typeof p.height === "number"
      ? (p.height as number)
      : sample && typeof sample.height === "number"
        ? sample.height
        : 0;
  return { pageNumber, rects, vw, vh, usePdfCoordinates };
}

function drawHighlightRect(
  page: PDFPage,
  box: { x1: number; y1: number; x2: number; y2: number },
  mode: "viewport" | "pdf",
  vw: number,
  vh: number,
  fill: { r: number; g: number; b: number },
  contentW?: number,
  contentH?: number
) {
  const pw = contentW ?? page.getWidth();
  const ph = contentH ?? page.getHeight();
  if (mode === "pdf") {
    const x = Math.min(box.x1, box.x2);
    const w = Math.abs(box.x2 - box.x1);
    const y = Math.min(box.y1, box.y2);
    const h = Math.abs(box.y2 - box.y1);
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(fill.r, fill.g, fill.b),
      opacity: 0.38,
      borderWidth: 0,
    });
    return;
  }
  if (vw <= 0 || vh <= 0) return;
  const left = Math.min(box.x1, box.x2);
  const right = Math.max(box.x1, box.x2);
  const top = Math.min(box.y1, box.y2);
  const bottom = Math.max(box.y1, box.y2);
  const pdfX = (left / vw) * pw;
  const pdfW = ((right - left) / vw) * pw;
  const pdfY = ph - (bottom / vh) * ph;
  const pdfH = ((bottom - top) / vh) * ph;
  page.drawRectangle({
    x: pdfX,
    y: pdfY,
    width: pdfW,
    height: pdfH,
    color: rgb(fill.r, fill.g, fill.b),
    opacity: 0.38,
    borderWidth: 0,
  });
}

/** Dimensions zone document (sans marge commentaires), par index de page. */
type ContentAreaByPage = { width: number; height: number }[];

/** Dessine les surlignages sur les pages du PDF ; retourne le nombre de rectangles tracees. */
function drawHighlightsOnPdf(
  pdfDoc: PDFDocument,
  rows: AnnotationRow[],
  contentAreaByPage?: ContentAreaByPage
): number {
  const pages = pdfDoc.getPages();
  let drawn = 0;
  for (const a of rows) {
    const pos = parseAnnotationPosition(a.position);
    const fill = hexToRgb(a.color || "#FFE28F");
    const mode = pos.usePdfCoordinates ? "pdf" : "viewport";
    const defaultPageIdx = Math.max(0, pos.pageNumber - 1);

    for (const raw of pos.rects) {
      const box = rectToBox(raw);
      if (!box) continue;
      const rectPage =
        typeof raw.pageNumber === "number" ? Math.max(0, raw.pageNumber - 1) : defaultPageIdx;
      if (rectPage >= pages.length) continue;
      const targetPage = pages[rectPage]!;
      const cw = contentAreaByPage?.[rectPage]?.width;
      const ch = contentAreaByPage?.[rectPage]?.height;
      const vw = typeof raw.width === "number" ? raw.width : pos.vw;
      const vh = typeof raw.height === "number" ? raw.height : pos.vh;
      try {
        drawHighlightRect(targetPage, box, mode, vw, vh, fill, cw, ch);
        drawn++;
      } catch {
        /* ignore */
      }
    }
  }
  return drawn;
}

/** Centre vertical (coordonnees PDF, origine bas-gauche) du surlignage pour aligner un commentaire. */
function highlightAnchorPdfY(
  box: { x1: number; y1: number; x2: number; y2: number },
  mode: "viewport" | "pdf",
  vw: number,
  vh: number,
  contentW: number,
  contentH: number
): number {
  if (mode === "pdf") {
    const y = Math.min(box.y1, box.y2);
    const h = Math.abs(box.y2 - box.y1);
    return y + h / 2;
  }
  if (vw <= 0 || vh <= 0) return contentH / 2;
  const top = Math.min(box.y1, box.y2);
  const bottom = Math.max(box.y1, box.y2);
  const pdfY = contentH - (bottom / vh) * contentH;
  const pdfH = ((bottom - top) / vh) * contentH;
  return pdfY + pdfH / 2;
}

const GUTTER_PT = 236;
const GUTTER_PAD = 12;
const ACCENT_W = 3.5;
const COMMENT_BOX_GAP = 10;

function wrapTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const clean = sanitizePdfText(text).trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, fontSize) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        current = word;
      } else {
        let buf = "";
        for (const ch of word) {
          const t = buf + ch;
          if (font.widthOfTextAtSize(t, fontSize) > maxWidth) {
            if (buf) lines.push(buf);
            buf = ch;
          } else {
            buf = t;
          }
        }
        current = buf;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Wordmark Glow Up (viewBox 1314×230), mêmes paths que `components/ui/logo.tsx` — rendu en noir. */
const GLOWUP_LOGO_VIEWBOX_W = 1314;
const GLOWUP_LOGO_VIEWBOX_H = 230;
const GLOWUP_LOGO_PATHS = [
  "M211.638 134.51L212.167 188.968C160.631 212.839 104.647 183.284 102 110.903C99.1152 35.534 183.5 2.91218 245.81 90.2298L246.604 89.9918L237.657 45.7118C168.783 9.62689 68.3574 36.7236 68.3574 123.301C68.3574 214.848 190.356 241.469 248.192 167.581V107.387H198.456C203.988 114.842 211.664 125.31 211.664 134.51H211.638Z",
  "M309.47 197.401V32.9962H272.915V207.129H410.134L410.478 173.529C390.414 189.47 350.709 197.401 320.746 197.401H309.443H309.47Z",
  "M572.049 50.9197C531.312 18.8266 472.417 25.039 439.277 63.3709C406.931 102.443 412.728 158.408 453.2 190.501C493.937 220.849 553.626 215.139 587.004 176.569C618.821 137.999 611.992 81.5324 572.022 50.9461L572.049 50.9197ZM558.126 158.381C526.309 195.444 492.693 211.121 459.023 184.5C434.301 164.858 434.301 122.085 465.852 85.4977C496.875 48.6726 538.909 36.0099 566.781 56.4183C599.127 80.2899 588.883 121.821 558.126 158.408V158.381Z",
  "M1063.03 34.0007V125.046C1063.03 217.598 945.006 230.525 945.006 126.288V32.9962H907.684V128.773C907.684 237.002 1071.74 238.746 1071.74 126.05V32.9962H1063.06V34.0007H1063.03Z",
  "M1169.71 32.9962H1094.24V207.129H1130.8V136.73L1169.71 136.492C1213.62 136.255 1244.64 115.106 1244.64 83.4886C1244.64 54.1448 1213.62 32.9962 1169.71 32.9962ZM1152.87 127.504H1130.8V39.7373H1152.87C1189.16 39.7373 1205.71 52.1357 1205.71 80.5014C1205.71 112.357 1189.14 127.504 1152.87 127.504Z",
  "M870.362 13.1693L850.51 32.9962L857.18 39.658C868.456 51.5013 864.062 64.8514 855.751 81.2416L813.161 166.074L755.854 57.8723L743.228 34.4766L742.434 32.9962H702.2L702.465 33.4985L714.297 54.885L740.846 105.378L710.353 165.836L650.955 57.37L637.799 34.2387L637.005 32.9962H597.036L597.83 34.2387L611.224 58.1102L697.197 210.116H697.727L746.616 113.837L799.714 210.116H800.244L890.161 33.472L890.426 32.9697H890.188L870.336 13.1429L870.362 13.1693Z",
];

function drawGlowupWordmarkBlack(
  page: PDFPage,
  xRight: number,
  contentH: number,
  padTop: number,
  heightPt: number
) {
  const scale = heightPt / GLOWUP_LOGO_VIEWBOX_H;
  const logoW = GLOWUP_LOGO_VIEWBOX_W * scale;
  const xLeft = xRight - logoW;
  const yBottom = contentH - padTop - heightPt;
  const black = rgb(0, 0, 0);
  for (const d of GLOWUP_LOGO_PATHS) {
    page.drawSvgPath(d, {
      x: xLeft,
      y: yBottom,
      scale,
      color: black,
    });
  }
}

function estimateCommentBlockHeight(
  lines: string[],
  authorSize: number,
  kindSize: number,
  lineHeight: number,
  hasHeader: boolean
): number {
  let h = GUTTER_PAD * 2;
  if (hasHeader) h += authorSize + 3 + kindSize + 8;
  h += Math.max(1, lines.length) * lineHeight;
  return h;
}

/** Commentaires dans la marge droite (style document / fil), avec anti-chevauchement vertical. */
function drawGutterCommentsForPage(
  page: PDFPage,
  contentW: number,
  contentH: number,
  pageIndex: number,
  rows: AnnotationRow[],
  font: PDFFont,
  fontBold: PDFFont
) {
  const gutterX0 = contentW;
  const gutterLeft = contentW + 14;
  const innerLeft = gutterLeft + ACCENT_W + 9;
  const maxTextW = GUTTER_PT - 28 - ACCENT_W;
  const fontSize = 9;
  const authorSize = 9;
  const kindSize = 7;
  const lineHeight = fontSize + 2;
  const idxSize = 7;

  type Item = {
    anchorY: number;
    lines: string[];
    author: string;
    kindLabel: string;
    fill: { r: number; g: number; b: number };
    n: number;
  };

  const items: Item[] = [];
  for (const a of rows) {
    if (a.resolved) continue;
    const pos = parseAnnotationPosition(a.position);
    const mode = pos.usePdfCoordinates ? "pdf" : "viewport";
    const defaultPageIdx = Math.max(0, pos.pageNumber - 1);
    let sumAy = 0;
    let countAy = 0;

    for (const raw of pos.rects) {
      const rectPage =
        typeof raw.pageNumber === "number" ? Math.max(0, raw.pageNumber - 1) : defaultPageIdx;
      if (rectPage !== pageIndex) continue;
      const box = rectToBox(raw);
      if (!box) continue;
      const vw = typeof raw.width === "number" ? raw.width : pos.vw;
      const vh = typeof raw.height === "number" ? raw.height : pos.vh;
      sumAy += highlightAnchorPdfY(box, mode, vw, vh, contentW, contentH);
      countAy += 1;
    }
    const bestAnchor = countAy ? sumAy / countAy : null;
    if (bestAnchor === null) continue;

    const com = commentLabel(a.content).trim();
    const cite = contentLabel(a.content).trim();
    if (!com && !cite) continue;

    const text = com || cite;
    const lines = wrapTextToWidth(text, font, fontSize, maxTextW);
    const kindLabel = com ? "Commentaire" : "Extrait surligné";
    const fill = hexToRgb(a.color || "#FFE28F");
    items.push({
      anchorY: bestAnchor,
      lines,
      author: sanitizePdfText(a.auteurNom),
      kindLabel,
      fill,
      n: 0,
    });
  }

  if (items.length === 0) return;

  items.sort((a, b) => b.anchorY - a.anchorY);
  items.forEach((it, i) => {
    it.n = i + 1;
  });

  page.drawRectangle({
    x: gutterX0,
    y: 0,
    width: GUTTER_PT,
    height: contentH,
    color: rgb(0.965, 0.967, 0.972),
    opacity: 1,
    borderWidth: 0,
  });
  page.drawLine({
    start: { x: gutterX0, y: 0 },
    end: { x: gutterX0, y: contentH },
    thickness: 0.35,
    color: rgb(0.86, 0.87, 0.9),
  });

  const marginY = 40;
  const topContentMax = contentH - 46;
  const placed: { bottom: number; top: number }[] = [];

  for (const it of items) {
    const H = estimateCommentBlockHeight(it.lines, authorSize, kindSize, lineHeight, true);
    let bottom = it.anchorY - H / 2;
    let top = it.anchorY + H / 2;

    let guard = 0;
    while (guard++ < 50) {
      let clash = false;
      for (const p of placed) {
        if (!(top < p.bottom || bottom > p.top)) {
          clash = true;
          top = p.bottom - COMMENT_BOX_GAP;
          bottom = top - H;
          break;
        }
      }
      if (!clash) break;
    }
    if (bottom < marginY) {
      const d = marginY - bottom;
      bottom += d;
      top += d;
    }
    if (top > contentH - marginY) {
      const d = top - (contentH - marginY);
      bottom -= d;
      top -= d;
    }
    if (top > topContentMax) {
      const d = top - topContentMax;
      bottom -= d;
      top -= d;
    }
    placed.push({ bottom, top });
  }

  const cardW = GUTTER_PT - 22;
  const placedSorted = items.map((it, i) => ({ it, box: placed[i]! }));
  for (const { it, box } of placedSorted) {
    const { bottom, top } = box;
    const midY = (top + bottom) / 2;
    const fillRgb = rgb(it.fill.r, it.fill.g, it.fill.b);

    page.drawRectangle({
      x: gutterLeft,
      y: bottom,
      width: cardW,
      height: top - bottom,
      color: rgb(1, 1, 1),
      opacity: 1,
      borderColor: rgb(0.88, 0.89, 0.92),
      borderWidth: 0.45,
    });
    page.drawRectangle({
      x: gutterLeft,
      y: bottom,
      width: ACCENT_W,
      height: top - bottom,
      color: fillRgb,
      opacity: 0.92,
      borderWidth: 0,
    });

    const idxStr = `#${it.n}`;
    const idxW = font.widthOfTextAtSize(idxStr, idxSize);
    page.drawText(idxStr, {
      x: gutterLeft + cardW - GUTTER_PAD - idxW,
      y: top - GUTTER_PAD - idxSize,
      font,
      size: idxSize,
      color: rgb(0.62, 0.64, 0.68),
    });

    const horizEnd = contentW + 20;
    page.drawLine({
      start: { x: contentW, y: it.anchorY },
      end: { x: horizEnd, y: it.anchorY },
      thickness: 0.55,
      color: fillRgb,
      opacity: 0.45,
    });
    page.drawLine({
      start: { x: horizEnd, y: it.anchorY },
      end: { x: gutterLeft - 0.5, y: midY },
      thickness: 0.35,
      color: rgb(0.72, 0.74, 0.78),
    });
    page.drawCircle({
      x: contentW - 0.5,
      y: it.anchorY,
      size: 2.5,
      color: fillRgb,
      opacity: 0.95,
      borderColor: rgb(1, 1, 1),
      borderWidth: 0.4,
    });

    let ty = top - GUTTER_PAD - authorSize;
    page.drawText(it.author, {
      x: innerLeft,
      y: ty,
      font: fontBold,
      size: authorSize,
      color: rgb(0.16, 0.17, 0.2),
      maxWidth: maxTextW - 22,
    });
    ty -= 3 + kindSize;
    page.drawText(it.kindLabel, {
      x: innerLeft,
      y: ty,
      font,
      size: kindSize,
      color: rgb(0.48, 0.5, 0.55),
    });
    ty -= 8;
    for (const line of it.lines) {
      page.drawText(line, {
        x: innerLeft,
        y: ty,
        font,
        size: fontSize,
        color: rgb(0.22, 0.23, 0.28),
        maxWidth: maxTextW,
      });
      ty -= lineHeight;
    }
  }

  const headerY = contentH - 20;
  page.drawRectangle({
    x: gutterX0,
    y: contentH - 30,
    width: GUTTER_PT,
    height: 30,
    color: rgb(0.965, 0.967, 0.972),
    opacity: 1,
    borderWidth: 0,
  });
  page.drawLine({
    start: { x: gutterX0, y: contentH - 30 },
    end: { x: gutterX0 + GUTTER_PT, y: contentH - 30 },
    thickness: 0.25,
    color: rgb(0.9, 0.91, 0.93),
  });
  page.drawText("Commentaires", {
    x: innerLeft,
    y: headerY,
    font: fontBold,
    size: 8.5,
    color: rgb(0.32, 0.34, 0.4),
  });
  const logoPad = 8;
  const logoH = 11;
  drawGlowupWordmarkBlack(page, gutterX0 + GUTTER_PT - logoPad, contentH, logoPad, logoH);
}

async function buildPdfWithGutter(
  originalBytes: ArrayBuffer,
  rows: AnnotationRow[]
): Promise<{ pdfDoc: PDFDocument; drawn: number; contentAreaByPage: ContentAreaByPage }> {
  const srcDoc = await PDFDocument.load(originalBytes);
  const pageCount = srcDoc.getPageCount();
  const indices = Array.from({ length: pageCount }, (_, i) => i);
  const outDoc = await PDFDocument.create();
  const embeddedPages = await outDoc.embedPdf(srcDoc, indices);
  const contentAreaByPage: ContentAreaByPage = [];

  for (let i = 0; i < embeddedPages.length; i++) {
    const embedded = embeddedPages[i]!;
    const pw = embedded.width;
    const ph = embedded.height;
    contentAreaByPage.push({ width: pw, height: ph });
    const newPage = outDoc.addPage([pw + GUTTER_PT, ph]);
    newPage.drawPage(embedded, { x: 0, y: 0, width: pw, height: ph });
  }

  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const drawn = drawHighlightsOnPdf(outDoc, rows, contentAreaByPage);

  const pages = outDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const ca = contentAreaByPage[i]!;
    drawGutterCommentsForPage(pages[i]!, ca.width, ca.height, i, rows, font, fontBold);
  }

  return { pdfDoc: outDoc, drawn, contentAreaByPage };
}

function sanitizePdfText(s: string): string {
  return s
    .replace(/\u2192/g, "->")
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, "-")
    .replace(/\u00D7/g, " x ")
    .replace(/\u00AB/g, '"')
    .replace(/\u00BB/g, '"')
    .replace(/\u2026/g, "...");
}

function wrapLines(text: string, maxLen: number): string[] {
  if (!text.trim()) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (tryLine.length > maxLen) {
      if (line) {
        lines.push(line);
        line = word;
      } else {
        lines.push(word.slice(0, maxLen));
        line = word.length > maxLen ? word.slice(maxLen) : "";
      }
      while (line.length > maxLen) {
        lines.push(line.slice(0, maxLen));
        line = line.slice(maxLen);
      }
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type ContentJson = { text?: string; comment?: string };

function contentLabel(c: unknown): string {
  if (c && typeof c === "object" && "text" in c && typeof (c as ContentJson).text === "string") {
    return (c as ContentJson).text ?? "";
  }
  return "";
}

function commentLabel(c: unknown): string {
  if (c && typeof c === "object" && "comment" in c && typeof (c as ContentJson).comment === "string") {
    return (c as ContentJson).comment ?? "";
  }
  return "";
}

function positionPageFromAnnotation(position: unknown): number {
  const pos = position as { pageNumber?: number; boundingRect?: { pageNumber?: number } };
  return pos?.pageNumber ?? pos?.boundingRect?.pageNumber ?? 1;
}

/** Annexe texte uniquement si aucun rectangle n'a pu etre dessine (coords incompletes). */
async function appendFallbackAppendix(
  pdfDoc: PDFDocument,
  rows: AnnotationRow[],
  title: string,
  currentNum: number,
  talentNom: string,
  marqueNom: string
) {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage();
  const margin = 50;
  const pageWidth = page.getSize().width;
  let y = page.getSize().height - 60;

  const ensureSpace = (needed: number) => {
    if (y < needed) {
      page = pdfDoc.addPage();
      y = page.getSize().height - 60;
    }
  };

  page.drawText(sanitizePdfText("GLOW UP AGENCY"), {
    x: margin,
    y,
    font: fontBold,
    size: 12,
    color: rgb(0.1, 0.07, 0.06),
  });
  y -= 20;
  page.drawText(sanitizePdfText(title), { x: margin, y, font: fontBold, size: 9, color: rgb(0.2, 0.2, 0.2) });
  y -= 22;
  page.drawText(
    sanitizePdfText(
      `Version V${currentNum} - ${talentNom} x ${marqueNom} (surlignages non reproductibles : detail texte ci-dessous)`
    ),
    { x: margin, y, font, size: 8, color: rgb(0.45, 0.45, 0.45) }
  );
  y -= 28;

  const byPage = new Map<number, AnnotationRow[]>();
  for (const a of rows) {
    const p = positionPageFromAnnotation(a.position);
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p)!.push(a);
  }
  const sortedPages = [...byPage.keys()].sort((a, b) => a - b);

  for (const pageNum of sortedPages) {
    const items = byPage.get(pageNum)!;
    ensureSpace(30);
    page.drawText(sanitizePdfText(`Page contrat ${pageNum}`), {
      x: margin,
      y,
      font: fontBold,
      size: 9,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= 14;
    for (const a of items) {
      const texte = contentLabel(a.content);
      const com = commentLabel(a.content);
      if (texte) {
        ensureSpace(20);
        page.drawText(sanitizePdfText(`Citation : "${texte.slice(0, 100)}${texte.length > 100 ? "..." : ""}"`), {
          x: margin + 6,
          y,
          font,
          size: 8,
          color: rgb(0.4, 0.4, 0.4),
        });
        y -= 12;
      }
      if (com) {
        for (const line of wrapLines(com, 90)) {
          ensureSpace(12);
          page.drawText(sanitizePdfText(line), { x: margin + 6, y, font, size: 8, color: rgb(0.2, 0.2, 0.2) });
          y -= 10;
        }
      }
      y -= 8;
    }
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    const { id } = await params;
    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: true,
        marque: true,
        contratMarqueAnnotations: { orderBy: { createdAt: "asc" } },
        contratMarqueVersions: {
          orderBy: { numero: "asc" },
          include: { annotations: { orderBy: { createdAt: "asc" } } },
        },
      },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    if (!canReadContratMarqueReview(user.id, user.role, collaboration)) {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    let pdfUrl: string | null = null;
    let currentNum = collaboration.contratMarqueVersionActuelle;
    if (collaboration.contratMarqueVersions.length > 0) {
      const match =
        collaboration.contratMarqueVersions.find((v) => v.numero === currentNum) ??
        collaboration.contratMarqueVersions[collaboration.contratMarqueVersions.length - 1];
      pdfUrl = match?.pdfUrl ?? null;
      currentNum = match?.numero ?? currentNum;
    }
    if (!pdfUrl?.trim()) {
      pdfUrl = collaboration.contratMarquePdfUrl?.trim() ?? null;
    }
    if (!pdfUrl) {
      return NextResponse.json({ error: "Aucun PDF uploadé" }, { status: 400 });
    }

    let rows: AnnotationRow[] = [];
    if (collaboration.contratMarqueVersions.length > 0) {
      const built = buildContratMarqueVersionsForClient({
        contratMarqueVersionActuelle: collaboration.contratMarqueVersionActuelle,
        contratMarqueAnnotations: collaboration.contratMarqueAnnotations,
        contratMarqueVersions: collaboration.contratMarqueVersions,
      });
      const cur =
        built.find((v) => v.numero === collaboration.contratMarqueVersionActuelle) ?? built[built.length - 1];
      rows = cur?.annotations ?? [];
    } else {
      rows = annotationsForClient(collaboration.contratMarqueAnnotations);
    }

    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      return NextResponse.json({ error: "Impossible de récupérer le PDF" }, { status: 502 });
    }
    const originalBytes = await pdfRes.arrayBuffer();

    let pdfDoc: PDFDocument;
    let drawn = 0;
    if (rows.length > 0) {
      const built = await buildPdfWithGutter(originalBytes, rows);
      pdfDoc = built.pdfDoc;
      drawn = built.drawn;
      if (drawn === 0) {
        await appendFallbackAppendix(
          pdfDoc,
          rows,
          "Detail des remarques (export sans surlignage colore)",
          currentNum,
          `${collaboration.talent.prenom} ${collaboration.talent.nom}`,
          collaboration.marque.nom
        );
      }
    } else {
      pdfDoc = await PDFDocument.load(originalBytes);
    }

    const pdfBytes = await pdfDoc.save();
    const safeMarque = collaboration.marque.nom.replace(/[^\w.-]+/g, "-");
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"contrat-${safeMarque}.pdf\"`,
      },
    });
  } catch (error) {
    console.error("GET contrat-marque/export-pdf:", error);
    return NextResponse.json({ error: "Erreur lors de l'export PDF" }, { status: 500 });
  }
}
