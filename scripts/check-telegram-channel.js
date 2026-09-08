#!/usr/bin/env node
// Reports what each Telegram destination is pointed at and whether it is live.
// Usage: node scripts/check-telegram-channel.js
const { getDb } = require('../server/sqlite');

const db = getDb();
const val = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value;
const flagOn = (k) => { const v = val(k); return v == null ? true : v !== '0'; };

// A Telegram chat_id encodes what kind of chat it is.
function describeChatId(id) {
  const v = String(id || '').trim();
  if (!v) return 'not set';
  if (v.startsWith('@')) return 'public channel/group by @name';
  if (/^-100\d+$/.test(v)) return 'channel or supergroup';
  if (/^-\d+$/.test(v)) return 'legacy basic group';
  if (/^\d+$/.test(v)) return 'PRIVATE CHAT with a user (messages appear in the bot chat)';
  return 'unrecognised format';
}

const token     = val('telegram_bot_token')  || process.env.TELEGRAM_BOT_TOKEN  || '';
const chatId    = val('telegram_chat_id')    || process.env.TELEGRAM_CHAT_ID    || '';
const channelId = val('telegram_channel_id') || process.env.TELEGRAM_CHANNEL_ID || '';

const groupLive   = !!(token && chatId)    && flagOn('telegram_enabled');
const channelLive = !!(token && channelId) && flagOn('telegram_channel_enabled');

console.log('Bot token        :', token ? `set (${token.slice(0, 8)}…)` : 'MISSING');
console.log('');
console.log('GROUP destination');
console.log('  telegram_chat_id     :', chatId || 'MISSING');
console.log('  looks like           :', describeChatId(chatId));
console.log('  telegram_enabled     :', flagOn('telegram_enabled') ? 'on' : 'off');
console.log('  -> receives sends    :', groupLive ? 'YES' : 'no');
console.log('');
console.log('CHANNEL destination');
console.log('  telegram_channel_id  :', channelId || 'MISSING');
console.log('  looks like           :', describeChatId(channelId));
console.log('  channel_enabled      :', flagOn('telegram_channel_enabled') ? 'on' : 'off');
console.log('  -> receives sends    :', channelLive ? 'YES' : 'no');
console.log('');

if (groupLive && channelLive) {
  console.log('Both destinations are live, so automated notifications go to both.');
  if (/^\d+$/.test(String(chatId))) {
    console.log('The group id is a private chat, which is why a copy appears in the bot chat.');
    console.log('Switch Telegram Group off in Notification Center -> Channels to stop it.');
  }
} else if (channelLive) {
  console.log('Only the channel is live — nothing should reach the group or bot chat.');
} else if (groupLive) {
  console.log('Only the group is live.');
} else {
  console.log('No Telegram destination is live.');
}
