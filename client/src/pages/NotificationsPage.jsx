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
  fixtures_list:       '• Arsenal vs Chelsea\n• Man City vs Liverpool',
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

// ── Channel status helpers ────────────────────────────────────────────────────

const STATUS_STYLES = {
  Active:        { dot: 'bg-vs-success', text: 'text-vs-success', pill: 'bg-vs-success/10 text-vs-success border-vs-success/20' },
  'Needs Setup': { dot: 'bg-vs-text-3',  text: 'text-vs-text-3',  pill: 'bg-vs-elevated text-vs-text-3 border-vs-border' },
  Error:         { dot: 'bg-vs-danger',  text: 'text-vs-danger',  pill: 'bg-vs-danger/10 text-vs-danger border-vs-danger/20' },
  Disabled:      { dot: 'bg-vs-warning', text: 'text-vs-warning', pill: 'bg-vs-warning/10 text-vs-warning border-vs-warning/20' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['Needs Setup'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function sentTodayCount(logs) {
  const today = new Date().toISOString().slice(0, 10);
  return logs.filter((l) => l.ok && String(l.created_at || '').slice(0, 10) === today).length;
}
function lastSuccess(logs) {
  const row = logs.find((l) => l.ok); // logs are DESC by id
  return row ? row.created_at : null;
}

// ── Channel overview card (top section — horizontal) ──────────────────────────

function ChannelOverviewCard({ icon, iconBg, name, description, status, sentToday, lastTest, selected, onManage }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['Needs Setup'];
  const needsSetup = status === 'Needs Setup';
  return (
    <div className={`bg-vs-card border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
      selected ? 'border-vs-purple ring-1 ring-vs-purple/30' : 'border-vs-border'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-vs-text">{name}</p>
          <p className="text-xs text-vs-text-3 truncate mt-0.5">{description}</p>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="flex items-center gap-4 text-xs border-t border-vs-border pt-3">
        <div className="flex-1">
          <p className="text-vs-text-3">Messages Today</p>
          <p className="text-vs-text font-semibold text-sm">{sentToday}</p>
        </div>
        <div className="flex-1">
          <p className="text-vs-text-3">Last Test</p>
          <p className="text-vs-text-2 font-medium">{lastTest ? timeAgo(lastTest) : '—'}</p>
        </div>
      </div>
      <button
        onClick={onManage}
        className={`w-full text-xs font-semibold py-2 rounded-lg transition-colors ${
          needsSetup
            ? 'bg-vs-warning/10 text-vs-warning hover:bg-vs-warning/20 border border-vs-warning/30'
            : selected
            ? 'bg-vs-purple/10 text-vs-purple-light hover:bg-vs-purple/20 border border-vs-purple/30'
            : 'bg-vs-elevated text-vs-text-3 hover:text-vs-text hover:bg-vs-hover border border-vs-border'
        }`}
      >
        {needsSetup ? 'Complete Setup' : selected ? 'Managing' : 'Manage'}
      </button>
    </div>
  );
}

// ── Channel sidebar item (narrow left sidebar) ─────────────────────────────────

function ChannelSidebarItem({ icon, iconBg, name, status, selected, onClick }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['Needs Setup'];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
        selected
          ? 'bg-vs-purple/10 border border-vs-purple/30'
          : 'hover:bg-vs-elevated/60 border border-transparent'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${selected ? 'text-vs-purple-light' : 'text-vs-text'}`}>{name}</p>
      </div>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
    </button>
  );
}

// ── Connection health check ────────────────────────────────────────────────────

function HealthRow({ label, state, detail }) {
  const cfg = state === 'ok'
    ? { dot: 'bg-vs-success', txt: 'text-vs-success', mark: '✓' }
    : state === 'fail'
    ? { dot: 'bg-vs-danger', txt: 'text-vs-danger', mark: '✕' }
    : { dot: 'bg-vs-text-3 opacity-40', txt: 'text-vs-text-3', mark: '—' };
  return (
    <div className="flex items-center gap-3 py-2 border-b border-vs-border last:border-0">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="text-sm text-vs-text-2 flex-1">{label}</span>
      {detail && <span className="text-xs text-vs-text-3 truncate max-w-[45%]">{detail}</span>}
      <span className={`text-xs font-bold w-4 text-center ${cfg.txt}`} aria-hidden="true">{cfg.mark}</span>
    </div>
  );
}

function ConnectionHealthCheck({ items, lastChecked, onRecheck, loading }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Connection Health</p>
        <button
          onClick={onRecheck}
          disabled={loading}
          className="text-xs px-2.5 py-1 rounded-lg border border-vs-border text-vs-text-3 hover:bg-vs-elevated hover:text-vs-text transition-colors disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>
      <div>
        {items.map((it) => (
          <HealthRow key={it.label} label={it.label} state={it.state} detail={it.detail} />
        ))}
      </div>
      <p className="text-xs text-vs-text-3 mt-3">
        Last checked: <span className="text-vs-text-2">{lastChecked ? timeAgo(lastChecked) : '—'}</span>
        <span className="ml-2 opacity-70">· probe does not send a message</span>
      </p>
    </div>
  );
}

// ── Config field (with secret masking) ─────────────────────────────────────────

function ChannelConfigField({ label, value, onChange, placeholder, hint, mono, secret, savedPreview }) {
  const [revealed, setRevealed] = useState(false);
  const [replacing, setReplacing] = useState(!secret); // non-secret = always editable
  const hasSaved = secret && !!savedPreview;

  const copy = (text) => navigator.clipboard?.writeText(text).catch(() => {});

  // Secret field that's already saved and not being replaced → show masked preview + actions
  if (secret && hasSaved && !replacing) {
    return (
      <div>
        <label className="text-xs text-vs-text-3 block mb-1">{label}</label>
        <div className="flex items-center gap-2 px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg">
          <span className="text-sm text-vs-text-2 font-mono flex-1 truncate">
            {revealed ? savedPreview : '•••••••••••••'}
          </span>
          <button type="button" onClick={() => setRevealed((v) => !v)} className="text-xs text-vs-text-3 hover:text-vs-text">
            {revealed ? 'Hide' : 'Reveal'}
          </button>
          <button type="button" onClick={() => copy(savedPreview)} className="text-xs text-vs-text-3 hover:text-vs-text">Copy</button>
          <button type="button" onClick={() => { setReplacing(true); setRevealed(false); }} className="text-xs text-vs-purple-light hover:text-vs-purple">Replace</button>
        </div>
        <p className="text-xs text-vs-text-3 mt-1">Saved — preview only; the full secret is never sent to the browser.</p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-vs-text-3 block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={secret && !revealed ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple ${mono ? 'font-mono' : ''}`}
        />
        {secret && (
          <button type="button" onClick={() => setRevealed((v) => !v)} className="text-xs text-vs-text-3 hover:text-vs-text whitespace-nowrap px-1">
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
        {secret && hasSaved && (
          <button type="button" onClick={() => { setReplacing(false); onChange(''); }} className="text-xs text-vs-text-3 hover:text-vs-text whitespace-nowrap px-1">
            Cancel
          </button>
        )}
        {!secret && value && (
          <button type="button" onClick={() => copy(value)} className="text-xs text-vs-text-3 hover:text-vs-text px-1">Copy</button>
        )}
      </div>
      {hint && <p className="text-xs text-vs-text-3 mt-1">{hint}</p>}
    </div>
  );
}

// ── Manual message composer ────────────────────────────────────────────────────

function ManualMessageComposer({ destination, value, onChange, onSend, sending, result, disabled, disabledReason }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Manual Message</p>
        <span className="text-xs text-vs-text-3">To: <span className="text-vs-text-2 font-medium">{destination}</span></span>
      </div>
      {disabled && (
        <div className="bg-vs-warning/10 border border-vs-warning/30 text-vs-warning text-xs rounded-lg px-3 py-2 mb-3">
          {disabledReason || 'This channel is not active — sending is disabled.'}
        </div>
      )}
      <form onSubmit={onSend} className="space-y-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder={`Type a message to send to ${destination}…`}
          className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none disabled:opacity-50"
        />
        {value.trim() && (
          <div className="bg-vs-elevated/60 border border-vs-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-vs-text-3 mb-1">Preview</p>
            <p className="text-sm text-vs-text-2 whitespace-pre-wrap break-words">{value}</p>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={disabled || sending || !value.trim()}
            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
          <span className="text-xs text-vs-text-3">{value.length} chars</span>
          {result && <p className={`text-xs ${result.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{result.msg}</p>}
        </div>
      </form>
    </div>
  );
}

// ── Recent channel activity ────────────────────────────────────────────────────

const TRIGGER_LABEL = { test: 'Test message', manual: 'Manual message' };

function RecentChannelActivity({ logs }) {
  const recent = logs.slice(0, 6);
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">D. Recent Activity</p>
      {recent.length === 0 ? (
        <p className="text-sm text-vs-text-3 text-center py-4">No activity yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recent.map((l) => (
            <div key={l.id} className="flex items-start gap-2.5 bg-vs-elevated/60 border border-vs-border rounded-lg px-3 py-2.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${l.ok ? 'bg-vs-success' : 'bg-vs-danger'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 justify-between">
                  <span className={`text-xs font-semibold ${l.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{l.ok ? 'Sent' : 'Failed'}</span>
                  <span className="text-xs text-vs-text-3 whitespace-nowrap">{timeAgo(l.created_at)}</span>
                </div>
                <p className="text-xs text-vs-text-2 truncate mt-0.5">{TRIGGER_LABEL[l.trigger] || l.trigger || 'Message'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Setup guide accordion ──────────────────────────────────────────────────────

function SetupGuideAccordion({ steps }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-vs-elevated/40 transition-colors">
        <span className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">View setup guide</span>
        <span className="text-vs-text-3 text-sm">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <ol className="space-y-2 text-sm text-vs-text-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
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
  const [waStatus, setWaStatus]                 = useState(null);
  const [waEnabled, setWaEnabled]               = useState(true);
  const [togglingWa, setTogglingWa]             = useState(false);
  const [waEvolutionUrl, setWaEvolutionUrl]     = useState('');
  const [waEvolutionApiKey, setWaEvolutionApiKey] = useState('');
  const [waEvolutionInstance, setWaEvolutionInstance] = useState('');
  const [waGroupId, setWaGroupId]               = useState('');
  const [waChannelId, setWaChannelId]           = useState('');
  const [waSaving, setWaSaving]                 = useState(false);
  const [waSaveMsg, setWaSaveMsg]               = useState('');
  const [waTesting, setWaTesting]               = useState(false);
  const [waTestResult, setWaTestResult]         = useState(null);
  const [waMessage, setWaMessage]               = useState('');
  const [waSending, setWaSending]               = useState(false);
  const [waSendResult, setWaSendResult]         = useState(null);

  // ── Channels overview / detail state ──────────────────────────────────────
  const [selectedChannel, setSelectedChannel]   = useState('telegram'); // telegram | wa_group | wa_channel
  const [tgHealth, setTgHealth]                 = useState(null);
  const [waHealth, setWaHealth]                 = useState(null);
  const [healthLoading, setHealthLoading]       = useState(false);
  const [tgLogs, setTgLogs]                     = useState([]);
  const [waLogs, setWaLogs]                     = useState([]);
  const [waChannelMessage, setWaChannelMessage] = useState('');
  const [waChannelSending, setWaChannelSending] = useState(false);
  const [waChannelSendResult, setWaChannelSendResult] = useState(null);

  // ── Direct Messages state ─────────────────────────────────────────────────
  const [dmEnabled, setDmEnabled]             = useState(false);
  const [togglingDm, setTogglingDm]           = useState(false);
  const [dmGroupLink, setDmGroupLink]         = useState('');
  const [dmChannelLink, setDmChannelLink]     = useState('');
  const [dmCountryCode, setDmCountryCode]     = useState('');
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
  const [dmRetryAllSending, setDmRetryAllSending]   = useState(false);
  const [dmRetryAllResult, setDmRetryAllResult]     = useState(null);
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

  // ── Resend by booking code state ─────────────────────────────────────────
  const [resendCode, setResendCode]             = useState('');
  const [resendTrigger, setResendTrigger]       = useState('');
  const [resendSending, setResendSending]       = useState(false);
  const [resendResult, setResendResult]         = useState(null);

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
      setDmCountryCode(r.data.countryCode || '');
      if (r.data.welcomePreview) setDmTemplate(r.data.welcomePreview);
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

  const recheckHealth = useCallback(() => {
    setHealthLoading(true);
    Promise.allSettled([
      api.get('/telegram/health').then((r) => setTgHealth(r.data)),
      api.get('/whatsapp/health').then((r) => setWaHealth(r.data)),
    ]).finally(() => setHealthLoading(false));
  }, []);

  const loadChannelLogs = useCallback(() => {
    api.get('/telegram/logs', { params: { channel: 'telegram', limit: 50 } })
      .then((r) => setTgLogs(r.data.rows || [])).catch(() => {});
    api.get('/whatsapp/logs', { params: { limit: 50 } })
      .then((r) => setWaLogs(r.data.rows || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== 'Channels') return;
    api.get('/whatsapp/status').then((r) => {
      setWaStatus(r.data);
      if (r.data.enabled != null) setWaEnabled(!!r.data.enabled);
    }).catch(() => {});
    api.get('/whatsapp/config').then((r) => {
      if (r.data.groupId)         setWaGroupId(r.data.groupId);
      if (r.data.channelId)       setWaChannelId(r.data.channelId);
      if (r.data.evolutionUrl)    setWaEvolutionUrl(r.data.evolutionUrl);
      if (r.data.evolutionInstance) setWaEvolutionInstance(r.data.evolutionInstance);
    }).catch(() => {});
    recheckHealth();
    loadChannelLogs();
  }, [tab, recheckHealth, loadChannelLogs]);

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
      await api.post('/whatsapp/config', {
        evolutionUrl:      waEvolutionUrl      || undefined,
        evolutionApiKey:   waEvolutionApiKey   || undefined,
        evolutionInstance: waEvolutionInstance || undefined,
        groupId:           waGroupId           || undefined,
        channelId:         waChannelId         || undefined,
      });
      setWaSaveMsg('Saved!');
      setWaEvolutionApiKey('');
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

  const handleWaSendChannel = async (e) => {
    e.preventDefault();
    if (!waChannelMessage.trim()) return;
    setWaChannelSending(true); setWaChannelSendResult(null);
    try {
      const r = await api.post('/whatsapp/send-channel', { text: waChannelMessage });
      setWaChannelSendResult({ ok: r.data.ok, msg: r.data.ok ? 'Sent!' : (r.data.reason || r.data.error || 'Failed') });
      if (r.data.ok) setWaChannelMessage('');
    } catch (e) {
      setWaChannelSendResult({ ok: false, msg: e.response?.data?.error || 'Request failed' });
    } finally {
      setWaChannelSending(false);
    }
  };

  const handleWaChannelTest = async () => {
    setWaChannelSendResult(null);
    try {
      const r = await api.post('/whatsapp/test-channel');
      setWaChannelSendResult({ ok: r.data.ok, msg: r.data.ok ? 'Test sent!' : (r.data.reason || r.data.error || 'Failed') });
    } catch (e) {
      setWaChannelSendResult({ ok: false, msg: e.response?.data?.error || 'Request failed' });
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
      await api.post('/notifications/dm/config', { groupLink: dmGroupLink, channelLink: dmChannelLink, countryCode: dmCountryCode });
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

  const handleDmRetryAll = async () => {
    setDmRetryAllSending(true); setDmRetryAllResult(null);
    try {
      const r = await api.post('/notifications/dm/retry-all-failed');
      setDmRetryAllResult(r.data);
      await loadDmLogs();
    } catch (err) {
      setDmRetryAllResult({ ok: false, error: err.response?.data?.error || 'Request failed' });
    } finally {
      setDmRetryAllSending(false);
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

  // ── Resend handler ───────────────────────────────────────────────────────

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendCode.trim()) return;
    setResendSending(true); setResendResult(null);
    try {
      const r = await api.post('/telegram/resend-for-bet', {
        bookingCode: resendCode.trim(),
        trigger:     resendTrigger || undefined,
      });
      setResendResult(r.data);
    } catch (err) {
      setResendResult({ ok: false, error: err.response?.data?.error || 'Request failed' });
    } finally {
      setResendSending(false);
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
      {tab === 'Channels' && (() => {
        const hs = (v) => (v === true ? 'ok' : v === false ? 'fail' : 'unknown');

        const tgStatus = !status?.configured ? 'Needs Setup'
          : !tgEnabled ? 'Disabled'
          : (tgHealth && (tgHealth.apiReachable === false || tgHealth.botTokenValid === false || tgHealth.chatIdValid === false)) ? 'Error'
          : 'Active';

        const waGroupConfigured = !!(waStatus?.configured && waStatus?.groupIdSet);
        const waGroupStatus = !waGroupConfigured ? 'Needs Setup'
          : !waEnabled ? 'Disabled'
          : (waHealth && (waHealth.urlReachable === false || waHealth.apiKeyValid === false || waHealth.instanceConnected === false)) ? 'Error'
          : 'Active';

        const waChannelConfigured = !!(waStatus?.evolutionUrlSet && waStatus?.evolutionApiKeySet && waStatus?.evolutionInstanceSet && waStatus?.channelIdSet);
        const waChannelStatus = !waChannelConfigured ? 'Needs Setup'
          : !waEnabled ? 'Disabled'
          : (waHealth && (waHealth.urlReachable === false || waHealth.apiKeyValid === false || waHealth.instanceConnected === false)) ? 'Error'
          : 'Active';

        const tgItems = [
          { label: 'Telegram API reachable', state: hs(tgHealth?.apiReachable) },
          { label: 'Bot token valid', state: hs(tgHealth?.botTokenValid), detail: tgHealth?.botUsername },
          { label: 'Chat ID valid', state: hs(tgHealth?.chatIdValid), detail: tgHealth?.chatTitle },
          { label: 'Send permission', state: hs(tgHealth?.canSend) },
          { label: 'Notifications enabled', state: tgEnabled ? 'ok' : 'fail' },
        ];
        const waItems = (idLabel, idState) => [
          { label: 'Evolution URL reachable', state: hs(waHealth?.urlReachable) },
          { label: 'API key valid', state: hs(waHealth?.apiKeyValid) },
          { label: 'Instance connected', state: hs(waHealth?.instanceConnected), detail: waHealth?.state },
          { label: idLabel, state: hs(idState) },
          { label: 'Notifications enabled', state: waEnabled ? 'ok' : 'fail' },
        ];

        const tgSteps = [
          <>Message <span className="font-mono text-vs-purple-light">@BotFather</span> on Telegram → send <span className="font-mono">/newbot</span> → receive your <strong>bot token</strong>.</>,
          <>Add your bot to your Telegram group as an <strong>administrator</strong>.</>,
          <>Get the group <strong>Chat ID</strong>: forward any group message to <span className="font-mono text-vs-purple-light">@userinfobot</span>. Group IDs look like <span className="font-mono">-1001234567890</span>.</>,
          <>Paste both values into the configuration above and click <strong>Save configuration</strong>.</>,
        ];
        const waSteps = [
          <>Deploy Evolution API and connect your WhatsApp number via the manager UI at <span className="font-mono text-vs-purple-light">{'<your-url>/manager'}</span>.</>,
          <>Copy the <strong>API Key</strong> from your Evolution <span className="font-mono">.env</span> (<span className="font-mono">AUTHENTICATION_API_KEY</span>).</>,
          <>Enter the <strong>Instance Name</strong> exactly as created in the manager.</>,
          <>Get the <strong>Group ID</strong> (ends in <span className="font-mono">@g.us</span>) or <strong>Channel ID</strong> (ends in <span className="font-mono">@newsletter</span>).</>,
          <>Click <strong>Save</strong>, then run a <strong>health check</strong> to confirm the connection.</>,
        ];

        const channels = [
          { key: 'telegram',   icon: '✈️', iconBg: 'bg-blue-500/10',   name: 'Telegram Group',  description: 'Broadcast to a Telegram group',    status: tgStatus,        logs: tgLogs },
          { key: 'wa_group',   icon: '💬', iconBg: 'bg-green-500/10',  name: 'WhatsApp Group',  description: 'Broadcast via Evolution API',       status: waGroupStatus,   logs: waLogs },
          { key: 'wa_channel', icon: '📡', iconBg: 'bg-purple-500/10', name: 'WhatsApp Channel',description: 'Broadcast to a WhatsApp channel',   status: waChannelStatus, logs: waLogs },
        ];

        const failuresToday = (logs) => {
          const today = new Date().toISOString().slice(0, 10);
          return logs.filter((l) => !l.ok && String(l.created_at || '').slice(0, 10) === today).length;
        };

        const DetailToggle = ({ enabled, onToggle, toggling, label }) => (
          <div className="flex items-center justify-between py-3 border-b border-vs-border">
            <div>
              <p className="text-sm font-medium text-vs-text">{label}</p>
              <p className="text-xs text-vs-text-3 mt-0.5">{enabled ? 'Enabled — messages will be sent' : 'Disabled — messages paused'}</p>
            </div>
            <button onClick={onToggle} disabled={toggling}
              className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${enabled ? 'bg-vs-success' : 'bg-vs-elevated border border-vs-border'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        );

        return (
          <div className="space-y-5">
            {/* ── Top: Channel Overview ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Channel Overview</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {channels.map((c) => (
                  <ChannelOverviewCard
                    key={c.key}
                    icon={c.icon}
                    iconBg={c.iconBg}
                    name={c.name}
                    description={c.description}
                    status={c.status}
                    sentToday={sentTodayCount(c.logs)}
                    lastTest={lastSuccess(c.logs)}
                    selected={selectedChannel === c.key}
                    onManage={() => setSelectedChannel(c.key)}
                  />
                ))}
              </div>
            </div>

            {/* ── Bottom: Sidebar + Detail Panel ── */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

              {/* Narrow sidebar */}
              <div className="lg:col-span-1 bg-vs-card border border-vs-border rounded-xl p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 px-2 mb-2">Channels</p>
                <div className="space-y-1">
                  {channels.map((c) => (
                    <ChannelSidebarItem
                      key={c.key}
                      icon={c.icon}
                      iconBg={c.iconBg}
                      name={c.name}
                      status={c.status}
                      selected={selectedChannel === c.key}
                      onClick={() => setSelectedChannel(c.key)}
                    />
                  ))}
                </div>
              </div>

              {/* Wide detail panel */}
              <div className="lg:col-span-3 space-y-4">

                {selectedChannel === 'telegram' && (
                  <>
                    {/* A. Status Summary */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">A. Status Summary</p>
                      <DetailToggle enabled={tgEnabled} onToggle={handleToggleTg} toggling={togglingTg} label="Telegram notifications" />
                      <div className="mt-3">
                        {tgItems.map((it) => <HealthRow key={it.label} label={it.label} state={it.state} detail={it.detail} />)}
                      </div>
                      <div className="flex items-center gap-2 mt-4 justify-between">
                        <button onClick={recheckHealth} disabled={healthLoading}
                          className="text-xs px-3 py-1.5 rounded-lg border border-vs-border text-vs-text-3 hover:bg-vs-elevated hover:text-vs-text transition-colors disabled:opacity-50">
                          {healthLoading ? 'Checking…' : 'Re-check'}
                        </button>
                        <p className="text-xs text-vs-text-3">Last checked: <span className="text-vs-text-2">{tgHealth?.checkedAt ? timeAgo(tgHealth.checkedAt) : '—'}</span></p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-vs-border">
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Last Test</p>
                          <p className="text-sm font-semibold text-vs-text mt-0.5">{lastSuccess(tgLogs) ? timeAgo(lastSuccess(tgLogs)) : '—'}</p>
                        </div>
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Sent Today</p>
                          <p className="text-sm font-semibold text-vs-success mt-0.5">{sentTodayCount(tgLogs)}</p>
                        </div>
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Failures Today</p>
                          <p className={`text-sm font-semibold mt-0.5 ${failuresToday(tgLogs) > 0 ? 'text-vs-danger' : 'text-vs-text-2'}`}>{failuresToday(tgLogs)}</p>
                        </div>
                      </div>
                    </div>

                    {/* B. Configuration */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">B. Configuration</p>
                      <form onSubmit={handleSaveConfig} className="space-y-4">
                        <ChannelConfigField label="Bot Token" secret savedPreview={status?.botTokenPreview}
                          value={botToken} onChange={setBotToken} placeholder="123456:ABCdef…" />
                        <ChannelConfigField label="Chat ID" mono value={chatId} onChange={setChatId}
                          placeholder={status?.chatId || '-1001234567890'} hint="Group IDs are negative numbers." />
                        <div className="flex items-center gap-3">
                          <button type="submit" disabled={saving || (!botToken.trim() && !chatId.trim())}
                            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save configuration'}
                          </button>
                          {saveMsg && <p className={`text-xs ${saveMsg.startsWith('Saved') ? 'text-vs-success' : 'text-vs-danger'}`}>{saveMsg}</p>}
                        </div>
                      </form>
                    </div>

                    {/* C. Actions */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">C. Actions</p>
                      <div className="space-y-3 mb-5">
                        <button onClick={handleTest} disabled={testing || tgStatus === 'Needs Setup'}
                          className="w-full py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                          {testing ? 'Sending…' : 'Send Test Message'}
                        </button>
                        {testResult && <p className={`text-xs text-center ${testResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{testResult.msg}</p>}
                      </div>
                      <div className="border-t border-vs-border pt-4">
                        <p className="text-xs text-vs-text-3 mb-2 font-medium">Manual Message</p>
                        {tgStatus !== 'Active' && (
                          <div className="bg-vs-warning/10 border border-vs-warning/30 text-vs-warning text-xs rounded-lg px-3 py-2 mb-3">
                            {tgStatus === 'Disabled' ? 'Notifications are disabled for this channel.' : 'Channel is not fully configured yet.'}
                          </div>
                        )}
                        <form onSubmit={handleSend} className="space-y-2">
                          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                            disabled={tgStatus !== 'Active'} rows={3}
                            placeholder="Type a message to broadcast…"
                            maxLength={1024}
                            className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none disabled:opacity-50" />
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 bg-vs-elevated border border-vs-border rounded-full px-2.5 py-1 text-xs text-vs-text-2">
                                <span>✈️</span> Telegram Group
                              </span>
                              <span className="text-xs text-vs-text-3">{message.length}/1024</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {sendResult && <p className={`text-xs ${sendResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{sendResult.msg}</p>}
                              <button type="submit" disabled={tgStatus !== 'Active' || sending || !message.trim()}
                                className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                                {sending ? 'Sending…' : 'Send'}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>

                    <RecentChannelActivity logs={tgLogs} />
                    <SetupGuideAccordion steps={tgSteps} />
                  </>
                )}

                {selectedChannel === 'wa_group' && (
                  <>
                    {/* A. Status Summary */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">A. Status Summary</p>
                      <DetailToggle enabled={waEnabled} onToggle={handleToggleWa} toggling={togglingWa} label="WhatsApp notifications (shared with channel)" />
                      <div className="mt-3">
                        {waItems('Group ID configured', waHealth?.groupIdConfigured).map((it) => <HealthRow key={it.label} label={it.label} state={it.state} detail={it.detail} />)}
                      </div>
                      <div className="flex items-center gap-2 mt-4 justify-between">
                        <button onClick={recheckHealth} disabled={healthLoading}
                          className="text-xs px-3 py-1.5 rounded-lg border border-vs-border text-vs-text-3 hover:bg-vs-elevated hover:text-vs-text transition-colors disabled:opacity-50">
                          {healthLoading ? 'Checking…' : 'Re-check'}
                        </button>
                        <p className="text-xs text-vs-text-3">Last checked: <span className="text-vs-text-2">{waHealth?.checkedAt ? timeAgo(waHealth.checkedAt) : '—'}</span></p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-vs-border">
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Last Test</p>
                          <p className="text-sm font-semibold text-vs-text mt-0.5">{lastSuccess(waLogs) ? timeAgo(lastSuccess(waLogs)) : '—'}</p>
                        </div>
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Sent Today</p>
                          <p className="text-sm font-semibold text-vs-success mt-0.5">{sentTodayCount(waLogs)}</p>
                        </div>
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Failures Today</p>
                          <p className={`text-sm font-semibold mt-0.5 ${failuresToday(waLogs) > 0 ? 'text-vs-danger' : 'text-vs-text-2'}`}>{failuresToday(waLogs)}</p>
                        </div>
                      </div>
                    </div>

                    {/* B. Configuration */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">B. Configuration</p>
                      <p className="text-xs text-vs-text-3 mb-4">Evolution API connection — shared with the WhatsApp Channel.</p>
                      <form onSubmit={handleWaSave} className="space-y-4">
                        <ChannelConfigField label="Evolution API URL" mono value={waEvolutionUrl} onChange={setWaEvolutionUrl} placeholder="http://localhost:8081" />
                        <ChannelConfigField label="API Key" secret savedPreview={waStatus?.evolutionApiKeyPreview} value={waEvolutionApiKey} onChange={setWaEvolutionApiKey} placeholder="AUTHENTICATION_API_KEY value" />
                        <ChannelConfigField label="Instance Name" mono value={waEvolutionInstance} onChange={setWaEvolutionInstance} placeholder="Vermo Sports" />
                        <ChannelConfigField label="Group ID" mono value={waGroupId} onChange={setWaGroupId} placeholder="120363xxxxxxxxxx@g.us" hint="Format: <numbers>@g.us" />
                        <div className="flex items-center gap-3">
                          <button type="submit" disabled={waSaving || (!waEvolutionUrl.trim() && !waEvolutionApiKey.trim() && !waEvolutionInstance.trim() && !waGroupId.trim())}
                            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                            {waSaving ? 'Saving…' : 'Save configuration'}
                          </button>
                          {waSaveMsg && <p className={`text-xs ${waSaveMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{waSaveMsg}</p>}
                        </div>
                      </form>
                    </div>

                    {/* C. Actions */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">C. Actions</p>
                      <div className="space-y-3 mb-5">
                        <button onClick={handleWaTest} disabled={waTesting || waGroupStatus === 'Needs Setup'}
                          className="w-full py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                          {waTesting ? 'Sending…' : 'Send Test Message'}
                        </button>
                        {waTestResult && <p className={`text-xs text-center ${waTestResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{waTestResult.msg}</p>}
                      </div>
                      <div className="border-t border-vs-border pt-4">
                        <p className="text-xs text-vs-text-3 mb-2 font-medium">Manual Message</p>
                        {waGroupStatus !== 'Active' && (
                          <div className="bg-vs-warning/10 border border-vs-warning/30 text-vs-warning text-xs rounded-lg px-3 py-2 mb-3">
                            {waGroupStatus === 'Disabled' ? 'Notifications are disabled for this channel.' : 'Channel is not fully configured yet.'}
                          </div>
                        )}
                        <form onSubmit={handleWaSend} className="space-y-2">
                          <textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)}
                            disabled={waGroupStatus !== 'Active'} rows={3}
                            placeholder="Type a message to broadcast…"
                            maxLength={1024}
                            className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none disabled:opacity-50" />
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 bg-vs-elevated border border-vs-border rounded-full px-2.5 py-1 text-xs text-vs-text-2">
                                <span>💬</span> WhatsApp Group
                              </span>
                              <span className="text-xs text-vs-text-3">{waMessage.length}/1024</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {waSendResult && <p className={`text-xs ${waSendResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{waSendResult.msg}</p>}
                              <button type="submit" disabled={waGroupStatus !== 'Active' || waSending || !waMessage.trim()}
                                className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                                {waSending ? 'Sending…' : 'Send'}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>

                    <RecentChannelActivity logs={waLogs} />
                    <SetupGuideAccordion steps={waSteps} />
                  </>
                )}

                {selectedChannel === 'wa_channel' && (
                  <>
                    {/* A. Status Summary */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">A. Status Summary</p>
                      <DetailToggle enabled={waEnabled} onToggle={handleToggleWa} toggling={togglingWa} label="WhatsApp notifications (shared with group)" />
                      <div className="mt-3">
                        {waItems('Channel ID configured', waHealth?.channelIdConfigured).map((it) => <HealthRow key={it.label} label={it.label} state={it.state} detail={it.detail} />)}
                      </div>
                      <div className="flex items-center gap-2 mt-4 justify-between">
                        <button onClick={recheckHealth} disabled={healthLoading}
                          className="text-xs px-3 py-1.5 rounded-lg border border-vs-border text-vs-text-3 hover:bg-vs-elevated hover:text-vs-text transition-colors disabled:opacity-50">
                          {healthLoading ? 'Checking…' : 'Re-check'}
                        </button>
                        <p className="text-xs text-vs-text-3">Last checked: <span className="text-vs-text-2">{waHealth?.checkedAt ? timeAgo(waHealth.checkedAt) : '—'}</span></p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-vs-border">
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Last Test</p>
                          <p className="text-sm font-semibold text-vs-text mt-0.5">{lastSuccess(waLogs) ? timeAgo(lastSuccess(waLogs)) : '—'}</p>
                        </div>
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Sent Today</p>
                          <p className="text-sm font-semibold text-vs-success mt-0.5">{sentTodayCount(waLogs)}</p>
                        </div>
                        <div className="bg-vs-elevated/60 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-vs-text-3">Failures Today</p>
                          <p className={`text-sm font-semibold mt-0.5 ${failuresToday(waLogs) > 0 ? 'text-vs-danger' : 'text-vs-text-2'}`}>{failuresToday(waLogs)}</p>
                        </div>
                      </div>
                    </div>

                    {/* B. Configuration */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">B. Configuration</p>
                      <div className="bg-vs-elevated/60 border border-vs-border rounded-lg px-3 py-2.5 mb-4 text-xs text-vs-text-3">
                        Uses the <span className="text-vs-text-2 font-medium">shared Evolution connection</span> (URL, API Key, Instance) — manage those on the WhatsApp Group panel. Only the Channel ID is specific to this channel.
                      </div>
                      <form onSubmit={handleWaSave} className="space-y-4">
                        <ChannelConfigField label="Channel ID" mono value={waChannelId} onChange={setWaChannelId} placeholder="120363xxxxxxxxxx@newsletter" hint="Format: <numbers>@newsletter" />
                        <div className="flex items-center gap-3">
                          <button type="submit" disabled={waSaving || !waChannelId.trim()}
                            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                            {waSaving ? 'Saving…' : 'Save configuration'}
                          </button>
                          {waSaveMsg && <p className={`text-xs ${waSaveMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{waSaveMsg}</p>}
                        </div>
                      </form>
                    </div>

                    {/* C. Actions */}
                    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">C. Actions</p>
                      <div className="space-y-3 mb-5">
                        <button onClick={handleWaChannelTest} disabled={waChannelStatus === 'Needs Setup'}
                          className="w-full py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                          Send Test Message
                        </button>
                        {waChannelSendResult && <p className={`text-xs text-center ${waChannelSendResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>{waChannelSendResult.msg}</p>}
                      </div>
                      <div className="border-t border-vs-border pt-4">
                        <p className="text-xs text-vs-text-3 mb-2 font-medium">Manual Message</p>
                        {waChannelStatus !== 'Active' && (
                          <div className="bg-vs-warning/10 border border-vs-warning/30 text-vs-warning text-xs rounded-lg px-3 py-2 mb-3">
                            {waChannelStatus === 'Disabled' ? 'Notifications are disabled.' : 'Channel is not fully configured yet.'}
                          </div>
                        )}
                        <form onSubmit={handleWaSendChannel} className="space-y-2">
                          <textarea value={waChannelMessage} onChange={(e) => setWaChannelMessage(e.target.value)}
                            disabled={waChannelStatus !== 'Active'} rows={3}
                            placeholder="Type a message to broadcast…"
                            maxLength={1024}
                            className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none disabled:opacity-50" />
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 bg-vs-elevated border border-vs-border rounded-full px-2.5 py-1 text-xs text-vs-text-2">
                                <span>📡</span> WhatsApp Channel
                              </span>
                              <span className="text-xs text-vs-text-3">{waChannelMessage.length}/1024</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="submit" disabled={waChannelStatus !== 'Active' || waChannelSending || !waChannelMessage.trim()}
                                className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                                {waChannelSending ? 'Sending…' : 'Send'}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>

                    <RecentChannelActivity logs={waLogs} />
                    <SetupGuideAccordion steps={waSteps} />
                  </>
                )}

              </div>
            </div>
          </div>
        );
      })()}

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
                <div className="w-40 flex-shrink-0">
                  <label className="text-xs text-vs-text-3 block mb-1">Country Code</label>
                  <input type="text" value={dmCountryCode} onChange={(e) => setDmCountryCode(e.target.value)}
                    placeholder="234"
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                  <p className="text-xs text-vs-text-3 mt-1">e.g. 234 for Nigeria</p>
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

          {/* Approved welcome template (read-only) */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Welcome Message Template</p>
                <p className="text-xs text-vs-text-3">This is the WhatsApp-approved template sent via Interakt.ai. It cannot be edited here — changes must be submitted through WhatsApp Business Manager.</p>
              </div>
              <span className="flex-shrink-0 px-2 py-0.5 text-xs rounded-full bg-vs-success/15 text-vs-success border border-vs-success/30">Approved</span>
            </div>
            <pre className="w-full px-4 py-3 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text-2 whitespace-pre-wrap font-sans select-all">
              {dmTemplate}
            </pre>
            <p className="text-xs text-vs-text-3 mt-2">
              <span className="font-mono text-vs-purple-light">{'{{1}}'}</span> is substituted with the user&apos;s display name at send time.
              Template name: <span className="font-mono text-vs-text-2">welcome_to_vermosports</span>
            </p>
          </div>

          {/* Test DM */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Send Test DM</p>
            <p className="text-xs text-vs-text-3 mb-4">Send the approved welcome template via Interakt.ai to a phone number. Requires Interakt.ai API Key to be configured.</p>
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
            <div className="px-5 py-3 border-b border-vs-border flex items-center gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mr-auto">DM Send Log</p>
              {dmRetryAllResult && (
                <span className={`text-xs ${dmRetryAllResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
                  {dmRetryAllResult.ok
                    ? `${dmRetryAllResult.retried} retried — ${dmRetryAllResult.succeeded} sent, ${dmRetryAllResult.failed} failed`
                    : (dmRetryAllResult.error || 'Failed')}
                </span>
              )}
              <button onClick={handleDmRetryAll} disabled={dmRetryAllSending}
                className="text-xs text-vs-purple-light hover:text-vs-purple px-2 py-1 rounded border border-vs-purple/30 hover:bg-vs-purple/10 transition-colors disabled:opacity-40">
                {dmRetryAllSending ? 'Retrying…' : 'Retry All Failed'}
              </button>
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
        <>
          {/* Resend by booking code */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Resend Notification</p>
            <p className="text-xs text-vs-text-3 mb-4">
              Enter a booking code to manually re-send its notification to all configured channels (Telegram + WhatsApp).
            </p>
            <form onSubmit={handleResend} className="space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs text-vs-text-3 block mb-1">Booking Code</label>
                  <input
                    type="text"
                    value={resendCode}
                    onChange={(e) => { setResendCode(e.target.value); setResendResult(null); }}
                    placeholder="e.g. GAME-ABCD"
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
                  />
                </div>
                <div className="w-56 flex-shrink-0">
                  <label className="text-xs text-vs-text-3 block mb-1">Trigger (optional — auto-detects)</label>
                  <select
                    value={resendTrigger}
                    onChange={(e) => setResendTrigger(e.target.value)}
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
                  >
                    <option value="">Auto-detect</option>
                    <option value="game_bet">Single Bet — New</option>
                    <option value="game_bet_multi_created">Multi — New</option>
                    <option value="game_bet_multi_half">Multi — 60% Full</option>
                    <option value="game_bet_multi_almost_3">Multi — 3 Slots Left</option>
                    <option value="game_bet_multi_almost_1">Multi — Last Slot</option>
                    <option value="game_bet_match_1hr">Countdown — 1hr</option>
                    <option value="game_bet_match_30min">Countdown — 30min</option>
                    <option value="game_bet_match_15min">Countdown — 15min</option>
                    <option value="game_bet_large_stake">Large Stake</option>
                  </select>
                </div>
                <button type="submit" disabled={resendSending || !resendCode.trim()}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
                  {resendSending ? 'Sending…' : 'Resend'}
                </button>
              </div>
            </form>

            {resendResult && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${resendResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
                    {resendResult.ok ? '✓ Sent' : '✗ Failed'}
                  </span>
                  {resendResult.code && (
                    <span className="text-xs text-vs-text-3">
                      · Bet: <span className="font-mono text-vs-text">{resendResult.code}</span>
                    </span>
                  )}
                  {resendResult.trigger && (
                    <span className="text-xs text-vs-text-3">
                      · Trigger: <span className="font-mono text-vs-text">{resendResult.trigger}</span>
                    </span>
                  )}
                  {(resendResult.error || resendResult.reason) && (
                    <span className="text-xs text-vs-danger">{resendResult.error || resendResult.reason}</span>
                  )}
                </div>
                {resendResult.message && (
                  <div className="bg-vs-elevated rounded-lg px-3 py-2.5 text-xs font-mono text-vs-text-2 whitespace-pre-wrap border border-vs-border">
                    {resendResult.message}
                  </div>
                )}
              </div>
            )}
          </div>

          <MessagesTab templates={templates} loading={templatesLoading} onSaved={loadTemplates} />
        </>
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
