import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import UserProfileModal from '../components/UserProfileModal';

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${n}%`;
}

function relTime(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30)  return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function MiniBar({ value, max, accent = 'bg-vs-purple' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-vs-elevated rounded-full h-1.5">
      <div className={`${accent} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub, accent = 'text-vs-text' }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-vs-text-3 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wider text-vs-text-3 mb-3">{children}</h2>;
}

function FunnelBar({ label, count, pct, accent, subLabel }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 text-xs text-vs-text-3 text-right shrink-0">{label}</div>
      <div className="flex-1 bg-vs-elevated rounded-full h-5 overflow-hidden">
        <div className={`h-5 rounded-full flex items-center px-2 transition-all ${accent}`} style={{ width: `${Math.max(pct, 1)}%` }}>
          <span className="text-xs font-bold text-white whitespace-nowrap">{pct}%</span>
        </div>
      </div>
      <div className="w-32 text-xs text-vs-text shrink-0">
        <span className="font-semibold">{count.toLocaleString()}</span>
        {subLabel && <span className="text-vs-text-3 ml-1">{subLabel}</span>}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-vs-purple' : 'bg-vs-elevated'} border border-vs-border ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
      <span className="text-sm text-vs-text-2">{label}</span>
    </label>
  );
}

function PortalSettingsPanel({ onSettingsChange }) {
  const { editMode, requestElevation } = useAuth();
  const [settings, setSettings]     = useState(null);
  const [saving, setSaving]         = useState(false);
  const [elevating, setElevating]   = useState(false);
  const [elevErr, setElevErr]       = useState('');
  const [msg, setMsg]               = useState('');

  useEffect(() => {
    api.get('/influencer-dashboard/settings').then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  const save = async (patch) => {
    setSaving(true); setMsg('');
    try {
      await api.post('/influencer-dashboard/settings', patch);
      setSettings((s) => ({ ...s, ...patch }));
      if (onSettingsChange) onSettingsChange(patch);
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed');
    } finally {
      setSaving(false); }
  };

  const handleElevate = async () => {
    setElevating(true); setElevErr('');
    try { await requestElevation('Influencer portal settings'); }
    catch (e) { setElevErr(e.response?.data?.error || e.message || 'Failed'); }
    finally { setElevating(false); }
  };

  if (!settings) return null;

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-vs-text">Influencer Portal Settings</p>
        <a href="/influencer" target="_blank" rel="noopener noreferrer"
          className="text-xs text-vs-purple hover:underline">
          Open public portal ↗
        </a>
      </div>
      {!editMode ? (
        <div className="space-y-2">
          <p className="text-xs text-vs-text-3">Edit access required to change settings.</p>
          <button onClick={handleElevate} disabled={elevating}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
            {elevating ? 'Requesting…' : '🔓 Request Edit Access'}
          </button>
          {elevErr && <p className="text-xs text-vs-danger">{elevErr}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <Toggle
            checked={settings.showFunnel}
            onChange={(v) => save({ showFunnel: v })}
            label="Show conversion funnel (Funded + Placed Bet steps)"
            disabled={saving}
          />
          <Toggle
            checked={settings.showEarnings}
            onChange={(v) => save({ showEarnings: v })}
            label="Show earnings section"
            disabled={saving}
          />
          {msg && <p className={`text-xs ${msg === 'Saved' ? 'text-vs-success' : 'text-vs-danger'}`}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

const SORT_KEYS = ['referred', 'funded', 'bet', 'conversionRate', 'lastReferralAt', 'earnings'];

function RateCell({ inf, editMode, onSaved }) {
  const [editing, setEditing]   = useState(false);
  const [val, setVal]           = useState('');
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const open = () => { setVal(inf.rate > 0 ? String(inf.rate) : ''); setEditing(true); setErr(''); };
  const cancel = () => { setEditing(false); setErr(''); };

  const save = async () => {
    const code = inf.referralCode;
    if (!code) { setErr('No referral code'); return; }
    setSaving(true); setErr('');
    try {
      await api.post(`/influencer-dashboard/rates/${encodeURIComponent(code)}`, { rate: parseFloat(val) || 0 });
      onSaved(code, parseFloat(val) || 0);
      setEditing(false);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed');
    } finally { setSaving(false); }
  };

  if (!inf.referralCode) return <span className="text-vs-text-3 text-xs">—</span>;

  if (!editing) {
    return (
      <button onClick={editMode ? open : undefined}
        className={`text-xs font-mono ${editMode ? 'hover:text-vs-purple cursor-pointer' : 'cursor-default'} ${inf.rate > 0 ? 'text-vs-lime' : 'text-vs-text-3'}`}
        title={editMode ? 'Click to edit rate' : undefined}>
        {inf.rate > 0 ? `₦${inf.rate.toLocaleString()}` : editMode ? '+ Set rate' : '—'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input type="number" value={val} onChange={(e) => setVal(e.target.value)} min="0" step="any"
        className="w-20 px-2 py-0.5 bg-vs-elevated border border-vs-border rounded text-xs text-vs-text focus:outline-none focus:ring-1 focus:ring-vs-purple"
        autoFocus />
      <button onClick={save} disabled={saving} className="text-xs text-vs-success hover:text-vs-success/80 disabled:opacity-40">✓</button>
      <button onClick={cancel} className="text-xs text-vs-text-3 hover:text-vs-text">✕</button>
      {err && <span className="text-vs-danger text-xs">{err}</span>}
    </div>
  );
}

export default function InfluencerDashboard({ embedded = false }) {
  const { editMode } = useAuth();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [sortKey, setSortKey]   = useState('referred');
  const [sortDir, setSortDir]   = useState('desc');
  const [profileUser, setProfileUser] = useState(null);
  const [showEarnings, setShowEarnings] = useState(false);
  const [localRates, setLocalRates] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    Promise.all([
      api.get('/influencer-dashboard', { params }),
      api.get('/influencer-dashboard/settings'),
    ])
      .then(([dataRes, settingsRes]) => {
        setData(dataRes.data);
        setShowEarnings(settingsRes.data.showEarnings);
      })
      .catch(() => setError('Failed to load influencer data'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedInfluencers = data
    ? [...data.influencers].sort((a, b) => {
        const av = a[sortKey] ?? (sortKey === 'lastReferralAt' ? '' : 0);
        const bv = b[sortKey] ?? (sortKey === 'lastReferralAt' ? '' : 0);
        if (sortKey === 'lastReferralAt') {
          return sortDir === 'desc'
            ? new Date(bv || 0) - new Date(av || 0)
            : new Date(av || 0) - new Date(bv || 0);
        }
        return sortDir === 'desc' ? bv - av : av - bv;
      })
    : [];

  const thCls = (key) =>
    `px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors ${
      sortKey === key ? 'text-vs-purple' : 'text-vs-text-3 hover:text-vs-text-2'
    }`;

  const sortArrow = (key) => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-vs-card rounded-xl border border-vs-border p-5 h-24 animate-pulse" />
          ))}
        </div>
        <div className="bg-vs-card rounded-xl border border-vs-border p-5 h-40 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">
        {error || 'No data'}
      </div>
    );
  }

  const { summary, influencers } = data;
  const base = summary.totalReferred || 1;
  const fundedPct   = Math.round((summary.totalFunded / base) * 100);
  const betPct      = Math.round((summary.totalBet    / base) * 100);

  const maxReferred = Math.max(...influencers.map((x) => x.referred), 1);

  const handleRateSaved = (code, rate) => {
    setLocalRates((prev) => ({ ...prev, [code.toUpperCase()]: rate }));
  };

  return (
    <div>
      <PortalSettingsPanel onSettingsChange={(patch) => {
        if (patch.showEarnings !== undefined) setShowEarnings(patch.showEarnings);
      }} />
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-vs-text">Influencer Dashboard</h1>
            <p className="text-sm text-vs-text-3 mt-1">Referral campaign — sign-up → fund → bet conversion funnel</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-vs-text-3 whitespace-nowrap">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-vs-text-3 whitespace-nowrap">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1.5 rounded-lg border border-vs-border hover:bg-vs-elevated transition-colors">
              Clear
            </button>
          )}
          <button onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-vs-elevated border border-vs-border text-vs-text-3 hover:text-vs-text hover:bg-vs-hover transition-colors">
            Refresh
          </button>
        </div>
      </div>


      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Influencers" value={summary.totalInfluencers.toLocaleString()} accent="text-vs-text" />
        <StatCard label="Total Referred" value={summary.totalReferred.toLocaleString()} accent="text-vs-text-2" />
        <StatCard
          label="Funded (Step 2)"
          value={summary.totalFunded.toLocaleString()}
          sub={`${fundedPct}% of referred`}
          accent="text-vs-lime"
        />
        <StatCard
          label="Placed Bet (Step 3)"
          value={summary.totalBet.toLocaleString()}
          sub={`${betPct}% of referred`}
          accent="text-vs-purple"
        />
      </div>

      {/* Conversion funnel */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <SectionTitle>Conversion Funnel</SectionTitle>
        {summary.totalReferred === 0 ? (
          <p className="text-vs-text-3 text-sm text-center py-4">No referrals in this period.</p>
        ) : (
          <div className="space-y-3">
            <FunnelBar label="Signed Up"   count={summary.totalReferred} pct={100}      accent="bg-vs-elevated" subLabel="referred users" />
            <FunnelBar label="Funded Wallet" count={summary.totalFunded} pct={fundedPct} accent="bg-vs-lime"     subLabel="of referred" />
            <FunnelBar label="Placed a Bet"  count={summary.totalBet}    pct={betPct}    accent="bg-vs-purple"   subLabel="of referred" />
          </div>
        )}
        {summary.totalFunded > 0 && (
          <p className="text-xs text-vs-text-3 mt-4 pt-4 border-t border-vs-border">
            Fund → Bet conversion: <strong className="text-vs-text">{Math.round((summary.totalBet / summary.totalFunded) * 100)}%</strong> of funded referrals have placed a bet
          </p>
        )}
      </div>

      {/* Per-influencer table */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5">
        <SectionTitle>Influencer Breakdown ({influencers.length})</SectionTitle>
        {influencers.length === 0 ? (
          <p className="text-vs-text-3 text-sm text-center py-8">No referrals found for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 w-8">#</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Influencer</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Referral Code</th>
                  <th onClick={() => handleSort('referred')} className={thCls('referred')}>
                    Referred{sortArrow('referred')}
                  </th>
                  <th onClick={() => handleSort('funded')} className={thCls('funded')}>
                    Funded{sortArrow('funded')}
                  </th>
                  <th onClick={() => handleSort('bet')} className={thCls('bet')}>
                    Placed Bet{sortArrow('bet')}
                  </th>
                  <th onClick={() => handleSort('conversionRate')} className={thCls('conversionRate')}>
                    Conv. Rate{sortArrow('conversionRate')}
                  </th>
                  <th onClick={() => handleSort('lastReferralAt')} className={`${thCls('lastReferralAt')} hidden lg:table-cell`}>
                    Last Referral{sortArrow('lastReferralAt')}
                  </th>
                  {showEarnings && (
                    <th onClick={() => handleSort('earnings')} className={thCls('earnings')}>
                      Earnings{sortArrow('earnings')}
                    </th>
                  )}
                  {showEarnings && <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 text-right">Rate</th>}
                  <th className="px-4 py-2 hidden xl:table-cell w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-border">
                {sortedInfluencers.map((inf, i) => {
                  const fundedPctRow = inf.referred > 0 ? Math.round((inf.funded / inf.referred) * 100) : 0;
                  const betPctRow    = inf.referred > 0 ? Math.round((inf.bet    / inf.referred) * 100) : 0;
                  return (
                    <tr key={inf.referrerId} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-4 py-2.5 text-vs-text-3 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setProfileUser({ id: inf.referrerId, displayName: inf.username })}
                          className="text-vs-purple hover:text-vs-purple-light font-medium text-xs font-mono hover:underline transition-colors"
                        >
                          {inf.username}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {inf.referralCode
                          ? <span className="text-xs font-mono bg-vs-elevated px-2 py-0.5 rounded text-vs-text-2">{inf.referralCode}</span>
                          : <span className="text-vs-text-3 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-vs-text">{inf.referred}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-semibold text-vs-lime">{inf.funded}</span>
                        <span className="text-vs-text-3 text-xs ml-1">({fundedPctRow}%)</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-semibold text-vs-purple">{inf.bet}</span>
                        <span className="text-vs-text-3 text-xs ml-1">({betPctRow}%)</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          inf.conversionRate >= 50 ? 'bg-vs-success/20 text-vs-success'
                            : inf.conversionRate >= 20 ? 'bg-vs-lime/20 text-vs-lime'
                            : inf.conversionRate > 0 ? 'bg-vs-warning/20 text-vs-warning'
                            : 'bg-vs-elevated text-vs-text-3'
                        }`}>
                          {fmtPct(inf.conversionRate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-vs-text-3 text-xs hidden lg:table-cell">{relTime(inf.lastReferralAt)}</td>
                      {showEarnings && (() => {
                        const effectiveRate = localRates[(inf.referralCode || '').toUpperCase()] ?? inf.rate ?? 0;
                        const earnings = effectiveRate * inf.bet;
                        return (
                          <td className="px-4 py-2.5 text-right text-xs font-mono text-vs-lime">
                            {earnings > 0 ? `₦${earnings.toLocaleString()}` : '—'}
                          </td>
                        );
                      })()}
                      {showEarnings && (
                        <td className="px-4 py-2.5 text-right">
                          <RateCell
                            inf={{ ...inf, rate: localRates[(inf.referralCode || '').toUpperCase()] ?? inf.rate ?? 0 }}
                            editMode={editMode}
                            onSaved={handleRateSaved}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2.5 hidden xl:table-cell">
                        <MiniBar value={inf.referred} max={maxReferred} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-vs-border bg-vs-elevated/30">
                  <td className="px-4 py-2 text-xs font-bold text-vs-text-2 uppercase" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right font-bold text-vs-text">{summary.totalReferred.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-bold text-vs-lime">{summary.totalFunded.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-bold text-vs-purple">{summary.totalBet.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-xs font-semibold text-vs-text-3">
                      {summary.totalReferred > 0 ? fmtPct(Math.round((summary.totalBet / summary.totalReferred) * 100)) : '—'}
                    </span>
                  </td>
                  <td className="hidden lg:table-cell" />
                  {showEarnings && (() => {
                    const totalEarnings = sortedInfluencers.reduce((s, inf) => {
                      const r = localRates[(inf.referralCode || '').toUpperCase()] ?? inf.rate ?? 0;
                      return s + r * inf.bet;
                    }, 0);
                    return (
                      <td className="px-4 py-2 text-right font-bold text-vs-lime text-xs font-mono">
                        {totalEarnings > 0 ? `₦${totalEarnings.toLocaleString()}` : '—'}
                      </td>
                    );
                  })()}
                  {showEarnings && <td className="hidden" />}
                  <td className="hidden xl:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {profileUser && (
        <UserProfileModal
          userId={profileUser.id}
          displayName={profileUser.displayName}
          onClose={() => setProfileUser(null)}
        />
      )}
    </div>
  );
}
