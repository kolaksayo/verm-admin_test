import { useEffect, useState, useCallback } from 'react';
import api from '../api';

const TABS = ['Settings', 'Logs'];

const TRIGGER_LABELS = {
  game_bet: 'Game Bet',
  test:     'Test',
  manual:   'Manual',
};

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

  const [logs, setLogs]           = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadStatus = () =>
    api.get('/telegram/status').then((r) => setStatus(r.data)).catch(() => {});

  const loadLogs = useCallback(() => {
    setLogsLoading(true);
    api.get('/telegram/logs')
      .then((r) => setLogs(r.data.rows))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, []);

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { if (tab === 'Logs') loadLogs(); }, [tab, loadLogs]);

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

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.post('/telegram/test');
      setTestResult({ ok: r.data.ok, msg: r.data.ok ? 'Message sent successfully!' : (r.data.description || 'Failed') });
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

      {tab === 'Settings' && (
        <>
          {/* Config form */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Bot Configuration</p>
            <p className="text-xs text-vs-text-3 mb-4">Saved to local storage — no server restart needed.</p>
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-vs-text-3 block mb-1">Bot Token</label>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={status?.botTokenSet ? 'Already set — paste new to update' : '123456:ABCdef…'}
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs text-vs-text-3 block mb-1">Chat ID</label>
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder={status?.chatId || '-1001234567890'}
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving || (!botToken.trim() && !chatId.trim())}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saveMsg && (
                  <p className={`text-xs ${saveMsg.startsWith('Saved') ? 'text-vs-success' : 'text-vs-danger'}`}>{saveMsg}</p>
                )}
              </div>
            </form>
          </div>

          {/* Status + test */}
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
                    {testResult && (
                      <p className={`text-xs ${testResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{testResult.msg}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-16 animate-pulse bg-vs-elevated rounded-lg" />
            )}
          </div>

          {/* Setup instructions */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">How to get your credentials</p>
            <ol className="space-y-3 text-sm text-vs-text-2">
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <span>Message <span className="font-mono text-vs-purple-light">@BotFather</span> on Telegram → send <span className="font-mono">/newbot</span> → follow the steps to receive your <strong>bot token</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <span>Add your bot to your Telegram group as an <strong>administrator</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <span>Get the group <strong>Chat ID</strong>: forward any group message to <span className="font-mono text-vs-purple-light">@userinfobot</span>. Group IDs are negative numbers like <span className="font-mono">-1001234567890</span>.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">4</span>
                <span>Paste both values into the form above and click <strong>Save</strong>.</span>
              </li>
            </ol>
          </div>

          {/* Manual message sender */}
          {status?.configured && (
            <div className="bg-vs-card border border-vs-border rounded-xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Send Manual Message</p>
              <form onSubmit={handleSend} className="space-y-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message to send to the Telegram group…"
                  rows={3}
                  className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none"
                />
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={sending || !message.trim()}
                    className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                  {sendResult && (
                    <p className={`text-xs ${sendResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{sendResult.msg}</p>
                  )}
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {tab === 'Logs' && (
        <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-vs-border flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Send Log</p>
            <button onClick={loadLogs} className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1 rounded border border-vs-border hover:bg-vs-elevated transition-colors">
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
                        row.trigger === 'game_bet' ? 'bg-vs-purple/15 text-vs-purple-light' :
                        row.trigger === 'test'     ? 'bg-vs-lime/15 text-vs-lime' :
                                                     'bg-vs-elevated text-vs-text-3'
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
