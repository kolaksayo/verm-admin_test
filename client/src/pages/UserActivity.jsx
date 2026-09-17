import { useEffect, useRef, useState } from 'react';
import api from '../api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNGN(n) {
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
function monthLabel(y, m) { return `${MONTHS[m - 1]} ${y}`; }
function weekLabel(y, w)  { return `W${String(w).padStart(2,'0')} ${y}`; }
function dayLabel(y, m, d){ return `${String(d).padStart(2,'0')} ${MONTHS[m-1]}`; }

// ── Icons ─────────────────────────────────────────────────────────────────────

const Ic = {
  users:   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-2a3 3 0 10-2.5-1.34" /></svg>,
  deposit: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" /></svg>,
  target:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth={1.8}/><circle cx="12" cy="12" r="4" strokeWidth={1.8}/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>,
  wallet:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M3 6h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zm13 7h.01" /></svg>,
  chart:   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>,
  trophy:  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3"/></svg>,
  link:    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>,
  info:    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth={1.8}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8h.01M12 12v4"/></svg>,
  arrow:   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4M3 12h18"/></svg>,
};

// ── MiniBar ───────────────────────────────────────────────────────────────────

function MiniBar({ value, max, color = '#775CDF' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-vs-elevated rounded-full h-2">
      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ── RingChart ─────────────────────────────────────────────────────────────────

function RingChart({ pct, size = 96, stroke = 9 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#252B36" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke="#775CDF" strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={size * 0.2} fontWeight="700">
        {pct}%
      </text>
      <text x="50%" y="65%" textAnchor="middle" dominantBaseline="central"
        fill="#6F7684" fontSize={size * 0.1}>
        rate
      </text>
    </svg>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({ icon, iconBg, label, value, sub, onView, sectionId }) {
  const scrollTo = () => {
    if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 flex gap-4 items-start min-w-0">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: iconBg }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-3xl font-bold text-vs-text leading-none">{value}</p>
        {sub && (
          <button onClick={scrollTo} className="mt-2 flex items-center gap-1 text-xs text-vs-purple-light hover:text-vs-purple transition-colors">
            {sub} {Ic.arrow}
          </button>
        )}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, children, right }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="text-vs-text-3">{icon}</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-vs-text-3">{children}</h2>
      </div>
      {right}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = (status || '').toUpperCase();
  const cls =
    /PAID|SUCCESS/.test(s)       ? 'bg-vs-elevated text-vs-text-3' :
    /PENDING|PROCESSING/.test(s) ? 'bg-vs-warning/15 text-vs-warning' :
    /FAILED|REJECTED/.test(s)    ? 'bg-vs-danger/15 text-vs-danger' :
                                   'bg-vs-elevated text-vs-text-3';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border border-transparent ${cls}`}>{s || '—'}</span>;
}

// ── SignupTable ───────────────────────────────────────────────────────────────

function SignupTable({ rows, labelFn }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  if (!rows.length) return <p className="text-vs-text-3 text-sm text-center py-8">No signups in this range.</p>;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-vs-border">
            <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Period</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">New Users</th>
            <th className="px-4 py-2.5 text-left w-2/5 hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-vs-border">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-vs-elevated/50 transition-colors">
              <td className="px-4 py-2.5 font-medium text-vs-text whitespace-nowrap">{labelFn(r)}</td>
              <td className="px-4 py-2.5 text-right font-bold text-vs-purple">{r.count}</td>
              <td className="px-4 py-2.5 hidden md:table-cell">
                <MiniBar value={r.count} max={max} color="#775CDF" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-vs-border bg-vs-elevated/30">
            <td className="px-4 py-2.5 text-xs font-bold text-vs-text-2 uppercase">Total</td>
            <td className="px-4 py-2.5 text-right font-bold text-vs-purple">{total}</td>
            <td className="hidden md:table-cell" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UserActivity() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [signupPeriod, setSignupPeriod] = useState('monthly');
  const [dateFrom, setDateFrom]     = useState('2026-03-01');
  const [dateTo, setDateTo]         = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    api.get('/user-dashboard/activity', { params })
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load activity data'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const pillCls = (active) =>
    `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      active
        ? 'bg-vs-purple text-white'
        : 'bg-vs-elevated text-vs-text-3 border border-vs-border hover:bg-vs-hover hover:text-vs-text'
    }`;

  const inputCls = 'px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple';

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-vs-text">User Activity</h1>
            <p className="text-sm text-vs-text-3 mt-1">Date-filtered signups, deposits, bets, and withdrawals</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-vs-card rounded-xl border border-vs-border animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 bg-vs-card rounded-xl border border-vs-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">User Activity</h1>
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">{error || 'No data'}</div>
      </div>
    );
  }

  const { summary, signups, topDepositors, topBettors, recentWithdrawals, referrals } = data;

  const maxNGN  = Math.max(...topDepositors.map((d) => d.totalNGN), 1);
  const maxBets = Math.max(...topBettors.map((b) => b.betCount), 1);

  const signupRows = signupPeriod === 'daily'
    ? signups.daily
    : signupPeriod === 'weekly' ? signups.weekly : signups.monthly;

  const signupLabelFn =
    signupPeriod === 'daily'   ? (r) => dayLabel(r.year, r.month, r.day) :
    signupPeriod === 'weekly'  ? (r) => weekLabel(r.year, r.week) :
                                 (r) => monthLabel(r.year, r.month);

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vs-text">User Activity</h1>
          <p className="text-sm text-vs-text-3 mt-1">Date-filtered signups, deposits, bets, and withdrawals</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-vs-text-3 whitespace-nowrap">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-vs-text-3 whitespace-nowrap">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </div>
          {(dateFrom !== '2026-03-01' || dateTo) && (
            <button
              onClick={() => { setDateFrom('2026-03-01'); setDateTo(''); }}
              className="text-xs text-vs-text-3 hover:text-vs-text px-2.5 py-1.5 rounded-lg border border-vs-border hover:bg-vs-elevated transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <SummaryCard
          icon={Ic.users}  iconBg="#775CDF"
          label="New Users" value={(summary?.newUsers ?? 0).toLocaleString()}
          sub="View signups" sectionId="section-signups"
        />
        <SummaryCard
          icon={Ic.deposit} iconBg="#1CDB2F"
          label="Depositors" value={(summary?.depositorCount ?? 0).toLocaleString()}
          sub="View depositors" sectionId="section-depositors"
        />
        <SummaryCard
          icon={Ic.target} iconBg="#0891B2"
          label="Active Bettors" value={(summary?.activeBettorCount ?? 0).toLocaleString()}
          sub="View bettors" sectionId="section-bettors"
        />
        <SummaryCard
          icon={Ic.wallet} iconBg="#D97706"
          label="Withdrawals" value={(summary?.withdrawalCount ?? 0).toLocaleString()}
          sub="View withdrawals" sectionId="section-withdrawals"
        />
        <SummaryCard
          icon={Ic.chart} iconBg="#6D28D9"
          label="Conversion Rate"
          value={`${referrals.conversionRate}%`}
          sub={`${referrals.converted} converted / ${referrals.total} referrals`}
          sectionId="section-referrals"
        />
      </div>

      {/* ── Row 1: Signups | Depositors ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        <div id="section-signups" className="bg-vs-card border border-vs-border rounded-xl p-5">
          <SectionHeader
            icon={Ic.users}
            right={
              <div className="flex gap-1">
                {['daily','weekly','monthly'].map((p) => (
                  <button key={p} onClick={() => setSignupPeriod(p)} className={pillCls(signupPeriod === p)}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            }
          >
            New User Signups
          </SectionHeader>
          <SignupTable rows={signupRows} labelFn={signupLabelFn} />
        </div>

        <div id="section-depositors" className="bg-vs-card border border-vs-border rounded-xl p-5">
          <SectionHeader icon={Ic.trophy}>Top 10 Depositors in Period</SectionHeader>
          {topDepositors.length === 0 ? (
            <p className="text-vs-text-3 text-sm text-center py-8">No deposits in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vs-border">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3 w-6">#</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: '#B5DB1C' }}>Total NGN</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden xl:table-cell">USD</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden xl:table-cell">Deposits</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Last</th>
                    <th className="px-3 py-2.5 w-20 hidden lg:table-cell" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {topDepositors.map((d, i) => (
                    <tr key={d.userId} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-3 py-2.5 text-vs-text-3 text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-vs-text text-xs font-mono">{d.username}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-xs" style={{ color: '#B5DB1C' }}>{fmtNGN(d.totalNGN)}</td>
                      <td className="px-3 py-2.5 text-right text-vs-text-3 text-xs hidden xl:table-cell">{fmtUSD(d.totalUSD)}</td>
                      <td className="px-3 py-2.5 text-right text-vs-text-3 text-xs hidden xl:table-cell">{d.txCount}</td>
                      <td className="px-3 py-2.5 text-right text-vs-text-3 text-xs hidden lg:table-cell whitespace-nowrap">{relTime(d.lastDeposit)}</td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <MiniBar value={d.totalNGN} max={maxNGN} color="#B5DB1C" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Bettors | Withdrawals ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        <div id="section-bettors" className="bg-vs-card border border-vs-border rounded-xl p-5">
          <SectionHeader icon={Ic.target}>Top 10 Most Active Bettors</SectionHeader>
          {topBettors.length === 0 ? (
            <p className="text-vs-text-3 text-sm text-center py-8">No betting data in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vs-border">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3 w-6">#</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-purple">Bets</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Total Pts</th>
                    <th className="px-3 py-2.5 w-24 hidden md:table-cell" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {topBettors.map((b, i) => (
                    <tr key={b.userId} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-3 py-2.5 text-vs-text-3 text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5 text-xs font-mono font-medium text-vs-text">{b.username}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-vs-purple">{b.betCount}</td>
                      <td className="px-3 py-2.5 text-right text-vs-text-3 text-xs">{b.totalScore.toLocaleString()}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <MiniBar value={b.betCount} max={maxBets} color="#775CDF" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div id="section-withdrawals" className="bg-vs-card border border-vs-border rounded-xl p-5">
          <SectionHeader icon={Ic.wallet}>Recent Withdrawals in Period</SectionHeader>
          {recentWithdrawals.length === 0 ? (
            <p className="text-vs-text-3 text-sm text-center py-8">No withdrawals in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vs-border">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-warning">USD</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">NGN Paid</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {recentWithdrawals.map((w, i) => (
                    <tr key={i} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-3 py-2.5 text-xs font-mono text-vs-text">{w.username}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-vs-warning text-xs">{fmtUSD(w.amountUSD)}</td>
                      <td className="px-3 py-2.5 text-right text-vs-text-3 text-xs hidden md:table-cell">{w.ngnPaid ? fmtNGN(w.ngnPaid) : '—'}</td>
                      <td className="px-3 py-2.5 text-right"><StatusBadge status={w.status} /></td>
                      <td className="px-3 py-2.5 text-right text-vs-text-3 text-xs hidden lg:table-cell whitespace-nowrap">{relTime(w.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Referral conversions ─────────────────────────────────────────────── */}
      <div id="section-referrals" className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <SectionHeader icon={Ic.link}>Referral Conversions in Period</SectionHeader>

        <div className="flex flex-wrap items-center gap-8">
          {/* Ring chart */}
          <RingChart pct={referrals.conversionRate} size={100} stroke={10} />

          {/* Stats */}
          <div className="flex gap-8 flex-wrap">
            <div className="text-center">
              <p className="text-3xl font-bold text-vs-text">{referrals.total.toLocaleString()}</p>
              <p className="text-xs text-vs-text-3 mt-1">Total referrals</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-vs-warning">{(referrals.total - referrals.converted).toLocaleString()}</p>
              <p className="text-xs text-vs-text-3 mt-1">Not converted</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-vs-success">{referrals.converted.toLocaleString()}</p>
              <p className="text-xs text-vs-text-3 mt-1">Converted</p>
            </div>
          </div>

          {/* Explanation */}
          <div className="flex-1 min-w-[200px] text-xs text-vs-text-3 leading-relaxed border-l border-vs-border pl-6 hidden lg:block">
            <div className="flex items-start gap-1.5 mb-2">
              {Ic.info}
              <p>Referral conversion rate is the percentage of referrals that have converted into active users.</p>
            </div>
            <p className="italic text-vs-text-3/70">Converted referrals become active users through a qualifying action (e.g., deposit or bet).</p>
          </div>
        </div>
      </div>

    </div>
  );
}
