import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const TABS = ['Create', 'Settings'];

const PROVIDERS = [
  { id: 'claude',  label: 'Claude',   color: 'text-orange-400' },
  { id: 'openai',  label: 'ChatGPT',  color: 'text-vs-success' },
  { id: 'gemini',  label: 'Gemini',   color: 'text-blue-400'   },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CampaignsPage() {
  const [tab, setTab] = useState('Create');

  // ── Fixture picker state ──────────────────────────────────────────────────
  const [dateFrom, setDateFrom]       = useState(today());
  const [dateTo, setDateTo]           = useState(plusDays(7));
  const [fixtures, setFixtures]       = useState([]);
  const [loadingFx, setLoadingFx]     = useState(false);
  const [fxError, setFxError]         = useState('');
  const [selected, setSelected]       = useState(new Set());

  // ── Generate state ────────────────────────────────────────────────────────
  const [context, setContext]         = useState('');
  const [provider, setProvider]       = useState('claude');
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState('');
  const [content, setContent]         = useState('');

  // ── Send state ────────────────────────────────────────────────────────────
  const [chTelegram, setChTelegram]   = useState(true);
  const [chWhatsApp, setChWhatsApp]   = useState(true);
  const [sending, setSending]         = useState(false);
  const [sendResults, setSendResults] = useState(null);

  // ── Settings state ────────────────────────────────────────────────────────
  const [cfgProvider, setCfgProvider] = useState('claude');
  const [claudeKey, setClaudeKey]     = useState('');
  const [openaiKey, setOpenaiKey]     = useState('');
  const [geminiKey, setGeminiKey]     = useState('');
  const [keyStatus, setKeyStatus]     = useState({ claudeKeySet: false, openaiKeySet: false, geminiKeySet: false });
  const [savingCfg, setSavingCfg]     = useState(false);
  const [cfgMsg, setCfgMsg]           = useState('');

  // ── Load config ───────────────────────────────────────────────────────────
  const loadConfig = useCallback(() => {
    api.get('/campaigns/config').then((r) => {
      setCfgProvider(r.data.provider || 'claude');
      setProvider(r.data.provider || 'claude');
      setKeyStatus({
        claudeKeySet: !!r.data.claudeKeySet,
        openaiKeySet: !!r.data.openaiKeySet,
        geminiKeySet: !!r.data.geminiKeySet,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Load fixtures ─────────────────────────────────────────────────────────
  const loadFixtures = async () => {
    setLoadingFx(true); setFxError(''); setFixtures([]); setSelected(new Set());
    try {
      const r = await api.get('/fixtures', { params: { dateFrom, dateTo, limit: 50 } });
      setFixtures(r.data.fixtures || []);
      if ((r.data.fixtures || []).length === 0) setFxError('No fixtures found for this date range.');
    } catch (err) {
      setFxError(err.response?.data?.error || 'Failed to load fixtures');
    } finally {
      setLoadingFx(false);
    }
  };

  const toggleFixture = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === fixtures.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(fixtures.map((f) => f._id)));
    }
  };

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true); setGenError(''); setSendResults(null);
    const pickedFixtures = fixtures
      .filter((f) => selected.has(f._id))
      .map((f) => ({ homeTeam: f.homeTeam?.name, awayTeam: f.awayTeam?.name, league: f.league?.name, date: f.date }));
    try {
      const r = await api.post('/campaigns/generate', { fixtures: pickedFixtures, context, provider });
      if (r.data.ok) {
        setContent(r.data.content || '');
      } else {
        setGenError(r.data.error || 'Generation failed');
      }
    } catch (err) {
      setGenError(err.response?.data?.error || 'Request failed');
    } finally {
      setGenerating(false);
    }
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!content.trim()) return;
    const channels = [];
    if (chTelegram) channels.push('telegram');
    if (chWhatsApp) channels.push('whatsapp');
    if (!channels.length) return;
    setSending(true); setSendResults(null);
    try {
      const r = await api.post('/campaigns/send', { content, channels });
      setSendResults(r.data.results || {});
    } catch (err) {
      setSendResults({ _error: err.response?.data?.error || 'Request failed' });
    } finally {
      setSending(false);
    }
  };

  // ── Save settings ─────────────────────────────────────────────────────────
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingCfg(true); setCfgMsg('');
    try {
      await api.post('/campaigns/config', {
        provider: cfgProvider,
        ...(claudeKey ? { claudeKey } : {}),
        ...(openaiKey ? { openaiKey } : {}),
        ...(geminiKey ? { geminiKey } : {}),
      });
      setCfgMsg('Saved!');
      setClaudeKey(''); setOpenaiKey(''); setGeminiKey('');
      await loadConfig();
    } catch (err) {
      setCfgMsg(err.response?.data?.error || 'Failed');
    } finally {
      setSavingCfg(false);
    }
  };

  const canGenerate = !generating && (selected.size > 0 || context.trim().length > 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Campaigns</h1>
        <p className="text-sm text-vs-text-3 mt-1">Generate AI-written CTAs from upcoming fixtures and send to your channels</p>
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

      {/* ── Create tab ── */}
      {tab === 'Create' && (
        <div className="space-y-6 max-w-3xl">

          {/* Step 1 – Fixture Picker */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">1. Pick Fixtures</p>
            <p className="text-xs text-vs-text-3 mb-4">Select the upcoming matches you want to write about.</p>

            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="text-xs text-vs-text-3 block mb-1">From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
              </div>
              <div>
                <label className="text-xs text-vs-text-3 block mb-1">To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
              </div>
              <button onClick={loadFixtures} disabled={loadingFx}
                className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {loadingFx ? 'Loading…' : 'Load Fixtures'}
              </button>
            </div>

            {fxError && <p className="text-xs text-vs-danger mb-3">{fxError}</p>}

            {fixtures.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={toggleAll}
                    className="text-xs text-vs-purple-light hover:text-vs-purple transition-colors">
                    {selected.size === fixtures.length ? 'Deselect all' : 'Select all'}
                  </button>
                  <span className="text-xs text-vs-text-3">{selected.size} of {fixtures.length} selected</span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {fixtures.map((f) => (
                    <label key={f._id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                        selected.has(f._id)
                          ? 'border-vs-purple/50 bg-vs-purple/10'
                          : 'border-vs-border hover:bg-vs-elevated'
                      }`}>
                      <input type="checkbox" checked={selected.has(f._id)} onChange={() => toggleFixture(f._id)}
                        className="w-4 h-4 accent-purple-500 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-vs-text">
                          {f.homeTeam?.name} <span className="text-vs-text-3 font-normal">vs</span> {f.awayTeam?.name}
                        </span>
                        <span className="text-xs text-vs-text-3 ml-2">
                          {f.league?.name && <span className="mr-2">{f.league.name}</span>}
                          {fmtDate(f.date)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Step 2 – Context */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">2. Add Context</p>
            <p className="text-xs text-vs-text-3 mb-3">Tell the AI what's trending — injuries, rivalries, title races, recent results, anything newsworthy.</p>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={4}
              placeholder="e.g. Arsenal need a win to stay top, Salah returns from injury, El Clásico form guide…"
              className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-y"
            />
          </div>

          {/* Step 3 – Provider + Generate */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">3. Choose AI & Generate</p>
            <div className="flex gap-2 mb-4">
              {PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => setProvider(p.id)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    provider === p.id
                      ? 'border-vs-purple bg-vs-purple/15 text-vs-text'
                      : 'border-vs-border text-vs-text-3 hover:text-vs-text hover:bg-vs-elevated'
                  }`}>
                  <span className={provider === p.id ? p.color : ''}>{p.label}</span>
                </button>
              ))}
            </div>

            {!canGenerate && !content && (
              <p className="text-xs text-vs-text-3 mb-3">Select at least one fixture or add context to enable generation.</p>
            )}

            <button onClick={handleGenerate} disabled={!canGenerate}
              className="w-full py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
              {generating ? '✨ Generating…' : '✨ Generate Campaign'}
            </button>

            {genError && <p className="text-xs text-vs-danger mt-3">{genError}</p>}
          </div>

          {/* Step 4 – Edit & Send (always visible) */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">4. Edit & Send</p>
              {content && <span className="text-xs text-vs-text-3">{content.length} chars</span>}
            </div>

            {generating ? (
              <div className="h-40 bg-vs-elevated rounded-lg animate-pulse" />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="Your generated campaign message will appear here. You can also type directly."
                className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm font-mono text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-y"
              />
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={chTelegram} onChange={(e) => setChTelegram(e.target.checked)}
                    className="w-4 h-4 accent-purple-500" />
                  <span className="text-sm text-vs-text">Telegram</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={chWhatsApp} onChange={(e) => setChWhatsApp(e.target.checked)}
                    className="w-4 h-4 accent-purple-500" />
                  <span className="text-sm text-vs-text">WhatsApp Channel / Group</span>
                </label>
              </div>

              <button onClick={handleSend}
                disabled={sending || generating || !content.trim() || (!chTelegram && !chWhatsApp)}
                className="px-5 py-2 bg-vs-success hover:bg-vs-success/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
                {sending ? 'Sending…' : '📣 Send to Channels'}
              </button>

              {sendResults && (
                <div className="flex items-center gap-3 text-xs">
                  {sendResults._error && (
                    <span className="text-vs-danger">{sendResults._error}</span>
                  )}
                  {sendResults.telegram && (
                    <span className={sendResults.telegram.ok ? 'text-vs-success' : 'text-vs-danger'}>
                      Telegram: {sendResults.telegram.ok ? '✓ Sent' : (sendResults.telegram.reason || 'Failed')}
                    </span>
                  )}
                  {sendResults.whatsapp && (
                    <span className={sendResults.whatsapp.ok ? 'text-vs-success' : 'text-vs-danger'}>
                      WhatsApp: {sendResults.whatsapp.ok ? '✓ Sent' : (sendResults.whatsapp.reason || 'Failed')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings tab ── */}
      {tab === 'Settings' && (
        <div className="max-w-lg">
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">AI Provider Keys</p>
            <p className="text-xs text-vs-text-3 mb-5">Keys are stored securely in the server database. Paste a new key to update — leave blank to keep the existing one.</p>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="text-xs text-vs-text-3 block mb-1">Default Provider</label>
                <div className="flex gap-2">
                  {PROVIDERS.map((p) => (
                    <button type="button" key={p.id} onClick={() => setCfgProvider(p.id)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        cfgProvider === p.id
                          ? 'border-vs-purple bg-vs-purple/15 text-vs-text'
                          : 'border-vs-border text-vs-text-3 hover:text-vs-text hover:bg-vs-elevated'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {[
                { id: 'claude',  label: 'Claude (Anthropic) API Key', value: claudeKey, set: keyStatus.claudeKeySet, onChange: setClaudeKey, placeholder: 'sk-ant-…' },
                { id: 'openai',  label: 'OpenAI API Key',             value: openaiKey, set: keyStatus.openaiKeySet, onChange: setOpenaiKey, placeholder: 'sk-proj-…' },
                { id: 'gemini',  label: 'Gemini (Google) API Key',    value: geminiKey, set: keyStatus.geminiKeySet, onChange: setGeminiKey, placeholder: 'AIza…' },
              ].map((field) => (
                <div key={field.id}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-vs-text-3">{field.label}</label>
                    {field.set && (
                      <span className="text-xs text-vs-success">● Set</span>
                    )}
                  </div>
                  <input type="password" value={field.value} onChange={(e) => field.onChange(e.target.value)}
                    placeholder={field.set ? 'Already set — paste new to update' : field.placeholder}
                    className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
                </div>
              ))}

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={savingCfg}
                  className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {savingCfg ? 'Saving…' : 'Save Settings'}
                </button>
                {cfgMsg && <p className={`text-xs ${cfgMsg === 'Saved!' ? 'text-vs-success' : 'text-vs-danger'}`}>{cfgMsg}</p>}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
