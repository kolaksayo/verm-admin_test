const express = require('express');
const { getDb: getSQLite } = require('../sqlite');
const { sendMessage: sendTelegram } = require('../telegram');
const { sendMessage: sendWhatsApp } = require('../whatsapp');
const auth = require('../middleware/auth');

const router = express.Router();

const SYSTEM_PROMPT = `You are a sports marketing copywriter for Vermö, a Nigerian sports prediction and gaming platform. Write punchy, exciting content for WhatsApp and Telegram that gets Nigerian football fans fired up about upcoming matches. Keep it under 280 words. Use relevant emojis. End with a clear call-to-action encouraging users to play on Vermö.`;

// ── Config ─────────────────────────────────────────────────────────────────────

router.get('/config', auth, (req, res) => {
  try {
    const db  = getSQLite();
    const get = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value ?? null;
    res.json({
      provider:      get('campaign_ai_provider') || 'claude',
      claudeKeySet:  !!(get('campaign_claude_key')),
      openaiKeySet:  !!(get('campaign_openai_key')),
      geminiKeySet:  !!(get('campaign_gemini_key')),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', auth, (req, res) => {
  try {
    const db  = getSQLite();
    const set = (k, v) => db.prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(k, String(v));

    const { provider, claudeKey, openaiKey, geminiKey } = req.body;
    if (provider)   set('campaign_ai_provider',  provider);
    if (claudeKey)  set('campaign_claude_key',   claudeKey);
    if (openaiKey)  set('campaign_openai_key',   openaiKey);
    if (geminiKey)  set('campaign_gemini_key',   geminiKey);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generate ───────────────────────────────────────────────────────────────────

router.post('/generate', auth, async (req, res) => {
  const { fixtures = [], context = '', provider: reqProvider } = req.body;

  const db       = getSQLite();
  const get      = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value ?? '';
  const provider = reqProvider || get('campaign_ai_provider') || 'claude';

  const fixtureLines = fixtures.map((f) => {
    const dateStr = f.date ? new Date(f.date).toLocaleString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }) : 'TBC';
    const league = f.league ? ` (${f.league})` : '';
    return `• ${f.homeTeam} vs ${f.awayTeam}${league} — ${dateStr}`;
  }).join('\n');

  const userMessage = [
    fixtures.length ? `Upcoming fixtures:\n${fixtureLines}` : '',
    context.trim() ? `Trending context:\n${context.trim()}` : '',
    'Write an engaging campaign message.',
  ].filter(Boolean).join('\n\n');

  try {
    let content;

    if (provider === 'claude') {
      const apiKey = get('campaign_claude_key') || process.env.ANTHROPIC_API_KEY || '';
      if (!apiKey) return res.status(400).json({ error: 'Claude API key not configured' });
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic.default({ apiKey });
      const msg = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });
      content = msg.content[0]?.text || '';

    } else if (provider === 'openai') {
      const apiKey = get('campaign_openai_key') || process.env.OPENAI_API_KEY || '';
      if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });
      const OpenAI = require('openai');
      const client = new OpenAI.default({ apiKey });
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage },
        ],
        max_tokens: 1024,
      });
      content = completion.choices[0]?.message?.content || '';

    } else if (provider === 'gemini') {
      const apiKey = get('campaign_gemini_key') || process.env.GEMINI_API_KEY || '';
      if (!apiKey) return res.status(400).json({ error: 'Gemini API key not configured' });
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      const result = await model.generateContent(`${SYSTEM_PROMPT}\n\n${userMessage}`);
      content = result.response.text();

    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    res.json({ ok: true, content });
  } catch (err) {
    console.error('[campaigns] generate error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Send ───────────────────────────────────────────────────────────────────────

router.post('/send', auth, async (req, res) => {
  const { content, channels = [] } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  const results = {};

  if (channels.includes('telegram')) {
    results.telegram = await sendTelegram(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }
  if (channels.includes('whatsapp')) {
    results.whatsapp = await sendWhatsApp(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }

  const anyOk = Object.values(results).some((r) => r.ok);
  res.json({ ok: anyOk, results });
});

module.exports = router;
