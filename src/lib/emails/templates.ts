/**
 * Templates HTML des emails Glow Up (sans React, pour compatibilité build Next.js/Turbopack).
 * Logo SVG Glow Up (variant light #F5EDE0).
 */
const LOGO_SVG =
  '<svg viewBox="0 0 1314 230" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:180px;height:32px;display:block"><path d="M211.638 134.51L212.167 188.968C160.631 212.839 104.647 183.284 102 110.903C99.1152 35.534 183.5 2.91218 245.81 90.2298L246.604 89.9918L237.657 45.7118C168.783 9.62689 68.3574 36.7236 68.3574 123.301C68.3574 214.848 190.356 241.469 248.192 167.581V107.387H198.456C203.988 114.842 211.664 125.31 211.664 134.51H211.638Z" fill="#F5EDE0"/><path d="M309.47 197.401V32.9962H272.915V207.129H410.134L410.478 173.529C390.414 189.47 350.709 197.401 320.746 197.401H309.443H309.47Z" fill="#F5EDE0"/><path d="M572.049 50.9197C531.312 18.8266 472.417 25.039 439.277 63.3709C406.931 102.443 412.728 158.408 453.2 190.501C493.937 220.849 553.626 215.139 587.004 176.569C618.821 137.999 611.992 81.5324 572.022 50.9461L572.049 50.9197ZM558.126 158.381C526.309 195.444 492.693 211.121 459.023 184.5C434.301 164.858 434.301 122.085 465.852 85.4977C496.875 48.6726 538.909 36.0099 566.781 56.4183C599.127 80.2899 588.883 121.821 558.126 158.408V158.381Z" fill="#F5EDE0"/><path d="M1063.03 34.0007V125.046C1063.03 217.598 945.006 230.525 945.006 126.288V32.9962H907.684V128.773C907.684 237.002 1071.74 238.746 1071.74 126.05V32.9962H1063.06V34.0007H1063.03Z" fill="#F5EDE0"/><path d="M1169.71 32.9962H1094.24V207.129H1130.8V136.73L1169.71 136.492C1213.62 136.255 1244.64 115.106 1244.64 83.4886C1244.64 54.1448 1213.62 32.9962 1169.71 32.9962ZM1152.87 127.504H1130.8V39.7373H1152.87C1189.16 39.7373 1205.71 52.1357 1205.71 80.5014C1205.71 112.357 1189.14 127.504 1152.87 127.504Z" fill="#F5EDE0"/><path d="M870.362 13.1693L850.51 32.9962L857.18 39.658C868.456 51.5013 864.062 64.8514 855.751 81.2416L813.161 166.074L755.854 57.8723L743.228 34.4766L742.434 32.9962H702.2L702.465 33.4985L714.297 54.885L740.846 105.378L710.353 165.836L650.955 57.37L637.799 34.2387L637.005 32.9962H597.036L597.83 34.2387L611.224 58.1102L697.197 210.116H697.727L746.616 113.837L799.714 210.116H800.244L890.161 33.472L890.426 32.9697H890.188L870.336 13.1429L870.362 13.1693Z" fill="#F5EDE0"/></svg>';

const WRAPPER = (title: string, body: string) =>
  `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0">${body}</body>
</html>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
<div style="background-color:#F5EBE0;font-family:Georgia,'Times New Roman',serif;padding:24px;margin:0">
  <div style="background-color:#1A1110;color:#fff;padding:24px 32px;text-align:center">
    <div style="display:inline-block;margin:0 auto">${LOGO_SVG}</div>
    <p style="margin:12px 0 0;font-size:14px;opacity:0.9">Agence d'influence</p>
  </div>
  <div style="background:#fff;margin:24px auto;max-width:560px;padding:32px;border-radius:12px;box-shadow:0 2px 8px rgba(26,17,16,0.08)">
    <p style="color:#1A1110;font-size:16px;line-height:1.6;margin:0 0 20px">Bonjour ${escapeHtml(p.signerName)},</p>
    <p style="color:#1A1110;font-size:16px;line-height:1.6;margin:0 0 24px">Vous avez reçu un devis à signer électroniquement.</p>
    <div style="background:#E8E4E0;border-radius:8px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 8px;color:#1A1110;font-size:14px">📄 Référence : <strong>${escapeHtml(p.documentReference)}</strong></p>
      <p style="margin:0 0 8px;color:#1A1110;font-size:14px">🎯 Collaboration : ${escapeHtml(p.talentPrenom)} ${escapeHtml(p.talentNom)} × ${escapeHtml(p.marqueNom)}</p>
      <p style="margin:0 0 8px;color:#1A1110;font-size:14px">💶 Montant HT : ${escapeHtml(montantStr)}</p>
      <p style="margin:0;color:#1A1110;font-size:14px">📅 Date : ${escapeHtml(p.dateDocument)}</p>
    </div>
    <p style="color:#1A1110;font-size:16px;line-height:1.6;margin:0 0 24px">Cliquez sur le bouton ci-dessous pour consulter et signer votre document de façon sécurisée.</p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${escapeHtml(p.signingUrl)}" style="display:inline-block;background:#C8F285;color:#1A1110;font-weight:700;padding:16px 32px;border-radius:8px;text-decoration:none;font-size:16px">✍️ Signer le document</a>
    </p>
  </div>
  <div style="background:#1A1110;color:#fff;padding:24px 32px;text-align:center;font-size:13px">
    <p style="margin:0 0 4px;font-weight:600">Glow Up Agence</p>
    <p style="margin:0 0 4px;color:#B0A8A3">5 Avenue Jean Moulin, Paris</p>
    <p style="margin:0 0 4px;color:#B0A8A3">SIRET : 92103414600024</p>
    <p style="margin:0;color:#B0A8A3">contact@glowupagence.fr</p>
    <p style="margin:0;margin-top:12px;font-size:11px;color:#B0A8A3;opacity:0.85">Cet email a été envoyé via DocuSeal. Si vous n'attendiez pas ce document, ignorez cet email.</p>
  </div>
</div>`;
  return WRAPPER("Devis à signer", body);
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
<div style="background-color:#F5EBE0;font-family:Georgia,'Times New Roman',serif;padding:24px;margin:0">
  <div style="background-color:#1A1110;color:#fff;padding:24px 32px;text-align:center">
    <div style="display:inline-block;margin:0 auto">${LOGO_SVG}</div>
    <p style="margin:12px 0 0;font-size:14px;opacity:0.9">Agence d'influence</p>
  </div>
  <div style="background:#fff;margin:24px auto;max-width:560px;padding:32px;border-radius:12px;box-shadow:0 2px 8px rgba(26,17,16,0.08)">
    <p style="color:#1A1110;font-size:16px;line-height:1.6;margin:0 0 20px">Bonjour ${escapeHtml(p.recipientName)},</p>
    <p style="color:#0F766E;font-size:17px;font-weight:600;line-height:1.5;margin:0 0 24px">✓ Le devis a été signé par toutes les parties.</p>
    <div style="background:#E8E4E0;border-radius:8px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 8px;color:#1A1110;font-size:14px">📄 Référence : <strong>${escapeHtml(p.documentReference)}</strong></p>
      <p style="margin:0 0 8px;color:#1A1110;font-size:14px">🎯 Collaboration : ${escapeHtml(p.talentPrenom)} ${escapeHtml(p.talentNom)} × ${escapeHtml(p.marqueNom)}</p>
      <p style="margin:0 0 8px;color:#1A1110;font-size:14px">💶 Montant HT : ${escapeHtml(montantStr)}</p>
      <p style="margin:0;color:#1A1110;font-size:14px">📅 Signé le : ${escapeHtml(p.signedAt)}</p>
    </div>
    <p style="color:#1A1110;font-size:16px;line-height:1.6;margin:0 0 24px">Vous pouvez télécharger le document signé via le lien ci-dessous.</p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${escapeHtml(p.signedDocumentUrl)}" style="display:inline-block;background:#C8F285;color:#1A1110;font-weight:700;padding:16px 32px;border-radius:8px;text-decoration:none;font-size:16px">📥 Voir le document signé</a>
    </p>
  </div>
  <div style="background:#1A1110;color:#fff;padding:24px 32px;text-align:center;font-size:13px">
    <p style="margin:0 0 4px;font-weight:600">Glow Up Agence</p>
    <p style="margin:0 0 4px;color:#B0A8A3">5 Avenue Jean Moulin, Paris</p>
    <p style="margin:0 0 4px;color:#B0A8A3">SIRET : 92103414600024</p>
    <p style="margin:0;color:#B0A8A3">contact@glowupagence.fr</p>
  </div>
</div>`;
  return WRAPPER("Devis signé", body);
}
