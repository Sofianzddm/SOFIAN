/**
 * Login ChatGPT via CDP déjà ouvert (terminal only, sans VNC).
 *
 * Usage (sur le VPS) :
 *   CHATGPT_EMAIL=... CHATGPT_PASSWORD=... node login-chatgpt.mjs
 *
 * Prérequis : Chromium CDP sur :9222 (ensure-chrome-cdp.sh).
 * Limite : Cloudflare / captcha / Google OAuth → échec (VNC alors obligatoire).
 */
import { chromium } from "playwright";

const CDP = process.env.CARTO_CHAT_CDP_URL?.trim() || "http://127.0.0.1:9222";
const EMAIL = (process.env.CHATGPT_EMAIL || process.env.OPENAI_EMAIL || "").trim();
const PASSWORD = (
  process.env.CHATGPT_PASSWORD ||
  process.env.OPENAI_PASSWORD ||
  ""
).trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findClickable(page, names) {
  for (const name of names) {
    const loc = page.getByRole("button", { name, exact: false }).first();
    if (await loc.count().catch(() => 0)) {
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    const link = page.getByRole("link", { name, exact: false }).first();
    if (await link.count().catch(() => 0)) {
      if (await link.isVisible().catch(() => false)) return link;
    }
  }
  return null;
}

async function isLoggedIn(page) {
  const url = page.url();
  if (/auth\.openai|\/auth|login|signup/i.test(url)) return false;
  const prompt =
    (await page
      .locator(
        'div.ProseMirror[contenteditable="true"], #prompt-textarea, [data-testid="prompt-textarea"]'
      )
      .first()
      .count()
      .catch(() => 0)) > 0;
  if (prompt) return true;
  const body = await page.evaluate(() => document.body?.innerText || "").catch(
    () => ""
  );
  if (/Log in|Sign up for free|Se connecter|Créer un compte/i.test(body) &&
      !/Nouveau chat|New chat|Demander à ChatGPT|Ask anything/i.test(body)) {
    return false;
  }
  return /Nouveau chat|New chat|How can I help|Comment puis-je/i.test(body);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "CHATGPT_EMAIL et CHATGPT_PASSWORD requis (ou OPENAI_EMAIL / OPENAI_PASSWORD)"
    );
    process.exit(1);
  }

  console.log(`[login] attach CDP ${CDP}`);
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] || (await browser.newContext());
  let page =
    context.pages().find((p) => /chatgpt\.com|openai\.com/i.test(p.url())) ||
    context.pages()[0] ||
    (await context.newPage());

  await page.goto("https://chatgpt.com/", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await sleep(2000);

  if (await isLoggedIn(page)) {
    console.log("[login] déjà connecté");
    console.log(JSON.stringify({ ok: true, loggedIn: true, url: page.url() }));
    return;
  }

  // Cookie / modales
  for (const label of ["Accept all", "Tout accepter", "Accept", "OK", "Okay"]) {
    const btn = await findClickable(page, [new RegExp(label, "i")]);
    if (btn) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await sleep(500);
    }
  }

  const loginBtn = await findClickable(page, [
    /log in/i,
    /se connecter/i,
    /sign in/i,
  ]);
  if (loginBtn) {
    await loginBtn.click({ timeout: 10_000 });
    await sleep(2000);
  } else {
    await page.goto("https://chatgpt.com/auth/login", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(1500);
  }

  // Parfois "Continue with email"
  const emailContinue = await findClickable(page, [
    /continue with email/i,
    /continuer avec (an )?e-?mail/i,
    /email/i,
  ]);
  if (emailContinue) {
    await emailContinue.click({ timeout: 8_000 }).catch(() => {});
    await sleep(1000);
  }

  // Champ email
  const emailInput = page
    .locator(
      'input[type="email"], input[name="email"], input[autocomplete="username"], input[id*="email" i]'
    )
    .first();
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(EMAIL);
  await sleep(400);

  const cont1 = await findClickable(page, [
    /continue/i,
    /continuer/i,
    /next/i,
    /suivant/i,
  ]);
  if (cont1) await cont1.click({ timeout: 8_000 });
  else await emailInput.press("Enter");
  await sleep(2000);

  // Mot de passe
  const passInput = page
    .locator(
      'input[type="password"], input[name="password"], input[autocomplete="current-password"]'
    )
    .first();
  await passInput.waitFor({ state: "visible", timeout: 30_000 });
  await passInput.fill(PASSWORD);
  await sleep(400);

  const cont2 = await findClickable(page, [
    /continue/i,
    /continuer/i,
    /log in/i,
    /se connecter/i,
    /sign in/i,
  ]);
  if (cont2) await cont2.click({ timeout: 8_000 });
  else await passInput.press("Enter");

  // Attente post-login
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    if (await isLoggedIn(page)) {
      console.log("[login] OK");
      console.log(
        JSON.stringify({ ok: true, loggedIn: true, url: page.url() })
      );
      return;
    }
    const body = await page
      .evaluate(() =>
        String(document.body?.innerText || "")
          .replace(/\s+/g, " ")
          .slice(0, 240)
      )
      .catch(() => "");
    if (/just a moment|cf-|captcha|verify you are human/i.test(body)) {
      console.error("[login] bloqué Cloudflare/captcha — VNC obligatoire");
      console.log(
        JSON.stringify({
          ok: false,
          loggedIn: false,
          reason: "captcha",
          preview: body,
        })
      );
      process.exit(2);
    }
    console.log(`[login] waiting… url=${page.url()}`);
  }

  console.error("[login] timeout — toujours pas connecté");
  console.log(
    JSON.stringify({ ok: false, loggedIn: false, url: page.url() })
  );
  process.exit(1);
}

main().catch((e) => {
  console.error("[login] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
