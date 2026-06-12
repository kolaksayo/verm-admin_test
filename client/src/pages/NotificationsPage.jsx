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
  Active:        { dot: 'bg-vs-success', text: 'text-vs-success', pill: 'bg-green-900/40 text-green-400 border-green-700/30' },
  'Needs Setup': { dot: 'bg-amber-400',  text: 'text-amber-400',  pill: 'bg-amber-900/30 text-amber-400 border-amber-700/30' },
  Error:         { dot: 'bg-vs-danger',  text: 'text-vs-danger',  pill: 'bg-red-900/30 text-red-400 border-red-700/30' },
  Disabled:      { dot: 'bg-vs-warning', text: 'text-vs-warning', pill: 'bg-vs-warning/10 text-vs-warning border-vs-warning/20' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['Needs Setup'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.pill}`}>
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
  const row = logs.find((l) => l.ok);
  return row ? row.created_at : null;
}
function failuresToday(logs) {
  const today = new Date().toISOString().slice(0, 10);
  return logs.filter((l) => !l.ok && String(l.created_at || '').slice(0, 10) === today).length;
}

// ── Brand icons ───────────────────────────────────────────────────────────────

function TgIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function WaIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function ChanIcon({ channelKey, size = 20, className = '' }) {
  if (channelKey === 'telegram') return <TgIcon size={size} className={className} />;
  return <WaIcon size={size} className={className} />;
}

// ── Inline SVG icons for status/metrics ──────────────────────────────────────

const IcCheckCircle = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
  </svg>
);
const IcXCircle = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
  </svg>
);
const IcClock = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);
const IcChat = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);
const IcShield = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IcSend = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>
);
const IcGear = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);
const IcShieldCheck = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
  </svg>
);
const IcChevronDown = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IcChevronUp = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);

// ── Channel overview card (top row — horizontal) ──────────────────────────────

function ChannelOverviewCard({ channelKey, name, status, sentToday, lastTest, missingLabel, selected, onManage }) {
  const iconBg = channelKey === 'telegram' ? 'bg-[#2AABEE]' : 'bg-[#25D366]';
  const needsSetup = status === 'Needs Setup';
  return (
    <div className={`bg-vs-card border rounded-xl p-4 flex items-center gap-4 ${
      selected ? 'border-vs-purple' : 'border-vs-border'
    }`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <ChanIcon channelKey={channelKey} size={24} className="text-white" />
      </div>
      <div className="flex-shrink-0 min-w-0">
        <p className="text-sm font-semibold text-vs-text">{name}</p>
        <div className="mt-1"><StatusPill status={status} /></div>
      </div>
      <div className="flex-1 flex items-center gap-6 pl-2">
        {needsSetup ? (
          <div>
            <p className="text-xs text-vs-text-3">Missing</p>
            <p className="text-sm font-semibold text-vs-text">{missingLabel || 'Configuration'}</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs text-vs-text-3">Messages Today</p>
              <p className="text-2xl font-bold text-vs-text leading-tight">{sentToday}</p>
            </div>
            <div>
              <p className="text-xs text-vs-text-3">Last Test</p>
              <p className="text-sm font-semibold text-vs-text">{lastTest ? timeAgo(lastTest) : '—'}</p>
            </div>
          </>
        )}
      </div>
      <button
        onClick={onManage}
        className="px-5 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
      >
        {needsSetup ? 'Complete setup' : 'Manage'}
      </button>
    </div>
  );
}

// ── Channel sidebar item ───────────────────────────────────────────────────────

function ChannelSidebarItem({ channelKey, name, status, selected, onClick }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['Needs Setup'];
  const iconBg = channelKey === 'telegram' ? 'bg-[#2AABEE]' : 'bg-[#25D366]';
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-left border-l-2 ${
        selected ? 'bg-vs-elevated/60 border-vs-purple' : 'hover:bg-vs-elevated/40 border-transparent'
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <ChanIcon channelKey={channelKey} size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-vs-text truncate">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          <span className={`text-xs ${s.text}`}>{status}</span>
        </div>
      </div>
    </button>
  );
}

// ── Status check row (section A) ──────────────────────────────────────────────

function StatusCheckRow({ label, value, state }) {
  const isOk = state === 'ok';
  const isFail = state === 'fail';
  return (
    <div className="flex items-center justify-between py-2 border-b border-vs-border/50 last:border-0">
      <div className="flex items-center gap-2.5">
        {isOk
          ? <IcCheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
          : isFail
          ? <IcXCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          : <span className="w-5 h-5 rounded-full border-2 border-vs-border flex-shrink-0 inline-block" />
        }
        <span className="text-sm text-vs-text-2">{label}</span>
      </div>
      {value && <span className="text-xs text-vs-text-3 ml-2">{value}</span>}
    </div>
  );
}

// ── Config fields (section B) — styled to match reference ─────────────────────

function SecretConfigRow({ label, savedPreview, inputValue, onChange, onSave, saving, saveMsg }) {
  const [revealed, setRevealed] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const hasSaved = !!savedPreview;
  const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});

  if (hasSaved && !replacing) {
    return (
      <div className="mb-4">
        <p className="text-xs text-vs-text-3 mb-1.5">{label}</p>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-vs-elevated border border-vs-border rounded-lg">
          <span className="text-sm text-vs-text font-mono flex-1 truncate">
            {revealed ? savedPreview : '••••••••••••••' + savedPreview.slice(-6)}
          </span>
          <button type="button" onClick={() => setRevealed((v) => !v)} className="text-xs text-vs-text-3 hover:text-vs-text transition-colors">{revealed ? 'Hide' : 'Reveal'}</button>
          <span className="text-vs-border">|</span>
          <button type="button" onClick={() => copy(savedPreview)} className="text-xs text-vs-text-3 hover:text-vs-text transition-colors">Copy</button>
          <span className="text-vs-border">|</span>
          <button type="button" onClick={() => setReplacing(true)} className="text-xs text-vs-purple-light hover:text-vs-purple transition-colors">Replace</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <p className="text-xs text-vs-text-3 mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type={revealed ? 'text' : 'password'}
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasSaved ? 'Paste new value…' : 'Paste token…'}
          className="flex-1 px-3 py-2.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple font-mono"
        />
        <button type="button" onClick={() => setRevealed((v) => !v)} className="text-xs text-vs-text-3 hover:text-vs-text px-1">{revealed ? 'Hide' : 'Show'}</button>
        {hasSaved && <button type="button" onClick={() => { setReplacing(false); onChange(''); }} className="text-xs text-vs-text-3 hover:text-vs-text px-1">Cancel</button>}
      </div>
      {inputValue.trim() && (
        <div className="flex items-center gap-2 mt-2">
          <button type="button" onClick={onSave} disabled={saving}
            className="px-3 py-1.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saveMsg && <p className={`text-xs ${saveMsg.startsWith('Saved') ? 'text-vs-success' : 'text-vs-danger'}`}>{saveMsg}</p>}
        </div>
      )}
    </div>
  );
}

function TextConfigRow({ label, fieldValue, placeholder, mono, onSave, saving, saveMsg }) {
  const [val, setVal] = useState(fieldValue || '');
  const copy = (t) => navigator.clipboard?.writeText(t).catch(() => {});
  const display = fieldValue || val;
  return (
    <div className="mb-4">
      <p className="text-xs text-vs-text-3 mb-1.5">{label}</p>
      <div className="flex items-center gap-2 px-3 py-2.5 bg-vs-elevated border border-vs-border rounded-lg">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 bg-transparent text-sm text-vs-text placeholder-vs-text-3 focus:outline-none ${mono ? 'font-mono' : ''}`}
        />
        {display && <button type="button" onClick={() => copy(display)} className="text-xs text-vs-text-3 hover:text-vs-text transition-colors flex-shrink-0">Copy</button>}
      </div>
      {val.trim() && val !== fieldValue && (
        <div className="flex items-center gap-2 mt-2">
          <button type="button" onClick={() => onSave(val)} disabled={saving}
            className="px-3 py-1.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saveMsg && <p className={`text-xs ${saveMsg.startsWith('Saved') ? 'text-vs-success' : 'text-vs-danger'}`}>{saveMsg}</p>}
        </div>
      )}
    </div>
  );
}

// ── Activity item (section D) ─────────────────────────────────────────────────

const TRIGGER_LABEL = { test: 'Test message sent', manual: 'Manual message sent' };

function ActivityItem({ log }) {
  const isTest = log.trigger === 'test';
  const isManual = log.trigger === 'manual';
  const timeStr = log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  let icon, iconBg;
  if (isTest) {
    icon = <IcSend className="w-4 h-4 text-white" />;
    iconBg = 'bg-teal-500/80';
  } else if (isManual) {
    icon = <IcChat className="w-4 h-4 text-white" />;
    iconBg = 'bg-vs-purple/80';
  } else if (!log.ok) {
    icon = <IcShield className="w-4 h-4 text-white" />;
    iconBg = 'bg-red-500/70';
  } else {
    icon = <IcShieldCheck className="w-4 h-4 text-white" />;
    iconBg = 'bg-green-600/80';
  }

  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-vs-text-2">{timeStr}</p>
        <p className="text-xs text-vs-text-3 truncate mt-0.5">
          {log.ok
            ? (TRIGGER_LABEL[log.trigger] || log.preview?.slice(0, 40) || 'Message sent')
            : (log.error || 'Send failed')}
        </p>
      </div>
    </div>
  );
}

// ── Setup guide accordion (section E) ─────────────────────────────────────────

function SetupGuideAccordion({ title, steps }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider mb-3">{title || 'E. Need help setting this up?'}</p>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text-2 hover:bg-vs-hover transition-colors"
      >
        <span>View setup guide</span>
        {open ? <IcChevronUp className="w-4 h-4 text-vs-text-3" /> : <IcChevronDown className="w-4 h-4 text-vs-text-3" />}
      </button>
      {open && (
        <div className="mt-2 px-1">
          <ol className="space-y-2.5 text-xs text-vs-text-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-vs-purple flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Bottom WhatsApp connection summary bar ────────────────────────────────────

function WaConnectionBar({ waGroupStatus, waEvolutionUrl, waEvolutionInstance, waGroupId, waChannelId, onManage }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
          <WaIcon size={20} className="text-white" />
        </div>
        <div className="flex-shrink-0">
          <p className="text-sm font-semibold text-vs-text">WhatsApp Group</p>
          <div className="mt-0.5"><StatusPill status={waGroupStatus} /></div>
        </div>
        {expanded && (
          <div className="flex-1 grid grid-cols-4 gap-4 pl-4 border-l border-vs-border">
            <div>
              <p className="text-xs text-vs-text-3">API URL</p>
              <p className="text-xs font-mono text-vs-text-2 truncate mt-0.5">{waEvolutionUrl || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-vs-text-3">Instance Name</p>
              <p className="text-xs font-mono text-vs-text-2 truncate mt-0.5">{waEvolutionInstance || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-vs-text-3">Group ID</p>
              <p className="text-xs font-mono text-vs-text-2 truncate mt-0.5">{waGroupId ? waGroupId.slice(0, 18) + '…' : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-vs-text-3">Channel ID</p>
              <p className="text-xs font-mono text-vs-text-2 truncate mt-0.5">{waChannelId || '—'}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <button onClick={onManage}
            className="px-4 py-1.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-xs font-semibold rounded-lg transition-colors">
            Manage
          </button>
          <button onClick={() => setExpanded((v) => !v)} className="p-1.5 text-vs-text-3 hover:text-vs-text">
            {expanded ? <IcChevronUp className="w-4 h-4" /> : <IcChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
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
  const [dmCountryCode, setDmCountryCode]           = useState('');
  const [dmTemplateName, setDmTemplateName]         = useState('');
  const [dmTemplateLanguage, setDmTemplateLanguage] = useState('');
  const [dmSavingConfig, setDmSavingConfig]         = useState(false);
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
  const [dmSubTab, setDmSubTab]               = useState('Overview');
  const [dmStats, setDmStats]                 = useState(null);
  const [dmStatsLoading, setDmStatsLoading]   = useState(false);
  const [dmGroupLinkSaved, setDmGroupLinkSaved]             = useState('');
  const [dmChannelLinkSaved, setDmChannelLinkSaved]         = useState('');
  const [dmCountryCodeSaved, setDmCountryCodeSaved]         = useState('');
  const [dmTemplateNameSaved, setDmTemplateNameSaved]       = useState('');
  const [dmTemplateLanguageSaved, setDmTemplateLanguageSaved] = useState('');
  const [dmSearch, setDmSearch]               = useState('');
  const [dmStatusFilter, setDmStatusFilter]   = useState('all');

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
      setDmTemplateName(r.data.welcomeTemplateName || '');
      setDmTemplateLanguage(r.data.welcomeTemplateLanguage || '');
      if (r.data.welcomePreview) setDmTemplate(r.data.welcomePreview);
      // Track saved values for unsaved-changes detection
      setDmGroupLinkSaved(r.data.groupLink || '');
      setDmChannelLinkSaved(r.data.channelLink || '');
      setDmCountryCodeSaved(r.data.countryCode || '');
      setDmTemplateNameSaved(r.data.welcomeTemplateName || '');
      setDmTemplateLanguageSaved(r.data.welcomeTemplateLanguage || '');
    }).catch(() => {});
  }, []);

  const loadDmLogs = useCallback(() => {
    setDmLogsLoading(true);
    api.get('/notifications/dm/logs')
      .then((r) => setDmLogs(r.data.rows))
      .catch(() => {})
      .finally(() => setDmLogsLoading(false));
  }, []);

  const loadDmStats = useCallback(() => {
    setDmStatsLoading(true);
    api.get('/notifications/dm/stats')
      .then((r) => setDmStats(r.data))
      .catch(() => {})
      .finally(() => setDmStatsLoading(false));
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
    loadDmStats();
    api.get('/whatsapp/config').then((r) => {
      if (r.data.evolutionUrl)      setWaEvolutionUrl(r.data.evolutionUrl);
      if (r.data.evolutionInstance) setWaEvolutionInstance(r.data.evolutionInstance);
    }).catch(() => {});
    api.get('/whatsapp/status').then((r) => setWaStatus(r.data)).catch(() => {});
  }, [tab, loadDmConfig, loadDmLogs, loadDmStats]);

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
      await api.post('/notifications/dm/config', { groupLink: dmGroupLink, channelLink: dmChannelLink, countryCode: dmCountryCode, welcomeTemplateName: dmTemplateName, welcomeTemplateLanguage: dmTemplateLanguage });
      setDmConfigMsg('Saved!');
      setDmGroupLinkSaved(dmGroupLink);
      setDmChannelLinkSaved(dmChannelLink);
      setDmCountryCodeSaved(dmCountryCode);
      setDmTemplateNameSaved(dmTemplateName);
      setDmTemplateLanguageSaved(dmTemplateLanguage);
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

        const tgHealthItems = [
          { label: 'Bot Token', value: tgHealth?.botTokenValid ? 'Valid' : tgHealth?.botTokenValid === false ? 'Invalid' : null, state: hs(tgHealth?.botTokenValid) },
          { label: 'Chat ID', value: tgHealth?.chatIdValid ? 'Valid' : tgHealth?.chatIdValid === false ? 'Invalid' : null, state: hs(tgHealth?.chatIdValid) },
          { label: 'Admin Access', value: tgHealth?.canSend ? 'Confirmed' : tgHealth?.canSend === false ? 'Denied' : null, state: hs(tgHealth?.canSend) },
        ];
        const waHealthItems = (idLabel, idState) => [
          { label: 'Evolution API', value: waHealth?.urlReachable ? 'Reachable' : waHealth?.urlReachable === false ? 'Unreachable' : null, state: hs(waHealth?.urlReachable) },
          { label: 'API Key', value: waHealth?.apiKeyValid ? 'Valid' : waHealth?.apiKeyValid === false ? 'Invalid' : null, state: hs(waHealth?.apiKeyValid) },
          { label: 'Instance', value: waHealth?.instanceConnected ? 'Connected' : waHealth?.state || null, state: hs(waHealth?.instanceConnected) },
          { label: idLabel, value: idState ? 'Configured' : idState === false ? 'Missing' : null, state: hs(idState) },
        ];

        const tgSteps = [
          <>Message <span className="font-mono text-vs-purple-light">@BotFather</span> on Telegram → send <span className="font-mono">/newbot</span> → receive your <strong>bot token</strong>.</>,
          <>Add your bot to your Telegram group as an <strong>administrator</strong>.</>,
          <>Get the group <strong>Chat ID</strong>: forward any group message to <span className="font-mono text-vs-purple-light">@userinfobot</span>. Group IDs look like <span className="font-mono">-1001234567890</span>.</>,
          <>Paste both values into the configuration fields and click <strong>Save</strong>.</>,
        ];
        const waSteps = [
          <>Deploy Evolution API and connect your WhatsApp number via the manager UI at <span className="font-mono text-vs-purple-light">{'<your-url>/manager'}</span>.</>,
          <>Copy the <strong>API Key</strong> from your Evolution <span className="font-mono">.env</span> (<span className="font-mono">AUTHENTICATION_API_KEY</span>).</>,
          <>Enter the <strong>Instance Name</strong> exactly as created in the manager.</>,
          <>Get the <strong>Group ID</strong> (ends in <span className="font-mono">@g.us</span>) or <strong>Channel ID</strong> (ends in <span className="font-mono">@newsletter</span>).</>,
          <>Click <strong>Save</strong>, then run a <strong>health check</strong> to confirm the connection.</>,
        ];

        const channels = [
          { key: 'telegram',   name: 'Telegram Group',  status: tgStatus,        logs: tgLogs,  missingLabel: 'Bot Token + Chat ID' },
          { key: 'wa_group',   name: 'WhatsApp Group',  status: waGroupStatus,   logs: waLogs,  missingLabel: 'Evolution credentials' },
          { key: 'wa_channel', name: 'WhatsApp Channel',status: waChannelStatus, logs: waLogs,  missingLabel: 'Channel ID' },
        ];

        const sel = channels.find((c) => c.key === selectedChannel) || channels[0];

        // Per-field inline save helpers
        const saveTgField = async (field, value) => {
          try {
            await api.post('/telegram/config', { [field]: value });
            await loadStatus();
            return 'Saved!';
          } catch (err) {
            return err.response?.data?.error || 'Failed';
          }
        };

        const saveWaField = async (fields) => {
          try {
            await api.post('/whatsapp/config', fields);
            const r = await api.get('/whatsapp/status');
            setWaStatus(r.data);
            return 'Saved!';
          } catch (err) {
            return err.response?.data?.error || 'Failed';
          }
        };

        return (
          <div className="space-y-4">

            {/* ── Channel Overview ── */}
            <div>
              <p className="text-sm font-semibold text-vs-text mb-3">Channel Overview</p>
              <div className="space-y-3">
                {channels.map((c) => (
                  <ChannelOverviewCard
                    key={c.key}
                    channelKey={c.key}
                    name={c.name}
                    status={c.status}
                    sentToday={sentTodayCount(c.logs)}
                    lastTest={lastSuccess(c.logs)}
                    missingLabel={c.missingLabel}
                    selected={selectedChannel === c.key}
                    onManage={() => setSelectedChannel(c.key)}
                  />
                ))}
              </div>
            </div>

            {/* ── Sidebar + Detail Panel ── */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

              {/* Sidebar */}
              <div className="bg-vs-card border border-vs-border rounded-xl p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 px-2 mb-2">Channels</p>
                <div className="space-y-0.5">
                  {channels.map((c) => (
                    <ChannelSidebarItem
                      key={c.key}
                      channelKey={c.key}
                      name={c.name}
                      status={c.status}
                      selected={selectedChannel === c.key}
                      onClick={() => setSelectedChannel(c.key)}
                    />
                  ))}
                </div>
              </div>

              {/* Detail panel */}
              <div className="lg:col-span-3 bg-vs-card border border-vs-border rounded-xl overflow-hidden">

                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-vs-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedChannel === 'telegram' ? 'bg-[#2AABEE]' : 'bg-[#25D366]'}`}>
                      <ChanIcon channelKey={selectedChannel} size={18} className="text-white" />
                    </div>
                    <h2 className="text-base font-bold text-vs-text">{sel.name}</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-vs-text-3">Notifications Enabled</span>
                    <button
                      onClick={selectedChannel === 'telegram' ? handleToggleTg : handleToggleWa}
                      disabled={selectedChannel === 'telegram' ? togglingTg : togglingWa}
                      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${
                        (selectedChannel === 'telegram' ? tgEnabled : waEnabled) ? 'bg-vs-success' : 'bg-vs-elevated border border-vs-border'
                      }`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${(selectedChannel === 'telegram' ? tgEnabled : waEnabled) ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                {/* A | B | C columns */}
                <div className="grid grid-cols-3 divide-x divide-vs-border">

                  {/* A. Status Summary */}
                  <div className="p-5">
                    <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider mb-3">A. Status Summary</p>
                    {selectedChannel === 'telegram'
                      ? tgHealthItems.map((it) => <StatusCheckRow key={it.label} label={it.label} value={it.value} state={it.state} />)
                      : waHealthItems(
                          selectedChannel === 'wa_group' ? 'Group ID' : 'Channel ID',
                          selectedChannel === 'wa_group' ? waHealth?.groupIdConfigured : waHealth?.channelIdConfigured
                        ).map((it) => <StatusCheckRow key={it.label} label={it.label} value={it.value} state={it.state} />)
                    }
                    <div className="mt-4 pt-3 border-t border-vs-border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-vs-text-3">
                          <IcClock className="w-4 h-4" />
                          <span>Last Successful Test</span>
                        </div>
                        <span className="text-xs text-vs-text-2">
                          {lastSuccess(sel.logs)
                            ? new Date(lastSuccess(sel.logs)).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-vs-text-3">
                          <IcChat className="w-4 h-4" />
                          <span>Messages Sent Today</span>
                        </div>
                        <span className="text-xs font-semibold text-vs-text">{sentTodayCount(sel.logs)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-vs-text-3">
                          <IcShield className="w-4 h-4" />
                          <span>Failures Today</span>
                        </div>
                        <span className={`text-xs font-semibold ${failuresToday(sel.logs) > 0 ? 'text-vs-danger' : 'text-vs-text'}`}>{failuresToday(sel.logs)}</span>
                      </div>
                      <button onClick={recheckHealth} disabled={healthLoading}
                        className="mt-1 text-xs text-vs-text-3 hover:text-vs-text transition-colors disabled:opacity-50">
                        {healthLoading ? 'Checking…' : '↻ Re-check connection'}
                      </button>
                    </div>
                  </div>

                  {/* B. Configuration */}
                  <div className="p-5">
                    <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider mb-3">B. Configuration</p>

                    {selectedChannel === 'telegram' && (
                      <>
                        <SecretConfigRow
                          label="Bot Token"
                          savedPreview={status?.botTokenPreview}
                          inputValue={botToken}
                          onChange={setBotToken}
                          onSave={async () => { const msg = await saveTgField('botToken', botToken); setSaveMsg(msg); setBotToken(''); }}
                          saving={saving}
                          saveMsg={saveMsg}
                        />
                        <TextConfigRow
                          label="Chat ID"
                          fieldValue={status?.chatId || chatId}
                          placeholder="-1001234567890"
                          mono
                          onSave={async (val) => { const msg = await saveTgField('chatId', val); setSaveMsg(msg); setChatId(val); }}
                          saving={saving}
                          saveMsg={saveMsg}
                        />
                      </>
                    )}

                    {selectedChannel === 'wa_group' && (
                      <>
                        <TextConfigRow label="Evolution API URL" fieldValue={waEvolutionUrl} placeholder="http://localhost:8081" mono
                          onSave={async (val) => { const msg = await saveWaField({ evolutionUrl: val }); setWaSaveMsg(msg); setWaEvolutionUrl(val); }}
                          saving={waSaving} saveMsg={waSaveMsg} />
                        <SecretConfigRow label="API Key" savedPreview={waStatus?.evolutionApiKeyPreview}
                          inputValue={waEvolutionApiKey} onChange={setWaEvolutionApiKey}
                          onSave={async () => { const msg = await saveWaField({ evolutionApiKey: waEvolutionApiKey }); setWaSaveMsg(msg); setWaEvolutionApiKey(''); }}
                          saving={waSaving} saveMsg={waSaveMsg} />
                        <TextConfigRow label="Instance Name" fieldValue={waEvolutionInstance} placeholder="Vermo Sports" mono
                          onSave={async (val) => { const msg = await saveWaField({ evolutionInstance: val }); setWaSaveMsg(msg); setWaEvolutionInstance(val); }}
                          saving={waSaving} saveMsg={waSaveMsg} />
                        <TextConfigRow label="Group ID" fieldValue={waGroupId} placeholder="120363xxxxxxxxxx@g.us" mono
                          onSave={async (val) => { const msg = await saveWaField({ groupId: val }); setWaSaveMsg(msg); setWaGroupId(val); }}
                          saving={waSaving} saveMsg={waSaveMsg} />
                      </>
                    )}

                    {selectedChannel === 'wa_channel' && (
                      <>
                        <div className="mb-3 px-3 py-2 bg-vs-elevated/60 border border-vs-border rounded-lg text-xs text-vs-text-3">
                          Shared Evolution connection — configure URL, Key & Instance on the WhatsApp Group panel.
                        </div>
                        <TextConfigRow label="Channel ID" fieldValue={waChannelId} placeholder="120363xxxxxxxxxx@newsletter" mono
                          onSave={async (val) => { const msg = await saveWaField({ channelId: val }); setWaSaveMsg(msg); setWaChannelId(val); }}
                          saving={waSaving} saveMsg={waSaveMsg} />
                      </>
                    )}
                  </div>

                  {/* C. Actions */}
                  <div className="p-5">
                    <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider mb-3">C. Actions</p>
                    <div className="space-y-2 mb-5">
                      <button
                        onClick={selectedChannel === 'telegram' ? handleTest : selectedChannel === 'wa_group' ? handleWaTest : handleWaChannelTest}
                        disabled={selectedChannel === 'telegram' ? (testing || tgStatus === 'Needs Setup') : selectedChannel === 'wa_group' ? (waTesting || waGroupStatus === 'Needs Setup') : waChannelStatus === 'Needs Setup'}
                        className="w-full py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {(selectedChannel === 'telegram' ? testing : waTesting) ? 'Sending…' : 'Send Test Message'}
                      </button>
                      {(selectedChannel === 'telegram' ? testResult : selectedChannel === 'wa_group' ? waTestResult : waChannelSendResult) && (
                        <p className={`text-xs text-center ${(selectedChannel === 'telegram' ? testResult : selectedChannel === 'wa_group' ? waTestResult : waChannelSendResult)?.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
                          {(selectedChannel === 'telegram' ? testResult : selectedChannel === 'wa_group' ? waTestResult : waChannelSendResult)?.msg}
                        </p>
                      )}
                      <button className="w-full py-2.5 bg-transparent border border-vs-border text-vs-text-2 text-sm font-semibold rounded-lg hover:bg-vs-elevated transition-colors">
                        Preview Message
                      </button>
                    </div>

                    <div>
                      <p className="text-xs text-vs-text-3 mb-1.5 font-medium">Manual Message</p>
                      {sel.status !== 'Active' && (
                        <p className="text-xs text-vs-warning mb-2">{sel.status === 'Disabled' ? 'Notifications disabled.' : 'Channel not configured.'}</p>
                      )}
                      <form onSubmit={selectedChannel === 'telegram' ? handleSend : selectedChannel === 'wa_group' ? handleWaSend : handleWaSendChannel}>
                        <textarea
                          value={selectedChannel === 'telegram' ? message : selectedChannel === 'wa_group' ? waMessage : waChannelMessage}
                          onChange={(e) => selectedChannel === 'telegram' ? setMessage(e.target.value) : selectedChannel === 'wa_group' ? setWaMessage(e.target.value) : setWaChannelMessage(e.target.value)}
                          disabled={sel.status !== 'Active'}
                          rows={4}
                          maxLength={1024}
                          placeholder={`Type a message to send to the ${sel.name}…`}
                          className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-none disabled:opacity-50"
                        />
                        <div className="flex justify-end mt-1">
                          <span className="text-xs text-vs-text-3">
                            {(selectedChannel === 'telegram' ? message : selectedChannel === 'wa_group' ? waMessage : waChannelMessage).length} / 1024
                          </span>
                        </div>
                        <div className="mt-2">
                          <p className="text-xs text-vs-text-3 mb-1.5">Destination</p>
                          <div className="flex items-center gap-2 px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg">
                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${selectedChannel === 'telegram' ? 'bg-[#2AABEE]' : 'bg-[#25D366]'}`}>
                              <ChanIcon channelKey={selectedChannel} size={12} className="text-white" />
                            </div>
                            <span className="text-sm text-vs-text-2 flex-1">{sel.name}</span>
                            <button type="submit"
                              disabled={sel.status !== 'Active' || (selectedChannel === 'telegram' ? sending : selectedChannel === 'wa_group' ? waSending : waChannelSending) || !(selectedChannel === 'telegram' ? message : selectedChannel === 'wa_group' ? waMessage : waChannelMessage).trim()}
                              className="px-3 py-1 bg-vs-purple hover:bg-vs-purple/90 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50">
                              {(selectedChannel === 'telegram' ? sending : selectedChannel === 'wa_group' ? waSending : waChannelSending) ? '…' : 'Send'}
                            </button>
                          </div>
                          {(selectedChannel === 'telegram' ? sendResult : selectedChannel === 'wa_group' ? waSendResult : null) && (
                            <p className={`text-xs mt-1 ${(selectedChannel === 'telegram' ? sendResult : waSendResult)?.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
                              {(selectedChannel === 'telegram' ? sendResult : waSendResult)?.msg}
                            </p>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                {/* D + E row */}
                <div className="grid grid-cols-3 divide-x divide-vs-border border-t border-vs-border">

                  {/* D. Recent Activity — spans 2 cols */}
                  <div className="col-span-2 p-5">
                    <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider mb-3">D. Recent Activity</p>
                    {sel.logs.length === 0 ? (
                      <p className="text-xs text-vs-text-3 py-4 text-center">No activity yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {sel.logs.slice(0, 6).map((l) => (
                          <ActivityItem key={l.id} log={l} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* E. Setup guide — col 3 */}
                  <div className="p-5">
                    <SetupGuideAccordion
                      title="E. Need help setting this up?"
                      steps={selectedChannel === 'telegram' ? tgSteps : waSteps}
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* ── Bottom: WhatsApp connection summary bar ── */}
            <WaConnectionBar
              waGroupStatus={waGroupStatus}
              waEvolutionUrl={waEvolutionUrl}
              waEvolutionInstance={waEvolutionInstance}
              waGroupId={waGroupId}
              waChannelId={waChannelId}
              onManage={() => setSelectedChannel('wa_group')}
            />

          </div>
        );
      })()}

      {/* ── Direct Messages tab ── */}
      {tab === 'Direct Messages' && (() => {
        const isValidGroupLink    = (v) => !v || v.startsWith('https://chat.whatsapp.com/');
        const isValidChannelLink  = (v) => !v || v.startsWith('https://whatsapp.com/channel/');
        const isValidCountryCode  = (v) => !v || /^\d{1,4}$/.test(v.trim());

        const groupLinkValid   = isValidGroupLink(dmGroupLink);
        const channelLinkValid = isValidChannelLink(dmChannelLink);
        const ccValid          = isValidCountryCode(dmCountryCode);

        const hasUnsaved  = dmGroupLink !== dmGroupLinkSaved || dmChannelLink !== dmChannelLinkSaved || dmCountryCode !== dmCountryCodeSaved || dmTemplateName !== dmTemplateNameSaved || dmTemplateLanguage !== dmTemplateLanguageSaved;
        const canSave     = hasUnsaved && groupLinkValid && channelLinkValid && ccValid;

        const templateVars = ['{{name}}', '{{group_link}}', '{{channel_link}}'].filter((v) => (dmTemplate || '').includes(v));
        const livePreview  = (dmTemplate || '')
          .replace(/\{\{name\}\}/g, 'Abraham')
          .replace(/\{\{group_link\}\}/g, dmGroupLink || '(group link)')
          .replace(/\{\{channel_link\}\}/g, dmChannelLink || '(channel link)');

        const filteredLogs = dmLogs.filter((row) => {
          if (dmStatusFilter === 'success' && !row.ok) return false;
          if (dmStatusFilter === 'failed'  &&  row.ok) return false;
          if (dmSearch) {
            const s = dmSearch.toLowerCase();
            return (row.username || '').toLowerCase().includes(s) ||
                   (row.phone    || '').includes(s) ||
                   (row.user_id  || '').toLowerCase().includes(s);
          }
          return true;
        });

        const DM_SUBTABS = ['Overview', 'Configuration', 'Template', 'Testing', 'Logs'];
        const showA   = dmSubTab === 'Overview';
        const showB   = dmSubTab === 'Overview' || dmSubTab === 'Configuration';
        const showC   = dmSubTab === 'Overview' || dmSubTab === 'Template';
        const showD   = dmSubTab === 'Overview' || dmSubTab === 'Testing';
        const showE   = dmSubTab === 'Overview' || dmSubTab === 'Logs';

        const ValidationBadge = ({ valid, empty }) => {
          if (empty) return null;
          return valid
            ? <span className="flex items-center gap-1 text-xs text-vs-success flex-shrink-0"><svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg> Valid</span>
            : <span className="flex items-center gap-1 text-xs text-vs-danger flex-shrink-0"><svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg> Invalid</span>;
        };

        const DeliveryBadge = ({ ok }) => ok
          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 text-xs font-semibold border border-green-700/30"><svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg> Sent</span>
          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 text-xs font-semibold border border-red-700/30"><svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg> Failed</span>;

        return (
          <div className="space-y-5">

            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Welcome DMs */}
              <div className="bg-vs-card border border-vs-border rounded-xl p-4 flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-vs-purple/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-vs-purple-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-vs-text-3">Welcome DMs</p>
                  <p className={`text-sm font-bold ${dmEnabled ? 'text-green-400' : 'text-vs-warning'}`}>{dmEnabled ? 'Enabled' : 'Disabled'}</p>
                  <p className="text-xs text-vs-text-3 mt-0.5 leading-tight">{dmEnabled ? 'Automatic welcome DMs are active.' : 'DMs are paused.'}</p>
                </div>
              </div>
              {/* Template Status */}
              <div className="bg-vs-card border border-vs-border rounded-xl p-4 flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-vs-text-3">Template Status</p>
                  <p className="text-sm font-bold text-green-400">Approved</p>
                  <p className="text-xs text-vs-text-3 mt-0.5 leading-tight">Using the approved template.</p>
                </div>
              </div>
              {/* Delivery Rate */}
              <div className="bg-vs-card border border-vs-border rounded-xl p-4 flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-vs-purple/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-vs-purple-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-vs-text-3">Delivery Rate</p>
                  <p className="text-2xl font-bold text-vs-text leading-tight">{dmStats?.deliveryRate7d != null ? dmStats.deliveryRate7d + '%' : '—'}</p>
                  <p className="text-xs text-vs-text-3 mt-0.5 leading-tight">Successful deliveries (7 days)</p>
                </div>
              </div>
              {/* Failed Sends */}
              <div className="bg-vs-card border border-vs-border rounded-xl p-4 flex gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${(dmStats?.failedThisWeek || 0) > 0 ? 'bg-red-900/30' : 'bg-vs-elevated'}`}>
                  <svg className={`w-5 h-5 ${(dmStats?.failedThisWeek || 0) > 0 ? 'text-red-400' : 'text-vs-text-3'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-vs-text-3">Failed Sends</p>
                  <p className={`text-2xl font-bold leading-tight ${(dmStats?.failedThisWeek || 0) > 0 ? 'text-red-400' : 'text-vs-text'}`}>{dmStats?.failedThisWeek ?? '—'}</p>
                  <p className="text-xs text-vs-text-3 mt-0.5 leading-tight">Failed deliveries (7 days)</p>
                </div>
              </div>
              {/* Last Test */}
              <div className="bg-vs-card border border-vs-border rounded-xl p-4 flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-vs-elevated flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-vs-text-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-vs-text-3">Last Test</p>
                  <p className="text-base font-bold text-vs-text leading-tight">{dmStats?.lastTestAt ? timeAgo(dmStats.lastTestAt) : 'Not tested'}</p>
                  <p className={`text-xs mt-0.5 leading-tight ${dmStats?.lastTestOk ? 'text-green-400' : dmStats?.lastTestOk === false ? 'text-red-400' : 'text-vs-text-3'}`}>
                    {dmStats?.lastTestOk ? 'Last test message was successful.' : dmStats?.lastTestOk === false ? 'Last test failed.' : 'No test yet.'}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Sub-navigation ── */}
            <div className="flex gap-0 border-b border-vs-border">
              {DM_SUBTABS.map((t) => (
                <button key={t} onClick={() => setDmSubTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    dmSubTab === t ? 'border-vs-purple text-vs-purple-light' : 'border-transparent text-vs-text-3 hover:text-vs-text'
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── A + B + C row ── */}
            {(showA || showB || showC) && (
              <div className={`grid grid-cols-1 gap-4 ${showA && showB && showC ? 'lg:grid-cols-3' : showB && showC ? 'lg:grid-cols-2' : ''}`}>

                {/* A. Welcome DM Status */}
                {showA && (
                  <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-vs-text">A. Welcome DM Status</p>
                        <svg className="w-3.5 h-3.5 text-vs-text-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${dmEnabled ? 'bg-green-900/40 text-green-400 border-green-700/30' : 'bg-vs-elevated text-vs-text-3 border-vs-border'}`}>{dmEnabled ? 'Enabled' : 'Disabled'}</span>
                        <button onClick={handleToggleDm} disabled={togglingDm}
                          className={`relative w-10 h-5 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${dmEnabled ? 'bg-vs-success' : 'bg-vs-elevated border border-vs-border'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${dmEnabled ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-vs-text-3 mb-4 leading-relaxed">New users with a phone number receive the approved welcome message automatically.</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 text-xs text-vs-text-3">
                          <svg className="w-4 h-4 text-vs-purple-light flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                          Total sent this week
                        </div>
                        <span className="text-sm font-bold text-vs-text">{dmStats?.sentThisWeek?.toLocaleString() ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 text-xs text-vs-text-3">
                          <svg className="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          Failed this week
                        </div>
                        <span className={`text-sm font-bold ${(dmStats?.failedThisWeek || 0) > 0 ? 'text-red-400' : 'text-vs-text'}`}>{dmStats?.failedThisWeek ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 text-xs text-vs-text-3">
                          <svg className="w-4 h-4 text-vs-text-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          Last automated send
                        </div>
                        <span className="text-sm font-medium text-vs-text">{dmStats?.lastAutomatedSend ? timeAgo(dmStats.lastAutomatedSend) : '—'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* B. Welcome Message Links */}
                {showB && (
                  <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-vs-text">B. Welcome Message Links</p>
                      {hasUnsaved && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                          Unsaved changes
                        </span>
                      )}
                    </div>
                    <form onSubmit={handleSaveDmConfig} className="space-y-4">
                      <div>
                        <label className="text-xs text-vs-text-3 block mb-1.5">WhatsApp Group Link</label>
                        <div className="flex items-center gap-2">
                          <input type="url" value={dmGroupLink} onChange={(e) => setDmGroupLink(e.target.value)}
                            placeholder="https://chat.whatsapp.com/..."
                            className={`flex-1 px-3 py-2 bg-vs-elevated border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple ${groupLinkValid ? 'border-vs-border' : 'border-red-500/50'}`} />
                          <ValidationBadge valid={groupLinkValid} empty={!dmGroupLink} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-vs-text-3 block mb-1.5">WhatsApp Channel Link</label>
                        <div className="flex items-center gap-2">
                          <input type="url" value={dmChannelLink} onChange={(e) => setDmChannelLink(e.target.value)}
                            placeholder="https://whatsapp.com/channel/..."
                            className={`flex-1 px-3 py-2 bg-vs-elevated border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple ${channelLinkValid ? 'border-vs-border' : 'border-red-500/50'}`} />
                          <ValidationBadge valid={channelLinkValid} empty={!dmChannelLink} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-vs-text-3 block mb-1.5">Default Country Code</label>
                        <div className="flex items-center gap-2">
                          <input type="text" value={dmCountryCode} onChange={(e) => setDmCountryCode(e.target.value)}
                            placeholder="234"
                            className={`w-32 px-3 py-2 bg-vs-elevated border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple ${ccValid ? 'border-vs-border' : 'border-red-500/50'}`} />
                          <ValidationBadge valid={ccValid} empty={!dmCountryCode} />
                        </div>
                        <p className="text-xs text-vs-text-3 mt-1">e.g. 234 for Nigeria</p>
                      </div>
                      <div className="pt-2 border-t border-vs-border/50">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-vs-text-2">Evolution Connection</p>
                          {waStatus && (
                            <span className={`flex items-center gap-1.5 text-xs ${waHealth?.instanceConnected ? 'text-vs-success' : waStatus?.evolutionUrlSet && waStatus?.evolutionApiKeySet && waStatus?.evolutionInstanceSet ? 'text-yellow-400' : 'text-vs-danger'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${waHealth?.instanceConnected ? 'bg-vs-success' : waStatus?.evolutionUrlSet && waStatus?.evolutionApiKeySet && waStatus?.evolutionInstanceSet ? 'bg-yellow-400' : 'bg-vs-danger'}`} />
                              {waHealth?.instanceConnected ? 'Connected' : waStatus?.evolutionUrlSet && waStatus?.evolutionApiKeySet && waStatus?.evolutionInstanceSet ? 'Configured' : 'Not configured'}
                            </span>
                          )}
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-vs-text-3 block mb-1.5">Evolution API URL</label>
                            <input type="text" value={waEvolutionUrl} onChange={(e) => setWaEvolutionUrl(e.target.value)}
                              placeholder="https://evolution.example.com"
                              className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                          </div>
                          <div>
                            <label className="text-xs text-vs-text-3 block mb-1.5">API Key</label>
                            <input type="password" value={waEvolutionApiKey} onChange={(e) => setWaEvolutionApiKey(e.target.value)}
                              placeholder={waStatus?.evolutionApiKeyPreview || 'Enter API key'}
                              className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                            {waStatus?.evolutionApiKeySet && <p className="text-xs text-vs-text-3 mt-1">Leave blank to keep current key.</p>}
                          </div>
                          <div>
                            <label className="text-xs text-vs-text-3 block mb-1.5">Instance Name</label>
                            <input type="text" value={waEvolutionInstance} onChange={(e) => setWaEvolutionInstance(e.target.value)}
                              placeholder="e.g. vermo-prod"
                              className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                          </div>
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={handleWaSave} disabled={waSaving}
                              className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                              {waSaving ? 'Saving…' : 'Save Connection'}
                            </button>
                            {waSaveMsg && <p className={`text-xs ${waSaveMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{waSaveMsg}</p>}
                          </div>
                          <p className="text-xs text-vs-text-3">Shared with WhatsApp group/channel broadcasts.</p>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-vs-border/50">
                        <p className="text-xs font-semibold text-vs-text-2 mb-3">WhatsApp Template (Welcome Message)</p>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-vs-text-3 block mb-1.5">Template Name</label>
                            <input type="text" value={dmTemplateName} onChange={(e) => setDmTemplateName(e.target.value)}
                              placeholder="e.g. vermo_welcome"
                              className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                          </div>
                          <div>
                            <label className="text-xs text-vs-text-3 block mb-1.5">Template Language</label>
                            <input type="text" value={dmTemplateLanguage} onChange={(e) => setDmTemplateLanguage(e.target.value)}
                              placeholder="e.g. en_US"
                              className="w-48 px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                          </div>
                          <p className="text-xs text-vs-text-3">Template must be approved in WhatsApp Business Manager. Leave blank to fall back to plain text.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <button type="submit" disabled={dmSavingConfig || !canSave}
                          className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                          {dmSavingConfig ? 'Saving…' : 'Save Changes'}
                        </button>
                        {dmConfigMsg && <p className={`text-xs ${dmConfigMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{dmConfigMsg}</p>}
                      </div>
                    </form>
                  </div>
                )}

                {/* C. Approved Welcome Template */}
                {showC && (
                  <div className="bg-vs-card border border-vs-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-vs-text">C. Approved Welcome Template</p>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/40 text-green-400 border border-green-700/30 font-semibold">Approved</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                      <div><p className="text-vs-text-3">Template name</p><p className="text-vs-text font-mono mt-0.5">welcome_to_vermosports</p></div>
                      <div><p className="text-vs-text-3">Source</p><p className="text-vs-text-2 mt-0.5">Interakt.ai</p></div>
                      <div>
                        <p className="text-vs-text-3">Editable here</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className="text-vs-text-2">No</p>
                          <svg className="w-3 h-3 text-vs-text-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-vs-text-3 mb-1.5">Template preview</p>
                        <pre className="w-full px-3 py-2.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text-2 whitespace-pre-wrap font-sans leading-relaxed min-h-[100px]">{dmTemplate}</pre>
                      </div>
                      <div>
                        <p className="text-xs text-vs-text-3 mb-1.5">Live preview (Abraham)</p>
                        <pre className="w-full px-3 py-2.5 bg-vs-elevated/60 border border-vs-purple/20 rounded-lg text-xs text-vs-text-2 whitespace-pre-wrap font-sans leading-relaxed min-h-[100px]">{livePreview}</pre>
                      </div>
                    </div>
                    {templateVars.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-vs-text-3">Variables used</span>
                        {templateVars.map((v) => (
                          <span key={v} className="px-2 py-0.5 bg-vs-elevated border border-vs-border rounded-md text-xs font-mono text-vs-purple-light">{v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── D + E row ── */}
            {(showD || showE) && (
              <div className={`grid grid-cols-1 gap-4 ${showD && showE ? 'lg:grid-cols-5' : ''}`}>

                {/* D. Send Test Welcome Message */}
                {showD && (
                  <div className={`bg-vs-card border border-vs-border rounded-xl p-5 ${showD && showE ? 'lg:col-span-2' : ''}`}>
                    <div className="flex items-center gap-2 mb-4">
                      <p className="text-sm font-semibold text-vs-text">D. Send Test Welcome Message</p>
                      <svg className="w-3.5 h-3.5 text-vs-text-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                    </div>
                    <form onSubmit={handleDmTest} className="space-y-3">
                      <div>
                        <label className="text-xs text-vs-text-3 block mb-1.5">Phone number</label>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0 bg-vs-elevated border border-vs-border rounded-lg overflow-hidden flex-1">
                            <span className="px-2.5 py-2 text-sm text-vs-text-3 border-r border-vs-border bg-vs-elevated flex-shrink-0">+{dmCountryCode || '234'}</span>
                            <input type="tel" value={dmTestPhone} onChange={(e) => setDmTestPhone(e.target.value)}
                              placeholder="814 638 1549"
                              className="flex-1 px-3 py-2 bg-transparent text-sm text-vs-text placeholder-vs-text-3 focus:outline-none" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-vs-text-3 mb-1.5">Message preview</p>
                        <pre className="w-full px-3 py-2.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text-2 whitespace-pre-wrap font-sans leading-relaxed max-h-36 overflow-y-auto">
                          {(dmTemplate || '').replace(/\{\{name\}\}/g, 'Test User').replace(/\{\{group_link\}\}/g, dmGroupLink || '(group link)').replace(/\{\{channel_link\}\}/g, dmChannelLink || '(channel link)')}
                        </pre>
                      </div>
                      <button type="submit" disabled={dmTesting || !dmTestPhone.trim() || !dmEnabled}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                        {dmTesting ? 'Sending…' : 'Send Test DM'}
                      </button>
                      {!dmEnabled && <p className="text-xs text-vs-warning text-center">Welcome DMs are disabled.</p>}
                    </form>
                    {dmTestResult && (
                      <div className={`mt-3 flex items-center gap-2 text-xs ${dmTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          {dmTestResult.ok
                            ? <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                            : <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                          }
                        </svg>
                        {dmTestResult.ok ? 'Last test successful' : dmTestResult.msg}
                        {dmTestResult.ok && dmStats?.lastTestAt && <span className="text-vs-text-3 ml-1">{timeAgo(dmStats.lastTestAt)}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* E. Direct Message Delivery Log */}
                {showE && (
                  <div className={`bg-vs-card border border-vs-border rounded-xl overflow-hidden ${showD && showE ? 'lg:col-span-3' : ''}`}>
                    <div className="px-5 py-3 border-b border-vs-border flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-vs-text mr-auto">E. Direct Message Delivery Log</p>
                      <div className="relative">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-vs-text-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input value={dmSearch} onChange={(e) => setDmSearch(e.target.value)}
                          placeholder="Search by user or phone…"
                          className="pl-8 pr-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-1 focus:ring-vs-purple w-48" />
                      </div>
                      <div className="flex items-center gap-1">
                        {['all', 'success', 'failed'].map((f) => (
                          <button key={f} onClick={() => setDmStatusFilter(f)}
                            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${dmStatusFilter === f ? 'bg-vs-elevated text-vs-text border border-vs-border' : 'text-vs-text-3 hover:text-vs-text'}`}>
                            {f === 'all' ? 'All' : f === 'success' ? 'Success' : 'Failed'}
                          </button>
                        ))}
                      </div>
                      {dmRetryAllResult && (
                        <span className={`text-xs ${dmRetryAllResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
                          {dmRetryAllResult.ok ? `${dmRetryAllResult.retried} retried — ${dmRetryAllResult.succeeded} sent, ${dmRetryAllResult.failed} failed` : (dmRetryAllResult.error || 'Failed')}
                        </span>
                      )}
                      <button onClick={handleDmRetryAll} disabled={dmRetryAllSending}
                        className="flex items-center gap-1.5 text-xs text-vs-purple-light hover:text-vs-purple px-2.5 py-1.5 rounded-md border border-vs-purple/30 hover:bg-vs-purple/10 transition-colors disabled:opacity-40">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                        {dmRetryAllSending ? 'Retrying…' : 'Retry Failed'}
                      </button>
                      <button onClick={loadDmLogs}
                        className="flex items-center gap-1.5 text-xs text-vs-text-3 hover:text-vs-text px-2.5 py-1.5 rounded-md border border-vs-border hover:bg-vs-elevated transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        Refresh
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-vs-border bg-vs-elevated/40">
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Time</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Phone</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Template</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Error</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-vs-border">
                          {dmLogsLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                              <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                                <td key={j} className="px-4 py-2.5"><div className="h-3.5 bg-vs-elevated rounded animate-pulse" /></td>
                              ))}</tr>
                            ))
                          ) : filteredLogs.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-10 text-vs-text-3 text-sm">No DMs found.</td></tr>
                          ) : (
                            filteredLogs.map((row) => (
                              <tr key={row.id} className="hover:bg-vs-elevated/40 transition-colors">
                                <td className="px-4 py-2.5 text-xs text-vs-text-3 whitespace-nowrap">{row.sent_at ? new Date(row.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                <td className="px-4 py-2.5 text-xs text-vs-text font-medium">{row.username || row.user_id || '—'}</td>
                                <td className="px-4 py-2.5 text-xs text-vs-text-3 font-mono">{row.phone || '—'}</td>
                                <td className="px-4 py-2.5 text-xs text-vs-text-3 font-mono">welcome_to_vermosports</td>
                                <td className="px-4 py-2.5"><DeliveryBadge ok={!!row.ok} /></td>
                                <td className="px-4 py-2.5 text-xs text-red-400 max-w-[140px] truncate">{row.error || '—'}</td>
                                <td className="px-4 py-2.5 text-right">
                                  {!row.ok && (
                                    <div className="flex items-center justify-end gap-2">
                                      {dmRetryResults[row.id] && (
                                        <span className={`text-xs ${dmRetryResults[row.id] === 'ok' ? 'text-vs-success' : 'text-vs-danger'}`}>
                                          {dmRetryResults[row.id] === 'ok' ? '✓' : '✗'}
                                        </span>
                                      )}
                                      <button onClick={() => handleDmRetry(row.id)} disabled={dmRetryingId === row.id}
                                        className="text-xs text-vs-purple-light hover:text-vs-purple border border-vs-purple/30 rounded-md px-2 py-0.5 hover:bg-vs-purple/10 transition-colors disabled:opacity-40">
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
                    {filteredLogs.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-vs-border text-xs text-vs-text-3">
                        Showing 1 to {filteredLogs.length} of {filteredLogs.length} results
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── F. Help & Information ── */}
            {showA && (
              <div className="bg-vs-card border border-vs-border rounded-xl p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-vs-elevated border border-vs-border flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-vs-text-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><path d="M12 12v4"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-vs-text mb-1">F. Help &amp; Information</p>
                  <p className="text-xs text-vs-text-3 leading-relaxed">
                    The welcome template content is managed in Interakt.ai and must be approved before use. You cannot edit the template text here. Use the links above to connect your WhatsApp Group and Channel.<br />
                    For advanced template management and approvals, log in to Interakt.ai or WhatsApp Business Manager.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href="https://app.interakt.ai" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text-2 hover:bg-vs-hover transition-colors">
                    Open Interakt.ai
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                  <a href="https://business.facebook.com/wa/manage" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text-2 hover:bg-vs-hover transition-colors">
                    WhatsApp Business Manager
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                </div>
              </div>
            )}

          </div>
        );
      })()}

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
