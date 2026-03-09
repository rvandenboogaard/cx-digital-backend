const axios = require('axios');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function sendAlert(message) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('SLACK_WEBHOOK_URL niet geconfigureerd, alert overgeslagen');
    return;
  }

  try {
    await axios.post(SLACK_WEBHOOK_URL, { text: message }, { timeout: 5000 });
    console.log('Slack alert verstuurd');
  } catch (err) {
    console.error('Slack alert mislukt:', err.message);
  }
}

// Check of het een werkdag is (ma-vr)
function isWeekday(dateStr) {
  const day = new Date(dateStr).getDay();
  return day >= 1 && day <= 5;
}

async function notifySyncResult(dateStr, source, recordsSynced, error) {
  if (error) {
    await sendAlert(
      `:red_circle: *Sync mislukt: ${source}*\nDatum: ${dateStr}\nFout: ${error}\n\nDe retry cron probeert het om 06:30 opnieuw.`
    );
  } else if (recordsSynced === 0 && isWeekday(dateStr)) {
    await sendAlert(
      `:warning: *Sync 0 records: ${source}*\nDatum: ${dateStr} (werkdag)\n\n0 records op een werkdag is onverwacht. Check of de API correct werkt.`
    );
  }
}

async function notifyRetryResult(results) {
  if (!results || results.length === 0) return;

  const lines = results.map(r => {
    const status = r.result.error ? `:red_circle: mislukt` : `:white_check_mark: ${r.result.synced} records`;
    return `• ${r.source} ${r.date}: ${status}`;
  });

  await sendAlert(
    `:arrows_counterclockwise: *Retry resultaten*\n${lines.join('\n')}`
  );
}

module.exports = { sendAlert, notifySyncResult, notifyRetryResult };
