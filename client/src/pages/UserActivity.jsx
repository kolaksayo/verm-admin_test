import { useEffect, useState } from 'react';
import api from '../api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

function MiniBar({ value, max, accent = 'bg-vs-purple' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-vs-elevated rounded-full h-1.5">
      <div className={`${accent} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wider text-vs-text-3 mb-3">{children}</h2>;
}

function SignupTable({ rows, labelFn }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  if (!rows.length) return <p className="text-vs-text-3 text-sm text-center py-6">No signups in this range.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-vs-border">
            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Period</th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">New Users</th>
            <th className="px-4 py-2 text-left hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-vs-border">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-vs-elevated/50 transition-colors">
              <td className="px-4 py-2 font-medium text-vs-text whitespace-nowrap">{labelFn(r)}</td>
              <td className="px-4 py-2 text-right font-semibold text-vs-purple">{r.count}</td>
              <td className="px-4 py-2 w-40 hidden md:table-cell"><MiniBar value={r.count} max={max} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-vs-border bg-vs-elevated/30">
            <td className="px-4 py-2 text-xs font-bold text-vs-text-2 uppercase">Total</td>
            <td className="px-4 py-2 text-right font-bold text-vs-purple">{rows.reduce((s, r) => s + r.count, 0)}</td>
            <td className="hidden md:table-cell" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function UserActivity() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signupPeriod, setSignupPeriod] = useState('monthly');
  const [dateFrom, setDateFrom] = useState('2026-03-01');
  const [dateTo, setDateTo] = useState('');

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
    `px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
      active ? 'bg-vs-purple text-white' : 'bg-vs-elevated text-vs-text-3 border border-vs-border hover:bg-vs-hover hover:text-vs-text'
    }`;

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">User Activity</h1>
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-vs-card rounded-xl border border-vs-border p-5 h-40 animate-pulse" />
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

  const { signups, topDepositors, topBettors, recentWithdrawals, referrals } = data;

  const maxDepCount = Math.max(...topDepositors.map((d) => d.totalNGN), 1);
  const maxBetCount = Math.max(...topBettors.map((b) => b.betCount), 1);

  const signupRows = signupPeriod === 'daily'
    ? signups.daily
    : signupPeriod === 'weekly'
      ? signups.weekly
      : signups.monthly;

  const signupLabelFn = signupPeriod === 'daily'
    ? (r) => dayLabel(r.year, r.month, r.day)
    : signupPeriod === 'weekly'
      ? (r) => weekLabel(r.year, r.week)
      : (r) => monthLabel(r.year, r.month);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vs-text">User Activity</h1>
          <p className="text-sm text-vs-text-3 mt-1">Date-filtered signups, deposits, bets, and withdrawals</p>
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
          {(dateFrom !== '2026-03-01' || dateTo) && (
            <button onClick={() => { setDateFrom('2026-03-01'); setDateTo(''); }}
              className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1.5 rounded-lg border border-vs-border hover:bg-vs-elevated transition-colors">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Signup trend */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>New User Signups</SectionTitle>
          <div className="flex gap-1.5">
            {['daily','weekly','monthly'].map((p) => (
              <button key={p} onClick={() => setSignupPeriod(p)} className={pillCls(signupPeriod === p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <SignupTable rows={signupRows} labelFn={signupLabelFn} />
      </div>

      {/* Top depositors */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <SectionTitle>Top 10 Depositors in Period</SectionTitle>
        {topDepositors.length === 0 ? (
          <p className="text-vs-text-3 text-sm text-center py-4">No deposits in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vs-border">
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 w-8">#</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-lime">Total NGN</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">USD Credited</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Deposits</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Last Deposit</th>
                <th className="px-4 py-2 hidden lg:table-cell w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-vs-border">
              {topDepositors.map((d, i) => (
                <tr key={d.userId} className="hover:bg-vs-elevated/50 transition-colors">
                  <td className="px-4 py-2.5 text-vs-text-3 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-vs-text font-medium text-xs font-mono">{d.username}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-vs-lime">{fmtNGN(d.totalNGN)}</td>
                  <td className="px-4 py-2.5 text-right text-vs-text-3 hidden md:table-cell">{fmtUSD(d.totalUSD)}</td>
                  <td className="px-4 py-2.5 text-right text-vs-text-3 hidden md:table-cell">{d.txCount}</td>
                  <td className="px-4 py-2.5 text-right text-vs-text-3 text-xs hidden lg:table-cell">{relTime(d.lastDeposit)}</td>
                  <td className="px-4 py-2.5 hidden lg:table-cell"><MiniBar value={d.totalNGN} max={maxDepCount} accent="bg-vs-lime" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        {/* Top bettors */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <SectionTitle>Top 10 Most Active Bettors</SectionTitle>
          {topBettors.length === 0 ? (
            <p className="text-vs-text-3 text-sm text-center py-4">No betting data in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border">
                  <th className="text-left px-2 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 w-8">#</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-purple">Bets</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Total Pts</th>
                  <th className="px-2 py-2 hidden md:table-cell w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-border">
                {topBettors.map((b, i) => (
                  <tr key={b.userId} className="hover:bg-vs-elevated/50 transition-colors">
                    <td className="px-2 py-2.5 text-vs-text-3 text-xs">{i + 1}</td>
                    <td className="px-2 py-2.5 text-xs font-mono font-medium text-vs-text">{b.username}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-vs-purple">{b.betCount}</td>
                    <td className="px-2 py-2.5 text-right text-vs-text-3">{b.totalScore.toLocaleString()}</td>
                    <td className="px-2 py-2.5 hidden md:table-cell"><MiniBar value={b.betCount} max={maxBetCount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent withdrawals */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <SectionTitle>Recent Withdrawals in Period</SectionTitle>
          {recentWithdrawals.length === 0 ? (
            <p className="text-vs-text-3 text-sm text-center py-4">No withdrawals in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vs-border">
                    <th className="text-left px-2 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-warning">USD</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">NGN Paid</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {recentWithdrawals.map((w, i) => {
                    const isPending = /pending|processing/i.test(w.status || '');
                    return (
                      <tr key={i} className="hover:bg-vs-elevated/50 transition-colors">
                        <td className="px-2 py-2.5 text-xs font-mono text-vs-text">{w.username}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-vs-warning">{fmtUSD(w.amountUSD)}</td>
                        <td className="px-2 py-2.5 text-right text-vs-text-3 hidden md:table-cell">{w.ngnPaid ? fmtNGN(w.ngnPaid) : '—'}</td>
                        <td className="px-2 py-2.5 text-right">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                            isPending ? 'bg-vs-warning/20 text-vs-warning' : 'bg-vs-elevated text-vs-text-3'
                          }`}>{w.status || '—'}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-vs-text-3 text-xs hidden lg:table-cell">{relTime(w.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Referral conversions */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <SectionTitle>Referral Conversions in Period</SectionTitle>
        <div className="flex flex-wrap gap-8 items-center">
          <div>
            <p className="text-4xl font-bold text-vs-purple">{referrals.conversionRate}%</p>
            <p className="text-xs text-vs-text-3 mt-1">conversion rate</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <span className="text-vs-text-3 w-36">Referrals in period</span>
              <span className="font-semibold text-vs-text">{referrals.total.toLocaleString()}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-vs-text-3 w-36">Converted (deposited)</span>
              <span className="font-semibold text-vs-lime">{referrals.converted.toLocaleString()}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-vs-text-3 w-36">Not converted</span>
              <span className="font-semibold text-vs-warning">{(referrals.total - referrals.converted).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
