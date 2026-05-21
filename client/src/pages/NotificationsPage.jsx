import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';

const TABS = ['Channels', 'Direct Messages', 'Messages', 'Logs', 'Settings'];

const DEFAULT_DM_TEMPLATE = `Welcome to Vermö! 🎉

Hi {{name}}, thanks for joining.

📣 Join our WhatsApp group to chat with other players:
{{group_link}}

🔔 Follow our WhatsApp channel for match updates & announcements:
{{channel_link}}

Good luck! 🏆`;

const DM_MACROS = [
  { key: '{{name}}',         desc: 'User display name' },
  { key: '{{username}}',     desc: 'Username' },
  { key: '{{group_link}}',   desc: 'WhatsApp group invite link' },
  { key: '{{channel_link}}', desc: 'WhatsApp channel link' },
];

function timeAgo(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const TRIGGER_LABELS = {
  game_bet:               'Single Bet',
  game_bet_multi_created: 'Multi Created',
  game_bet_multi_half:    '60% Full',
  game_bet_multi_almost_3:'3 Slots Left',
  game_bet_multi_almost_1:'Last Slot',
  game_bet_match_1hr:     '1hr Countdown',
  game_bet_match_30min:   '30min Countdown',
  game_bet_match_15min:   '15min Countdown',
  game_bet_large_stake:   'Large Stake',
  game_bet_settled:       'Settled',
  rankings_weekly:        'Weekly Rankings',
  rankings_monthly:       'Monthly Rankings',
  user_registered:        'User Welcome',
  dm_test:                'DM Test',
  test:                   'Test',
  manual:                 'Manual',
};

const TRIGGER_COLORS = {
  game_bet:               'bg-vs-purple/15 text-vs-purple-light',
  game_bet_multi_created: 'bg-vs-purple/15 text-vs-purple-light',
  game_bet_multi_half:    'bg-vs-warning/15 text-vs-warning',
  game_bet_multi_almost_3:'bg-vs-warning/15 text-vs-warning',
  game_bet_multi_almost_1:'bg-vs-danger/15 text-vs-danger',
  game_bet_match_1hr:     'bg-vs-lime/15 text-vs-lime',
  game_bet_match_30min:   'bg-vs-lime/15 text-vs-lime',
  game_bet_match_15min:   'bg-vs-lime/15 text-vs-lime',
  game_bet_large_stake:   'bg-vs-warning/15 text-vs-warning',
  game_bet_settled:       'bg-vs-success/15 text-vs-success',
  rankings_weekly:        'bg-vs-purple/15 text-vs-purple-light',
  rankings_monthly:       'bg-vs-purple/15 text-vs-purple-light',
  user_registered:        'bg-vs-success/15 text-vs-success',
  dm_test:                'bg-vs-success/15 text-vs-success',
  test:                   'bg-vs-success/15 text-vs-success',
  manual:                 'bg-vs-elevated text-vs-text-3',
};

// ── Template editor ───────────────────────────────────────────────────────────

function TemplateEditor({ tpl, onSaved }) {
  const [text, setText]         = useState(tpl.template);
  const [enabled, setEnabled]   = useState(tpl.enabled);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [testing, setTesting]   = useState(false);
  const [testMsg, setTestMsg]   = useState('');
  const [preview, setPreview]   = useState(false);
  const textareaRef             = useRef(null);

  const insertMacro = (macro) => {
    const el  = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = text.slice(0, start) + macro + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + macro.length;
      el.focus();
    });
  };

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      await api.post(`/telegram/templates/${tpl.trigger}`, { template: text, enabled });
      setMsg('Saved');
      onSaved?.();
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => { setText(tpl.default || tpl.template); setMsg(''); };

  const handleTest = async () => {
    setTesting(true); setTestMsg('');
    try {
      const r = await api.post(`/telegram/templates/${tpl.trigger}/test`);
      setTestMsg(r.data.ok ? 'Test sent!' : (r.data.description || 'Failed'));
    } catch (e) {
      setTestMsg(e.response?.data?.error || 'Failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-sm font-semibold text-vs-text">{tpl.label}</p>
          <p className="text-xs text-vs-text-3 mt-0.5">{tpl.description}</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <span className="text-xs text-vs-text-3">Enabled</span>
          <button
            onClick={() => setEnabled((v) => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-vs-success' : 'bg-vs-elevated border border-vs-border'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-5' : 'left-0.5'}`} />
          </button>
        </label>
      </div>

      <div className="mb-3">
        <p className="text-xs text-vs-text-3 mb-2">Available macros — click to insert at cursor:</p>
        <div className="flex flex-wrap gap-1.5">
          {tpl.macros?.map((m) => (
            <button key={m.key} onClick={() => insertMacro(m.key)}
              title={m.desc}
              className="px-2 py-0.5 text-xs font-mono rounded bg-vs-elevated border border-vs-border text-vs-purple-light hover:bg-vs-purple/15 transition-colors">
              {m.key}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-vs-text-3 flex-1">Template</span>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
            preview
              ? 'bg-vs-purple/15 border-vs-purple/40 text-vs-purple-light'
              : 'border-vs-border text-vs-text-3 hover:text-vs-text hover:bg-vs-elevated'
          }`}
        >
          {preview ? '✏ Edit' : '👁 Preview'}
        </button>
      </div>

      {preview ? (
        <div className="w-full min-h-[240px] px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm font-mono text-vs-text whitespace-pre-wrap">
          {renderPreview(text)}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm font-mono text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-y"
        />
      )}

      <div className="flex items-center gap-3 mt-3">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Template'}
        </button>
        <button onClick={handleTest} disabled={testing || saving}
          className="px-3 py-2 text-xs text-vs-purple-light border border-vs-purple/30 rounded-lg hover:bg-vs-purple/10 transition-colors disabled:opacity-50">
          {testing ? 'Sending…' : '▶ Test'}
        </button>
        <button onClick={handleReset}
          className="px-3 py-2 text-xs text-vs-text-3 hover:text-vs-text border border-vs-border rounded-lg hover:bg-vs-elevated transition-colors">
          Reset to Default
        </button>
        {msg && <p className={`text-xs ${msg === 'Saved' ? 'text-vs-success' : 'text-vs-danger'}`}>{msg}</p>}
        {testMsg && <p className={`text-xs ${testMsg === 'Test sent!' ? 'text-vs-success' : 'text-vs-danger'}`}>{testMsg}</p>}
      </div>
    </div>
  );
}

// ── Preview vars ──────────────────────────────────────────────────────────────

const PREVIEW_VARS = {
  recipient:           'testuser',
  your_result:         'Won 🏆',
  home_team:           'Arsenal',
  away_team:           'Chelsea',
  league:              'Premier League',
  stake:               '$5.00',
  max_players:         10,
  current_players:     6,
  slots_remaining:     4,
  fill_percent:        '60%',
  current_pot:         '$30.00',
  potential_pot:       '$50.00',
  creator:             'testuser',
  winner:              'testuser',
  earnings:            '$21.00',
  players_joined:      6,
  code:                'TEST-ABCD',
  mode:                'Multiplayer',
  slots:               10,
  minutes_until_match: 60,
  kickoff_time:        '20:00',
  match_date:          new Date().toLocaleDateString('en-GB'),
  period:              'This Week',
  week:                '12 May – 18 May 2025',
  month:               'May 2025',
  generated_at:        new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  top_players:         '🥇 testuser1 — 320 pts (5 bets)\n🥈 testuser2 — 280 pts (4 bets)\n🥉 testuser3 — 210 pts (3 bets)',
  total_players:       42,
};

function renderPreview(template) {
  return Object.entries(PREVIEW_VARS).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v ?? '—'),
    template,
  );
}

// ── Messages sub-tab ──────────────────────────────────────────────────────────

function MessagesTab({ templates, loading, onSaved }) {
  const [mode, setMode] = useState('single');

  const subTabCls = (active) =>
    `px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
      active ? 'bg-vs-card text-vs-text shadow-sm' : 'text-vs-text-3 hover:text-vs-text'
    }`;

  const displayed = loading ? [] : templates.filter((t) => t.group === mode);

  return (
    <div>
      <p className="text-xs text-vs-text-3 mb-4">
        Edit the message sent to Telegram for each trigger. Click a macro chip to insert it at the cursor.
        HTML tags like <span className="font-mono text-xs bg-vs-elevated px-1 rounded">&lt;b&gt;</span> are supported for bold.
      </p>

      <div className="flex gap-1 mb-5 bg-vs-elevated rounded-lg p-1 w-fit">
        <button onClick={() => setMode('single')}   className={subTabCls(mode === 'single')}>Single Bet</button>
        <button onClick={() => setMode('multi')}    className={subTabCls(mode === 'multi')}>Multiplayer</button>
        <button onClick={() => setMode('settled')}  className={subTabCls(mode === 'settled')}>Settled</button>
        <button onClick={() => setMode('rankings')} className={subTabCls(mode === 'rankings')}>Rankings</button>
      </div>

      {loading ? (
        <div className="h-40 bg-vs-card border border-vs-border rounded-xl animate-pulse" />
      ) : displayed.length === 0 ? (
        <div className="bg-vs-card border border-vs-border rounded-xl p-8 text-center text-vs-text-3 text-sm">
          No templates found.
        </div>
      ) : (
        displayed.map((tpl) => (
          <TemplateEditor key={tpl.trigger} tpl={tpl} onSaved={onSaved} />
        ))
      )}
    </div>
  );
}

// ── Channel toggle card ───────────────────────────────────────────────────────

function ChannelToggle({ channel, enabled, onToggle, toggling }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-vs-text">{channel} Notifications</p>
        <p className="text-xs text-vs-text-3 mt-0.5">
          {enabled
            ? 'Notifications are enabled — messages will be sent to this channel.'
            : 'Notifications are disabled — messages will not be sent to this channel.'}
        </p>
      </div>
      <button
        onClick={onToggle}
        disabled={toggling}
        className={`relative w-12 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${
          enabled ? 'bg-vs-success' : 'bg-vs-elevated border border-vs-border'
        }`}
      >
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg bg-vs-elevated border border-vs-border flex items-center justify-center text-xl flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-vs-text">{title}</p>
        <p className="text-xs text-vs-text-3">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [tab, setTab] = useState('Channels');

  // ── Telegram state ────────────────────────────────────────────────────────
  const [status, setStatus]             = useState(null);
  const [tgEnabled, setTgEnabled]       = useState(true);
  const [togglingTg, setTogglingTg]     = useState(false);
  const [testing, setTesting]           = useState(false);
  const [testResult, setTestResult]     = useState(null);
  const [message, setMessage]           = useState('');
  const [sending, setSending]           = useState(false);
  const [sendResult, setSendResult]     = useState(null);
  const [botToken, setBotToken]         = useState('');
  const [chatId, setChatId]             = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');

  // ── WhatsApp group state ──────────────────────────────────────────────────
  const [waStatus, setWaStatus]         = useState(null);
  const [waEnabled, setWaEnabled]       = useState(true);
  const [togglingWa, setTogglingWa]     = useState(false);
  const [waToken, setWaToken]           = useState('');
  const [waGroupId, setWaGroupId]       = useState('');
  const [waSaving, setWaSaving]         = useState(false);
  const [waSaveMsg, setWaSaveMsg]       = useState('');
  const [waTesting, setWaTesting]       = useState(false);
  const [waTestResult, setWaTestResult] = useState(null);
  const [waMessage, setWaMessage]       = useState('');
  const [waSending, setWaSending]       = useState(false);
  const [waSendResult, setWaSendResult] = useState(null);

  // ── Direct Messages state ─────────────────────────────────────────────────
  const [dmEnabled, setDmEnabled]             = useState(false);
  const [togglingDm, setTogglingDm]           = useState(false);
  const [dmGroupLink, setDmGroupLink]         = useState('');
  const [dmChannelLink, setDmChannelLink]     = useState('');
  const [dmSavingConfig, setDmSavingConfig]   = useState(false);
  const [dmConfigMsg, setDmConfigMsg]         = useState('');
  const [dmTemplate, setDmTemplate]           = useState(DEFAULT_DM_TEMPLATE);
  const [dmSavingTemplate, setDmSavingTemplate] = useState(false);
  const [dmTemplateMsg, setDmTemplateMsg]     = useState('');
  const [dmTestPhone, setDmTestPhone]         = useState('');
  const [dmTesting, setDmTesting]             = useState(false);
  const [dmTestResult, setDmTestResult]       = useState(null);
  const [dmLogs, setDmLogs]                         = useState([]);
  const [dmLogsLoading, setDmLogsLoading]           = useState(false);
  const [dmRetryingId, setDmRetryingId]             = useState(null);
  const [dmRetryResults, setDmRetryResults]         = useState({});
  const [settledTestCode, setSettledTestCode]       = useState('');
  const [settledTesting, setSettledTesting]         = useState(false);
  const [settledTestResults, setSettledTestResults] = useState(null);
  const dmTextareaRef                               = useRef(null);

  // ── Settings tab state ────────────────────────────────────────────────────
  const [threshold, setThreshold]               = useState('7');
  const [savingThreshold, setSavingThreshold]   = useState(false);
  const [thresholdMsg, setThresholdMsg]         = useState('');
  const [rankingsTopN, setRankingsTopN]         = useState('10');
  const [savingTopN, setSavingTopN]             = useState(false);
  const [topNMsg, setTopNMsg]                   = useState('');
  const [watcherStatus, setWatcherStatus]       = useState(null);
  const [watcherTick, setWatcherTick]           = useState(0);
  const [rankingsPeriod, setRankingsPeriod]     = useState('weekly');
  const [rankingsWeekStart, setRankingsWeekStart] = useState('');
  const [rankingsMonthOf, setRankingsMonthOf]   = useState('');
  const [rankingsMonthSel, setRankingsMonthSel] = useState('');
  const [rankingsYearSel, setRankingsYearSel]   = useState('');
  const [sendingRankings, setSendingRankings]   = useState(false);
  const [rankingsSendMsg, setRankingsSendMsg]   = useState('');
  const [rankingsChannels, setRankingsChannels] = useState({ telegram: true, whatsapp: true });

  // ── Logs + Messages state ─────────────────────────────────────────────────
  const [logChannel, setLogChannel]             = useState('all');
  const [templates, setTemplates]               = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [logs, setLogs]                         = useState([]);
  const [logsLoading, setLogsLoading]           = useState(false);
  const [logTriggerFilter, setLogTriggerFilter] = useState('');
  const [retryingId, setRetryingId]             = useState(null);
  const [retryResults, setRetryResults]         = useState({});

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadStatus = () =>
    api.get('/telegram/status').then((r) => {
      setStatus(r.data);
      if (r.data.enabled != null) setTgEnabled(!!r.data.enabled);
    }).catch(() => {});

  const loadTemplates = useCallback(() => {
    setTemplatesLoading(true);
    api.get('/telegram/templates')
      .then((r) => setTemplates(r.data))
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, []);

  const loadLogs = useCallback(() => {
    setLogsLoading(true);
    api.get('/telegram/logs', { params: { channel: logChannel } })
      .then((r) => setLogs(r.data.rows))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, [logChannel]);

  const loadDmConfig = useCallback(() => {
    api.get('/notifications/dm/config').then((r) => {
      setDmEnabled(!!r.data.enabled);
      setDmGroupLink(r.data.groupLink || '');
      setDmChannelLink(r.data.channelLink || '');
      setDmTemplate(r.data.welcomeTemplate || DEFAULT_DM_TEMPLATE);
    }).catch(() => {});
  }, []);

  const loadDmLogs = useCallback(() => {
    setDmLogsLoading(true);
    api.get('/notifications/dm/logs')
      .then((r) => setDmLogs(r.data.rows))
      .catch(() => {})
      .finally(() => setDmLogsLoading(false));
  }, []);

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { if (tab === 'Messages') loadTemplates(); }, [tab, loadTemplates]);
  useEffect(() => { if (tab === 'Logs') loadLogs(); }, [tab, loadLogs]);
  useEffect(() => { if (tab === 'Logs') loadLogs(); }, [logChannel]);

  useEffect(() => {
    if (tab !== 'Channels') return;
    api.get('/whatsapp/status').then((r) => {
      setWaStatus(r.data);
      if (r.data.enabled != null) setWaEnabled(!!r.data.enabled);
    }).catch(() => {});
    api.get('/whatsapp/config').then((r) => {
      if (r.data.groupId) setWaGroupId(r.data.groupId);
    }).catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (tab !== 'Direct Messages') return;
    loadDmConfig();
    loadDmLogs();
  }, [tab, loadDmConfig, loadDmLogs]);

  useEffect(() => {
    if (tab !== 'Settings') return;
    api.get('/telegram/config').then((r) => {
      if (r.data.largeStakeThreshold) setThreshold(String(r.data.largeStakeThreshold));
      if (r.data.rankingsTopN)        setRankingsTopN(String(r.data.rankingsTopN));
    }).catch(() => {});
    const fetchWatcher = () =>
      api.get('/telegram/watcher-status').then((r) => setWatcherStatus(r.data)).catch(() => {});
    fetchWatcher();
    const pollId = setInterval(fetchWatcher, 15000);
    const tickId = setInterval(() => setWatcherTick((n) => n + 1), 5000);
    return () => { clearInterval(pollId); clearInterval(tickId); };
  }, [tab]);

  // ── Telegram handlers ─────────────────────────────────────────────────────

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSaving(true); setSaveMsg('');
    try {
      await api.post('/telegram/config', { botToken, chatId });
      setSaveMsg('Saved! Test the connection below.');
      setBotToken(''); setChatId('');
      setTestResult(null);
      await loadStatus();
    } catch (err) {
      setSaveMsg(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTg = async () => {
    setTogglingTg(true);
    const next = !tgEnabled;
    try {
      await api.post('/telegram/config', { enabled: next });
      setTgEnabled(next);
    } catch { /* ignore */ } finally {
      setTogglingTg(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.post('/telegram/test');
      setTestResult({ ok: r.data.ok, msg: r.data.ok ? 'Message sent!' : (r.data.description || 'Failed') });
    } catch (e) {
      setTestResult({ ok: false, msg: e.response?.data?.error || 'Request failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true); setSendResult(null);
    try {
      const r = await api.post('/telegram/send', { text: message });
      setSendResult({ ok: r.data.ok, msg: r.data.ok ? 'Sent!' : (r.data.description || 'Failed') });
      if (r.data.ok) setMessage('');
    } catch (e) {
      setSendResult({ ok: false, msg: e.response?.data?.error || 'Request failed' });
    } finally {
      setSending(false);
    }
  };

  // ── WhatsApp group handlers ───────────────────────────────────────────────

  const handleWaSave = async (e) => {
    e.preventDefault();
    setWaSaving(true); setWaSaveMsg('');
    try {
      await api.post('/whatsapp/config', { apiToken: waToken || undefined, groupId: waGroupId || undefined });
      setWaSaveMsg('Saved!');
      setWaToken('');
      const r = await api.get('/whatsapp/status');
      setWaStatus(r.data);
      if (r.data.enabled != null) setWaEnabled(!!r.data.enabled);
    } catch (err) {
      setWaSaveMsg(err.response?.data?.error || 'Failed');
    } finally {
      setWaSaving(false);
    }
  };

  const handleToggleWa = async () => {
    setTogglingWa(true);
    const next = !waEnabled;
    try {
      await api.post('/whatsapp/config', { enabled: next });
      setWaEnabled(next);
    } catch { /* ignore */ } finally {
      setTogglingWa(false);
    }
  };

  const handleWaTest = async () => {
    setWaTesting(true); setWaTestResult(null);
    try {
      const r = await api.post('/whatsapp/test');
      setWaTestResult({ ok: r.data.ok, msg: r.data.ok ? 'Message sent!' : (r.data.reason || 'Failed') });
    } catch (e) {
      setWaTestResult({ ok: false, msg: e.response?.data?.error || 'Request failed' });
    } finally {
      setWaTesting(false);
    }
  };

  const handleWaSend = async (e) => {
    e.preventDefault();
    if (!waMessage.trim()) return;
    setWaSending(true); setWaSendResult(null);
    try {
      const r = await api.post('/whatsapp/send', { text: waMessage });
      setWaSendResult({ ok: r.data.ok, msg: r.data.ok ? 'Sent!' : (r.data.reason || r.data.error || 'Failed') });
      if (r.data.ok) setWaMessage('');
    } catch (e) {
      setWaSendResult({ ok: false, msg: e.response?.data?.error || 'Request failed' });
    } finally {
      setWaSending(false);
    }
  };

  // ── Direct Messages handlers ──────────────────────────────────────────────

  const handleToggleDm = async () => {
    setTogglingDm(true);
    const next = !dmEnabled;
    try {
      await api.post('/notifications/dm/config', { enabled: next });
      setDmEnabled(next);
    } catch { /* ignore */ } finally {
      setTogglingDm(false);
    }
  };

  const handleSaveDmConfig = async (e) => {
    e.preventDefault();
    setDmSavingConfig(true); setDmConfigMsg('');
    try {
      await api.post('/notifications/dm/config', { groupLink: dmGroupLink, channelLink: dmChannelLink });
      setDmConfigMsg('Saved!');
    } catch (err) {
      setDmConfigMsg(err.response?.data?.error || 'Failed');
    } finally {
      setDmSavingConfig(false);
    }
  };

  const handleSaveDmTemplate = async () => {
    setDmSavingTemplate(true); setDmTemplateMsg('');
    try {
      await api.post('/notifications/dm/config', { welcomeTemplate: dmTemplate });
      setDmTemplateMsg('Saved!');
    } catch (err) {
      setDmTemplateMsg(err.response?.data?.error || 'Failed');
    } finally {
      setDmSavingTemplate(false);
    }
  };

  const insertDmMacro = (macro) => {
    const el = dmTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = dmTemplate.slice(0, start) + macro + dmTemplate.slice(end);
    setDmTemplate(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + macro.length;
      el.focus();
    });
  };

  const handleDmTest = async (e) => {
    e.preventDefault();
    if (!dmTestPhone.trim()) return;
    setDmTesting(true); setDmTestResult(null);
    try {
      const r = await api.post('/notifications/dm/test', { phone: dmTestPhone });
      setDmTestResult({ ok: r.data.ok, msg: r.data.ok ? 'DM sent!' : (r.data.reason || 'Failed') });
    } catch (err) {
      setDmTestResult({ ok: false, msg: err.response?.data?.error || 'Request failed' });
    } finally {
      setDmTesting(false);
    }
  };

  const handleDmRetry = async (id) => {
    setDmRetryingId(id);
    setDmRetryResults((prev) => ({ ...prev, [id]: null }));
    try {
      const r = await api.post(`/notifications/dm/logs/${id}/retry`);
      setDmRetryResults((prev) => ({ ...prev, [id]: r.data.ok ? 'ok' : (r.data.reason || 'fail') }));
    } catch (err) {
      setDmRetryResults((prev) => ({ ...prev, [id]: err.response?.data?.error || 'fail' }));
    } finally {
      setDmRetryingId(null);
    }
  };

  const handleSettledTest = async (e) => {
    e.preventDefault();
    if (!settledTestCode.trim()) return;
    setSettledTesting(true); setSettledTestResults(null);
    try {
      const r = await api.post('/notifications/dm/test-settled', { bookingCode: settledTestCode.trim() });
      setSettledTestResults(r.data);
    } catch (err) {
      setSettledTestResults({ ok: false, error: err.response?.data?.error || 'Request failed', results: [] });
    } finally {
      setSettledTesting(false);
    }
  };

  // ── Settings handlers ─────────────────────────────────────────────────────

  const handleSaveThreshold = async (e) => {
    e.preventDefault();
    setSavingThreshold(true); setThresholdMsg('');
    try {
      await api.post('/telegram/config', { largeStakeThreshold: Number(threshold) });
      setThresholdMsg('Saved');
    } catch (err) {
      setThresholdMsg(err.response?.data?.error || 'Failed');
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleSaveTopN = async (e) => {
    e.preventDefault();
    setSavingTopN(true); setTopNMsg('');
    try {
      await api.post('/telegram/config', { rankingsTopN: Number(rankingsTopN) });
      setTopNMsg('Saved');
    } catch (err) {
      setTopNMsg(err.response?.data?.error || 'Failed');
    } finally {
      setSavingTopN(false);
    }
  };

  const handleSendRankings = async (e) => {
    e.preventDefault();
    setSendingRankings(true); setRankingsSendMsg('');
    try {
      const body = { period: rankingsPeriod };
      if (rankingsPeriod === 'weekly'  && rankingsWeekStart) body.weekStart = rankingsWeekStart;
      if (rankingsPeriod === 'monthly' && rankingsMonthOf)   body.monthOf   = rankingsMonthOf;
      const channels = Object.entries(rankingsChannels).filter(([, v]) => v).map(([k]) => k);
      if (channels.length) body.channels = channels;
      const r = await api.post('/telegram/rankings/send', body);
      setRankingsSendMsg(r.data.ok ? 'Sent!' : (r.data.description || r.data.error || 'Failed'));
    } catch (err) {
      setRankingsSendMsg(err.response?.data?.error || 'Request failed');
    } finally {
      setSendingRankings(false);
    }
  };

  const handleRetry = async (id, channel) => {
    setRetryingId(id);
    setRetryResults((prev) => ({ ...prev, [id]: null }));
    try {
      const endpoint = channel === 'whatsapp' ? `/whatsapp/logs/${id}/retry` : `/telegram/logs/${id}/retry`;
      const r = await api.post(endpoint);
      setRetryResults((prev) => ({ ...prev, [id]: r.data.ok ? 'ok' : (r.data.description || r.data.error || 'fail') }));
    } catch (err) {
      setRetryResults((prev) => ({ ...prev, [id]: err.response?.data?.error || 'fail' }));
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Notification Center</h1>
        <p className="text-sm text-vs-text-3 mt-1">Manage broadcast channels, direct messages, templates, and alert settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-vs-elevated rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-vs-card text-vs-text shadow-sm' : 'text-vs-text-3 hover:text-vs-text'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Channels tab ── */}
      {tab === 'Channels' && (
        <>
          {/* Telegram section */}
          <SectionHeader icon="✈️" title="Telegram" subtitle="Broadcast notifications to a Telegram group" />

          <ChannelToggle channel="Telegram" enabled={tgEnabled} onToggle={handleToggleTg} toggling={togglingTg} />

          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Bot Configuration</p>
            <p className="text-xs text-vs-text-3 mb-4">Saved to local storage — no server restart needed.</p>
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-vs-text-3 block mb-1">Bot Token</label>
                  <input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)}
                    placeholder={status?.botTokenSet ? 'Already set — paste new to update' : '123456:ABCdef…'}
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs text-vs-text-3 block mb-1">Chat ID</label>
                  <input type="text" value={chatId} onChange={(e) => setChatId(e.target.value)}
                    placeholder={status?.chatId || '-1001234567890'}
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving || (!botToken.trim() && !chatId.trim())}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saveMsg && <p className={`text-xs ${saveMsg.startsWith('Saved') ? 'text-vs-success' : 'text-vs-danger'}`}>{saveMsg}</p>}
              </div>
            </form>
          </div>

          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Connection Status</p>
            {status ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.configured ? 'bg-vs-success' : 'bg-vs-danger'}`} />
                  <span className={`text-sm font-medium ${status.configured ? 'text-vs-success' : 'text-vs-danger'}`}>
                    {status.configured ? 'Configured & Active' : 'Not Configured'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-vs-elevated rounded-lg px-4 py-3 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status.botTokenSet ? 'bg-vs-success' : 'bg-vs-danger'}`} />
                    <span className="text-vs-text-3">Bot Token</span>
                    <span className={`ml-auto font-medium ${status.botTokenSet ? 'text-vs-success' : 'text-vs-danger'}`}>
                      {status.botTokenSet ? status.botTokenPreview : 'Missing'}
                    </span>
                  </div>
                  <div className="bg-vs-elevated rounded-lg px-4 py-3 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status.chatIdSet ? 'bg-vs-success' : 'bg-vs-danger'}`} />
                    <span className="text-vs-text-3">Chat ID</span>
                    <span className={`ml-auto font-mono font-medium ${status.chatIdSet ? 'text-vs-success' : 'text-vs-danger'}`}>
                      {status.chatId || 'Missing'}
                    </span>
                  </div>
                </div>
                {status.configured && (
                  <div className="pt-1 flex items-center gap-3">
                    <button onClick={handleTest} disabled={testing}
                      className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                      {testing ? 'Sending…' : 'Send Test Message'}
                    </button>
                    {testResult && <p className={`text-xs ${testResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{testResult.msg}</p>}
                  </div>
                )}
              </div>
            ) : <div className="h-16 animate-pulse bg-vs-elevated rounded-lg" />}
          </div>

          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">How to get your credentials</p>
            <ol className="space-y-3 text-sm text-vs-text-2">
              {[
                <>Message <span className="font-mono text-vs-purple-light">@BotFather</span> on Telegram → send <span className="font-mono">/newbot</span> → follow the steps to receive your <strong>bot token</strong>.</>,
                <>Add your bot to your Telegram group as an <strong>administrator</strong>.</>,
                <>Get the group <strong>Chat ID</strong>: forward any group message to <span className="font-mono text-vs-purple-light">@userinfobot</span>. Group IDs are negative numbers like <span className="font-mono">-1001234567890</span>.</>,
                <>Paste both values into the form above and click <strong>Save</strong>.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {status?.configured && (
            <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Send Manual Message</p>
              <form onSubmit={handleSend} className="space-y-3">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message to send to the Telegram group…" rows={3}
                  className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none" />
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={sending || !message.trim()}
                    className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                  {sendResult && <p className={`text-xs ${sendResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{sendResult.msg}</p>}
                </div>
              </form>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-vs-border mb-8" />

          {/* WhatsApp group section */}
          <SectionHeader icon="💬" title="WhatsApp Group" subtitle="Broadcast notifications to a WhatsApp group via whapi.cloud" />

          <ChannelToggle channel="WhatsApp Group" enabled={waEnabled} onToggle={handleToggleWa} toggling={togglingWa} />

          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">WhatsApp Configuration</p>
            <p className="text-xs text-vs-text-3 mb-4">
              Powered by <span className="font-medium text-vs-text-2">whapi.cloud</span> — messages are sent alongside Telegram when both are configured.
            </p>
            <form onSubmit={handleWaSave} className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-vs-text-3 block mb-1">API Token</label>
                  <input type="password" value={waToken} onChange={(e) => setWaToken(e.target.value)}
                    placeholder={waStatus?.tokenSet ? 'Already set — paste new to update' : 'Your whapi.cloud Bearer token'}
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-vs-text-3 block mb-1">Group ID</label>
                  <input type="text" value={waGroupId} onChange={(e) => setWaGroupId(e.target.value)}
                    placeholder="120363xxxxxxxxxx@g.us"
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple font-mono" />
                  <p className="text-xs text-vs-text-3 mt-1">Format: <span className="font-mono">{'<numbers>@g.us'}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={waSaving || (!waToken.trim() && !waGroupId.trim())}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {waSaving ? 'Saving…' : 'Save'}
                </button>
                {waSaveMsg && <p className={`text-xs ${waSaveMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{waSaveMsg}</p>}
              </div>
            </form>
          </div>

          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Connection Status</p>
            {waStatus ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${waStatus.configured ? 'bg-vs-success' : 'bg-vs-danger'}`} />
                  <span className={`text-sm font-medium ${waStatus.configured ? 'text-vs-success' : 'text-vs-danger'}`}>
                    {waStatus.configured ? 'Configured & Active' : 'Not Configured'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-vs-elevated rounded-lg px-4 py-3 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${waStatus.tokenSet ? 'bg-vs-success' : 'bg-vs-danger'}`} />
                    <span className="text-vs-text-3">API Token</span>
                    <span className={`ml-auto font-medium ${waStatus.tokenSet ? 'text-vs-success' : 'text-vs-danger'}`}>
                      {waStatus.tokenSet ? waStatus.tokenPreview : 'Missing'}
                    </span>
                  </div>
                  <div className="bg-vs-elevated rounded-lg px-4 py-3 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${waStatus.groupIdSet ? 'bg-vs-success' : 'bg-vs-danger'}`} />
                    <span className="text-vs-text-3">Group ID</span>
                    <span className={`ml-auto font-mono text-xs ${waStatus.groupIdSet ? 'text-vs-success' : 'text-vs-danger'}`}>
                      {waStatus.groupId || 'Missing'}
                    </span>
                  </div>
                </div>
                {waStatus.configured && (
                  <div className="pt-1 flex items-center gap-3">
                    <button onClick={handleWaTest} disabled={waTesting}
                      className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                      {waTesting ? 'Sending…' : 'Send Test Message'}
                    </button>
                    {waTestResult && <p className={`text-xs ${waTestResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{waTestResult.msg}</p>}
                  </div>
                )}
              </div>
            ) : <div className="h-20 animate-pulse bg-vs-elevated rounded-lg" />}
          </div>

          {waStatus?.configured && (
            <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Send Manual Message</p>
              <form onSubmit={handleWaSend} className="space-y-3">
                <textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)}
                  placeholder="Type a message to send to the WhatsApp group…" rows={3}
                  className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none" />
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={waSending || !waMessage.trim()}
                    className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {waSending ? 'Sending…' : 'Send'}
                  </button>
                  {waSendResult && <p className={`text-xs ${waSendResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{waSendResult.msg}</p>}
                </div>
              </form>
            </div>
          )}

          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">How to get your credentials</p>
            <ol className="space-y-3 text-sm text-vs-text-2">
              {[
                <>Sign up at <span className="font-mono text-vs-purple-light">whapi.cloud</span> and create a channel instance.</>,
                <>Connect your WhatsApp number by scanning the QR code shown in the dashboard.</>,
                <>Copy your <strong>API Token</strong> (Bearer token) from the channel settings page.</>,
                <>Get the <strong>Group ID</strong> by sending a message to your group and checking the webhook or message logs — it looks like <span className="font-mono">120363xxxxxxxxxx@g.us</span>.</>,
                <>Paste both values into the form above and click <strong>Save</strong>.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* ── Direct Messages tab ── */}
      {tab === 'Direct Messages' && (
        <>
          <SectionHeader
            icon="📱"
            title="WhatsApp Direct Messages"
            subtitle="Automatically send a personalised welcome DM to new users when they register"
          />

          {/* Enable toggle */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-vs-text">User DMs</p>
              <p className="text-xs text-vs-text-3 mt-0.5">
                {dmEnabled
                  ? 'Welcome DMs are enabled — new users with a phone number will receive a message.'
                  : 'Welcome DMs are disabled — no messages will be sent to new users.'}
              </p>
            </div>
            <button
              onClick={handleToggleDm}
              disabled={togglingDm}
              className={`relative w-12 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${
                dmEnabled ? 'bg-vs-success' : 'bg-vs-elevated border border-vs-border'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${dmEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Links config */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Community Links</p>
            <p className="text-xs text-vs-text-3 mb-4">These links are inserted into the welcome message via <span className="font-mono text-xs">{'{{group_link}}'}</span> and <span className="font-mono text-xs">{'{{channel_link}}'}</span>.</p>
            <form onSubmit={handleSaveDmConfig} className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-vs-text-3 block mb-1">WhatsApp Group Link</label>
                  <input type="url" value={dmGroupLink} onChange={(e) => setDmGroupLink(e.target.value)}
                    placeholder="https://chat.whatsapp.com/..."
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-vs-text-3 block mb-1">WhatsApp Channel Link</label>
                  <input type="url" value={dmChannelLink} onChange={(e) => setDmChannelLink(e.target.value)}
                    placeholder="https://whatsapp.com/channel/..."
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={dmSavingConfig}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {dmSavingConfig ? 'Saving…' : 'Save Links'}
                </button>
                {dmConfigMsg && <p className={`text-xs ${dmConfigMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{dmConfigMsg}</p>}
              </div>
            </form>
          </div>

          {/* Welcome template */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Welcome Message Template</p>
            <p className="text-xs text-vs-text-3 mb-3">Sent automatically to each new user. HTML is not supported.</p>

            <div className="mb-3">
              <p className="text-xs text-vs-text-3 mb-2">Available macros — click to insert at cursor:</p>
              <div className="flex flex-wrap gap-1.5">
                {DM_MACROS.map((m) => (
                  <button key={m.key} onClick={() => insertDmMacro(m.key)}
                    title={m.desc}
                    className="px-2 py-0.5 text-xs font-mono rounded bg-vs-elevated border border-vs-border text-vs-purple-light hover:bg-vs-purple/15 transition-colors">
                    {m.key}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              ref={dmTextareaRef}
              value={dmTemplate}
              onChange={(e) => setDmTemplate(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm font-mono text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-y"
            />

            <div className="flex items-center gap-3 mt-3">
              <button onClick={handleSaveDmTemplate} disabled={dmSavingTemplate}
                className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {dmSavingTemplate ? 'Saving…' : 'Save Template'}
              </button>
              <button onClick={() => { setDmTemplate(DEFAULT_DM_TEMPLATE); setDmTemplateMsg(''); }}
                className="px-3 py-2 text-xs text-vs-text-3 hover:text-vs-text border border-vs-border rounded-lg hover:bg-vs-elevated transition-colors">
                Reset to Default
              </button>
              {dmTemplateMsg && <p className={`text-xs ${dmTemplateMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{dmTemplateMsg}</p>}
            </div>
          </div>

          {/* Test DM */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Send Test DM</p>
            <p className="text-xs text-vs-text-3 mb-4">Enter a phone number to receive a preview of the welcome message. Uses the saved template and links.</p>
            <form onSubmit={handleDmTest} className="flex items-start gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-xs text-vs-text-3 block mb-1">Phone Number</label>
                <input type="tel" value={dmTestPhone} onChange={(e) => setDmTestPhone(e.target.value)}
                  placeholder="+2348012345678"
                  className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                <p className="text-xs text-vs-text-3 mt-1">International format, e.g. +234…</p>
              </div>
              <div className="mt-5">
                <button type="submit" disabled={dmTesting || !dmTestPhone.trim()}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {dmTesting ? 'Sending…' : 'Send Test'}
                </button>
              </div>
              {dmTestResult && (
                <div className="mt-5">
                  <p className={`text-xs ${dmTestResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{dmTestResult.msg}</p>
                </div>
              )}
            </form>
          </div>

          {/* Settled notification test */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Test Settlement DM</p>
            <p className="text-xs text-vs-text-3 mb-4">
              Enter a booking code to send the settlement notification as individual WhatsApp DMs to each participant of that challenge.
              Uses the saved "Challenge Settled" template from the Messages tab.
            </p>
            <form onSubmit={handleSettledTest} className="flex items-start gap-3 mb-4">
              <div className="flex-1 max-w-xs">
                <label className="text-xs text-vs-text-3 block mb-1">Booking Code</label>
                <input
                  type="text"
                  value={settledTestCode}
                  onChange={(e) => setSettledTestCode(e.target.value)}
                  placeholder="e.g. GAME-ABCD"
                  className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
                />
              </div>
              <div className="mt-5">
                <button type="submit" disabled={settledTesting || !settledTestCode.trim()}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {settledTesting ? 'Sending…' : 'Send Test'}
                </button>
              </div>
            </form>

            {settledTestResults && (
              <div className="space-y-2">
                {settledTestResults.error && (
                  <p className="text-xs text-vs-danger">{settledTestResults.error}</p>
                )}
                {settledTestResults.betCode && (
                  <p className="text-xs text-vs-text-3 mb-2">
                    Bet: <span className="font-mono text-vs-text">{settledTestResults.betCode}</span>
                  </p>
                )}
                {settledTestResults.results?.length > 0 && (
                  <div className="rounded-lg border border-vs-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-vs-border bg-vs-elevated/60">
                          <th className="text-left px-4 py-2 font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                          <th className="text-left px-4 py-2 font-semibold uppercase tracking-wider text-vs-text-3">Phone</th>
                          <th className="text-left px-4 py-2 font-semibold uppercase tracking-wider text-vs-text-3">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-vs-border">
                        {settledTestResults.results.map((r, i) => (
                          <tr key={i} className="hover:bg-vs-elevated/30">
                            <td className="px-4 py-2 font-mono text-vs-text">{r.username}</td>
                            <td className="px-4 py-2 font-mono text-vs-text-3">{r.phone || '—'}</td>
                            <td className="px-4 py-2">
                              {r.reason === 'no_phone' ? (
                                <span className="text-vs-text-3">No phone</span>
                              ) : r.ok ? (
                                <span className="text-vs-success font-semibold">Sent</span>
                              ) : (
                                <span className="text-vs-danger">{r.reason || 'Failed'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DM log table */}
          <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-vs-border flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mr-auto">DM Send Log</p>
              <button onClick={loadDmLogs}
                className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1 rounded border border-vs-border hover:bg-vs-elevated transition-colors">
                Refresh
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border bg-vs-elevated/40">
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Time</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Phone</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Error</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-border">
                {dmLogsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-vs-elevated rounded animate-pulse" /></td>
                    ))}</tr>
                  ))
                ) : dmLogs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-vs-text-3 text-sm">No DMs sent yet.</td></tr>
                ) : (
                  dmLogs.map((row) => (
                    <tr key={row.id} className="hover:bg-vs-elevated/40 transition-colors">
                      <td className="px-5 py-3 text-xs text-vs-text-3 whitespace-nowrap">{row.sent_at}</td>
                      <td className="px-5 py-3 text-xs text-vs-text font-mono">{row.username || row.user_id}</td>
                      <td className="px-5 py-3 text-xs text-vs-text-3 font-mono">{row.phone}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold ${row.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
                          {row.ok ? 'OK' : 'FAIL'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-vs-danger">{row.error || '—'}</td>
                      <td className="px-5 py-3 text-right">
                        {!row.ok && (
                          <div className="flex items-center justify-end gap-2">
                            {dmRetryResults[row.id] && (
                              <span className={`text-xs ${dmRetryResults[row.id] === 'ok' ? 'text-vs-success' : 'text-vs-danger'}`}>
                                {dmRetryResults[row.id] === 'ok' ? '✓ Sent' : dmRetryResults[row.id]}
                              </span>
                            )}
                            <button
                              onClick={() => handleDmRetry(row.id)}
                              disabled={dmRetryingId === row.id}
                              className="text-xs text-vs-purple-light hover:text-vs-purple border border-vs-purple/30 rounded px-2 py-0.5 hover:bg-vs-purple/10 transition-colors disabled:opacity-40"
                            >
                              {dmRetryingId === row.id ? '…' : 'Retry'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Messages tab ── */}
      {tab === 'Messages' && (
        <MessagesTab templates={templates} loading={templatesLoading} onSaved={loadTemplates} />
      )}

      {/* ── Logs tab ── */}
      {tab === 'Logs' && (() => {
        const triggersInLogs = [...new Set(logs.map((r) => r.trigger))].sort();
        const visibleLogs = logTriggerFilter
          ? logs.filter((r) => r.trigger === logTriggerFilter)
          : logs;
        return (
          <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-vs-border flex items-center gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mr-auto">Broadcast Send Log</p>
              <select
                value={logChannel}
                onChange={(e) => setLogChannel(e.target.value)}
                className="px-2 py-1 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-1 focus:ring-vs-purple"
              >
                <option value="all">All channels</option>
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <select
                value={logTriggerFilter}
                onChange={(e) => setLogTriggerFilter(e.target.value)}
                className="px-2 py-1 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-1 focus:ring-vs-purple"
              >
                <option value="">All triggers</option>
                {triggersInLogs.map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t] || t}</option>
                ))}
              </select>
              <button onClick={loadLogs}
                className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1 rounded border border-vs-border hover:bg-vs-elevated transition-colors">
                Refresh
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border bg-vs-elevated/40">
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Time</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Channel</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Trigger</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Message Preview</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Error</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-border">
                {logsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-vs-elevated rounded animate-pulse" /></td>
                    ))}</tr>
                  ))
                ) : visibleLogs.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-vs-text-3 text-sm">
                    {logTriggerFilter ? 'No sends recorded for this trigger.' : 'No sends recorded yet.'}
                  </td></tr>
                ) : (
                  visibleLogs.map((row) => (
                    <tr key={row.id} className="hover:bg-vs-elevated/40 transition-colors">
                      <td className="px-5 py-3 text-xs text-vs-text-3 whitespace-nowrap">{row.created_at}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          row.channel === 'whatsapp'
                            ? 'bg-vs-success/15 text-vs-success'
                            : 'bg-vs-purple/15 text-vs-purple-light'
                        }`}>
                          {row.channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          TRIGGER_COLORS[row.trigger] || 'bg-vs-elevated text-vs-text-3'
                        }`}>
                          {TRIGGER_LABELS[row.trigger] || row.trigger}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-semibold ${row.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
                          {row.ok ? 'OK' : 'FAIL'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-vs-text-3 max-w-[280px] truncate">{row.preview}</td>
                      <td className="px-5 py-3 text-xs text-vs-danger">{row.error || '—'}</td>
                      <td className="px-5 py-3 text-right">
                        {!row.ok && (
                          <div className="flex items-center justify-end gap-2">
                            {retryResults[row.id] && (
                              <span className={`text-xs ${retryResults[row.id] === 'ok' ? 'text-vs-success' : 'text-vs-danger'}`}>
                                {retryResults[row.id] === 'ok' ? '✓ Sent' : retryResults[row.id]}
                              </span>
                            )}
                            <button
                              onClick={() => handleRetry(row.id, row.channel)}
                              disabled={retryingId === row.id}
                              className="text-xs text-vs-purple-light hover:text-vs-purple border border-vs-purple/30 rounded px-2 py-0.5 hover:bg-vs-purple/10 transition-colors disabled:opacity-40"
                            >
                              {retryingId === row.id ? '…' : 'Retry'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── Settings tab ── */}
      {tab === 'Settings' && (
        <>
          {/* Alert Settings */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Alert Settings</p>
            <p className="text-xs text-vs-text-3 mb-4">Configure thresholds for cross-cutting alert triggers.</p>

            <form onSubmit={handleSaveThreshold} className="flex items-end gap-4 mb-5">
              <div>
                <label className="text-xs text-vs-text-3 block mb-1">Large Stake Threshold ($)</label>
                <input type="number" min="0.01" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)}
                  className="w-40 px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                <p className="text-xs text-vs-text-3 mt-1">Fire "Large Stake Alert" when bet amount exceeds this value</p>
              </div>
              <div className="flex items-center gap-3 mb-[26px]">
                <button type="submit" disabled={savingThreshold}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {savingThreshold ? 'Saving…' : 'Save'}
                </button>
                {thresholdMsg && <p className={`text-xs ${thresholdMsg === 'Saved' ? 'text-vs-success' : 'text-vs-danger'}`}>{thresholdMsg}</p>}
              </div>
            </form>

            <div className="border-t border-vs-border pt-5">
              <form onSubmit={handleSaveTopN} className="flex items-end gap-4">
                <div>
                  <label className="text-xs text-vs-text-3 block mb-1">Rankings — Players Shown</label>
                  <select value={rankingsTopN} onChange={(e) => setRankingsTopN(e.target.value)}
                    className="w-40 px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple">
                    {[3, 5, 10, 15, 20, 25].map((n) => (
                      <option key={n} value={n}>Top {n}</option>
                    ))}
                  </select>
                  <p className="text-xs text-vs-text-3 mt-1">Number of players listed in weekly/monthly ranking notifications</p>
                </div>
                <div className="flex items-center gap-3 mb-[26px]">
                  <button type="submit" disabled={savingTopN}
                    className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {savingTopN ? 'Saving…' : 'Save'}
                  </button>
                  {topNMsg && <p className={`text-xs ${topNMsg === 'Saved' ? 'text-vs-success' : 'text-vs-danger'}`}>{topNMsg}</p>}
                </div>
              </form>
            </div>
          </div>

          {/* Send Rankings Now */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Send Rankings Now</p>
            <p className="text-xs text-vs-text-3 mb-4">Manually trigger a rankings notification without waiting for the scheduled send.</p>
            <form onSubmit={handleSendRankings} className="space-y-3">
              <div className="flex gap-2">
                {['weekly', 'monthly'].map((p) => (
                  <button key={p} type="button" onClick={() => { setRankingsPeriod(p); setRankingsSendMsg(''); }}
                    className={`px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                      rankingsPeriod === p
                        ? 'bg-vs-purple/15 border-vs-purple/40 text-vs-purple-light'
                        : 'border-vs-border text-vs-text-3 hover:text-vs-text hover:bg-vs-elevated'
                    }`}>
                    {p === 'weekly' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>

              {rankingsPeriod === 'weekly' && (
                <div>
                  <label className="text-xs text-vs-text-3 block mb-1">
                    Custom week <span className="opacity-60">(any date in that week — leave blank for current week)</span>
                  </label>
                  <input type="date" value={rankingsWeekStart} onChange={(e) => setRankingsWeekStart(e.target.value)}
                    className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                </div>
              )}

              {rankingsPeriod === 'monthly' && (
                <div>
                  <label className="text-xs text-vs-text-3 block mb-1">
                    Custom month <span className="opacity-60">(leave blank for current month)</span>
                  </label>
                  <div className="flex gap-2">
                    {(() => {
                      const currentYear = new Date().getFullYear();
                      const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
                      const months = [
                        ['01','January'],['02','February'],['03','March'],['04','April'],
                        ['05','May'],['06','June'],['07','July'],['08','August'],
                        ['09','September'],['10','October'],['11','November'],['12','December'],
                      ];
                      const selectCls = 'px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple';
                      return (<>
                        <select value={rankingsMonthSel} onChange={(e) => {
                          const m = e.target.value;
                          setRankingsMonthSel(m);
                          setRankingsMonthOf(rankingsYearSel && m ? `${rankingsYearSel}-${m}` : '');
                        }} className={selectCls}>
                          <option value="">Month</option>
                          {months.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                        <select value={rankingsYearSel} onChange={(e) => {
                          const y = e.target.value;
                          setRankingsYearSel(y);
                          setRankingsMonthOf(y && rankingsMonthSel ? `${y}-${rankingsMonthSel}` : '');
                        }} className={selectCls}>
                          <option value="">Year</option>
                          {years.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </>);
                    })()}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs text-vs-text-3 mb-2">Send to:</p>
                <div className="flex gap-5">
                  {[{ key: 'telegram', label: 'Telegram' }, { key: 'whatsapp', label: 'WhatsApp' }].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rankingsChannels[key]}
                        onChange={(e) => setRankingsChannels((prev) => ({ ...prev, [key]: e.target.checked }))}
                        className="w-4 h-4 rounded accent-vs-purple"
                      />
                      <span className="text-sm text-vs-text">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button type="submit"
                  disabled={sendingRankings || !Object.values(rankingsChannels).some(Boolean)}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {sendingRankings ? 'Sending…' : 'Send Rankings'}
                </button>
                {rankingsSendMsg && (
                  <p className={`text-xs ${rankingsSendMsg === 'Sent!' ? 'text-vs-success' : 'text-vs-danger'}`}>
                    {rankingsSendMsg}
                  </p>
                )}
              </div>
            </form>
          </div>

          {/* Watcher Health */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Watcher Health</p>
            {watcherStatus ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'New-Bet Poll',     value: watcherStatus.lastNewBetPoll,        count: watcherStatus.newBetPollCount,   interval: '30s' },
                    { label: 'Progress Poll',    value: watcherStatus.lastProgressPoll,      count: watcherStatus.progressPollCount, interval: '2m' },
                    { label: 'User DM Poll',     value: watcherStatus.lastUserDmPoll,        count: watcherStatus.userDmPollCount,   interval: '5m' },
                    { label: 'Weekly Rankings',  value: watcherStatus.rankingsWeeklySentAt,  count: null,                            interval: 'Mon' },
                    { label: 'Monthly Rankings', value: watcherStatus.rankingsMonthlySentAt, count: null,                            interval: '1st' },
                  ].map(({ label, value, count, interval }) => {
                    const ago  = timeAgo(value);
                    const ageS = value ? Math.floor((Date.now() - new Date(value).getTime()) / 1000) : null;
                    const dot  = !value ? 'bg-vs-text-3' : ageS < 120 ? 'bg-vs-success' : ageS < 600 ? 'bg-vs-warning' : 'bg-vs-danger';
                    return (
                      <div key={label} className="bg-vs-elevated rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                          <span className="text-xs text-vs-text-3">{label}</span>
                          <span className="ml-auto text-[10px] text-vs-text-3 opacity-60">{interval}</span>
                        </div>
                        <p className="text-xs font-mono text-vs-text">{ago || 'Never'}</p>
                        {count != null && <p className="text-[10px] text-vs-text-3 mt-0.5">{count} polls</p>}
                      </div>
                    );
                  })}
                </div>
                {watcherStatus.lastError && (
                  <div className="bg-vs-danger/10 border border-vs-danger/20 rounded-lg px-3 py-2 text-xs">
                    <span className="text-vs-danger font-semibold">Last error</span>
                    <span className="text-vs-text-3 mx-2">·</span>
                    <span className="text-vs-danger">{watcherStatus.lastError}</span>
                    {watcherStatus.lastErrorAt && (
                      <span className="text-vs-text-3 ml-2">{timeAgo(watcherStatus.lastErrorAt)}</span>
                    )}
                  </div>
                )}
                {watcherStatus.startedAt && (
                  <p className="text-xs text-vs-text-3">Watcher started {timeAgo(watcherStatus.startedAt)}</p>
                )}
              </div>
            ) : (
              <div className="h-20 animate-pulse bg-vs-elevated rounded-lg" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
