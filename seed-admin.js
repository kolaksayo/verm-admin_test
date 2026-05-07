require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.ADMIN_DB_PATH || path.join(__dirname, 'admin.db');
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'changeme123';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

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
`);

const hashed = bcrypt.hashSync(password, 12);

db.prepare(`
  INSERT INTO admin_users (username, password, role)
  VALUES (?, ?, 'superadmin')
  ON CONFLICT(username) DO UPDATE SET
    password = excluded.password,
    role = 'superadmin',
    updated_at = datetime('now')
`).run(username, hashed);

console.log('');
console.log('✅ Superadmin created/updated in admin.db (SQLite)');
console.log('──────────────────────────────────');
console.log(`   Username : ${username}`);
console.log(`   Password : ${password}`);
console.log(`   Role     : superadmin`);
console.log(`   DB file  : ${DB_PATH}`);
console.log('──────────────────────────────────');
console.log('Change ADMIN_PASSWORD in .env before running this in production!');
console.log('');

db.close();
