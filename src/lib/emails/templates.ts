/**
 * Templates HTML des emails Glow Up — couleurs de la marque (login / charte).
 * Logo en data URI base64 pour affichage dans Gmail (évite blocage images externes).
 */
const LOGO_SVG =
  '<svg viewBox="0 0 1314 230" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M211.638 134.51L212.167 188.968C160.631 212.839 104.647 183.284 102 110.903C99.1152 35.534 183.5 2.91218 245.81 90.2298L246.604 89.9918L237.657 45.7118C168.783 9.62689 68.3574 36.7236 68.3574 123.301C68.3574 214.848 190.356 241.469 248.192 167.581V107.387H198.456C203.988 114.842 211.664 125.31 211.664 134.51H211.638Z" fill="#F5EDE0"/><path d="M309.47 197.401V32.9962H272.915V207.129H410.134L410.478 173.529C390.414 189.47 350.709 197.401 320.746 197.401H309.443H309.47Z" fill="#F5EDE0"/><path d="M572.049 50.9197C531.312 18.8266 472.417 25.039 439.277 63.3709C406.931 102.443 412.728 158.408 453.2 190.501C493.937 220.849 553.626 215.139 587.004 176.569C618.821 137.999 611.992 81.5324 572.022 50.9461L572.049 50.9197ZM558.126 158.381C526.309 195.444 492.693 211.121 459.023 184.5C434.301 164.858 434.301 122.085 465.852 85.4977C496.875 48.6726 538.909 36.0099 566.781 56.4183C599.127 80.2899 588.883 121.821 558.126 158.408V158.381Z" fill="#F5EDE0"/><path d="M1063.03 34.0007V125.046C1063.03 217.598 945.006 230.525 945.006 126.288V32.9962H907.684V128.773C907.684 237.002 1071.74 238.746 1071.74 126.05V32.9962H1063.06V34.0007H1063.03Z" fill="#F5EDE0"/><path d="M1169.71 32.9962H1094.24V207.129H1130.8V136.73L1169.71 136.492C1213.62 136.255 1244.64 115.106 1244.64 83.4886C1244.64 54.1448 1213.62 32.9962 1169.71 32.9962ZM1152.87 127.504H1130.8V39.7373H1152.87C1189.16 39.7373 1205.71 52.1357 1205.71 80.5014C1205.71 112.357 1189.14 127.504 1152.87 127.504Z" fill="#F5EDE0"/><path d="M870.362 13.1693L850.51 32.9962L857.18 39.658C868.456 51.5013 864.062 64.8514 855.751 81.2416L813.161 166.074L755.854 57.8723L743.228 34.4766L742.434 32.9962H702.2L702.465 33.4985L714.297 54.885L740.846 105.378L710.353 165.836L650.955 57.37L637.799 34.2387L637.005 32.9962H597.036L597.83 34.2387L611.224 58.1102L697.197 210.116H697.727L746.616 113.837L799.714 210.116H800.244L890.161 33.472L890.426 32.9697H890.188L870.336 13.1429L870.362 13.1693Z" fill="#F5EDE0"/></svg>';

const LOGO_DATA_URI =
  typeof Buffer !== "undefined"
    ? `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG, "utf-8").toString("base64")}`
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;

const LOGO_IMG = `<img src="${LOGO_DATA_URI}" alt="Glow Up" width="200" height="36" style="display:block;width:200px;height:36px" />`;

// Police officielle Glow Up (alignée sur la plateforme — globals.css)
const FONT_FAMILY =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const WRAPPER = (title: string, body: string) =>
  `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background-color:#F5EDE0;font-family:${FONT_FAMILY}">${body}</body>
</html>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Couleurs Glow Up (alignées login / charte)
const C = {
  licorice: "#220101",
  rose: "#B06F70",
  lace: "#F5EDE0",
  laceDark: "#E8DED0",
  white: "#FFFFFF",
} as const;

export interface SignatureRequestParams {
  signerName: string;
  documentReference: string;
  talentPrenom: string;
  talentNom: string;
  marqueNom: string;
  montantHT: string | number;
  dateDocument: string;
  signingUrl: string;
}

export function getSignatureRequestHtml(p: SignatureRequestParams): string {
  const montantStr = typeof p.montantHT === "number" ? `${p.montantHT} €` : `${p.montantHT}`;
  const body = `
<div style="background:linear-gradient(180deg, #220101 0%, #3D1515 100%);font-family:${FONT_FAMILY};padding:0;margin:0;min-height:100%">
  <div style="padding:32px 24px 28px;text-align:center">
    <div style="display:inline-block">${LOGO_IMG}</div>
    <p style="margin:14px 0 0;font-size:13px;color:${C.lace};opacity:0.9;letter-spacing:0.05em">Agence d'influence</p>
  </div>
  <div style="max-width:560px;margin:0 auto 32px;padding:0 24px">
    <div style="background:${C.white};border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(34,1,1,0.12);border:1px solid rgba(176,111,112,0.15)">
      <p style="color:${C.licorice};font-size:17px;line-height:1.6;margin:0 0 8px;font-family:${FONT_FAMILY}">Bonjour ${escapeHtml(p.signerName)},</p>
      <p style="color:${C.licorice};font-size:15px;line-height:1.6;margin:0 0 24px;opacity:0.9">Vous avez reçu un devis à signer électroniquement.</p>
      <div style="background:${C.laceDark};border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid ${C.rose}">
        <p style="margin:0 0 10px;color:${C.licorice};font-size:14px">📄 Référence : <strong>${escapeHtml(p.documentReference)}</strong></p>
        <p style="margin:0 0 10px;color:${C.licorice};font-size:14px">🎯 Collaboration : ${escapeHtml(p.talentPrenom)} ${escapeHtml(p.talentNom)} × ${escapeHtml(p.marqueNom)}</p>
        <p style="margin:0 0 10px;color:${C.licorice};font-size:14px">💶 Montant HT : ${escapeHtml(montantStr)}</p>
        <p style="margin:0;color:${C.licorice};font-size:14px">📅 Date : ${escapeHtml(p.dateDocument)}</p>
      </div>
      <p style="color:${C.licorice};font-size:15px;line-height:1.6;margin:0 0 28px">Cliquez sur le bouton ci-dessous pour consulter et signer votre document de façon sécurisée.</p>
      <p style="text-align:center;margin:0">
        <a href="${escapeHtml(p.signingUrl)}" style="display:inline-block;background:${C.rose};color:${C.lace};font-weight:600;padding:16px 36px;border-radius:12px;text-decoration:none;font-size:16px;box-shadow:0 2px 12px rgba(176,111,112,0.35)">✍️ Signer le document</a>
      </p>
    </div>
  </div>
  <div style="background:${C.licorice};color:${C.lace};padding:28px 24px;text-align:center;font-size:13px">
    <p style="margin:0 0 6px;font-weight:600;font-size:14px">Glow Up Agence</p>
    <p style="margin:0 0 4px;opacity:0.9">1330 avenue Jean-René Guillibert Gautier de La Lauzière, 13290 Aix-en-Provence</p>
    <p style="margin:0 0 4px;opacity:0.9">SIRET : 921 034 146 00024</p>
    <p style="margin:0 0 12px;opacity:0.9"><a href="mailto:contact@glowupagence.fr" style="color:${C.lace};text-decoration:none">contact@glowupagence.fr</a></p>
    <p style="margin:0;font-size:11px;opacity:0.7">© ${new Date().getFullYear()} Glow Up Agence. Tous droits réservés.</p>
    <p style="margin:12px 0 0;font-size:11px;opacity:0.6">Cet email a été envoyé via notre plateforme. Si vous n'attendiez pas ce document, vous pouvez l'ignorer.</p>
  </div>
</div>`;
  return WRAPPER("Devis à signer — Glow Up Agence", body);
}

export interface SignatureCompletedParams {
  recipientName: string;
  documentReference: string;
  talentPrenom: string;
  talentNom: string;
  marqueNom: string;
  montantHT: string | number;
  signedAt: string;
  signedDocumentUrl: string;
}

export function getSignatureCompletedHtml(p: SignatureCompletedParams): string {
  const montantStr = typeof p.montantHT === "number" ? `${p.montantHT} €` : `${p.montantHT}`;
  const body = `
<div style="background:linear-gradient(180deg, #220101 0%, #3D1515 100%);font-family:${FONT_FAMILY};padding:0;margin:0;min-height:100%">
  <div style="padding:32px 24px 28px;text-align:center">
    <div style="display:inline-block">${LOGO_IMG}</div>
    <p style="margin:14px 0 0;font-size:13px;color:${C.lace};opacity:0.9;letter-spacing:0.05em">Agence d'influence</p>
  </div>
  <div style="max-width:560px;margin:0 auto 32px;padding:0 24px">
    <div style="background:${C.white};border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(34,1,1,0.12);border:1px solid rgba(176,111,112,0.15)">
      <p style="color:${C.licorice};font-size:17px;line-height:1.6;margin:0 0 8px;font-family:${FONT_FAMILY}">Bonjour ${escapeHtml(p.recipientName)},</p>
      <p style="color:#0F766E;font-size:17px;font-weight:600;line-height:1.5;margin:0 0 24px">✓ Le devis a été signé par toutes les parties.</p>
      <div style="background:${C.laceDark};border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid ${C.rose}">
        <p style="margin:0 0 10px;color:${C.licorice};font-size:14px">📄 Référence : <strong>${escapeHtml(p.documentReference)}</strong></p>
        <p style="margin:0 0 10px;color:${C.licorice};font-size:14px">🎯 Collaboration : ${escapeHtml(p.talentPrenom)} ${escapeHtml(p.talentNom)} × ${escapeHtml(p.marqueNom)}</p>
        <p style="margin:0 0 10px;color:${C.licorice};font-size:14px">💶 Montant HT : ${escapeHtml(montantStr)}</p>
        <p style="margin:0;color:${C.licorice};font-size:14px">📅 Signé le : ${escapeHtml(p.signedAt)}</p>
      </div>
      <p style="color:${C.licorice};font-size:15px;line-height:1.6;margin:0 0 28px">Vous pouvez télécharger le document signé via le lien ci-dessous.</p>
      <p style="text-align:center;margin:0">
        <a href="${escapeHtml(p.signedDocumentUrl)}" style="display:inline-block;background:${C.rose};color:${C.lace};font-weight:600;padding:16px 36px;border-radius:12px;text-decoration:none;font-size:16px;box-shadow:0 2px 12px rgba(176,111,112,0.35)">📥 Voir le document signé</a>
      </p>
    </div>
  </div>
  <div style="background:${C.licorice};color:${C.lace};padding:28px 24px;text-align:center;font-size:13px">
    <p style="margin:0 0 6px;font-weight:600;font-size:14px">Glow Up Agence</p>
    <p style="margin:0 0 4px;opacity:0.9">1330 avenue Jean-René Guillibert Gautier de La Lauzière, 13290 Aix-en-Provence</p>
    <p style="margin:0 0 4px;opacity:0.9">SIRET : 921 034 146 00024</p>
    <p style="margin:0 0 12px;opacity:0.9"><a href="mailto:contact@glowupagence.fr" style="color:${C.lace};text-decoration:none">contact@glowupagence.fr</a></p>
    <p style="margin:0;font-size:11px;opacity:0.7">© ${new Date().getFullYear()} Glow Up Agence. Tous droits réservés.</p>
  </div>
</div>`;
  return WRAPPER("Devis signé — Glow Up Agence", body);
}
