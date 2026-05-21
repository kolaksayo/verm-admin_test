import { useState } from 'react';
import api from '../api';

export default function CampaignsPage() {
  const [content, setContent]         = useState('');
  const [chTelegram, setChTelegram]   = useState(true);
  const [chWaGroup, setChWaGroup]     = useState(true);
  const [chWaChannel, setChWaChannel] = useState(true);
  const [sending, setSending]         = useState(false);
  const [results, setResults]         = useState(null);

  const handleSend = async () => {
    if (!content.trim()) return;
    const channels = [];
    if (chTelegram)  channels.push('telegram');
    if (chWaGroup)   channels.push('whatsapp_group');
    if (chWaChannel) channels.push('whatsapp_channel');
    if (!channels.length) return;

    setSending(true); setResults(null);
    try {
      const r = await api.post('/campaigns/send', { content, channels });
      setResults(r.data.results || {});
    } catch (err) {
      setResults({ _error: err.response?.data?.error || 'Request failed' });
    } finally {
      setSending(false);
    }
  };

  const canSend = !sending && content.trim().length > 0 && (chTelegram || chWaGroup || chWaChannel);

  const CHANNEL_LABELS = {
    telegram:        'Telegram',
    whatsapp_group:  'WhatsApp Group',
    whatsapp_channel:'WhatsApp Channel',
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Campaigns</h1>
        <p className="text-sm text-vs-text-3 mt-1">Paste your campaign message and broadcast it to your channels</p>
      </div>

      <div className="max-w-2xl space-y-5">

        {/* Message */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Campaign Message</p>
            {content && <span className="text-xs text-vs-text-3">{content.length} chars</span>}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            placeholder="Paste or write your campaign message here…"
            className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-y"
          />
        </div>

        {/* Channels + Send */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Send To</p>

          <div className="flex flex-wrap gap-3 mb-5">
            {[
              { label: 'Telegram',         checked: chTelegram,  set: setChTelegram  },
              { label: 'WhatsApp Group',   checked: chWaGroup,   set: setChWaGroup   },
              { label: 'WhatsApp Channel', checked: chWaChannel, set: setChWaChannel },
            ].map(({ label, checked, set }) => (
              <label key={label}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors select-none ${
                  checked
                    ? 'border-vs-purple/50 bg-vs-purple/10 text-vs-text'
                    : 'border-vs-border text-vs-text-3 hover:bg-vs-elevated'
                }`}>
                <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)}
                  className="w-4 h-4 accent-purple-500" />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button onClick={handleSend} disabled={!canSend}
              className="px-6 py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
              {sending ? 'Sending…' : '📣 Send Campaign'}
            </button>

            {results && (
              <div className="flex items-center gap-4 flex-wrap text-xs">
                {results._error && (
                  <span className="text-vs-danger">{results._error}</span>
                )}
                {Object.entries(results).filter(([k]) => k !== '_error').map(([key, r]) => (
                  <span key={key} className={r.ok ? 'text-vs-success' : 'text-vs-danger'}>
                    {CHANNEL_LABELS[key] || key}: {r.ok ? '✓ Sent' : (r.reason || 'Failed')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-vs-text-3">
          Configure WhatsApp Group ID, Channel ID, and Telegram in{' '}
          <a href="/notifications" className="text-vs-purple-light hover:underline">Notification Center → Channels</a>.
        </p>
      </div>
    </div>
  );
}
