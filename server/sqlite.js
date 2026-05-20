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
    `);

    // Safe additive migrations
    try { db.exec(`ALTER TABLE telegram_logs ADD COLUMN message TEXT`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE telegram_logs ADD COLUMN channel TEXT NOT NULL DEFAULT 'telegram'`); } catch { /* already exists */ }
  }
  return db;
}

module.exports = { getDb };
