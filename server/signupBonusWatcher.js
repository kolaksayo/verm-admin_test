const { ObjectId } = require('mongodb');
const { getDb, getWriteDb } = require('./db');
const { getDb: getSQLite } = require('./sqlite');
const { applyAdjustment } = require('./routes/adminCredit');

const POLL_INTERVAL_MS    = 2 * 60 * 1000; // 2 min — matches gameBetWatcher's slow poll
const MAX_RETRY_ATTEMPTS  = 10;            // ~20 min of retries for no_wallet/error before giving up
const BACKLOG_LIMIT       = 200;

const SIGNUP_BONUS_ACTOR      = 'signup-bonus-watcher';
const SIGNUP_BONUS_DESCRIPTION = 'Signup Bonus';

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

// ── Rule matching ────────────────────────────────────────────────────────────────

// Unconditional lookup — used once eligibility has already been locked in (see
// processGrant) to re-read the rule's *current* amount/currency on every retry,
// regardless of its active flag (active only gates whether a signup newly qualifies,
// not whether a bonus already promised to a qualifying user still gets paid).
function findRuleByCode(referralCode) {
  if (!referralCode) return null;
  return getSQLite()
    .prepare('SELECT * FROM signup_bonus_rules WHERE referral_code = ?')
    .get(referralCode.toUpperCase()) || null;
}

// This comparison is the actual forward-only guarantee: a rule only matches signups
// at/after its own creation time, so editing rules or adding new ones can never reach
// back into pre-existing referral history. Only used for the *first* eligibility check
// on a referral (see processGrant) — never re-applied on retries.
function findActiveRule(referralCode, referralCreatedAt) {
  if (!referralCreatedAt) return null;
  const rule = findRuleByCode(referralCode);
  if (!rule || !rule.active) return null;
  const ruleCreatedAt = sqliteDatetimeToDate(rule.created_at);
  return (ruleCreatedAt && ruleCreatedAt <= referralCreatedAt) ? rule : null;
}

// Has this user already received a signup bonus? Checked before every credit attempt so a
// crash (or any other interruption) between applyAdjustment succeeding and this grant row
// being marked 'granted' can never cause a second credit on retry — the admin_credits row
// written inside applyAdjustment is the authoritative record, not this grants table.
function findExistingCredit(userId) {
  return getSQLite()
    .prepare('SELECT id FROM admin_credits WHERE user_id = ? AND description = ? LIMIT 1')
    .get(userId, SIGNUP_BONUS_DESCRIPTION) || null;
}

// ── Grant helpers ──────────────────────────────────────────────────────────────

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
  getSQLite().prepare(`
    UPDATE signup_bonus_grants
    SET attempts   = attempts + 1,
        status     = CASE WHEN attempts + 1 >= ? THEN 'gave_up' ELSE ? END,
        error      = ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(MAX_RETRY_ATTEMPTS, status, error || null, userId);
}

// ── Per-grant processing ────────────────────────────────────────────────────────

async function processGrant(db, grant, referralDoc) {
  const userId = grant.user_id;

  // Eligibility (was there an active rule for this code as of signup time?) is decided
  // once and locked in by persisting referral_code on the grant. Later rule edits/toggles
  // must not strand a user who legitimately qualified while their credit was still
  // retrying (e.g. on no_wallet) — so once locked in, only the rule's *current*
  // amount/currency are re-read here (decision: amount applies at credit time), and the
  // rule's active flag is no longer consulted for this specific, already-qualified user.
  let rule;
  if (grant.referral_code) {
    rule = findRuleByCode(grant.referral_code);
    if (!rule) {
      updateGrant(userId, { status: 'no_rule' });
      return;
    }
  } else {
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

    rule = findActiveRule(code, referralDoc.createdAt);
    if (!rule) {
      updateGrant(userId, { status: 'no_rule', referral_code: code });
      return;
    }
    updateGrant(userId, { referral_code: code, currency_name: rule.currency_name });
  }

  // Idempotency guard: if a Signup Bonus credit for this user already exists, a previous
  // pass must have completed the money-move but crashed/failed before this row was marked
  // granted. Adopt that existing credit instead of moving money again.
  const existingCredit = findExistingCredit(userId);
  if (existingCredit) {
    updateGrant(userId, { status: 'granted', admin_credit_id: existingCredit.id, error: null });
    return;
  }

  // Re-check the global kill switch immediately before the money-moving step, in case it
  // was flipped off after this poll's backlog was already assembled.
  if (!isEnabled()) return;

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
    notes:       `Referral code: ${rule.referral_code}`,
    txType:      'CREDIT',
    description: SIGNUP_BONUS_DESCRIPTION,
    action:      'credit',
    adminUser:   SIGNUP_BONUS_ACTOR,
    sessionId:   null,
  });

  updateGrant(userId, {
    status:          'granted',
    currency_name:   rule.currency_name,
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

  const referralOids = backlog
    .map((g) => { try { return new ObjectId(g.referral_id); } catch { return null; } })
    .filter(Boolean);
  const referralDocs = referralOids.length
    ? await db.collection('referrals').find({ _id: { $in: referralOids } }).toArray()
    : [];
  const referralDocMap = new Map(referralDocs.map((d) => [String(d._id), d]));

  for (const grant of backlog) {
    const referralDoc = referralDocMap.get(grant.referral_id) || null;

    if (!referralDoc) {
      // Bounded like every other retry path — a permanently missing referral doc must
      // eventually reach 'gave_up' rather than occupy a backlog slot forever.
      bumpAttemptsOrGiveUp(grant.user_id, 'error', 'Referral document no longer found');
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
