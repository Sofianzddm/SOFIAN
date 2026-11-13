/**
 * Pilote un onglet ChatGPT déjà ouvert (CDP) ou lancé avec profil persistant.
 * Une seule conversation à la fois.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const CHATGPT_URL = process.env.CARTO_CHAT_URL || "https://chatgpt.com/";

/** Doit matcher src/lib/carto-chat-vps/end-marker.ts */
const END_MARKER =
  process.env.CARTO_CHAT_END_MARKER?.trim() || "GLOWUP_CART_DONE_9f3k2x";

function hasEndMarker(text) {
  const esc = END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i").test(text || "");
}

function stripEndMarker(text) {
  const raw = String(text || "");
  if (!hasEndMarker(raw)) return raw.trim();
  const esc = END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Ne pas couper ce qui suit (section LinkedIn hrefs souvent après le jeton)
  return raw
    .replace(new RegExp(`^[ \\t]*${esc}[ \\t]*$`, "gim"), "")
    .replace(new RegExp(`\\s*${esc}\\b`, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

export class ChatGptDriver {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.busy = false;
    this.mode = null;
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
    // Dès le démarrage : Medium / Moyen (pas Instant)
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

  async status() {
    await this.refreshPageHandle();
    const url = this.page?.url?.() || "";
    const loggedIn = await this.isLoggedIn().catch(() => false);
    const hasPrompt = Boolean(await this.findPromptHandle().catch(() => null));
    const lastLen = (await this.readLastAssistantText().catch(() => "")).length;
    return {
      ok: Boolean(this.page),
      mode: this.mode,
      url,
      loggedIn,
      hasPrompt,
      busy: this.busy,
      lastAnswerChars: lastLen,
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
   * UI ChatGPT actuelle (FR/EN) : « ChatGPT a dit : » / « ChatGPT said: »
   * + href LinkedIn (innerText perd les liens « Profil »).
   */
  async readLastAssistantText() {
    await this.refreshPageHandle();
    const payload = await this.page.evaluate(() => {
      const clean = (s) => (s || "").replace(/\u00a0/g, " ").trim();

      const normalizeLi = (href) => {
        try {
          const u = new URL(href, location.origin);
          if (!/linkedin\.com/i.test(u.hostname)) return null;
          // profils personnes
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
        // contexte autour du lien (nom souvent juste avant « Profil »)
        const block = clean(
          (a.closest("li, tr, p, div") || a.parentElement)?.innerText || ""
        ).slice(0, 220);
        const label = clean(a.innerText || a.getAttribute("aria-label") || "");
        linkRows.push({ href, label, block });
      }

      const candidates = [
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

      const raw = candidates[0] || clean(document.body?.innerText || "");
      let text = "";

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

      if (!text) {
        const byRole = Array.from(
          document.querySelectorAll(
            '[data-message-author-role="assistant"], [data-testid="assistant-message"]'
          )
        )
          .map((el) => clean(el.innerText))
          .filter((t) => t.length > 40);
        if (byRole.length) text = byRole[byRole.length - 1];
      }

      return { text: text || "", links: linkRows };
    });

    let text = (payload?.text || "").trim();
    const links = Array.isArray(payload?.links) ? payload.links : [];
    if (links.length) {
      // Filtre liens cités / proches de la réponse (évite toute la sidebar)
      const relevant = links.filter((l) => {
        const blob = `${l.block || ""} ${l.label || ""} ${text}`.toLowerCase();
        // garde si le bloc autour mentionne un fragment de la réponse
        // ou label Profil / LinkedIn
        if (/profil|linkedin|profile/i.test(l.label || "")) return true;
        if ((l.block || "").length > 20 && text.length > 80) {
          // overlap grossier: un mot du bloc (nom) apparaît dans la réponse
          const tokens = (l.block || "")
            .split(/\s+/)
            .map((t) => t.replace(/[^a-zA-ZÀ-ÿ-]/g, ""))
            .filter((t) => t.length >= 4);
          return tokens.some((t) => text.toLowerCase().includes(t.toLowerCase()));
        }
        return /\/in\//.test(l.href);
      });

      const lines = relevant.slice(0, 30).map((l) => {
        const who = (l.block || l.label || "")
          .replace(/\s+/g, " ")
          .slice(0, 160);
        return `- ${who}\n  ${l.href}`;
      });
      if (lines.length) {
        text = `${text}\n\n## LinkedIn URLs (hrefs page)\n${lines.join("\n")}`;
      }
    }
    return text.trim();
  }

  /**
   * Source de vérité = croissance puis STABILITÉ du texte (pas le bouton Stop).
   * Stop n'est qu'un hint : trop de faux positifs → lab bloqué alors que Chat a fini.
   */
  async waitGenerationDone(prevText, timeoutMs, onProgress) {
    const started = Date.now();
    let stableHits = 0;
    let lastLen = -1;
    let last = "";
    let best = "";
    const prev = prevText || "";
    let sawGrowth = false;
    let peakLen = prev.length;

    const isNew = (text) =>
      !prev ||
      prev.length < 200 ||
      (text.length >= peakLen + 150 && text !== prev) ||
      (text.length > prev.length + 200 &&
        !text.startsWith((prev || "").slice(0, 80)));

    while (Date.now() - started < timeoutMs) {
      const generating = await this.isGenerating().catch(() => false);
      const searching = await this.isWebSearching().catch(() => false);
      const text = await this.readLastAssistantText();
      const elapsed = Date.now() - started;
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
        await sleep(700);
        continue;
      }

      if (len > best.length) best = text;
      if (len > peakLen + 40) {
        peakLen = len;
        sawGrowth = true;
      }

      // ★ Jeton de fin dans le prompt → dès qu'il apparaît, c'est fini
      if (hasEndMarker(text) && isNew(text)) {
        await sleep(400);
        const final = await this.readLastAssistantText();
        if (hasEndMarker(final)) {
          console.log(
            `[carto-chat-vps] CAPTURE via END_MARKER chars=${final.length}`
          );
          return stripEndMarker(final);
        }
      }

      // Pendant « Searching N websites » : le texte intro peut être figé
      // → on NE compte PAS les 15s stables (sinon on sort trop tôt).
      if (searching) {
        stableHits = 0;
        lastLen = len;
        if (elapsed > 8_000 && elapsed % 14_000 < 800) {
          console.log(
            `[carto-chat-vps] web search en cours… chars=${len} (chrono stable en pause)`
          );
        }
        await sleep(1000);
        continue;
      }

      if (len > lastLen + 25) {
        // encore en train d'écrire
        stableHits = 0;
        lastLen = len;
        last = text;
        if (elapsed > 5_000) {
          console.log(
            `[carto-chat-vps] streaming… chars=${len} gen=${generating} stable=0`
          );
        }
      } else if (len >= 350 && Math.abs(len - lastLen) <= 25) {
        stableHits += 1;
        lastLen = len;
        last = text.length >= last.length ? text : last;
        if (stableHits === 1 || stableHits % 5 === 0) {
          console.log(
            `[carto-chat-vps] stable… chars=${len} hits=${stableHits}/20 (~15s) gen=${generating}`
          );
        }
      } else if (len > lastLen) {
        lastLen = len;
        last = text;
        stableHits = 0;
      }

      if (!isNew(text) || !sawGrowth) {
        await sleep(700);
        continue;
      }

      // ★ FIN : plus de Searching + texte stable ~15s + assez de contenu
      // boucle ~700ms → 15s ≈ 22 hits (20 = marge)
      const STABLE_15S = 20;
      const stopGone = !generating;
      const meatyEnough =
        len >= 1200 ||
        /linkedin\.com\/in\//i.test(text) ||
        /##\s*1\.|##\s*Marque|Agence/i.test(text);
      const doneStable15 =
        stableHits >= STABLE_15S &&
        meatyEnough &&
        (stopGone || elapsed > 60_000);

      if (doneStable15) {
        await sleep(600);
        // re-check search au cas où une 2e vague démarre
        if (await this.isWebSearching().catch(() => false)) {
          stableHits = 0;
          await sleep(1000);
          continue;
        }
        const final = await this.readLastAssistantText();
        console.log(
          `[carto-chat-vps] CAPTURE chars=${final.length} hits=${stableHits} (~15s stable, search off)`
        );
        return stripEndMarker(
          final.length >= 200 ? final : last || best
        );
      }

      await sleep(700);
    }

    const fallback = (await this.readLastAssistantText()) || best;
    if (hasEndMarker(fallback)) {
      console.log(
        `[carto-chat-vps] capture timeout+marker chars=${fallback.length}`
      );
      return stripEndMarker(fallback);
    }
    if (fallback.length > 200 && isNew(fallback) && sawGrowth) {
      console.log(
        `[carto-chat-vps] capture timeout-fallback chars=${fallback.length}`
      );
      return stripEndMarker(fallback);
    }
    throw new Error("Timeout: réponse Chat non lue");
  }

  /** Lit la réponse déjà affichée (sans renvoyer de prompt). */
  async readLatest() {
    await this.refreshPageHandle();
    let answer = await this.readLastAssistantText();
    if (!answer || answer.length < 40) {
      await this.openLatestConversation();
      answer = await this.readLastAssistantText();
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
   * Force Effort (défaut Medium / Moyen = cran 2/5).
   * CARTO_CHAT_EFFORT_LEVEL: 1 Instant … 2 Medium … 3 High … 4 Extra … 5 Pro
   * Ne pas cliquer « Verrouillé » : ça ferme le menu Puissance.
   */
  async ensureHighEffort() {
    const TARGET = Number(process.env.CARTO_CHAT_EFFORT_LEVEL || 2); // 2 = Medium/Moyen
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

  async ask(prompt, opts = {}) {
    if (this.busy) throw new Error("Chat déjà occupé — réessaie dans un instant");
    this.busy = true;
    const timeoutMs = Number(
      opts.timeoutMs || process.env.CARTO_CHAT_TIMEOUT_MS || 240_000
    );
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

      // Medium après nouveau chat (sinon Instant revient)
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

      // Re-check Medium juste avant envoi (Chat reset parfois)
      const targetEffort = Number(process.env.CARTO_CHAT_EFFORT_LEVEL || 2);
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
      if (send) await send.click({ timeout: 5000 });
      else await box.press("Enter");

      await sleep(1500);
      const answer = await this.waitGenerationDone(
        beforeText,
        timeoutMs,
        opts.onProgress
      );
      return { answer, url: this.page.url() };
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
