import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';

const TABS = ['Settings', 'Messages', 'Logs'];

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
  test:                   'bg-vs-success/15 text-vs-success',
  manual:                 'bg-vs-elevated text-vs-text-3',
};

// ── Messages tab ─────────────────────────────────────────────────────────────

function TemplateEditor({ tpl, onSaved }) {
  const [text, setText]       = useState(tpl.template);
  const [enabled, setEnabled] = useState(tpl.enabled);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const textareaRef           = useRef(null);

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

      {/* Macro chips */}
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

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm font-mono text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-y"
      />

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TelegramSettings() {
  const [tab, setTab] = useState('Settings');

  const [status, setStatus]         = useState(null);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [message, setMessage]       = useState('');
  const [sending, setSending]       = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');

  const [threshold, setThreshold]           = useState('7');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdMsg, setThresholdMsg]     = useState('');

  const [templates, setTemplates]             = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [logs, setLogs]               = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadStatus = () =>
    api.get('/telegram/status').then((r) => setStatus(r.data)).catch(() => {});

  const loadTemplates = useCallback(() => {
    setTemplatesLoading(true);
    api.get('/telegram/templates')
      .then((r) => setTemplates(r.data))
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, []);

  const loadLogs = useCallback(() => {
    setLogsLoading(true);
    api.get('/telegram/logs')
      .then((r) => setLogs(r.data.rows))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, []);

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { if (tab === 'Messages') loadTemplates(); }, [tab, loadTemplates]);
  useEffect(() => { if (tab === 'Logs') loadLogs(); }, [tab, loadLogs]);

  // Load threshold when Settings tab is active
  useEffect(() => {
    if (tab === 'Settings') {
      api.get('/telegram/config').then((r) => {
        if (r.data.largeStakeThreshold) setThreshold(String(r.data.largeStakeThreshold));
      }).catch(() => {});
    }
  }, [tab]);

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Telegram Notifications</h1>
        <p className="text-sm text-vs-text-3 mt-1">Automatic alerts to your Telegram group when new challenges are created</p>
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

      {/* ── Settings tab ── */}
      {tab === 'Settings' && (
        <>
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

          {/* Alert Settings */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Alert Settings</p>
            <p className="text-xs text-vs-text-3 mb-4">Configure thresholds for cross-cutting alert triggers.</p>
            <form onSubmit={handleSaveThreshold} className="flex items-end gap-4">
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
            <div className="bg-vs-card border border-vs-border rounded-xl p-5">
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
        </>
      )}

      {/* ── Messages tab ── */}
      {tab === 'Messages' && (
        <div>
          <p className="text-xs text-vs-text-3 mb-5">
            Edit the message sent to Telegram for each trigger. Click a macro chip to insert it at the cursor position.
            Use plain text — HTML tags like <span className="font-mono text-xs bg-vs-elevated px-1 rounded">&lt;b&gt;</span> are also supported for bold.
          </p>
          {templatesLoading ? (
            <div className="h-40 bg-vs-card border border-vs-border rounded-xl animate-pulse" />
          ) : (
            templates.map((tpl) => (
              <TemplateEditor key={tpl.trigger} tpl={tpl} onSaved={loadTemplates} />
            ))
          )}
        </div>
      )}

      {/* ── Logs tab ── */}
      {tab === 'Logs' && (
        <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-vs-border flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Send Log</p>
            <button onClick={loadLogs}
              className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1 rounded border border-vs-border hover:bg-vs-elevated transition-colors">
              Refresh
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vs-border bg-vs-elevated/40">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Time</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Trigger</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Message Preview</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vs-border">
              {logsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-5 py-3"><div className="h-4 bg-vs-elevated rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-vs-text-3 text-sm">No sends recorded yet.</td></tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} className="hover:bg-vs-elevated/40 transition-colors">
                    <td className="px-5 py-3 text-xs text-vs-text-3 whitespace-nowrap">{row.created_at}</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
