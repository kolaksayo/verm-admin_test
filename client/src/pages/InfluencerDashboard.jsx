import { useEffect, useState, useCallback } from 'react';
import api from '../api';
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

const SORT_KEYS = ['referred', 'funded', 'bet', 'conversionRate', 'lastReferralAt'];

export default function InfluencerDashboard() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [sortKey, setSortKey]   = useState('referred');
  const [sortDir, setSortDir]   = useState('desc');
  const [profileUser, setProfileUser] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    api.get('/influencer-dashboard', { params })
      .then((res) => setData(res.data))
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
        <h1 className="text-2xl font-bold text-vs-text mb-6">Influencer Dashboard</h1>
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
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">Influencer Dashboard</h1>
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">{error || 'No data'}</div>
      </div>
    );
  }

  const { summary, influencers } = data;
  const base = summary.totalReferred || 1;
  const fundedPct   = Math.round((summary.totalFunded / base) * 100);
  const betPct      = Math.round((summary.totalBet    / base) * 100);

  const maxReferred = Math.max(...influencers.map((x) => x.referred), 1);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vs-text">Influencer Dashboard</h1>
          <p className="text-sm text-vs-text-3 mt-1">Referral campaign — sign-up → fund → bet conversion funnel</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
