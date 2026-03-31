/**
 * Worker PDF.js servi depuis `public/pdf.worker.min.mjs` (copie de
 * `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, même version que `pdfjs-dist` dans package.json).
 * Évite les soucis de chargement cross-origin / cache sur unpkg et garantit l’alignement API/worker.
 */
export const PDFJS_DIST_WORKER_SRC = "/pdf.worker.min.mjs";
