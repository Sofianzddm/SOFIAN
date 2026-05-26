#!/usr/bin/env node
/**
 * Supprime le cache Next (.next) — à utiliser quand routes-manifest.json manque.
 */
import { rmSync, existsSync } from "node:fs";

if (existsSync(".next")) {
  rmSync(".next", { recursive: true, force: true });
  console.log("[glowup] Cache .next supprimé.");
} else {
  console.log("[glowup] Pas de dossier .next à supprimer.");
}
