/**
 * ════════════════════════════════════════════════════════════════════
 *  PATCHES À COLLER dans le scanner talents (Inbound)
 *  Résout : "Exceeded maximum execution time" sur catchUp14Days
 * ════════════════════════════════════════════════════════════════════
 *
 * 1) Remplace fetchThreadMessages par la version ci-dessous (fil léger)
 * 2) Ajoute les fonctions catchUpNextTalents + installCatchUpTriggers
 * 3) N'utilise PLUS catchUp14Days d'un coup — lance catchUpNextTalents 15–20 fois
 *    (ou installCatchUpTriggers = 1 talent / 5 min automatique)
 */

// ─── Remplace fetchThreadMessages ─────────────────────────────────────
function fetchThreadMessages(talentEmail, threadId, accessToken) {
  try {
    const url =
      'https://gmail.googleapis.com/gmail/v1/users/' +
      encodeURIComponent(talentEmail) +
      '/threads/' +
      threadId +
      '?format=metadata&metadataHeaders=From&metadataHeaders=Subject';

    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) return [];

    const data = JSON.parse(resp.getContentText());
    const talentLower = talentEmail.toLowerCase();
    const all = data.messages || [];

    // Garde les 8 derniers messages du fil (suffisant pour voir paid vs gifting)
    const slice = all.length > 8 ? all.slice(all.length - 8) : all;

    return slice.map(function (m) {
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
        body: '(voir message courant dans le fil)',
      };
    });
  } catch (e) {
    Logger.log('   ⚠️ fetchThreadMessages failed : ' + e.toString());
    return [];
  }
}

// ─── Rattrapage 1 talent à la fois (évite le timeout 6 min) ───────────
function catchUpNextTalents() {
  const props = PropertiesService.getScriptProperties();
  const startIdx = parseInt(props.getProperty('catchupTalentIndex') || '0', 10);

  let talentEmails;
  try {
    talentEmails = fetchTalentEmailsFromGroup();
  } catch (e) {
    Logger.log('❌ Groupe : ' + e.toString());
    return;
  }

  if (startIdx >= talentEmails.length) {
    Logger.log('✅ Rattrapage terminé pour tous les talents (' + talentEmails.length + ')');
    props.deleteProperty('catchupTalentIndex');
    return;
  }

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  props.setProperty('lastScanTimestamp', fourteenDaysAgo.toString());

  const previousWindow = CONFIG.scanWindowMinutes;
  CONFIG.scanWindowMinutes = 14 * 24 * 60;
  CONFIG.maxMailsPerInbox = 80; // 80 suffit pour 14j ; plus rapide que 200

  const email = talentEmails[startIdx];
  Logger.log('📥 Rattrapage talent ' + (startIdx + 1) + '/' + talentEmails.length + ' : ' + email);

  const talent = {
    email: email,
    prenom: email.split('@')[0].split('.')[0],
    nom: (email.split('@')[0].split('.')[1] || ''),
  };

  try {
    scanInboxForTalent(talent, fourteenDaysAgo);
  } catch (e) {
    Logger.log('❌ Erreur ' + email + ' : ' + e.toString());
  }

  props.setProperty('catchupTalentIndex', String(startIdx + 1));
  CONFIG.scanWindowMinutes = previousWindow;

  Logger.log('➡️ Prochain run : talent index ' + (startIdx + 1) + ' — relance catchUpNextTalents');
}

function installCatchUpTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'catchUpNextTalents') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('catchUpNextTalents').timeBased().everyMinutes(5).create();
  PropertiesService.getScriptProperties().setProperty('catchupTalentIndex', '0');
  Logger.log('✅ Trigger rattrapage : 1 talent toutes les 5 min');
}

function resetCatchUpProgress() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('catchupTalentIndex');
  const all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('processed_') === 0) props.deleteProperty(k);
  });
  Logger.log('🔄 Index rattrapage + cache processed_* réinitialisés');
}
