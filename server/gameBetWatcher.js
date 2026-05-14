const { getDb } = require('./db');
const { sendMessage, isConfigured } = require('./telegram');

const POLL_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes

function formatChallenge(bet) {
  const code    = bet.bookingCode || bet.title || bet.name || bet._id.toString();
  const stake   = bet.stake != null ? `$${Number(bet.stake).toFixed(2)}` : null;
  const slots   = bet.maxParticipants || bet.participantCount || null;
  const creator = bet.createdByUsername || null;

  const lines = [
    '🎯 <b>New Challenge Created!</b>',
    '',
    `<b>Code:</b> ${code}`,
  ];
  if (creator) lines.push(`<b>Created by:</b> ${creator}`);
  if (stake)   lines.push(`<b>Stake:</b> ${stake}`);
  if (slots)   lines.push(`<b>Slots:</b> ${slots}`);
  lines.push('');
  lines.push('Open the VermoSports app to join!');

  return lines.join('\n');
}

async function resolveCreator(db, bet) {
  const uid = bet.createdBy;
  if (!uid) return null;
  try {
    const { ObjectId } = require('mongodb');
    const oid = new ObjectId(uid.toString());
    const user = await db.collection('users').findOne(
      { _id: oid },
      { projection: { username: 1, displayName: 1, name: 1 } },
    );
    return user ? (user.username || user.displayName || user.name || null) : null;
  } catch {
    return null;
  }
}

function startWatcher() {
  if (!isConfigured()) {
    console.log('[GameBetWatcher] Telegram not configured — watcher inactive. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable.');
    return;
  }

  let lastChecked = new Date();
  console.log(`[GameBetWatcher] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);

  setInterval(async () => {
    try {
      const db      = getDb();
      const since   = lastChecked;
      lastChecked   = new Date();

      const newBets = await db.collection('game_bet')
        .find({ createdAt: { $gt: since } })
        .sort({ createdAt: 1 })
        .toArray();

      for (const bet of newBets) {
        const creatorName = await resolveCreator(db, bet);
        const message     = formatChallenge({ ...bet, createdByUsername: creatorName });
        const result      = await sendMessage(message);
        if (result.ok) {
          console.log(`[GameBetWatcher] Notified: ${bet.bookingCode || bet._id}`);
        } else {
          console.error('[GameBetWatcher] Telegram error:', result);
        }
      }
    } catch (err) {
      console.error('[GameBetWatcher] Poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);
}

module.exports = { startWatcher };
