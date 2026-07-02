const { ObjectId } = require('mongodb');
const { getDb, getWriteDb } = require('./db');
const { getDb: getSQLite } = require('./sqlite');
const { applyAdjustment } = require('./routes/adminCredit');

const POLL_INTERVAL_MS    = 2 * 60 * 1000; // 2 min — matches gameBetWatcher's slow poll
const MAX_RETRY_ATTEMPTS  = 10;            // ~20 min of retries for no_wallet/error before giving up
const BACKLOG_LIMIT       = 200;

const SIGNUP_BONUS_ACTOR = 'signup-bonus-watcher';

const watcherState = {
  started:     false,
  startedAt:   null,
  lastPoll:    null,
  pollCount:   0,
  lastError:   null,
  lastErrorAt: null,
};

function getWatcherState() {
  return { ...watcherState };
}

function isEnabled() {
  try {
    const row = getSQLite().prepare("SELECT value FROM admin_settings WHERE key = 'signup_bonus_enabled'").get();
    return row ? row.value === 'true' : true; // default: enabled
  } catch {
    return true;
  }
}

// ── lastChecked persistence (same idiom as gameBetWatcher's readLastChecked/saveLastChecked) ──

function readLastChecked() {
  try {
    const row = getSQLite()
      .prepare("SELECT value FROM admin_settings WHERE key = 'signup_bonus_last_checked'")
      .get();
    if (row?.value) {
      const d = new Date(row.value);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // ignore
  }
  return new Date(); // first run: start from now
}

function saveLastChecked(date) {
  try {
    getSQLite().prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES ('signup_bonus_last_checked', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(date.toISOString());
  } catch {
    // non-fatal
  }
}

// SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS" (UTC, no zone suffix) — parse it
// explicitly as UTC rather than relying on Date's non-standard, locale-dependent handling
// of space-separated datetime strings.
function sqliteDatetimeToDate(str) {
  if (!str) return null;
  const d = new Date(str.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

// ── Rule matching — this comparison is the actual forward-only guarantee: a rule only
// matches signups at/after its own creation time, so editing rules or adding new ones
// can never reach back into pre-existing referral history. ──────────────────────────────

function findActiveRule(referralCode, referralCreatedAt) {
  if (!referralCode || !referralCreatedAt) return null;
  const rule = getSQLite()
    .prepare('SELECT * FROM signup_bonus_rules WHERE referral_code = ? AND active = 1')
    .get(referralCode.toUpperCase());
  if (!rule) return null;
  const ruleCreatedAt = sqliteDatetimeToDate(rule.created_at);
  return (ruleCreatedAt && ruleCreatedAt <= referralCreatedAt) ? rule : null;
}

// ── Grant helpers ──────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['granted', 'no_rule', 'gave_up']);

function claimGrant(userId, referralId) {
  getSQLite().prepare(`
    INSERT OR IGNORE INTO signup_bonus_grants (user_id, referral_id, status)
    VALUES (?, ?, 'pending')
  `).run(userId, referralId);
}

function updateGrant(userId, patch) {
  const fields = Object.keys(patch);
  if (!fields.length) return;
  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  getSQLite().prepare(`
    UPDATE signup_bonus_grants SET ${setClause}, updated_at = datetime('now') WHERE user_id = ?
  `).run(...fields.map((f) => patch[f]), userId);
}

function bumpAttemptsOrGiveUp(userId, status, error) {
  const row = getSQLite().prepare('SELECT attempts FROM signup_bonus_grants WHERE user_id = ?').get(userId);
  const attempts    = (row?.attempts || 0) + 1;
  const finalStatus = attempts >= MAX_RETRY_ATTEMPTS ? 'gave_up' : status;
  updateGrant(userId, { status: finalStatus, attempts, error: error || null });
}

// ── Per-grant processing ────────────────────────────────────────────────────────

async function processGrant(db, grant, referralDoc) {
  const userId     = grant.user_id;
  const referrerId = String(referralDoc.referrer || '');

  let referrerOid;
  try { referrerOid = new ObjectId(referrerId); } catch { referrerOid = null; }
  const referrer = referrerOid
    ? await db.collection('users').findOne({ _id: referrerOid }, { projection: { referralCode: 1 } })
    : null;
  const code = (referrer?.referralCode || '').toUpperCase();

  if (!code) {
    updateGrant(userId, { status: 'no_rule', referral_code: null });
    return;
  }

  const rule = findActiveRule(code, referralDoc.createdAt);
  if (!rule) {
    updateGrant(userId, { status: 'no_rule', referral_code: code });
    return;
  }

  updateGrant(userId, { referral_code: code, currency_name: rule.currency_name });

  // Look up the referred user's wallet on the write DB — same connection applyAdjustment
  // itself reads from, so a decision that moves money never sees stale replica state.
  const wDb = getWriteDb();
  let userOid;
  try { userOid = new ObjectId(userId); } catch { userOid = null; }
  let currencyOid;
  try { currencyOid = new ObjectId(rule.currency_id); } catch { currencyOid = rule.currency_id; }

  const wallet = await wDb.collection('walletusers').findOne({
    $and: [
      { $or: [{ user: userOid }, { user: userId }, { userId: userOid }, { userId }] },
      { currencyType: currencyOid },
    ],
  });

  if (!wallet) {
    bumpAttemptsOrGiveUp(userId, 'no_wallet', null);
    return;
  }

  const result = await applyAdjustment({
    walletId:    wallet._id,
    userId,
    amount:      rule.amount,
    notes:       `Referral code: ${code}`,
    txType:      'CREDIT',
    description: 'Signup Bonus',
    action:      'credit',
    adminUser:   SIGNUP_BONUS_ACTOR,
    sessionId:   null,
  });

  updateGrant(userId, {
    status:          'granted',
    wallet_id:       String(wallet._id),
    admin_credit_id: result.creditId,
    error:           null,
  });
}

// ── Main poll ────────────────────────────────────────────────────────────────
// Two decoupled passes:
//  1. Discover newly-created referral events since the last check and claim a grants
//     row for each (cheap, no Mongo writes beyond SQLite).
//  2. Work the backlog of not-yet-terminal grants (freshly claimed above, plus older
//     no_wallet/error rows still retrying) by re-reading each referral doc by id — this
//     runs independently of the discovery cursor so retries aren't lost once a referral
//     doc's createdAt falls behind the advancing "since" watermark.

async function pollSignupBonuses(db, since) {
  if (!isEnabled()) return;

  const newDocs = await db.collection('referrals')
    .find(
      { createdAt: { $gt: since } },
      { projection: { referrer: 1, referee: 1, referred: 1, referredUser: 1, newUser: 1, createdAt: 1 } },
    )
    .sort({ createdAt: 1 })
    .limit(500)
    .toArray();

  for (const doc of newDocs) {
    const refereeId = String(doc.referee || doc.referred || doc.referredUser || doc.newUser || '');
    if (!refereeId) {
      console.warn(`[SignupBonusWatcher] Referral doc ${doc._id} has no resolvable referee field — skipping`);
      continue;
    }
    claimGrant(refereeId, String(doc._id));
  }

  const backlog = getSQLite()
    .prepare(`SELECT * FROM signup_bonus_grants WHERE status IN ('pending','no_wallet','error') LIMIT ${BACKLOG_LIMIT}`)
    .all();

  if (backlog.length === BACKLOG_LIMIT) {
    console.warn(`[SignupBonusWatcher] Backlog hit the ${BACKLOG_LIMIT}-row limit — some retries may be delayed to the next poll.`);
  }

  for (const grant of backlog) {
    let referralOid;
    try { referralOid = new ObjectId(grant.referral_id); } catch { referralOid = null; }
    const referralDoc = referralOid ? await db.collection('referrals').findOne({ _id: referralOid }) : null;

    if (!referralDoc) {
      updateGrant(grant.user_id, { status: 'error', error: 'Referral document no longer found' });
      continue;
    }

    try {
      await processGrant(db, grant, referralDoc);
    } catch (err) {
      console.error(`[SignupBonusWatcher] Error processing grant for user ${grant.user_id}:`, err.message);
      bumpAttemptsOrGiveUp(grant.user_id, 'error', err.message);
    }
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────

function startSignupBonusWatcher() {
  let lastChecked = readLastChecked();
  let isRunning   = false;

  console.log(`[SignupBonusWatcher] Started. Polling every ${POLL_INTERVAL_MS / 1000}s, resuming from ${lastChecked.toISOString()}.`);
  watcherState.started   = true;
  watcherState.startedAt = new Date();

  const tick = async () => {
    if (isRunning) return; // guard against an overlapping tick if a poll ever runs long
    isRunning = true;
    try {
      const db    = getDb();
      const since = lastChecked;
      const next  = new Date();
      await pollSignupBonuses(db, since);
      lastChecked = next;
      saveLastChecked(lastChecked);
      watcherState.lastPoll  = new Date();
      watcherState.pollCount += 1;
    } catch (err) {
      watcherState.lastError   = err.message;
      watcherState.lastErrorAt = new Date();
      console.error('[SignupBonusWatcher] Poll error:', err.message);
    } finally {
      isRunning = false;
    }
  };

  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

module.exports = {
  startSignupBonusWatcher,
  getWatcherState,
  pollSignupBonuses,
  SIGNUP_BONUS_ACTOR,
};
