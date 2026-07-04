const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.ADMIN_DB_PATH || path.join(__dirname, '../admin.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        two_factor_secret TEXT,
        two_factor_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ngn_rate_snapshots (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT    NOT NULL,
        period     TEXT    NOT NULL CHECK(period IN ('morning','midday','night')),
        rate       REAL    NOT NULL,
        source     TEXT    NOT NULL DEFAULT 'scheduled',
        captured_at TEXT   NOT NULL DEFAULT (datetime('now')),
        UNIQUE(date, period)
      );

      CREATE INDEX IF NOT EXISTS idx_ngn_rate_date ON ngn_rate_snapshots(date);

      CREATE TABLE IF NOT EXISTS admin_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS telegram_logs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger     TEXT NOT NULL,
        preview     TEXT NOT NULL,
        ok          INTEGER NOT NULL DEFAULT 0,
        error       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS telegram_templates (
        trigger     TEXT PRIMARY KEY,
        template    TEXT NOT NULL,
        enabled     INTEGER NOT NULL DEFAULT 1,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS telegram_notified (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        bet_id      TEXT NOT NULL,
        trigger_key TEXT NOT NULL,
        notified_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(bet_id, trigger_key)
      );
      CREATE INDEX IF NOT EXISTS idx_tg_notified ON telegram_notified(bet_id);

      CREATE TABLE IF NOT EXISTS whatsapp_user_dms (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id  TEXT NOT NULL,
        phone    TEXT NOT NULL,
        username TEXT,
        trigger  TEXT NOT NULL DEFAULT 'user_registered',
        ok       INTEGER NOT NULL DEFAULT 0,
        error    TEXT,
        sent_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wud_user_trigger
        ON whatsapp_user_dms(user_id, trigger);

      CREATE TABLE IF NOT EXISTS admin_edit_sessions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL,
        username    TEXT    NOT NULL,
        reason      TEXT,
        elevated_at TEXT    NOT NULL DEFAULT (datetime('now')),
        expires_at  TEXT    NOT NULL,
        dropped_at  TEXT,
        drop_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_edit_sessions_user
        ON admin_edit_sessions(user_id, dropped_at);

      CREATE TABLE IF NOT EXISTS admin_activity_logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user   TEXT    NOT NULL,
        session_id   INTEGER,
        action       TEXT    NOT NULL,
        collection   TEXT    NOT NULL,
        document_id  TEXT    NOT NULL,
        before_json  TEXT,
        after_json   TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user
        ON admin_activity_logs(admin_user);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_col
        ON admin_activity_logs(collection);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_col
        ON admin_activity_logs(admin_user, collection);

      CREATE TABLE IF NOT EXISTS influencer_rates (
        referral_code  TEXT PRIMARY KEY,
        rate           REAL NOT NULL DEFAULT 0,
        notes          TEXT,
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS admin_credits (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user     TEXT    NOT NULL,
        session_id     INTEGER,
        user_id        TEXT    NOT NULL,
        wallet_id      TEXT    NOT NULL,
        currency_name  TEXT,
        amount         REAL    NOT NULL,
        balance_before REAL    NOT NULL,
        balance_after  REAL    NOT NULL,
        description    TEXT    NOT NULL DEFAULT 'Admin Credit',
        notes          TEXT,
        created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_admin_credits_user
        ON admin_credits(user_id);

      -- Defense-in-depth: at most one Signup Bonus credit can ever exist per user, at the
      -- database level, independent of any application-side idempotency logic.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_credits_signup_bonus_once
        ON admin_credits(user_id) WHERE description = 'Signup Bonus';

      CREATE TABLE IF NOT EXISTS signup_bonus_rules (
        referral_code  TEXT PRIMARY KEY,
        amount         REAL NOT NULL DEFAULT 0,
        currency_id    TEXT NOT NULL,
        currency_name  TEXT,
        active         INTEGER NOT NULL DEFAULT 1,
        notes          TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS signup_bonus_grants (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          TEXT NOT NULL UNIQUE,
        referral_id      TEXT,
        referral_code    TEXT,
        currency_name    TEXT,
        wallet_id        TEXT,
        admin_credit_id  INTEGER,
        status           TEXT NOT NULL DEFAULT 'pending',
        attempts         INTEGER NOT NULL DEFAULT 0,
        error            TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_signup_bonus_grants_status
        ON signup_bonus_grants(status);

      CREATE TABLE IF NOT EXISTS admin_permission_grants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        category    TEXT    NOT NULL,
        subcategory TEXT    NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, category, subcategory)
      );
      CREATE INDEX IF NOT EXISTS idx_permission_grants_user
        ON admin_permission_grants(user_id);
    `);

    // Safe additive migrations
    try { db.exec(`ALTER TABLE telegram_logs ADD COLUMN message TEXT`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE telegram_logs ADD COLUMN channel TEXT NOT NULL DEFAULT 'telegram'`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE admin_credits ADD COLUMN tx_type TEXT NOT NULL DEFAULT 'CREDIT'`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE admin_users ADD COLUMN email TEXT UNIQUE`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE admin_users ADD COLUMN two_factor_exempt INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
  }
  return db;
}

module.exports = { getDb };
