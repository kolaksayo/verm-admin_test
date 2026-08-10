#!/usr/bin/env node
// Prints why the Telegram channel shows as unavailable for campaigns.
// Usage: node scripts/check-telegram-channel.js
const { getDb } = require('../server/sqlite');

const KEYS = ['telegram_bot_token', 'telegram_chat_id', 'telegram_channel_id', 'telegram_channel_enabled'];
const db = getDb();
const val = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value;

const found = Object.fromEntries(KEYS.map((k) => [k, val(k)]));
const token     = found.telegram_bot_token  || process.env.TELEGRAM_BOT_TOKEN  || '';
const channelId = found.telegram_channel_id || process.env.TELEGRAM_CHANNEL_ID || '';

console.log('telegram_bot_token       :', token ? `set (${token.slice(0, 8)}…)` : 'MISSING');
console.log('telegram_channel_id      :', channelId || 'MISSING');
console.log('telegram_channel_enabled :', found.telegram_channel_enabled ?? '(unset — treated as on)');
console.log('');
console.log(token && channelId
  ? 'Campaigns CAN target the Telegram channel.'
  : 'Campaigns cannot target it: save a Channel ID under Notification Center -> Settings -> Telegram.');
