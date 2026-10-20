import { describe, expect, it } from "vitest";
import {
  CANONICAL_AGENCE_SIGNATURE_EMAIL,
  normalizeGlowupEmail,
  resolveAgenceSignatureEmail,
} from "./agence-signature";

describe("normalizeGlowupEmail", () => {
  it("corrige gloupagence → glowupagence", () => {
    expect(normalizeGlowupEmail("contrat@gloupagence.fr")).toBe(
      CANONICAL_AGENCE_SIGNATURE_EMAIL
    );
  });

  it("conserve un email déjà correct", () => {
    expect(normalizeGlowupEmail("contrat@glowupagence.fr")).toBe(
      CANONICAL_AGENCE_SIGNATURE_EMAIL
    );
  });

  it("trim + lowercase", () => {
    expect(normalizeGlowupEmail("  Sofian@GlowUpAgence.fr ")).toBe(
      "sofian@glowupagence.fr"
    );
  });
});

describe("resolveAgenceSignatureEmail", () => {
  it("force contrat@ typé vers le canonique", () => {
    expect(resolveAgenceSignatureEmail("contrat@gloupagence.fr")).toBe(
      CANONICAL_AGENCE_SIGNATURE_EMAIL
    );
  });

  it("fallback si vide", () => {
    expect(resolveAgenceSignatureEmail("")).toBe(
      CANONICAL_AGENCE_SIGNATURE_EMAIL
    );
    expect(resolveAgenceSignatureEmail(null)).toBe(
      CANONICAL_AGENCE_SIGNATURE_EMAIL
    );
  });

  it("rejette un domaine hors glowup", () => {
    expect(resolveAgenceSignatureEmail("someone@gmail.com")).toBe(
      CANONICAL_AGENCE_SIGNATURE_EMAIL
    );
  });
});
