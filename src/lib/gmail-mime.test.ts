/**
 * Hygiène MIME anti-spam. Lancer : npx tsx src/lib/gmail-mime.test.ts
 */
import {
  buildListUnsubscribeHttpsUrl,
  buildMimeMessage,
  htmlToPlainTextForMime,
  verifyListUnsubscribeToken,
} from "./gmail";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const SAMPLE_HTML =
  '<p>Bonjour <strong>Marie</strong>,</p><p>Voici notre <a href="https://glowupagence.fr">site</a>.</p><br><p>Leyna</p>';

{
  const plain = htmlToPlainTextForMime(SAMPLE_HTML);
  assert(plain.includes("Bonjour Marie"), "plain conserve le texte");
  assert(plain.includes("https://glowupagence.fr"), "plain garde le lien");
  assert(!plain.includes("<strong>"), "plain sans balises");
}

{
  const html = SAMPLE_HTML;
  const mime = buildMimeMessage({
    fromName: "Leyna Khaled",
    fromEmail: "leyna@glowupagence.fr",
    to: "marie@example.com",
    subject: "Collab",
    htmlBody: html,
  });

  assert(mime.includes("multipart/alternative"), "alternative plain+html");
  assert(mime.includes("Content-Type: text/plain; charset=utf-8"), "part plain");
  assert(mime.includes("Content-Type: text/html; charset=utf-8"), "part html");
  assert(mime.includes(html), "HTML recopié tel quel (forme inchangée)");
  assert(mime.includes("List-Unsubscribe:"), "header List-Unsubscribe");
  assert(mime.includes("List-Unsubscribe-Post: List-Unsubscribe=One-Click"), "one-click");
  assert(mime.includes("mailto:leyna@glowupagence.fr"), "mailto unsubscribe");
  assert(!mime.includes('<div style='), "aucun wrapper style injecté");
}

{
  const mime = buildMimeMessage({
    fromName: "Leyna Khaled",
    fromEmail: "leyna@glowupagence.fr",
    to: "marie@example.com",
    subject: "Avec PJ",
    htmlBody: SAMPLE_HTML,
    attachments: [
      {
        filename: "deck.pdf",
        contentType: "application/pdf",
        content: Buffer.from("%PDF-1.4 test"),
      },
    ],
  });
  assert(mime.includes("multipart/mixed"), "mixed avec PJ");
  assert(mime.includes("multipart/alternative"), "alternative dans mixed");
  assert(mime.includes(SAMPLE_HTML), "HTML inchangé avec PJ");
  assert(mime.includes('filename="deck.pdf"'), "PJ présente");
}

{
  const url = buildListUnsubscribeHttpsUrl("Marie@Example.com");
  assert(url.includes("/api/public/unsubscribe?e="), "URL one-click");
  const u = new URL(url);
  const email = Buffer.from(u.searchParams.get("e") || "", "base64url").toString("utf8");
  const sig = u.searchParams.get("s") || "";
  assert(email === "marie@example.com", "email normalisé");
  assert(verifyListUnsubscribeToken(email, sig), "signature valide");
  assert(!verifyListUnsubscribeToken(email, "bad"), "signature invalide rejetée");
}

console.log("gmail-mime.test.ts OK");
