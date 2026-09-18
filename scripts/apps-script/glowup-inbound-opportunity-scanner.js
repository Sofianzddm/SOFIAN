/**
 * ════════════════════════════════════════════════════════════════════
 *  GLOW UP — INBOUND OPPORTUNITY SCANNER
 *  Analyse les boîtes talents et pousse les opportunités
 *  vers /api/inbound/opportunities
 *  Claude classifie en regardant le FIL ENTIER, pas juste le dernier mail
 * ════════════════════════════════════════════════════════════════════
 */

// Secrets via Apps Script → Project Settings → Script properties
function _prop(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Missing Script property: ' + key);
  return v;
}
const GLOW_UP_API_SECRET = () => _prop('GLOW_UP_API_SECRET');
const INBOUND_API_SECRET = () => _prop('INBOUND_API_SECRET'); // casting only — ne pas utiliser pour push inbound
const ANTHROPIC_API_KEY = () => _prop('ANTHROPIC_API_KEY');
const SERVICE_ACCOUNT_EMAIL = 'glow-up-mail-scanner@glow-up-platform.iam.gserviceaccount.com';
const SERVICE_ACCOUNT_PRIVATE_KEY = () => _prop('SERVICE_ACCOUNT_PRIVATE_KEY');

const GLOW_UP_API_URL = 'https://app.glowupagence.fr';
const SCAN_GROUP_EMAIL = 'talents-scan@glowupagence.fr';
const WORKSPACE_ADMIN_EMAIL = 's.zeddam@glowupagence.fr';

/** Boîtes absentes / suspendues dans Workspace — skip avant même l'oauth. */
const SKIP_MAILBOXES = {
  'kelly@glowupagence.fr': true
};

const CONFIG = {
  scanWindowMinutes: 10080,
  minConfidence: 0.7,
  maxBodyLength: 3000,
  maxThreadBodyLength: 1500,
  maxMailsPerInbox: 200,
  blacklistDomains: [
    'mailchimp.com', 'sendgrid.net', 'amazonses.com',
    'notifications.google.com', 'no-reply', 'noreply',
    'newsletter', 'mailer-daemon', 'postmaster',
    'docusign.net', 'docuseal.', 'resend.com', 'hubspot.com',
    'instagram.com', 'tiktok.com', 'youtube.com',
    'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
    'shopify.com', 'stripe.com', 'qonto.com'
  ]
};

function scanAllTalentInboxes() {
  const startTime = Date.now();
  const props = PropertiesService.getScriptProperties();
  const lastScan = parseInt(props.getProperty('lastScanTimestamp') || '0');
  const now = Date.now();
  const sinceTimestamp = lastScan || (now - CONFIG.scanWindowMinutes * 60 * 1000);

  Logger.log('🔍 SCAN START — depuis ' + new Date(sinceTimestamp).toISOString());

  let talentEmails;
  try {
    talentEmails = fetchTalentEmailsFromGroup();
    Logger.log('📋 ' + talentEmails.length + ' talents dans le groupe ' + SCAN_GROUP_EMAIL);
  } catch (e) {
    Logger.log('❌ Impossible de lister le groupe : ' + e.toString());
    return;
  }

  let totalProcessed = 0, totalDetected = 0, totalPushed = 0;
  let boxesOk = 0, boxesSkipped = 0, boxesError = 0;

  talentEmails.forEach(function (email) {
    if (SKIP_MAILBOXES[String(email || '').toLowerCase()]) {
      boxesSkipped++;
      Logger.log('⏭️ Skip ' + email + ' : exclus (boîte Workspace absente)');
      return;
    }
    try {
      const talent = {
        email: email,
        prenom: email.split('@')[0].split('.')[0],
        nom: (email.split('@')[0].split('.')[1] || ''),
      };
      const result = scanInboxForTalent(talent, sinceTimestamp);
      if (result.skipped) {
        boxesSkipped++;
      } else {
        boxesOk++;
        totalProcessed += result.processed;
        totalDetected += result.detected;
        totalPushed += result.pushed;
      }
    } catch (e) {
      if (isUnreachableMailboxError(e)) {
        boxesSkipped++;
        Logger.log('⏭️ Skip ' + email + ' : boîte introuvable / inactive dans Workspace');
      } else {
        boxesError++;
        Logger.log('❌ Erreur sur ' + email + ' : ' + e.toString());
      }
    }
  });

  props.setProperty('lastScanTimestamp', now.toString());
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  Logger.log(
    '✅ SCAN END — ' +
      boxesOk + ' boîtes OK, ' + boxesSkipped + ' skip, ' + boxesError + ' erreurs | ' +
      totalProcessed + ' analysés, ' + totalDetected + ' opportunités, ' + totalPushed +
      ' poussées en ' + durationSec + 's'
  );
}

/**
 * Liste les boîtes à scanner via l'API Glow Up (plus fiable que Directory API).
 * Filtre @glowupagence.fr uniquement (impersonation Gmail Workspace).
 */
function fetchTalentEmailsFromGroup() {
  const resp = UrlFetchApp.fetch(GLOW_UP_API_URL + '/api/inbound/talents', {
    headers: { Authorization: 'Bearer ' + INBOUND_API_SECRET() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Inbound talents API ' + resp.getResponseCode() + ' : ' + resp.getContentText());
  }
  const data = JSON.parse(resp.getContentText());
  const emails = (data.talents || [])
    .map(function (t) { return String(t.email || '').trim(); })
    .filter(function (email) {
      return email && email.toLowerCase().endsWith('@glowupagence.fr');
    });
  // dédoublonne en conservant l'ordre
  const seen = {};
  return emails.filter(function (email) {
    const key = email.toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function isUnreachableMailboxError(e) {
  const msg = (e && e.message) ? e.message : String(e || '');
  return (
    msg.indexOf('UNREACHABLE_MAILBOX') !== -1 ||
    msg.indexOf('invalid_grant') !== -1 ||
    msg.indexOf('Invalid email or User ID') !== -1
  );
}

function scanInboxForTalent(talent, sinceTimestamp) {
  const accessToken = getAccessTokenForUser(talent.email, [
    'https://www.googleapis.com/auth/gmail.readonly'
  ]);
  if (!accessToken) {
    Logger.log('⏭️ Skip ' + talent.email + ' : boîte introuvable / inactive dans Workspace');
    return { processed: 0, detected: 0, pushed: 0, skipped: true };
  }

  const sinceSec = Math.floor(sinceTimestamp / 1000);
  const query = 'in:inbox -from:me -category:promotions -category:social after:' + sinceSec;
  const listUrl = 'https://gmail.googleapis.com/gmail/v1/users/' + encodeURIComponent(talent.email) + '/messages?q=' + encodeURIComponent(query) + '&maxResults=' + CONFIG.maxMailsPerInbox;

  const listResp = UrlFetchApp.fetch(listUrl, {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });

  if (listResp.getResponseCode() !== 200) {
    Logger.log('   ⚠️ ' + talent.email + ' : list failed ' + listResp.getResponseCode());
    return { processed: 0, detected: 0, pushed: 0 };
  }

  const messages = JSON.parse(listResp.getContentText()).messages || [];
  if (messages.length === 0) return { processed: 0, detected: 0, pushed: 0 };

  const props = PropertiesService.getScriptProperties();
  let processed = 0, detected = 0, pushed = 0;

  messages.forEach(function (msg) {
    try {
      const processedKey = 'processed_' + msg.id;
      if (props.getProperty(processedKey)) {
        return;
      }

      const msgUrl = 'https://gmail.googleapis.com/gmail/v1/users/' + encodeURIComponent(talent.email) + '/messages/' + msg.id + '?format=full';
      const msgResp = UrlFetchApp.fetch(msgUrl, {
        headers: { Authorization: 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      if (msgResp.getResponseCode() !== 200) return;

      const parsed = parseGmailMessage(JSON.parse(msgResp.getContentText()));
      processed++;

      if (parsed.receivedAt < sinceTimestamp) return;

      // Skip blacklist : ne PAS écrire en ScriptProperties (évite le quota).
      if (shouldSkipMail(parsed)) return;

      const threadMessages = parsed.threadId
        ? fetchThreadMessages(talent.email, parsed.threadId, accessToken)
        : [];

      const classification = classifyWithClaude(parsed, talent, threadMessages);
      if (!classification) return;

      const isOpportunity =
        ['COLLAB_PAID', 'COLLAB_GIFTING'].includes(classification.category) &&
        classification.confidence >= CONFIG.minConfidence;

      if (isOpportunity) {
        detected++;
        if (pushToGlowUp(parsed, talent, classification)) {
          // Marquer UNIQUEMENT après push OK
          props.setProperty(processedKey, 'pushed');
          pushed++;
          Logger.log('   ✅ Push [' + classification.category + '] : ' + parsed.senderEmail + ' → ' + talent.email + ' : ' + parsed.subject.substring(0, 50));
        }
      } else {
        props.setProperty(processedKey, 'not_opportunity');
      }
    } catch (e) {
      Logger.log('   ❌ Erreur message ' + msg.id + ' : ' + e.toString());
    }
  });

  if (processed > 0) {
    Logger.log('   📬 ' + talent.email + ' : ' + processed + ' analysés, ' + detected + ' opportunités, ' + pushed + ' poussées');
  }
  return { processed: processed, detected: detected, pushed: pushed };
}

function fetchThreadMessages(talentEmail, threadId, accessToken) {
  try {
    const url = 'https://gmail.googleapis.com/gmail/v1/users/' +
      encodeURIComponent(talentEmail) +
      '/threads/' + threadId + '?format=full';

    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return [];

    const data = JSON.parse(resp.getContentText());
    const talentLower = talentEmail.toLowerCase();

    return (data.messages || []).map(function (m) {
      const headers = {};
      (m.payload.headers || []).forEach(function (h) {
        headers[h.name.toLowerCase()] = h.value;
      });
      const fromRaw = headers['from'] || '';
      const fromEmail = (fromRaw.match(/<(.+?)>/) || [null, fromRaw])[1] || fromRaw;
      return {
        from: fromRaw,
        isFromTalent: fromEmail.toLowerCase().indexOf(talentLower) !== -1,
        date: new Date(parseInt(m.internalDate)).toISOString(),
        subject: headers['subject'] || '',
        body: extractBody(m.payload).substring(0, CONFIG.maxThreadBodyLength)
      };
    });
  } catch (e) {
    Logger.log('   ⚠️ fetchThreadMessages failed : ' + e.toString());
    return [];
  }
}

function parseGmailMessage(message) {
  const headers = {};
  message.payload.headers.forEach(function (h) { headers[h.name.toLowerCase()] = h.value; });
  const fromRaw = headers['from'] || '';
  const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) || [null, '', fromRaw];
  const senderName = (fromMatch[1] || '').replace(/^"|"$/g, '').trim();
  const senderEmail = (fromMatch[2] || fromRaw).trim();
  const senderDomain = (senderEmail.split('@')[1] || '').toLowerCase();
  return {
    gmailMessageId: message.id,
    threadId: message.threadId,
    senderName: senderName,
    senderEmail: senderEmail,
    senderDomain: senderDomain,
    subject: headers['subject'] || '(sans sujet)',
    body: extractBody(message.payload),
    receivedAt: parseInt(message.internalDate),
    headers: headers
  };
}

function extractBody(payload) {
  let body = '';
  function decode(data) {
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(data)).getDataAsString('UTF-8');
  }
  function walk(part) {
    if (part.body && part.body.data && part.mimeType === 'text/plain') {
      body += decode(part.body.data);
    } else if (part.parts) {
      part.parts.forEach(walk);
    } else if (part.body && part.body.data && part.mimeType === 'text/html' && !body) {
      const html = decode(part.body.data);
      body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  walk(payload);
  return body.substring(0, CONFIG.maxBodyLength);
}

function shouldSkipMail(parsed) {
  const h = parsed.headers;
  if (h['list-unsubscribe']) return true;
  if (h['precedence'] === 'bulk' || h['precedence'] === 'list') return true;
  if (h['auto-submitted'] && h['auto-submitted'] !== 'no') return true;
  if (h['x-autoreply'] || h['x-autorespond']) return true;
  const senderLower = parsed.senderEmail.toLowerCase();
  for (const blocked of CONFIG.blacklistDomains) {
    if (senderLower.includes(blocked)) return true;
  }
  if (parsed.body.length < 30) return true;
  return false;
}

function classifyWithClaude(parsed, talent, threadMessages) {
  const messages = threadMessages && threadMessages.length > 0 ? threadMessages : [{
    from: parsed.senderName + ' <' + parsed.senderEmail + '>',
    isFromTalent: false,
    date: new Date(parsed.receivedAt).toISOString(),
    subject: parsed.subject,
    body: parsed.body
  }];

  const threadText = messages.map(function (m, i) {
    const who = m.isFromTalent ? '[TALENT ' + talent.email + ']' : '[CONTACT EXTERNE]';
    return '--- Message ' + (i + 1) + '/' + messages.length + ' — ' + m.date + ' — ' + who + ' ' + m.from + ' ---\n' +
           'Sujet : ' + m.subject + '\n' +
           m.body;
  }).join('\n\n');

  const prompt =
'Tu es un classifieur de mails pour Glow Up Agence (agence d\'influenceurs).\n' +
'Le talent "' + talent.prenom + ' ' + talent.nom + '" (' + talent.email + ') reçoit des mails de marques.\n\n' +
'OBJECTIF : analyser le FIL ENTIER (pas juste le dernier mail) pour déterminer la NATURE ORIGINELLE du deal.\n' +
'Tu dois retracer la conversation depuis le premier message pour comprendre s\'il s\'agit d\'une collab payée, d\'un gifting, etc.\n\n' +
'FIL DE DISCUSSION COMPLET (' + messages.length + ' message' + (messages.length > 1 ? 's' : '') + ', du plus ancien au plus récent) :\n\n' +
threadText + '\n\n' +
'INSTRUCTIONS :\n' +
'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans markdown.\n\n' +
'Schéma :\n' +
'{\n' +
'  "category": "COLLAB_PAID" | "COLLAB_GIFTING" | "PRESS_KIT" | "EVENT_INVITE" | "OTHER",\n' +
'  "confidence": 0.0 à 1.0,\n' +
'  "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",\n' +
'  "extractedBrand": string ou null,\n' +
'  "extractedTopic": string ou null,\n' +
'  "extractedBudget": string ou null (ex: "5000€", "3-5k€"),\n' +
'  "extractedDeadline": string ou null,\n' +
'  "extractedDeliverables": string ou null (ex: "1 reel + 3 stories"),\n' +
'  "briefSummary": string (1-2 phrases résumant LA NATURE DU DEAL, pas juste le dernier mail)\n' +
'}\n\n' +
'RÈGLES DE CLASSIFICATION (basées sur le PREMIER message de la marque, pas le dernier) :\n' +
'- COLLAB_PAID : la marque propose (ou a proposé) une collab RÉMUNÉRÉE. Indices : "budget", "tarif", "rémunération", "honoraires", "facture", "devis", "k€", "€", "paiement". Même si le dernier message ne parle que de logistique/facture, si l\'origine était un deal payé → COLLAB_PAID.\n' +
'- COLLAB_GIFTING : la marque propose un envoi PRODUIT GRATUIT en échange de contenu, SANS rémunération. Mots-clés : "gifting", "envoi", "cadeau", "test produit", "découverte", "sample".\n' +
'- PRESS_KIT : envoi d\'infos / dossier presse / lancement produit, sans demande de contenu précise.\n' +
'- EVENT_INVITE : invitation à un événement (lancement, soirée, voyage presse) sans brief collab détaillé.\n' +
'- OTHER : fan, démarchage non commercial, recrutement, perso, spam non filtré, ou collab dont la nature est totalement indéterminable depuis le fil.\n\n' +
'IMPORTANT :\n' +
'- Lis TOUS les messages, surtout le PREMIER (souvent c\'est là que la nature du deal est annoncée).\n' +
'- Si le dernier mail est un "Re:" administratif (facture, livraison) mais que la collab d\'origine était payée → reste COLLAB_PAID.\n' +
'- Si le talent a déjà répondu plusieurs fois dans le fil, c\'est une conversation engagée — garde la catégorie d\'origine, ne dégrade pas en OTHER.\n' +
'- Si tu hésites entre COLLAB_PAID et COLLAB_GIFTING, regarde si un budget/montant est mentionné quelque part dans le fil → COLLAB_PAID.\n' +
'- Confidence > 0.85 si certain, 0.7-0.85 si probable, < 0.7 si incertain.\n' +
'- Priority HIGH/URGENT si grosse marque OU budget > 5k€ OU deadline < 7j.';

  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY(),
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('   ⚠️ Claude API ' + response.getResponseCode() + ' : ' + response.getContentText().substring(0, 200));
      return null;
    }

    const data = JSON.parse(response.getContentText());
    const text = data.content[0].text.trim();
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    Logger.log('   ❌ Classification Claude failed : ' + e.toString());
    return null;
  }
}

function pushToGlowUp(parsed, talent, classification) {
  let category = classification.category;
  if (!['COLLAB_PAID', 'COLLAB_GIFTING', 'PRESS_KIT', 'EVENT_INVITE', 'OTHER'].includes(category)) {
    category = 'OTHER';
  }

  const payload = {
    talentEmail: talent.email,
    talentName: (talent.prenom + ' ' + talent.nom).trim() || talent.email,
    senderEmail: parsed.senderEmail,
    senderName: parsed.senderName || null,
    senderDomain: (parsed.senderDomain || parsed.senderEmail.split('@')[1] || 'unknown').toLowerCase(),
    subject: parsed.subject,
    bodyExcerpt: (parsed.body || '').slice(0, 3000),
    gmailMessageId: parsed.gmailMessageId,
    threadId: parsed.threadId || null,
    receivedAt: new Date(parsed.receivedAt).toISOString(),
    category: category,
    confidence: classification.confidence,
    priority: classification.priority || 'MEDIUM',
    extractedBrand: classification.extractedBrand || null,
    extractedTopic: classification.extractedTopic || null,
    extractedBudget: classification.extractedBudget || null,
    extractedDeadline: classification.extractedDeadline || null,
    extractedDeliverables: classification.extractedDeliverables || null,
    briefSummary: classification.briefSummary || null
  };

  try {
    const response = UrlFetchApp.fetch(GLOW_UP_API_URL + '/api/inbound/opportunities', {
      method: 'post',
      contentType: 'application/json',
      // Vercel INBOUND_API_SECRET = la constante INBOUND_API_SECRET ci-dessus (pas le hash)
      headers: { Authorization: 'Bearer ' + INBOUND_API_SECRET() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code === 200) {
      const result = JSON.parse(response.getContentText());
      if (result.duplicate) Logger.log('   ⏭️ Duplicate ignoré : ' + parsed.gmailMessageId);
      return true;
    } else {
      Logger.log('   ❌ Push failed ' + code + ' : ' + response.getContentText().substring(0, 200));
      return false;
    }
  } catch (e) {
    Logger.log('   ❌ Push exception : ' + e.toString());
    return false;
  }
}

function getAccessTokenForUser(userEmail, scopes) {
  const scopeStr = (scopes || ['https://www.googleapis.com/auth/gmail.readonly']).join(' ');
  const cache = CacheService.getScriptCache();
  const cacheKey = 'oauth_' + Utilities.base64Encode(userEmail + '|' + scopeStr);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: SERVICE_ACCOUNT_EMAIL,
    sub: userEmail,
    scope: scopeStr,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const headerB64 = Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, '');
  const claimB64 = Utilities.base64EncodeWebSafe(JSON.stringify(claim)).replace(/=+$/, '');
  const toSign = headerB64 + '.' + claimB64;
  const signatureBytes = Utilities.computeRsaSha256Signature(toSign, SERVICE_ACCOUNT_PRIVATE_KEY());
  const signatureB64 = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');
  const jwt = toSign + '.' + signatureB64;

  const tokenResp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  if (tokenResp.getResponseCode() !== 200) {
    const body = tokenResp.getContentText();
    // Compte absent / suspendu / typo → pas une vraie erreur, on saute la boîte
    if (
      body.indexOf('invalid_grant') !== -1 ||
      body.indexOf('Invalid email or User ID') !== -1
    ) {
      return null;
    }
    throw new Error('Token exchange failed : ' + body);
  }

  const token = JSON.parse(tokenResp.getContentText()).access_token;
  cache.put(cacheKey, token, 3500);
  return token;
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scanAllTalentInboxes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scanAllTalentInboxes').timeBased().everyMinutes(5).create();
  Logger.log('✅ Trigger installé : scan toutes les 5 minutes');
}

function uninstallTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scanAllTalentInboxes') ScriptApp.deleteTrigger(t);
  });
  Logger.log('🛑 Trigger désinstallé');
}

function resetLastScanTimestamp() {
  PropertiesService.getScriptProperties().deleteProperty('lastScanTimestamp');
  Logger.log('🔄 Timestamp réinitialisé');
}

function clearProcessedKeys() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let cleared = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('processed_') === 0) {
      props.deleteProperty(k);
      cleared++;
    }
  });
  Logger.log('🧹 ' + cleared + ' clés processed_* supprimées');
}

function clearAllScriptProperties() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log('🧹 Toutes les Script Properties supprimées');
}

function catchUp14Days() {
  Logger.log('⚠️ Préférer startCatchUp7Days / startCatchUp21Days (chunké). catchUp14Days peut timeout.');
  const props = PropertiesService.getScriptProperties();
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  props.setProperty('lastScanTimestamp', fourteenDaysAgo.toString());
  Logger.log('⏪ Rattrapage depuis ' + new Date(fourteenDaysAgo).toISOString());

  const previousWindow = CONFIG.scanWindowMinutes;
  CONFIG.scanWindowMinutes = 14 * 24 * 60;

  try {
    scanAllTalentInboxes();
  } finally {
    CONFIG.scanWindowMinutes = previousWindow;
  }

  Logger.log('✅ Rattrapage 14 jours terminé');
}

function testSetup() {
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('🔧 TEST SETUP');
  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    Logger.log('\n📋 Test 1 : récupération membres du groupe...');
    const emails = fetchTalentEmailsFromGroup();
    Logger.log('   ✅ ' + emails.length + ' talents dans ' + SCAN_GROUP_EMAIL);
    if (emails.length > 0) Logger.log('   Exemple : ' + emails[0]);

    if (emails.length > 0) {
      Logger.log('\n🔑 Test 2 : OAuth impersonation sur Gmail...');
      const token = getAccessTokenForUser(emails[0], ['https://www.googleapis.com/auth/gmail.readonly']);
      if (!token) {
        Logger.log('   ⏭️ ' + emails[0] + ' introuvable dans Workspace');
      } else {
        Logger.log('   ✅ Token obtenu pour ' + emails[0] + ' : ' + token.substring(0, 20) + '...');

        Logger.log('\n📬 Test 3 : appel Gmail API...');
        const profileResp = UrlFetchApp.fetch(
          'https://gmail.googleapis.com/gmail/v1/users/' + encodeURIComponent(emails[0]) + '/profile',
          { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
        );
        if (profileResp.getResponseCode() === 200) {
          const profile = JSON.parse(profileResp.getContentText());
          Logger.log('   ✅ Boîte ' + profile.emailAddress + ' accessible (' + profile.messagesTotal + ' mails)');
        } else {
          Logger.log('   ❌ Gmail API échec ' + profileResp.getResponseCode());
        }
      }
    }

    Logger.log('\n🤖 Test 4 : Claude Haiku...');
    const fakeTest = classifyWithClaude({
      senderName: 'Marie Dubois',
      senderEmail: 'marie@lancome.com',
      senderDomain: 'lancome.com',
      subject: 'Lancement Idôle Now — partenariat avril 2026',
      body: 'Bonjour, nous lançons en avril notre nouvelle fragrance et serions ravis de collaborer. Budget envisagé : 8-12k€. 1 reel + 3 stories souhaités. Deadline : 15 avril.',
      headers: {}
    }, { prenom: 'Sofia', nom: 'Test', email: 'test@glowupagence.fr' }, []);

    if (fakeTest) Logger.log('   ✅ Claude répond : ' + JSON.stringify(fakeTest));
    else Logger.log('   ❌ Claude n\'a rien renvoyé');

    Logger.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    Logger.log('✅ Tests terminés. Si tout est ✅ → lance installTrigger()');
  } catch (e) {
    Logger.log('❌ Test échoué : ' + e.toString());
  }
}

function catchUpNextTalents() {
  var props = PropertiesService.getScriptProperties();
  var startIdx = parseInt(props.getProperty('catchupTalentIndex') || '0', 10);

  var talentEmails = fetchTalentEmailsFromGroup();
  if (startIdx >= talentEmails.length) {
    Logger.log('✅ Rattrapage terminé (' + talentEmails.length + ' talents)');
    return;
  }

  var fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  var prevWindow = CONFIG.scanWindowMinutes;
  var prevMax = CONFIG.maxMailsPerInbox;
  CONFIG.scanWindowMinutes = 14 * 24 * 60;
  CONFIG.maxMailsPerInbox = 60;

  var email = talentEmails[startIdx];
  Logger.log('📥 Talent ' + (startIdx + 1) + '/' + talentEmails.length + ' : ' + email);

  try {
    scanInboxForTalent({
      email: email,
      prenom: email.split('@')[0].split('.')[0],
      nom: email.split('@')[0].split('.')[1] || ''
    }, fourteenDaysAgo);
  } catch (e) {
    if (isUnreachableMailboxError(e)) {
      Logger.log('⏭️ Skip ' + email + ' : boîte introuvable / inactive dans Workspace');
    } else {
      Logger.log('⚠️ Skip ' + email + ' : ' + e.toString());
    }
  }

  props.setProperty('catchupTalentIndex', String(startIdx + 1));
  CONFIG.scanWindowMinutes = prevWindow;
  CONFIG.maxMailsPerInbox = prevMax;
  Logger.log('➡️ Relance catchUpNextTalents pour le talent suivant');
}

function setCatchUpFromJasmine() {
  PropertiesService.getScriptProperties().setProperty('catchupTalentIndex', '6');
  Logger.log('Index = 6 (reprise ~ Jasmine). Lance catchUpNextTalents');
}

function isCatchUpOrScanHandler(fn) {
  return (
    fn === 'scanAllTalentInboxes' ||
    fn === 'catchUpNextTalents' ||
    fn === 'catchUpNextTalents4d' ||
    fn === 'catchUpNextTalents7d' ||
    fn === 'catchUpNextTalents21d'
  );
}

/** Rattrapage 4 jours — lancer UNE fois. Tourne tout seul ensuite. */
function startCatchUp4Days() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (isCatchUpOrScanHandler(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });

  PropertiesService.getScriptProperties().setProperty('catchupTalentIndex', '0');
  ScriptApp.newTrigger('catchUpNextTalents4d').timeBased().everyMinutes(5).create();
  Logger.log('✅ Rattrapage 4j armé : 1 talent / 5 min (auto). À la fin → scan permanent.');

  // Premier tour tout de suite (pas besoin d'attendre le 1er tick)
  catchUpNextTalents4d();
}

function catchUpNextTalents4d() {
  var props = PropertiesService.getScriptProperties();
  var startIdx = parseInt(props.getProperty('catchupTalentIndex') || '0', 10);
  var talentEmails = fetchTalentEmailsFromGroup();

  if (startIdx >= talentEmails.length) {
    Logger.log('✅ Rattrapage 4j terminé (' + talentEmails.length + ' talents)');
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'catchUpNextTalents4d') ScriptApp.deleteTrigger(t);
    });
    installTrigger(); // scanAllTalentInboxes toutes les 5 min, pour de bon
    Logger.log('🔁 Scan permanent installé (scanAllTalentInboxes / 5 min)');
    return;
  }

  var since = Date.now() - 4 * 24 * 60 * 60 * 1000;
  var prevWindow = CONFIG.scanWindowMinutes;
  var prevMax = CONFIG.maxMailsPerInbox;
  CONFIG.scanWindowMinutes = 4 * 24 * 60;
  CONFIG.maxMailsPerInbox = 80;

  var email = talentEmails[startIdx];
  Logger.log('📥 4j ' + (startIdx + 1) + '/' + talentEmails.length + ' : ' + email);

  try {
    scanInboxForTalent({
      email: email,
      prenom: email.split('@')[0].split('.')[0],
      nom: email.split('@')[0].split('.')[1] || ''
    }, since);
  } catch (e) {
    if (isUnreachableMailboxError(e)) {
      Logger.log('⏭️ Skip ' + email + ' : boîte introuvable / inactive dans Workspace');
    } else {
      Logger.log('⚠️ Skip ' + email + ' : ' + e.toString());
    }
  }

  props.setProperty('catchupTalentIndex', String(startIdx + 1));
  CONFIG.scanWindowMinutes = prevWindow;
  CONFIG.maxMailsPerInbox = prevMax;
}

/** Rattrapage 7 jours — lancer UNE fois. 1 talent / 5 min. */
function startCatchUp7Days() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (isCatchUpOrScanHandler(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });

  PropertiesService.getScriptProperties().setProperty('catchupTalentIndex', '0');
  ScriptApp.newTrigger('catchUpNextTalents7d').timeBased().everyMinutes(5).create();
  Logger.log('✅ Rattrapage 7j : 1 talent / 5 min. À la fin, scan 5 min rétabli.');
}

function catchUpNextTalents7d() {
  var props = PropertiesService.getScriptProperties();
  var startIdx = parseInt(props.getProperty('catchupTalentIndex') || '0', 10);
  var talentEmails = fetchTalentEmailsFromGroup();

  if (startIdx >= talentEmails.length) {
    Logger.log('✅ Rattrapage 7j terminé (' + talentEmails.length + ' talents)');
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'catchUpNextTalents7d') ScriptApp.deleteTrigger(t);
    });
    installTrigger();
    return;
  }

  var since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  var prevWindow = CONFIG.scanWindowMinutes;
  var prevMax = CONFIG.maxMailsPerInbox;
  CONFIG.scanWindowMinutes = 7 * 24 * 60;
  CONFIG.maxMailsPerInbox = 100;

  var email = talentEmails[startIdx];
  Logger.log('📥 7j ' + (startIdx + 1) + '/' + talentEmails.length + ' : ' + email);

  try {
    scanInboxForTalent({
      email: email,
      prenom: email.split('@')[0].split('.')[0],
      nom: email.split('@')[0].split('.')[1] || ''
    }, since);
  } catch (e) {
    if (isUnreachableMailboxError(e)) {
      Logger.log('⏭️ Skip ' + email + ' : boîte introuvable / inactive dans Workspace');
    } else {
      Logger.log('⚠️ Skip ' + email + ' : ' + e.toString());
    }
  }

  props.setProperty('catchupTalentIndex', String(startIdx + 1));
  CONFIG.scanWindowMinutes = prevWindow;
  CONFIG.maxMailsPerInbox = prevMax;
}

function startCatchUp21Days() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (isCatchUpOrScanHandler(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });

  PropertiesService.getScriptProperties().setProperty('catchupTalentIndex', '0');
  ScriptApp.newTrigger('catchUpNextTalents21d').timeBased().everyMinutes(5).create();
  Logger.log('✅ Rattrapage 21j : 1 talent / 5 min.');
}

function catchUpNextTalents21d() {
  var props = PropertiesService.getScriptProperties();
  var startIdx = parseInt(props.getProperty('catchupTalentIndex') || '0', 10);
  var talentEmails = fetchTalentEmailsFromGroup();

  if (startIdx >= talentEmails.length) {
    Logger.log('✅ Rattrapage 21j terminé (' + talentEmails.length + ' talents)');
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'catchUpNextTalents21d') ScriptApp.deleteTrigger(t);
    });
    installTrigger();
    return;
  }

  var since = Date.now() - 21 * 24 * 60 * 60 * 1000;
  var prevWindow = CONFIG.scanWindowMinutes;
  var prevMax = CONFIG.maxMailsPerInbox;
  CONFIG.scanWindowMinutes = 21 * 24 * 60;
  CONFIG.maxMailsPerInbox = 120;

  var email = talentEmails[startIdx];
  Logger.log('📥 21j ' + (startIdx + 1) + '/' + talentEmails.length + ' : ' + email);

  try {
    scanInboxForTalent({
      email: email,
      prenom: email.split('@')[0].split('.')[0],
      nom: email.split('@')[0].split('.')[1] || ''
    }, since);
  } catch (e) {
    if (isUnreachableMailboxError(e)) {
      Logger.log('⏭️ Skip ' + email + ' : boîte introuvable / inactive dans Workspace');
    } else {
      Logger.log('⚠️ Skip ' + email + ' : ' + e.toString());
    }
  }

  props.setProperty('catchupTalentIndex', String(startIdx + 1));
  CONFIG.scanWindowMinutes = prevWindow;
  CONFIG.maxMailsPerInbox = prevMax;
}

function stopCatchUpAndRestoreScan() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (
      fn === 'catchUpNextTalents4d' ||
      fn === 'catchUpNextTalents7d' ||
      fn === 'catchUpNextTalents21d'
    ) {
      ScriptApp.deleteTrigger(t);
    }
  });
  installTrigger();
  Logger.log('🛑 Rattrapage stoppé, scan 5 min rétabli');
}
