/**
 * ════════════════════════════════════════════════════════════════════
 *  GLOW UP — CASTING INBOX → DEMANDES ENTRANTES
 *  Surveille casting@glowupagence.fr et pousse vers
 *  POST /api/webhook/inbound-email (colonne "À traiter")
 *
 *  Déployer dans le MÊME projet Apps Script que le scanner talents
 *  OU dans un projet dédié (mêmes secrets + service account).
 * ════════════════════════════════════════════════════════════════════
 */

// Même valeur que INBOUND_EMAIL_SECRET sur Vercel
const INBOUND_EMAIL_SECRET = 'glowup_casting_2026_xK9mP3qR';
const GLOW_UP_API_URL = 'https://app.glowupagence.fr';

// Boîte à surveiller (transferts + mails directs)
const CASTING_INBOX_EMAIL = 'casting@glowupagence.fr';

// Réutilise les constantes du scanner talents si dans le même projet :
// SERVICE_ACCOUNT_EMAIL, SERVICE_ACCOUNT_PRIVATE_KEY, getAccessTokenForUser, parseGmailMessage, extractBody, shouldSkipMail

const CASTING_CONFIG = {
  scanWindowMinutes: 10080,
  maxMailsPerInbox: 200,
  maxBodyLength: 8000,
};

function scanCastingInbox() {
  const startTime = Date.now();
  const props = PropertiesService.getScriptProperties();
  const lastScan = parseInt(props.getProperty('lastCastingScanTimestamp') || '0', 10);
  const now = Date.now();
  const sinceTimestamp = lastScan || now - CASTING_CONFIG.scanWindowMinutes * 60 * 1000;

  Logger.log('📥 CASTING SCAN — depuis ' + new Date(sinceTimestamp).toISOString());

  const accessToken = getAccessTokenForUser(CASTING_INBOX_EMAIL, [
    'https://www.googleapis.com/auth/gmail.readonly',
  ]);

  const sinceSec = Math.floor(sinceTimestamp / 1000);
  const query =
    'in:inbox -from:me -category:promotions -category:social after:' + sinceSec;
  const listUrl =
    'https://gmail.googleapis.com/gmail/v1/users/' +
    encodeURIComponent(CASTING_INBOX_EMAIL) +
    '/messages?q=' +
    encodeURIComponent(query) +
    '&maxResults=' +
    CASTING_CONFIG.maxMailsPerInbox;

  const listResp = UrlFetchApp.fetch(listUrl, {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });

  if (listResp.getResponseCode() !== 200) {
    Logger.log('❌ List failed ' + listResp.getResponseCode() + ' : ' + listResp.getContentText().substring(0, 200));
    return;
  }

  const messages = JSON.parse(listResp.getContentText()).messages || [];
  let processed = 0;
  let pushed = 0;

  messages.forEach(function (msg) {
    try {
      const processedKey = 'casting_processed_' + msg.id;
      if (props.getProperty(processedKey)) return;

      const msgUrl =
        'https://gmail.googleapis.com/gmail/v1/users/' +
        encodeURIComponent(CASTING_INBOX_EMAIL) +
        '/messages/' +
        msg.id +
        '?format=full';
      const msgResp = UrlFetchApp.fetch(msgUrl, {
        headers: { Authorization: 'Bearer ' + accessToken },
        muteHttpExceptions: true,
      });
      if (msgResp.getResponseCode() !== 200) return;

      const parsed = parseGmailMessage(JSON.parse(msgResp.getContentText()));
      processed++;

      if (parsed.receivedAt < sinceTimestamp) return;
      if (shouldSkipMail(parsed)) {
        props.setProperty(processedKey, 'skipped');
        return;
      }

      if (pushToDemandesEntrantes(parsed)) {
        pushed++;
        props.setProperty(processedKey, 'pushed');
        Logger.log('   ✅ Demande entrante : ' + parsed.subject.substring(0, 60));
      }
    } catch (e) {
      Logger.log('   ❌ ' + msg.id + ' : ' + e.toString());
    }
  });

  props.setProperty('lastCastingScanTimestamp', String(now));
  Logger.log(
    '✅ CASTING SCAN END — ' +
      processed +
      ' analysés, ' +
      pushed +
      ' poussés en ' +
      ((Date.now() - startTime) / 1000).toFixed(1) +
      's'
  );
}

function pushToDemandesEntrantes(parsed) {
  const fromLabel = parsed.senderName
    ? parsed.senderName + ' <' + parsed.senderEmail + '>'
    : parsed.senderEmail;

  const payload = {
    from: fromLabel,
    subject: parsed.subject,
    body: parsed.body || '',
    date: new Date(parsed.receivedAt).toISOString(),
    messageId: parsed.gmailMessageId,
    threadId: parsed.threadId || '',
    isReply: false,
  };

  try {
    const response = UrlFetchApp.fetch(GLOW_UP_API_URL + '/api/webhook/inbound-email', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': INBOUND_EMAIL_SECRET },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    const text = response.getContentText();
    if (code === 200) {
      const result = JSON.parse(text);
      if (result.action === 'duplicate_thread' || result.action === 'already_exists') {
        Logger.log('   ⏭️ ' + result.action + ' : ' + parsed.gmailMessageId);
      }
      return result.action === 'created' || result.action === 'already_exists';
    }
    Logger.log('   ❌ Webhook ' + code + ' : ' + text.substring(0, 200));
    return false;
  } catch (e) {
    Logger.log('   ❌ Webhook exception : ' + e.toString());
    return false;
  }
}

function installCastingTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scanCastingInbox') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scanCastingInbox').timeBased().everyMinutes(5).create();
  Logger.log('✅ Trigger casting installé (toutes les 5 min)');
}

function catchUpCasting14Days() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let cleared = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('casting_processed_') === 0) {
      props.deleteProperty(k);
      cleared++;
    }
  });
  Logger.log('🧹 ' + cleared + ' clés casting_processed_* supprimées');

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  props.setProperty('lastCastingScanTimestamp', String(fourteenDaysAgo));

  const prev = CASTING_CONFIG.scanWindowMinutes;
  CASTING_CONFIG.scanWindowMinutes = 14 * 24 * 60;
  try {
    scanCastingInbox();
  } finally {
    CASTING_CONFIG.scanWindowMinutes = prev;
  }
}

function testCastingWebhook() {
  const fake = {
    gmailMessageId: 'test_' + Date.now(),
    threadId: 'test_thread_' + Date.now(),
    senderName: 'Test',
    senderEmail: 'test@example.com',
    subject: 'Test demande entrante',
    body: 'Corps de test depuis Apps Script',
    receivedAt: Date.now(),
    headers: {},
  };
  const ok = pushToDemandesEntrantes(fake);
  Logger.log(ok ? '✅ Test webhook OK' : '❌ Test webhook failed');
}
