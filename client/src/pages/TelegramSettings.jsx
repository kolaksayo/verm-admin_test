import { useEffect, useState } from 'react';
import api from '../api';

export default function TelegramSettings() {
  const [status, setStatus]         = useState(null);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [message, setMessage]       = useState('');
  const [sending, setSending]       = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Config form
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');

  const loadStatus = () =>
    api.get('/telegram/status').then((r) => setStatus(r.data)).catch(() => {});

  useEffect(() => { loadStatus(); }, []);

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

      {/* Config form */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Bot Configuration</p>
        <p className="text-xs text-vs-text-3 mb-4">Settings are saved to local storage — no server restart needed.</p>
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
        <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
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

      {/* How it works */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">How Automatic Notifications Work</p>
        <div className="space-y-2 text-xs text-vs-text-3">
          <p>The admin server polls the <span className="font-mono text-vs-text">game_bet</span> collection every <strong className="text-vs-text">2 minutes</strong> for newly created challenges.</p>
          <p>When a new challenge is detected, a notification is automatically sent to your Telegram group with the challenge code, creator, and stake amount.</p>
          <p>Polling begins when the server starts. Challenges created while the server is offline will be picked up on the next restart within the 2-minute window.</p>
        </div>
      </div>
    </div>
  );
}
