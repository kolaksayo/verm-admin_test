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
      provider:      get('campaign_ai_provider')    || 'claude',
      claudeKeySet:  !!(get('campaign_claude_key')),
      openaiKeySet:  !!(get('campaign_openai_key')),
      geminiKeySet:  !!(get('campaign_gemini_key')),
      claudeModel:   get('campaign_claude_model')   || 'claude-sonnet-4-6',
      openaiModel:   get('campaign_openai_model')   || 'gpt-4o',
      geminiModel:   get('campaign_gemini_model')   || 'gemini-2.0-flash',
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

    const { provider, claudeKey, openaiKey, geminiKey, claudeModel, openaiModel, geminiModel } = req.body;
    if (provider)     set('campaign_ai_provider',  provider);
    if (claudeKey)    set('campaign_claude_key',   claudeKey);
    if (openaiKey)    set('campaign_openai_key',   openaiKey);
    if (geminiKey)    set('campaign_gemini_key',   geminiKey);
    if (claudeModel)  set('campaign_claude_model', claudeModel);
    if (openaiModel)  set('campaign_openai_model', openaiModel);
    if (geminiModel)  set('campaign_gemini_model', geminiModel);

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
  const claudeModel = get('campaign_claude_model') || 'claude-sonnet-4-6';
  const openaiModel = get('campaign_openai_model') || 'gpt-4o';
  const geminiModel = get('campaign_gemini_model') || 'gemini-2.0-flash';

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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    let content;

    if (provider === 'claude') {
      const apiKey = get('campaign_claude_key') || process.env.ANTHROPIC_API_KEY || '';
      if (!apiKey) return res.status(400).json({ error: 'Claude API key not configured' });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      claudeModel,
          max_tokens: 1024,
          system:     SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: userMessage }],
        }),
      });
      const json = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: json.error?.message || 'Claude API error' });
      content = json.content?.[0]?.text || '';

    } else if (provider === 'openai') {
      const apiKey = get('campaign_openai_key') || process.env.OPENAI_API_KEY || '';
      if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:      openaiModel,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userMessage },
          ],
        }),
      });
      const json = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: json.error?.message || 'OpenAI API error' });
      content = json.choices?.[0]?.message?.content || '';

    } else if (provider === 'gemini') {
      const apiKey = get('campaign_gemini_key') || process.env.GEMINI_API_KEY || '';
      if (!apiKey) return res.status(400).json({ error: 'Gemini API key not configured' });

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ parts: [{ text: userMessage }] }],
          }),
        },
      );
      const json = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: json.error?.message || 'Gemini API error' });
      content = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    res.json({ ok: true, content });
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    console.error('[campaigns] generate error:', reason);
    res.status(500).json({ ok: false, error: reason });
  } finally {
    clearTimeout(timer);
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
