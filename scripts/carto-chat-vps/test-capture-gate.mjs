/**
 * Harness local — rejoue le bug Christophe Robin (capture prématurée)
 * sans Chat réel. Exit 0 = OK.
 *
 *   CARTO_CHAT_TEST_FAST=1 node scripts/carto-chat-vps/test-capture-gate.mjs
 */

process.env.CARTO_CHAT_TEST_FAST = "1";

import {
  ChatGptDriver,
  hasEndMarker,
  withCorrectEndMarker,
  hasDeliverableAnchors,
} from "./chatgpt-driver.mjs";

const MARKER = "GLOWUP_CART_DONE_test3db273";
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error(`  FAIL: ${msg}`);
  } else {
    console.log(`  OK: ${msg}`);
  }
}

function pad(n, seed = "x") {
  return seed.repeat(Math.max(0, n));
}

/** Timeline mock : chaque appel readLastAssistantText avance d'un cran. */
function installMock(driver, steps) {
  let i = 0;
  driver._sleep = async () => {};
  driver.isGenerating = async () => {
    const s = steps[Math.min(i, steps.length - 1)] || {};
    return Boolean(s.generating);
  };
  driver.isWebSearching = async () => {
    const s = steps[Math.min(i, steps.length - 1)] || {};
    return Boolean(s.searching);
  };
  driver.readLastAssistantText = async () => {
    const s = steps[Math.min(i, steps.length - 1)] || { text: "" };
    const text = s.text || "";
    if (i < steps.length - 1) i += 1;
    return text;
  };
  driver.waitForPrompt = async () => null;
  driver.findPromptHandle = async () => null;
  return () => i;
}

async function test1_noCaptureWithoutMarker() {
  console.log("\n[1] Pause mid-stream ~22k SANS jeton → ne doit PAS capturer");
  const d = new ChatGptDriver();
  const mid = `## Agence dump\n${pad(22000, "a")}`;
  const steps = Array.from({ length: 8 }, () => ({
    text: mid,
    generating: false,
    searching: false,
  }));
  installMock(d, steps);
  // Horloge mock : avance à chaque sleep pour timeout prévisible
  let now = 1_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  d._sleep = async (ms) => {
    now += Math.max(1, Number(ms) || 1);
  };

  let captured = null;
  let err = null;
  try {
    captured = await d.waitGenerationDone("", 50, () => {}, MARKER);
  } catch (e) {
    err = e;
  } finally {
    Date.now = realNow;
  }
  assert(
    captured == null,
    "pas de return prématuré (stable 15s désactivé avec jeton)"
  );
  assert(
    err != null && /jeton|Timeout/i.test(String(err.message || err)),
    `timeout/erreur jeton absent (got: ${err?.message || "none"})`
  );
}

async function test2_captureOnMarker() {
  console.log("\n[2] Jeton + settle → capture OK");
  const d = new ChatGptDriver();
  const body = [
    "## 1. Marque",
    "Marque — interne",
    "Eugénie",
    "Priorités Glow Up",
    "## 5 Checklist",
    pad(5000, "b"),
  ].join("\n");
  const withMarker = `${body}\n\n${MARKER}`;
  // frames: growth sans jeton, puis avec jeton, puis settle/grow stables
  const steps = [
    { text: body.slice(0, 500), generating: true, searching: false },
    { text: body, generating: true, searching: false },
    { text: withMarker, generating: false, searching: false },
    // confirmMarkerCapture reads
    { text: withMarker, generating: false, searching: false },
    { text: withMarker, generating: false, searching: false },
    { text: withMarker, generating: false, searching: false },
    { text: withMarker, generating: false, searching: false },
  ];
  installMock(d, steps);
  const out = await d.waitGenerationDone("", 5000, () => {}, MARKER);
  assert(typeof out === "string" && out.length > 1000, `capture longueur ${out?.length}`);
  assert(hasEndMarker(out, MARKER), "jeton présent dans la capture");
  assert(hasDeliverableAnchors(out), "ancrages livrable présents");
}

async function test3_growCheckResumes() {
  console.log("\n[3] Grow-check : jeton puis +2k → reprise, puis capture finale");
  const d = new ChatGptDriver();
  const base = `Marque — interne\nEugénie\nPriorités Glow Up\n## 5\n${pad(3000, "c")}`;
  const v1 = `${base}\n\n${MARKER}`;
  const v2 = `${base}\n${pad(2500, "D")}\n\n${MARKER}`; // +2.5k after marker
  let reads = 0;
  d._sleep = async () => {};
  d.isGenerating = async () => false;
  d.isWebSearching = async () => false;
  d.readLastAssistantText = async () => {
    reads += 1;
    // 1: mid-stream sans jeton
    if (reads === 1) return base;
    // 2: jeton → enter confirmMarkerCapture
    if (reads === 2) return v1;
    // 3: grow-check (seul read dans confirm) → +2.5k → reprise
    if (reads === 3) return v2;
    // 4: boucle principale re-détecte le jeton sur v2
    // 5: grow-check stable → capture
    return v2;
  };
  const out = await d.waitGenerationDone("", 8000, () => {}, MARKER);
  assert(hasEndMarker(out, MARKER), "jeton final OK");
  assert(
    out.length >= v2.length - 50,
    `capture finale longue (got ${out.length}, expect ~${v2.length})`
  );
  assert(reads >= 4, `grow-check a bien relu (reads=${reads})`);
}

async function test4_injectionNotCertified() {
  console.log("\n[4] Injection locale → injected:true (pas certified)");
  const d = new ChatGptDriver();
  // Texte meaty pour tenter nudge, mais waitForPrompt=null → inject
  const truncated = `## Agence\nlinkedin.com/in/foo\n${pad(2000, "e")}`;
  installMock(d, [{ text: truncated, generating: false, searching: false }]);
  const ensured = await d.ensureCorrectEndMarker(truncated, MARKER);
  assert(ensured.injected === true, "injected=true");
  assert(ensured.source === "injected", `source=injected (got ${ensured.source})`);
  assert(hasEndMarker(ensured.answer, MARKER), "jeton collé dans answer debug");

  // Court : skip nudge → inject direct
  const short = "hello world only";
  const ensured2 = await d.ensureCorrectEndMarker(short, MARKER);
  assert(ensured2.injected === true, "short → injected");

  // Déjà présent → pas injecté
  const good = withCorrectEndMarker(
    `Marque — interne\nPriorités Glow Up\n## 5\n${pad(1000, "f")}`,
    MARKER
  );
  const ensured3 = await d.ensureCorrectEndMarker(good, MARKER);
  assert(ensured3.injected === false, "présent → injected=false");
  assert(ensured3.source === "present", "source=present");
}

async function main() {
  console.log("=== test-capture-gate (CR premature capture) ===");
  await test1_noCaptureWithoutMarker();
  await test2_captureOnMarker();
  await test3_growCheckResumes();
  await test4_injectionNotCertified();
  console.log(`\n=== ${failed === 0 ? "ALL PASSED" : `${failed} FAILED`} ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
