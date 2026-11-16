/**
 * Pilote un onglet ChatGPT déjà ouvert (CDP) ou lancé avec profil persistant.
 * Une seule conversation à la fois.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const CHATGPT_URL = process.env.CARTO_CHAT_URL || "https://chatgpt.com/";

/** Préfixe — un id unique par fil est passé via opts.endMarker */
const END_MARKER_PREFIX = "GLOWUP_CART_DONE_";
const END_MARKER_DEFAULT =
  process.env.CARTO_CHAT_END_MARKER?.trim() || "GLOWUP_CART_DONE_9f3k2x";

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasEndMarker(text, marker) {
  const raw = text || "";
  if (marker && String(marker).trim()) {
    return new RegExp(`\\b${escapeRe(String(marker).trim())}\\b`, "i").test(raw);
  }
  return new RegExp(
    `\\b${escapeRe(END_MARKER_PREFIX)}[a-z0-9]+\\b`,
    "i"
  ).test(raw);
}

/** Retire TOUS les GLOWUP_CART_DONE_* (bons et mauvais). */
function stripAllEndMarkers(text) {
  return String(text || "")
    .replace(new RegExp(`^[ \\t]*${escapeRe(END_MARKER_PREFIX)}[a-z0-9]+[ \\t]*$`, "gim"), "")
    .replace(new RegExp(`\\s*${escapeRe(END_MARKER_PREFIX)}[a-z0-9]+\\b`, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripEndMarker(text, marker) {
  const raw = String(text || "");
  // Toujours purger les anciens jetons ; on ne garde que le bon à la fin si besoin
  if (!marker || !String(marker).trim()) {
    return stripAllEndMarkers(raw);
  }
  const cleaned = stripAllEndMarkers(raw);
  return cleaned;
}

/** Garantit que la réponse se termine par LE bon jeton (pas un ancien). */
function withCorrectEndMarker(text, marker) {
  const m = String(marker || "").trim();
  const body = stripAllEndMarkers(text);
  if (!m) return body;
  return `${body}\n\n${m}`.trim();
}

const PROMPT_SELECTORS = [
  "#prompt-textarea",
  'div[contenteditable="true"]#prompt-textarea',
  'textarea[name="prompt-textarea"]',
  'div[contenteditable="true"][data-testid="prompt-textarea"]',
  'div[role="textbox"][contenteditable="true"]',
  'div[role="textbox"]',
  'form div[contenteditable="true"]',
  'main div[contenteditable="true"]',
  '[contenteditable="true"]',
];

const SEND_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label="Envoyer le prompt"]',
  'button[aria-label="Send"]',
  'button[aria-label="Envoyer"]',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ancrages soft : livrable carto (pas juste un dump partiel). */
function hasDeliverableAnchors(text) {
  const t = String(text || "");
  return (
    /Marque\s*[—–-]\s*interne/i.test(t) ||
    /Priorit[ée]s\s+Glow\s*Up/i.test(t) ||
    /##\s*5\b/i.test(t) ||
    /checklist/i.test(t)
  );
}

export {
  hasEndMarker,
  stripAllEndMarkers,
  withCorrectEndMarker,
  hasDeliverableAnchors,
  END_MARKER_PREFIX,
};

export class ChatGptDriver {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.busy = false;
    this.mode = null;
    /** Overridable in tests (fast sleep). */
    this._sleep = sleep;
  }

  async start() {
    const cdp = process.env.CARTO_CHAT_CDP_URL?.trim();
    if (cdp) {
      console.log(`[carto-chat-vps] attach CDP ${cdp}`);
      this.browser = await chromium.connectOverCDP(cdp);
      const contexts = this.browser.contexts();
      this.context = contexts[0] || (await this.browser.newContext());
      await this.attachBestPage();
      this.mode = "cdp";
    } else {
      const profileDir =
        process.env.CARTO_CHAT_PROFILE_DIR?.trim() ||
        path.join(process.cwd(), ".chatgpt-profile");
      fs.mkdirSync(profileDir, { recursive: true });
      const headless = process.env.CARTO_CHAT_HEADLESS === "1";
      console.log(
        `[carto-chat-vps] launch persistent profile=${profileDir} headless=${headless}`
      );
      this.context = await chromium.launchPersistentContext(profileDir, {
        headless,
        viewport: { width: 1280, height: 900 },
        args: ["--disable-blink-features=AutomationControlled"],
      });
      this.browser = this.context;
      this.page = this.context.pages()[0] || (await this.context.newPage());
      this.mode = "persistent";
    }

    if (!/chatgpt\.com|chat\.openai\.com/i.test(this.page.url())) {
      await this.page.goto(CHATGPT_URL, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
    }
    console.log(`[carto-chat-vps] ready url=${this.page.url()} mode=${this.mode}`);
    // Dès le démarrage : High / Élevé (pas Instant)
    try {
      await this.ensureHighEffort();
    } catch (e) {
      console.warn(
        "[carto-chat-vps] Effort au boot:",
        e instanceof Error ? e.message : e
      );
    }
  }

  /** Préfère l’onglet conversation ChatGPT le plus récent. */
  async attachBestPage() {
    const pages = this.context.pages();
    const chatPages = pages.filter((p) =>
      /chatgpt\.com|chat\.openai\.com/i.test(p.url())
    );
    // Priorité: /c/… (conversation), sinon n’importe quel chatgpt
    this.page =
      chatPages.find((p) => /\/c\//.test(p.url())) ||
      chatPages[0] ||
      pages[0] ||
      (await this.context.newPage());
  }

  async refreshPageHandle() {
    if (this.mode === "cdp") {
      try {
        await this.attachBestPage();
      } catch {
        /* keep current */
      }
    }
  }

  async status(opts = {}) {
    await this.refreshPageHandle();
    const url = this.page?.url?.() || "";
    const loggedIn = await this.isLoggedIn().catch(() => false);
    const hasPrompt = Boolean(await this.findPromptHandle().catch(() => null));
    const lastText = await this.readLastAssistantText().catch(() => "");
    const expected =
      (opts.endMarker && String(opts.endMarker).trim()) ||
      this.activeEndMarker ||
      null;
    return {
      ok: Boolean(this.page),
      mode: this.mode,
      url,
      loggedIn,
      hasPrompt,
      busy: this.busy,
      lastAnswerChars: lastText.length,
      // Uniquement le marker du fil courant (pas l’ancien)
      hasEndMarker: expected
        ? hasEndMarker(lastText, expected)
        : false,
      endMarker: expected,
    };
  }

  async isLoggedIn() {
    const url = this.page.url();
    if (/auth\.openai|\/auth|login|signup/i.test(url)) return false;
    const prompt = await this.findPromptHandle();
    if (prompt) return true;
    if (/chatgpt\.com\/c\//i.test(url)) return true;
    // Accueil connecté
    const home = await this.page
      .evaluate(() =>
        /Comment puis-je vous aider|How can I help|Nouveau chat|New chat/i.test(
          document.body?.innerText || ""
        )
      )
      .catch(() => false);
    return Boolean(home);
  }

  async findPromptHandle() {
    // Préfère le ProseMirror visible « Demander à ChatGPT » (plusieurs clones DOM).
    const preferred = this.page
      .locator('div.ProseMirror[contenteditable="true"][role="textbox"]')
      .locator("visible=true");
    const prefCount = await preferred.count().catch(() => 0);
    for (let i = prefCount - 1; i >= 0; i--) {
      const el = preferred.nth(i);
      try {
        const box = await el.boundingBox();
        if (box && box.width >= 80 && box.height >= 16) return el;
      } catch {
        /* next */
      }
    }

    let best = null;
    let bestArea = 0;
    for (const sel of PROMPT_SELECTORS) {
      const loc = this.page.locator(sel);
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i);
        try {
          if (!(await el.isVisible({ timeout: 200 }))) continue;
          const box = await el.boundingBox();
          if (!box || box.width < 80 || box.height < 16) continue;
          const area = box.width * box.height;
          // Composer en bas d'écran
          if (box.y < 200) continue;
          if (area > bestArea) {
            bestArea = area;
            best = el;
          }
        } catch {
          /* next */
        }
      }
      if (best) return best;
    }
    return best;
  }

  /** Attend le composer après Nouveau chat / navigation. */
  async waitForPrompt(timeoutMs = 15_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const box = await this.findPromptHandle();
      if (box) return box;
      await sleep(400);
    }
    return null;
  }

  /**
   * Force une nouvelle conversation (comme « Nouveau chat » sur Chrome).
   * Évite d'enchaîner dans le même /c/… (contexte marque précédente).
   */
  async startFreshChat() {
    await this.refreshPageHandle();
    const urlBefore = this.page.url();
    const idBefore = (urlBefore.match(/\/c\/([a-z0-9-]+)/i) || [])[1] || null;

    const clickNew = async () => {
      const selectors = [
        'a[data-testid="create-new-chat-button"]',
        'button[data-testid="create-new-chat-button"]',
        '[data-testid="create-new-chat-button"]',
        'a[aria-label="Nouveau chat"]',
        'a[aria-label="New chat"]',
        'button[aria-label="Nouveau chat"]',
        'button[aria-label="New chat"]',
        'nav a:has-text("Nouveau chat")',
        'nav a:has-text("New chat")',
        'a:has-text("Nouveau chat")',
        'a:has-text("New chat")',
        'button:has-text("Nouveau chat")',
        'button:has-text("New chat")',
      ];
      for (const sel of selectors) {
        try {
          const btn = this.page.locator(sel).first();
          if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
            await btn.click({ timeout: 2500 });
            await sleep(900);
            return true;
          }
        } catch {
          /* next */
        }
      }
      return false;
    };

    let clicked = await clickNew();
    if (!clicked) {
      // Sidebar fermée / UI EN différente → accueil = nouveau fil
      console.log(
        "[carto-chat-vps] Nouveau chat introuvable → goto chatgpt.com/"
      );
      try {
        await this.page.goto(CHATGPT_URL, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await sleep(800);
      } catch (e) {
        console.warn(
          "[carto-chat-vps] goto accueil:",
          e instanceof Error ? e.message : e
        );
      }
      clicked = await clickNew();
    }

    // Si on est encore sur le même /c/…, forcer l'accueil
    const urlMid = this.page.url();
    const idMid = (urlMid.match(/\/c\/([a-z0-9-]+)/i) || [])[1] || null;
    if (idBefore && idMid && idBefore === idMid) {
      console.log(
        `[carto-chat-vps] encore sur ${idBefore} → force accueil`
      );
      try {
        await this.page.goto(CHATGPT_URL, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await sleep(1000);
        await clickNew();
      } catch {
        /* stay */
      }
    }

    const urlAfter = this.page.url();
    const idAfter = (urlAfter.match(/\/c\/([a-z0-9-]+)/i) || [])[1] || null;
    const fresh =
      !idAfter || (idBefore && idAfter !== idBefore) || /chatgpt\.com\/?(\?|$)/i.test(urlAfter);
    console.log(
      `[carto-chat-vps] fresh chat ${fresh ? "OK" : "?"} before=${idBefore || "—"} after=${idAfter || "accueil"} url=${urlAfter}`
    );
    return fresh;
  }

  /** Si on est sur l'accueil sans réponse, ouvre la dernière conversation /c/. */
  async openLatestConversation() {
    await this.refreshPageHandle();
    if (/\/c\//.test(this.page.url())) return true;
    try {
      const link = this.page.locator('a[href*="/c/"]').filter({
        hasText: /influence|gestion|responsables|HOKA|NYX|HYROX|Red Bull|redbull/i,
      }).first();
      if (await link.isVisible({ timeout: 800 }).catch(() => false)) {
        await link.click({ timeout: 3000 });
        await sleep(1500);
        return /\/c\//.test(this.page.url());
      }
      const all = this.page.locator('a[href*="/c/"]');
      const count = await all.count();
      for (let i = 0; i < Math.min(count, 12); i++) {
        const href = (await all.nth(i).getAttribute("href")) || "";
        const text = (
          (await all.nth(i).innerText().catch(() => "")) || ""
        ).trim();
        if (/Négocier|carnet|Alertes/i.test(text)) continue;
        if (!/\/c\//.test(href)) continue;
        await all.nth(i).click({ timeout: 3000 });
        await sleep(1500);
        if (/\/c\//.test(this.page.url())) return true;
      }
    } catch (e) {
      console.warn(
        "[carto-chat-vps] openLatestConversation:",
        e instanceof Error ? e.message : e
      );
    }
    return false;
  }

  async findSendButton() {
    for (const sel of SEND_SELECTORS) {
      const loc = this.page.locator(sel).first();
      if (await loc.count()) {
        try {
          if (await loc.isVisible({ timeout: 400 })) return loc;
        } catch {
          /* next */
        }
      }
    }
    return null;
  }

  /**
   * true si la pastille « Searching N websites » / recherche web est EN COURS
   * (pas « Searched » terminé). Pendant ce temps le texte peut être stable
   * alors que Chat n'a pas encore listé les contacts.
   */
  async isWebSearching() {
    return this.page
      .evaluate(() => {
        const isVisible = (el) => {
          if (!el) return false;
          const st = window.getComputedStyle(el);
          const b = el.getBoundingClientRect();
          return (
            st.display !== "none" &&
            st.visibility !== "hidden" &&
            b.width > 0 &&
            b.height > 0
          );
        };
        const root =
          document.querySelector("main") ||
          document.querySelector("[data-app-shell-focus-area='main']") ||
          document.body;
        if (!root) return false;
        const nodes = Array.from(
          root.querySelectorAll("button, a, span, div, [role='status']")
        ).slice(-80);
        for (const el of nodes) {
          if (!isVisible(el)) continue;
          const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length < 8 || t.length > 80) continue;
          // EN/FR en cours (pas le passé « Searched »)
          if (
            /^Searching \d+/i.test(t) ||
            /^Searching the web/i.test(t) ||
            /^Recherche( de)? \d+/i.test(t) ||
            /^Recherche en cours/i.test(t) ||
            /^Browsing \d+/i.test(t) ||
            /^Web browsing/i.test(t)
          ) {
            return true;
          }
        }
        // Stop visible = encore actif (souvent pendant Searching)
        for (const btn of Array.from(document.querySelectorAll("button"))) {
          const aria = (btn.getAttribute("aria-label") || "").trim();
          const testid = (btn.getAttribute("data-testid") || "").trim();
          if (
            (testid === "stop-button" ||
              /^Arrêter$/i.test(aria) ||
              /^Stop$/i.test(aria) ||
              /stop generating|arrêter de générer/i.test(aria)) &&
            isVisible(btn)
          ) {
            return true;
          }
        }
        return false;
      })
      .catch(() => false);
  }

  /**
   * true = Chat encore en train de chercher / écrire.
   * Priorité au bouton Stop visible (« Arrêter ») — NE PAS se fier à
   * « Réponse terminée » dans le body (présent trop tôt / tour précédent).
   */
  async isGenerating() {
    return this.page
      .evaluate(() => {
        const isVisible = (el) => {
          if (!el) return false;
          const st = window.getComputedStyle(el);
          const b = el.getBoundingClientRect();
          return (
            st.display !== "none" &&
            st.visibility !== "hidden" &&
            b.width > 0 &&
            b.height > 0
          );
        };

        // 1) Bouton Stop / Arrêter visible dans le composer → encore en cours
        for (const btn of Array.from(document.querySelectorAll("button"))) {
          const aria = (btn.getAttribute("aria-label") || "").trim();
          const testid = (btn.getAttribute("data-testid") || "").trim();
          const hit =
            testid === "stop-button" ||
            /^Arrêter$/i.test(aria) ||
            /^Stop$/i.test(aria) ||
            /stop generating|arrêter de générer|stop streaming/i.test(aria);
          if (hit && isVisible(btn)) return true;
        }

        // 2) Send encore absent / désactivé pendant le stream (optionnel)
        const send = document.querySelector(
          'button[data-testid="send-button"], button[aria-label="Envoyer le prompt"], button[aria-label="Send prompt"]'
        );
        // pas de conclusion ici

        // 3) Ne plus se fier aux aria-live « Recherche/Thinking » :
        // ils restent souvent dans le DOM après coup → faux busy infini.

        // Send visible = plus en génération
        if (send && isVisible(send) && !send.disabled) return false;
        return false;
      })
      .catch(() => false);
  }

  /**
   * true si plus de Stop ET (label « terminé » OU send-button visible).
   */
  async isResponseComplete() {
    return this.page
      .evaluate(() => {
        const isVisible = (el) => {
          if (!el) return false;
          const st = window.getComputedStyle(el);
          const b = el.getBoundingClientRect();
          return (
            st.display !== "none" &&
            st.visibility !== "hidden" &&
            b.width > 0 &&
            b.height > 0
          );
        };

        for (const btn of Array.from(document.querySelectorAll("button"))) {
          const aria = (btn.getAttribute("aria-label") || "").trim();
          const testid = (btn.getAttribute("data-testid") || "").trim();
          const hit =
            testid === "stop-button" ||
            /^Arrêter$/i.test(aria) ||
            /^Stop$/i.test(aria) ||
            /stop generating|arrêter de générer/i.test(aria);
          if (hit && isVisible(btn)) return false;
        }

        const statuses = Array.from(
          document.querySelectorAll(
            '[role="status"], [aria-live="polite"], [aria-live="assertive"]'
          )
        );
        for (const el of statuses) {
          if (!isVisible(el)) continue;
          const t = (el.innerText || el.textContent || "").trim();
          if (
            /Réponse terminée|Response complete|Finished responding|Done responding/i.test(
              t
            )
          ) {
            return true;
          }
        }

        // Fallback: bouton Envoyer / Send visible → plus de stream
        const send = document.querySelector(
          'button[data-testid="send-button"], button[aria-label="Envoyer le prompt"], button[aria-label="Send prompt"], button[aria-label="Send"]'
        );
        if (send && isVisible(send) && !send.disabled) return true;

        return false;
      })
      .catch(() => false);
  }

  /**
   * Force le rendu de la fin du fil (Chat virtualise → sinon ~20–25k sans jeton).
   * Aucun plafond de caractères : on scrolle jusqu'en bas plusieurs fois.
   */
  async scrollConversationToEnd() {
    if (!this.page) return;
    try {
      await this.page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const pickScroll = () => {
          const nodes = [
            document.querySelector("[data-testid='conversation-turn-list']"),
            document.querySelector("#thread"),
            document.querySelector("main"),
            document.querySelector("[class*='composer']")?.parentElement,
            document.scrollingElement,
          ].filter(Boolean);
          let best = document.scrollingElement || document.documentElement;
          let bestH = 0;
          for (const n of nodes) {
            const h = n.scrollHeight || 0;
            if (h > bestH) {
              bestH = h;
              best = n;
            }
          }
          return best;
        };

        for (let i = 0; i < 8; i++) {
          const sc = pickScroll();
          if (sc) sc.scrollTop = sc.scrollHeight;
          window.scrollTo(0, document.body.scrollHeight);
          const assists = document.querySelectorAll(
            '[data-message-author-role="assistant"], [data-testid="assistant-message"]'
          );
          const last = assists[assists.length - 1];
          if (last) {
            last.scrollIntoView({ block: "end", inline: "nearest" });
            // Scrolle aussi à l'intérieur du message (longs articles)
            last.scrollTop = last.scrollHeight;
            const md =
              last.querySelector(".markdown") ||
              last.querySelector("[class*='markdown']") ||
              last;
            if (md && md !== last) md.scrollTop = md.scrollHeight;
          }
          await sleep(120);
        }
      });
    } catch {
      /* ignore */
    }
  }

  /**
   * Tentative Copy du dernier tour assistant (texte complet, hors virtualisation).
   */
  async tryCopyLastAssistantText() {
    if (!this.page) return "";
    try {
      await this.page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"])
        .catch(() => {});
      const btn = this.page
        .locator(
          [
            '[data-testid="copy-turn-action-button"]',
            'button[aria-label*="Copy"]',
            'button[aria-label*="Copier"]',
            'button[aria-label*="copy"]',
          ].join(", ")
        )
        .last();
      if (!(await btn.isVisible({ timeout: 800 }).catch(() => false))) {
        return "";
      }
      await btn.click({ timeout: 2000 }).catch(() => {});
      await this._sleep(
        process.env.CARTO_CHAT_TEST_FAST === "1" ? 1 : 400
      );
      const clip = await this.page
        .evaluate(async () => {
          try {
            return (await navigator.clipboard.readText()) || "";
          } catch {
            return "";
          }
        })
        .catch(() => "");
      return String(clip || "").trim();
    } catch {
      return "";
    }
  }

  /**
   * UI ChatGPT actuelle (FR/EN) : « ChatGPT a dit : » / « ChatGPT said: »
   * + href LinkedIn (innerText perd les liens « Profil »).
   * @param {{ deep?: boolean }} [opts] deep=true → scroll bas + copy fallback, 0 limite
   */
  async readLastAssistantText(opts = {}) {
    const deep = Boolean(opts.deep);
    await this.refreshPageHandle();
    if (deep) {
      await this.scrollConversationToEnd();
      await this._sleep(
        process.env.CARTO_CHAT_TEST_FAST === "1" ? 1 : 350
      );
    }

    const payload = await this.page.evaluate(() => {
      const clean = (s) => (s || "").replace(/\u00a0/g, " ").trim();

      const normalizeLi = (href) => {
        try {
          const u = new URL(href, location.origin);
          if (!/linkedin\.com/i.test(u.hostname)) return null;
          if (!/\/in\//i.test(u.pathname)) return null;
          u.search = "";
          u.hash = "";
          let path = u.pathname.replace(/\/+$/, "");
          return `https://www.linkedin.com${path}`;
        } catch {
          return null;
        }
      };

      const linkRows = [];
      const seen = new Set();
      for (const a of Array.from(document.querySelectorAll("a[href]"))) {
        const href = normalizeLi(a.href || a.getAttribute("href") || "");
        if (!href || seen.has(href)) continue;
        seen.add(href);
        const block = clean(
          (a.closest("li, tr, p, div") || a.parentElement)?.innerText || ""
        ).slice(0, 220);
        const label = clean(a.innerText || a.getAttribute("aria-label") || "");
        linkRows.push({ href, label, block });
      }

      // ★ Préférer le nœud assistant (markdown) — pas de slice/plafond
      const assistNodes = Array.from(
        document.querySelectorAll(
          '[data-message-author-role="assistant"], [data-testid="assistant-message"]'
        )
      );
      let byRole = "";
      if (assistNodes.length) {
        const last = assistNodes[assistNodes.length - 1];
        const md =
          last.querySelector(".markdown") ||
          last.querySelector('[class*="markdown"]') ||
          last;
        byRole = clean(md.innerText || md.textContent || "");
        // Si plusieurs bulles assistant d'affilée (même tour fragmenté), concatène
        // les plus longues récentes si la dernière est courte.
        if (byRole.length < 500 && assistNodes.length >= 2) {
          const joined = assistNodes
            .slice(-3)
            .map((el) => {
              const m =
                el.querySelector(".markdown") ||
                el.querySelector('[class*="markdown"]') ||
                el;
              return clean(m.innerText || m.textContent || "");
            })
            .filter((t) => t.length > 40)
            .join("\n\n");
          if (joined.length > byRole.length) byRole = joined;
        }
      }

      const candidates = [
        byRole,
        document.body?.innerText || "",
        document.querySelector("#thread")?.innerText || "",
        document.querySelector("[data-testid='conversation-turn-list']")
          ?.innerText || "",
        ...Array.from(
          document.querySelectorAll(
            "[data-app-shell-focus-area='main'], main, [class*='thread']"
          )
        ).map((el) => el.innerText || ""),
      ]
        .map(clean)
        .filter((t) => t.length > 80)
        .sort((a, b) => b.length - a.length);

      let text = "";
      // Si byRole est le plus long ou proche → le garder (évite sidebar)
      if (byRole && byRole.length >= (candidates[0]?.length || 0) * 0.85) {
        text = byRole;
      } else {
        const raw = candidates[0] || clean(document.body?.innerText || "");
        const splitRe = /(?:ChatGPT a dit|ChatGPT said)\s*:?\s*/gi;
        const userRe = /(?:Vous avez dit|You said)\s*:?\s*/gi;
        const parts = raw.split(splitRe);
        if (parts.length >= 2) {
          let last = clean(parts[parts.length - 1].split(userRe)[0] || "");
          last = clean(
            last.split(
              /ChatGPT peut faire des erreurs|ChatGPT can make mistakes|Aller au contenu/i
            )[0]
          );
          const sidebarCut = last.search(
            /\n(?:Épinglés|Pinned|Projets|Projects|Récents|Recent)\n/i
          );
          if (sidebarCut > 200) last = clean(last.slice(0, sidebarCut));
          if (last.length > 40) text = last;
        }
        if (!text && byRole) text = byRole;
        if (!text) text = raw;
      }

      return { text: text || "", links: linkRows, byRoleLen: byRole.length };
    });

    let text = (payload?.text || "").trim();

    // Deep : si Copy donne un texte plus long → on le prend (0 limite)
    if (deep) {
      const copied = await this.tryCopyLastAssistantText();
      if (copied.length > text.length + 200) {
        console.log(
          `[carto-chat-vps] read via Copy chars=${copied.length} (dom=${text.length})`
        );
        text = copied;
      } else if (copied.length > 500 && /GLOWUP_CART_DONE_/i.test(copied) && !/GLOWUP_CART_DONE_/i.test(text)) {
        console.log(
          `[carto-chat-vps] read via Copy (jeton trouvé) chars=${copied.length}`
        );
        text = copied;
      }
    }

    const links = Array.isArray(payload?.links) ? payload.links : [];
    if (links.length && !opts.skipLinks) {
      const relevant = links.filter((l) => {
        if (/profil|linkedin|profile/i.test(l.label || "")) return true;
        if ((l.block || "").length > 20 && text.length > 80) {
          const tokens = (l.block || "")
            .split(/\s+/)
            .map((t) => t.replace(/[^a-zA-ZÀ-ÿ-]/g, ""))
            .filter((t) => t.length >= 4);
          return tokens.some((t) => text.toLowerCase().includes(t.toLowerCase()));
        }
        return /\/in\//.test(l.href);
      });

      const lines = relevant.slice(0, 40).map((l) => {
        const who = (l.block || l.label || "")
          .replace(/\s+/g, " ")
          .slice(0, 160);
        return `- ${who}\n  ${l.href}`;
      });
      if (lines.length) {
        // N'écrase JAMAIS un jeton déjà présent : append après
        text = `${text}\n\n## LinkedIn URLs (hrefs page)\n${lines.join("\n")}`;
      }
    }
    return text.trim();
  }

  /**
   * Après détection du bon jeton : settle + grow-check.
   * Retourne le texte final (avec jeton) ou null pour reprendre l'attente.
   */
  async confirmMarkerCapture(marker, initialText) {
    const fast = process.env.CARTO_CHAT_TEST_FAST === "1";
    const settleMs = fast ? 5 : 1500;
    const growMs = fast ? 10 : 3500;
    const maxRetries = 3;
    let text = String(initialText || "");

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await this._sleep(settleMs);
      const generating = await this.isGenerating().catch(() => false);
      const searching = await this.isWebSearching().catch(() => false);
      if (generating || searching) {
        console.log(
          `[carto-chat-vps] grow-check: gen/search actif — reprise attente (try ${attempt + 1})`
        );
        return null;
      }

      await this._sleep(growMs);
      const again = await this.readLastAssistantText({ deep: true }).catch(
        () => ""
      );
      const grewHard =
        again.length > text.length + 1500 ||
        (text.length > 0 && again.length > text.length * 1.08);

      if (grewHard) {
        console.log(
          `[carto-chat-vps] grow-check: +${again.length - text.length} chars — reprise attente`
        );
        text = again.length > text.length ? again : text;
        // Si le jeton a disparu (réécriture) → reprendre
        if (!hasEndMarker(again, marker)) return null;
        // Jeton encore là mais texte a grandi → Chat continue après le code ?
        // Reprendre pour attendre une vraie stabilisation / 2e jeton.
        return null;
      }

      if (!hasEndMarker(again, marker) && !hasEndMarker(text, marker)) {
        console.log(`[carto-chat-vps] grow-check: jeton disparu — reprise`);
        return null;
      }

      const final = hasEndMarker(again, marker)
        ? again
        : hasEndMarker(text, marker)
          ? text
          : again;
      console.log(
        `[carto-chat-vps] CAPTURE via END_MARKER chars=${final.length} marker=${marker} (settle+grow ok)`
      );
      // Garde le bon jeton dans la réponse (certification worker)
      return withCorrectEndMarker(final, marker);
    }

    if (hasEndMarker(text, marker)) {
      return withCorrectEndMarker(text, marker);
    }
    return null;
  }

  /**
   * Fin normale = UNIQUEMENT le bon jeton (+ settle/grow-check).
   * Toutes les ~10s : relecture DEEP (scroll + copy) pour trouver le jeton.
   * Aucun plafond de chars. Timeout → renvoie best pour nudge (pas throw).
   */
  async waitGenerationDone(prevText, timeoutMs, onProgress, endMarker) {
    const marker = endMarker || this.activeEndMarker || END_MARKER_DEFAULT;
    const requireMarker = Boolean(marker && String(marker).trim());
    const started = Date.now();
    let stableHits = 0;
    let lastLen = -1;
    let last = "";
    let best = "";
    const prev = prevText || "";
    let sawGrowth = false;
    let peakLen = prev.length;
    const fast = process.env.CARTO_CHAT_TEST_FAST === "1";
    const pollMs = fast ? 1 : 700;
    const deepEveryMs = fast ? 15 : 10_000;
    let lastDeepAt = -deepEveryMs;

    const isNew = (text) =>
      !prev ||
      prev.length < 200 ||
      (text.length >= peakLen + 150 && text !== prev) ||
      (text.length > prev.length + 200 &&
        !text.startsWith((prev || "").slice(0, 80)));

    while (Date.now() - started < timeoutMs) {
      const generating = await this.isGenerating().catch(() => false);
      const searching = await this.isWebSearching().catch(() => false);
      const elapsed = Date.now() - started;
      const dueDeep =
        requireMarker && elapsed - lastDeepAt >= deepEveryMs;

      // ★ Toutes les 10s : scroll bas + copy + lecture complète (0 limite)
      let text;
      if (dueDeep) {
        lastDeepAt = elapsed;
        text = await this.readLastAssistantText({ deep: true });
        const found = hasEndMarker(text, marker);
        console.log(
          `[carto-chat-vps] check jeton @${Math.round(elapsed / 1000)}s chars=${text.length} found=${found ? "oui" : "non"} marker=${marker}`
        );
      } else {
        text = await this.readLastAssistantText();
      }

      const len = text.length;

      if (typeof onProgress === "function") {
        try {
          onProgress(len, {
            generating,
            searching,
            elapsed,
            stableHits,
            sawGrowth,
          });
        } catch {
          /* ignore */
        }
      }

      // Ancienne réponse encore affichée au début
      if (
        prev &&
        text &&
        (text === prev ||
          (text.startsWith(prev.slice(0, 60)) &&
            text.length <= prev.length + 80)) &&
        elapsed < 25_000
      ) {
        await this._sleep(pollMs);
        continue;
      }

      if (len > best.length) best = text;
      if (len > peakLen + 40) {
        peakLen = len;
        sawGrowth = true;
      }

      // ★ Seule sortie normale : bon jeton + stop/search off + grow-check
      if (
        requireMarker &&
        hasEndMarker(text, marker) &&
        isNew(text) &&
        !generating &&
        !searching
      ) {
        const confirmed = await this.confirmMarkerCapture(marker, text);
        if (confirmed) return confirmed;
        stableHits = 0;
        await this._sleep(pollMs);
        continue;
      }

      if (searching) {
        stableHits = 0;
        lastLen = len;
        if (elapsed > 8_000 && elapsed % 14_000 < 800) {
          console.log(
            `[carto-chat-vps] web search en cours… chars=${len} (attente jeton)`
          );
        }
        await this._sleep(fast ? 1 : 1000);
        continue;
      }

      if (len > lastLen + 25) {
        stableHits = 0;
        lastLen = len;
        last = text;
        if (elapsed > 5_000 && !fast) {
          console.log(
            `[carto-chat-vps] streaming… chars=${len} gen=${generating} stable=0`
          );
        }
      } else if (len >= 350 && Math.abs(len - lastLen) <= 25) {
        stableHits += 1;
        lastLen = len;
        last = text.length >= last.length ? text : last;
        if (!fast && (stableHits === 1 || stableHits % 5 === 0)) {
          console.log(
            `[carto-chat-vps] stable… chars=${len} hits=${stableHits} gen=${generating} (jeton requis=${requireMarker ? "oui" : "non"})`
          );
        }
      } else if (len > lastLen) {
        lastLen = len;
        last = text;
        stableHits = 0;
      }

      // Sans jeton requis (legacy) : sortie stable 15s encore possible
      if (!requireMarker && isNew(text) && sawGrowth) {
        const STABLE_15S = 20;
        const meatyEnough =
          len >= 1200 ||
          /linkedin\.com\/in\//i.test(text) ||
          /##\s*1\.|##\s*Marque|Agence/i.test(text);
        if (
          stableHits >= STABLE_15S &&
          meatyEnough &&
          (!generating || elapsed > 60_000)
        ) {
          await this._sleep(fast ? 1 : 600);
          if (await this.isWebSearching().catch(() => false)) {
            stableHits = 0;
            await this._sleep(pollMs);
            continue;
          }
          const final = await this.readLastAssistantText({ deep: true });
          console.log(
            `[carto-chat-vps] CAPTURE legacy-stable chars=${final.length}`
          );
          return stripEndMarker(
            final.length >= 200 ? final : last || best,
            marker
          );
        }
      }

      await this._sleep(pollMs);
    }

    // Timeout : dernière lecture DEEP — si jeton → OK ; sinon renvoie best pour nudge
    const fallback =
      (await this.readLastAssistantText({ deep: true })) || best;
    if (requireMarker && hasEndMarker(fallback, marker)) {
      const confirmed = await this.confirmMarkerCapture(marker, fallback);
      if (confirmed) return confirmed;
      console.log(
        `[carto-chat-vps] capture timeout+marker chars=${fallback.length}`
      );
      return withCorrectEndMarker(fallback, marker);
    }
    if (requireMarker) {
      console.warn(
        `[carto-chat-vps] timeout sans jeton chars=${fallback.length} — passe au nudge`
      );
      return fallback.length >= 200 ? fallback : best || fallback;
    }
    if (fallback.length > 200 && isNew(fallback) && sawGrowth) {
      console.log(
        `[carto-chat-vps] capture timeout-fallback chars=${fallback.length}`
      );
      return stripEndMarker(fallback, marker);
    }
    throw new Error("Timeout: réponse Chat non lue");
  }

  /** Lit la réponse déjà affichée (sans renvoyer de prompt). */
  async readLatest() {
    await this.refreshPageHandle();
    let answer = await this.readLastAssistantText({ deep: true });
    if (!answer || answer.length < 40) {
      await this.openLatestConversation();
      answer = await this.readLastAssistantText({ deep: true });
    }
    if (!answer || answer.length < 40) {
      throw new Error(
        "Aucune réponse lisible sur l'onglet Chat — ouvre la conversation (pas l'accueil)"
      );
    }
    return { answer, url: this.page.url() };
  }

  /**
   * Bouton Effort / Reasoning visible (FR + EN).
   * Attributs data-* = fiables quelle que soit la langue UI.
   */
  effortButton() {
    return this.page
      .locator(
        [
          'button[data-composer-navigation-target="reasoning"]',
          'button[aria-label="Sélectionner le modèle ChatGPT"]',
          'button[aria-label="Select ChatGPT model"]',
          'button[aria-label*="reasoning" i]',
          'button[aria-label*="Effort" i]',
          'button[aria-label*="modèle ChatGPT" i]',
        ].join(", ")
      )
      .locator("visible=true")
      .last();
  }

  async readEffortLabel() {
    const selector = this.effortButton();
    if (!(await selector.isVisible({ timeout: 800 }).catch(() => false))) {
      return "";
    }
    return ((await selector.innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async readEffortAttr() {
    const selector = this.effortButton();
    if (!(await selector.isVisible({ timeout: 800 }).catch(() => false))) {
      return "";
    }
    return (
      (await selector.getAttribute("data-selected-reasoning-effort").catch(
        () => ""
      )) || ""
    );
  }

  /**
   * Labels EN + FR pour chaque cran (1..5).
   * FR ChatGPT : Instantané / Moyen / Élevé / Très élevé / Pro
   */
  effortAliases(level) {
    const map = {
      1: ["Instant", "Instantané"],
      2: ["Medium", "Moyen"],
      3: ["High", "Élevé", "Eleve"],
      4: ["Extra High", "Très élevé", "Tres eleve"],
      5: ["Pro"],
    };
    return map[level] || map[3];
  }

  effortAttrForLevel(level) {
    return (
      { 1: "none", 2: "medium", 3: "high", 4: "xhigh", 5: "pro" }[level] ||
      "high"
    );
  }

  isEffortAtTarget(label, level = 3) {
    if (!label) return false;
    const aliases = this.effortAliases(level);
    // « Très élevé » ne doit pas matcher le cran 3 (Élevé / High)
    if (level === 3 && /tr[eè]s\s+[eé]lev[eé]/i.test(label)) return false;
    if (level === 3 && /extra\s*high/i.test(label)) return false;
    return aliases.some((a) => {
      const re = new RegExp(
        a.length <= 4 ? `\\b${a}\\b` : a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      return re.test(label);
    });
  }

  /**
   * Force Effort (défaut High / Élevé = cran 3/5).
   * CARTO_CHAT_EFFORT_LEVEL: 1 Instant … 2 Medium … 3 High … 4 Extra … 5 Pro
   * Ne pas cliquer « Verrouillé » : ça ferme le menu Puissance.
   */
  async ensureHighEffort() {
    const TARGET = Number(process.env.CARTO_CHAT_EFFORT_LEVEL || 3); // 3 = High/Élevé
    const aliases = this.effortAliases(TARGET);
    const targetAttr = this.effortAttrForLevel(TARGET);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.page.keyboard.press("Escape").catch(() => {});
        await sleep(250);

        const selector = this.effortButton();
        if (!(await selector.isVisible({ timeout: 2500 }).catch(() => false))) {
          console.warn(
            `[carto-chat-vps] sélecteur Effort introuvable (try ${attempt})`
          );
          continue;
        }

        const current = await this.readEffortLabel();
        const attr = await this.readEffortAttr();
        if (
          this.isEffortAtTarget(current, TARGET) ||
          attr === targetAttr
        ) {
          console.log(
            `[carto-chat-vps] effort OK ${aliases.join("/")} (« ${current} » attr=${attr})`
          );
          return true;
        }

        console.log(
          `[carto-chat-vps] effort try ${attempt}: « ${current} » attr=${attr} → ${aliases.join("/")}`
        );
        await selector.click({ timeout: 4000 });
        await sleep(700);

        // NE PAS cliquer « Verrouillé / options d’accès » : ça ferme le menu.

        const slider = this.page
          .locator(
            '[data-reasoning-slider="true"], [aria-label="Puissance"], [aria-label="Power"], [aria-label*="reasoning" i]'
          )
          .locator("visible=true")
          .last();

        if (!(await slider.isVisible({ timeout: 2500 }).catch(() => false))) {
          console.warn(
            `[carto-chat-vps] slider Puissance introuvable (try ${attempt})`
          );
          await this.page.keyboard.press("Escape").catch(() => {});
          continue;
        }

        const box = await slider.boundingBox();
        if (!box || box.width < 8) {
          console.warn(`[carto-chat-vps] slider sans bbox (try ${attempt})`);
          await this.page.keyboard.press("Escape").catch(() => {});
          continue;
        }

        // Instantané=0 … Élevé=0.5 … Pro=1
        const ratio = Math.min(1, Math.max(0, (TARGET - 1) / 4));
        await this.page.mouse.click(
          box.x + box.width * ratio,
          box.y + box.height / 2
        );
        await sleep(400);

        let desc = await this.page.evaluate(() => {
          const nodes = Array.from(
            document.querySelectorAll(
              '[data-reasoning-slider="true"], [aria-label="Puissance"]'
            )
          );
          const s =
            nodes.find((el) => {
              const b = el.getBoundingClientRect();
              return b.width > 0 && b.height > 0;
            }) || nodes[0];
          const ids = (s?.getAttribute("aria-describedby") || "").split(/\s+/);
          return ids
            .map((id) => document.getElementById(id)?.innerText || "")
            .filter(Boolean)[0];
        });
        console.log(`[carto-chat-vps] slider → ${desc || "?"}`);

        const levelOk =
          desc &&
          (new RegExp(`${TARGET}\\s*sur\\s*5`, "i").test(desc) ||
            this.isEffortAtTarget(desc, TARGET));
        if (!levelOk) {
          const ratio2 = Math.min(1, Math.max(0, (TARGET - 0.5) / 5));
          await this.page.mouse.click(
            box.x + box.width * ratio2,
            box.y + box.height / 2
          );
          await sleep(350);
          desc = await this.page.evaluate(() => {
            const nodes = Array.from(
              document.querySelectorAll('[data-reasoning-slider="true"]')
            );
            const s =
              nodes.find((el) => el.getBoundingClientRect().width > 0) ||
              nodes[0];
            const ids = (s?.getAttribute("aria-describedby") || "").split(
              /\s+/
            );
            return ids
              .map((id) => document.getElementById(id)?.innerText || "")
              .filter(Boolean)[0];
          });
          console.log(`[carto-chat-vps] slider retry → ${desc || "?"}`);
        }

        await this.page.keyboard.press("Escape").catch(() => {});
        await sleep(400);

        const after = await this.readEffortLabel();
        const afterAttr = await this.readEffortAttr();
        console.log(
          `[carto-chat-vps] effort après try ${attempt}: « ${after} » attr=${afterAttr}`
        );
        if (
          this.isEffortAtTarget(after, TARGET) ||
          afterAttr === targetAttr
        ) {
          return true;
        }
      } catch (e) {
        console.warn(
          `[carto-chat-vps] ensureHighEffort try ${attempt}:`,
          e instanceof Error ? e.message : e
        );
        await this.page.keyboard.press("Escape").catch(() => {});
      }
    }

    console.warn(
      `[carto-chat-vps] impossible de forcer ${aliases.join("/")} après 3 essais`
    );
    return false;
  }

  /**
   * Force LE bon jeton à la fin (Chat oublie / réécrit un ancien code).
   * 1) si déjà le bon → OK (injected: false)
   * 2) sinon micro-prompt « écris UNIQUEMENT ce code » → injected: false si Chat écrit
   * 3) sinon injection locale — injected: true (NE PAS certifier le job)
   * @returns {{ answer: string, injected: boolean, source: 'present'|'nudge'|'injected'|'none' }}
   */
  async ensureCorrectEndMarker(answer, marker) {
    const m = String(marker || "").trim();
    if (!m) {
      return {
        answer: stripAllEndMarkers(answer || ""),
        injected: false,
        source: "none",
      };
    }

    let text = String(answer || "");
    if (hasEndMarker(text, m)) {
      console.log(`[carto-chat-vps] jeton OK ${m}`);
      return {
        answer: withCorrectEndMarker(text, m),
        injected: false,
        source: "present",
      };
    }

    const wrong = (text.match(new RegExp(`${escapeRe(END_MARKER_PREFIX)}[a-z0-9]+`, "gi")) || []);
    if (wrong.length) {
      console.warn(
        `[carto-chat-vps] MAUVAIS jeton(s) ${wrong.join(", ")} — attendu ${m}`
      );
    } else {
      console.warn(`[carto-chat-vps] jeton manquant — relance pour ${m}`);
    }

    // Nudge seulement si contenu déjà substantiel (évite nudge sur fragment vide)
    const meatyEnough =
      text.length >= 1200 ||
      /linkedin\.com\/in\//i.test(text) ||
      /##\s*1\.|##\s*Marque|Agence/i.test(text);

    if (meatyEnough) {
      try {
        let box = await this.waitForPrompt(8_000);
        if (!box) box = await this.findPromptHandle();
        if (box) {
          const nudge = `CODE DE FIN OBLIGATOIRE — réponds UNIQUEMENT par cette ligne exacte, rien d'autre :\n${m}`;
          await box.click({ timeout: 4000 }).catch(() => {});
          await box
            .evaluate((node, value) => {
              const el = node;
              el.focus();
              if (document.execCommand) {
                document.execCommand("selectAll", false);
                document.execCommand("delete", false);
              }
              const ok = document.execCommand("insertText", false, value);
              if (!ok) el.textContent = value;
              return (el.innerText || "").length;
            }, nudge)
            .catch(() => 0);
          const send = await this.findSendButton();
          if (send) {
            await send.click({ timeout: 5000, noWaitAfter: true });
          } else {
            await box.press("Enter");
          }

          const nudgeTimeout =
            process.env.CARTO_CHAT_TEST_FAST === "1" ? 50 : 90_000;
          const deadline = Date.now() + nudgeTimeout;
          while (Date.now() < deadline) {
            await this._sleep(
              process.env.CARTO_CHAT_TEST_FAST === "1" ? 1 : 900
            );
            const latest = await this.readLastAssistantText().catch(() => "");
            if (hasEndMarker(latest, m)) {
              console.log(`[carto-chat-vps] jeton obtenu via relance ${m}`);
              // Si Chat a réécrit une longue réponse avec jeton, la prendre ;
              // sinon fusion research initial + jeton.
              const research =
                latest.length > text.length + 200 && hasDeliverableAnchors(latest)
                  ? latest
                  : text;
              return {
                answer: withCorrectEndMarker(research, m),
                injected: false,
                source: "nudge",
              };
            }
          }
        }
      } catch (e) {
        console.warn(
          "[carto-chat-vps] relance jeton échouée:",
          e instanceof Error ? e.message : e
        );
      }
    }

    console.warn(
      `[carto-chat-vps] injection locale du jeton ${m} — NON CERTIFIÉ (Chat n'a pas écrit le code)`
    );
    return {
      answer: withCorrectEndMarker(text, m),
      injected: true,
      source: "injected",
    };
  }

  async ask(prompt, opts = {}) {
    if (this.busy) throw new Error("Chat déjà occupé — réessaie dans un instant");
    this.busy = true;
    const timeoutMs = Number(
      opts.timeoutMs || process.env.CARTO_CHAT_TIMEOUT_MS || 240_000
    );
    const endMarker =
      (opts.endMarker && String(opts.endMarker).trim()) || END_MARKER_DEFAULT;
    this.activeEndMarker = endMarker;
    try {
      await this.refreshPageHandle();

      if (!(await this.isLoggedIn())) {
        throw new Error(
          "ChatGPT non connecté — connecte-toi dans la fenêtre Chrome CDP"
        );
      }

      // Toujours une NOUVELLE conversation (comme Chrome chez toi)
      await this.startFreshChat();

      let box = await this.waitForPrompt(12_000);
      if (!box) {
        console.warn(
          "[carto-chat-vps] prompt absent après Nouveau chat — retry accueil"
        );
        try {
          await this.page.goto(CHATGPT_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
        } catch {
          /* ignore */
        }
        box = await this.waitForPrompt(10_000);
      }
      if (!box) throw new Error("Champ prompt ChatGPT introuvable");
      console.log(
        `[carto-chat-vps] prompt OK url=${this.page.url()}`
      );

      // High après nouveau chat (sinon Instant revient)
      await this.ensureHighEffort();
      box = (await this.findPromptHandle()) || box;

      // Baseline : sur l'accueil (pas de /c/…) le body contient la sidebar
      // (anciennes marques) — ne PAS s'en servir comme « réponse ».
      let beforeText = "";
      const urlNow = this.page.url();
      if (/\/c\/[a-z0-9-]+/i.test(urlNow)) {
        beforeText = await this.readLastAssistantText();
        if (beforeText.length > 400) {
          console.warn(
            `[carto-chat-vps] encore sur un /c/ long (${beforeText.length}) → force accueil`
          );
          await this.startFreshChat();
          try {
            await this.page.goto(CHATGPT_URL, {
              waitUntil: "domcontentloaded",
              timeout: 60_000,
            });
          } catch {
            /* ignore */
          }
          box = (await this.waitForPrompt(10_000)) || box;
          await this.ensureHighEffort();
          beforeText = /\/c\/[a-z0-9-]+/i.test(this.page.url())
            ? await this.readLastAssistantText()
            : "";
        }
      }
      if (/\/c\/[a-z0-9-]+/i.test(this.page.url()) && beforeText.length > 800) {
        throw new Error(
          "Ancienne conversation encore à l'écran — impossible de démarrer un fil propre"
        );
      }
      console.log(
        `[carto-chat-vps] beforeText chars=${beforeText.length} url=${this.page.url()}`
      );

      await box.click({ timeout: 5000 });
      // Coller le prompt d'un coup (pressSequentially timeout sur les longs textes)
      const pasted = await box
        .evaluate((node, value) => {
          const el = node;
          el.focus();
          // vide
          if (document.execCommand) {
            document.execCommand("selectAll", false);
            document.execCommand("delete", false);
          } else {
            el.textContent = "";
          }
          // insertText = chemin le plus fiable pour ProseMirror / contenteditable
          const ok = document.execCommand("insertText", false, value);
          if (!ok) {
            el.textContent = value;
            el.dispatchEvent(
              new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })
            );
          }
          return (el.innerText || el.textContent || "").length;
        }, prompt)
        .catch(() => 0);
      if (!pasted || pasted < Math.min(40, prompt.length)) {
        // Fallback clavier
        try {
          await box.fill("");
        } catch {
          await this.page.keyboard.press("Control+A").catch(() => {});
          await this.page.keyboard.press("Backspace").catch(() => {});
        }
        await this.page.keyboard.insertText(prompt);
      }
      console.log(
        `[carto-chat-vps] prompt collé ~${pasted || prompt.length} chars`
      );

      // Re-check High juste avant envoi (Chat reset parfois)
      const targetEffort = Number(process.env.CARTO_CHAT_EFFORT_LEVEL || 3);
      await this.ensureHighEffort();
      const effortNow = await this.readEffortLabel();
      if (!this.isEffortAtTarget(effortNow, targetEffort)) {
        console.warn(
          `[carto-chat-vps] envoi malgré effort « ${effortNow} »`
        );
      }

      box = (await this.findPromptHandle()) || box;
      await box.click({ timeout: 3000 }).catch(() => {});

      const send = await this.findSendButton();
      if (send) {
        // ChatGPT = SPA : après Send, Playwright peut rester coincé sur
        // « waiting for scheduled navigations » → ne pas attendre la nav.
        await send.click({ timeout: 5000, noWaitAfter: true });
      } else {
        await box.press("Enter");
      }

      await this._sleep(
        process.env.CARTO_CHAT_TEST_FAST === "1" ? 1 : 1500
      );
      let answer = await this.waitGenerationDone(
        beforeText,
        timeoutMs,
        opts.onProgress,
        endMarker
      );
      // Garantit le bon jeton ; injected=true → worker ne certifie PAS
      const ensured = await this.ensureCorrectEndMarker(answer, endMarker);
      return {
        answer: ensured.answer,
        url: this.page.url(),
        markerInjected: Boolean(ensured.injected),
        markerSource: ensured.source,
      };
    } finally {
      this.busy = false;
    }
  }

  async close() {
    try {
      if (this.mode === "cdp") {
        await this.browser?.close?.().catch(() => {});
      } else {
        await this.context?.close?.().catch(() => {});
      }
    } catch {
      /* ok */
    }
  }
}
