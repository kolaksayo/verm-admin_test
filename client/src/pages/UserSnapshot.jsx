import { useEffect, useState } from 'react';
import api from '../api';

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      <div className="w-32 text-xs text-vs-text-3 text-right shrink-0">{label}</div>
      <div className="flex-1 bg-vs-elevated rounded-full h-5 overflow-hidden">
        <div className={`h-5 rounded-full flex items-center px-2 transition-all ${accent}`} style={{ width: `${Math.max(pct, 1)}%` }}>
          <span className="text-xs font-bold text-white whitespace-nowrap">{pct}%</span>
        </div>
      </div>
      <div className="w-28 text-xs text-vs-text shrink-0">
        <span className="font-semibold">{count.toLocaleString()}</span>
        {subLabel && <span className="text-vs-text-3 ml-1">{subLabel}</span>}
      </div>
    </div>
  );
}

export default function UserSnapshot() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get('/user-dashboard/snapshot')
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load snapshot data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">User Snapshot</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-vs-card rounded-xl border border-vs-border p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">User Snapshot</h1>
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">{error || 'No data'}</div>
      </div>
    );
  }

  const { funnel, walletStats, balanceDistribution, idleDepositors, referrals, pendingWithdrawals } = data;
  const maxDistCount = Math.max(...balanceDistribution.map((b) => b.count), 1);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">User Snapshot</h1>
        <p className="text-sm text-vs-text-3 mt-1">All-time platform state — total users, wallets, and lifetime metrics</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users"        value={funnel.totalUsers.toLocaleString()}       accent="text-vs-text" />
        <StatCard label="Deposited Users"    value={funnel.depositedUsers.toLocaleString()}    sub={`${funnel.depositedPct}% of all users`}   accent="text-vs-lime" />
        <StatCard label="Betting Users"      value={funnel.bettingUsers.toLocaleString()}      sub={`${funnel.bettingPct}% of all users`}     accent="text-vs-purple" />
        <StatCard label="Avg Wallet Balance" value={fmtUSD(walletStats.avgBalance)}            sub={`${walletStats.totalWallets.toLocaleString()} wallets`} accent="text-vs-warning" />
      </div>

      {/* Activation funnel */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <SectionTitle>Activation Funnel</SectionTitle>
        <div className="space-y-3">
          <FunnelBar label="Registered"   count={funnel.totalUsers}     pct={100}                 accent="bg-vs-elevated" subLabel="users" />
          <FunnelBar label="Deposited"    count={funnel.depositedUsers} pct={funnel.depositedPct} accent="bg-vs-lime"     subLabel="of all users" />
          <FunnelBar label="Placed a Bet" count={funnel.bettingUsers}   pct={funnel.bettingPct}   accent="bg-vs-purple"   subLabel="of all users" />
        </div>
        <div className="mt-4 pt-4 border-t border-vs-border flex flex-wrap gap-6 text-xs text-vs-text-3">
          <span>Deposit → Bet conversion: <strong className="text-vs-text">{funnel.bettingOfDeposited}%</strong> of deposited users have placed a bet</span>
          <span>Idle depositors: <strong className="text-vs-warning">{idleDepositors.count.toLocaleString()}</strong> deposited but never bet ({idleDepositors.pct}%)</span>
        </div>
      </div>

      {/* Wallet stats */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <SectionTitle>Wallet Overview</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-5">
          <div>
            <p className="text-xs text-vs-text-3 mb-1">Total Wallets</p>
            <p className="text-xl font-bold text-vs-text">{walletStats.totalWallets.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-vs-text-3 mb-1">Total Balance</p>
            <p className="text-xl font-bold text-vs-lime">{fmtUSD(walletStats.totalBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-vs-text-3 mb-1">Average Balance</p>
            <p className="text-xl font-bold text-vs-warning">{fmtUSD(walletStats.avgBalance)}</p>
          </div>
        </div>
        <SectionTitle>Balance Distribution</SectionTitle>
        <div className="space-y-3">
          {balanceDistribution.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <div className="w-20 text-xs text-vs-text-3 shrink-0">{b.label}</div>
              <div className="flex-1">
                <MiniBar value={b.count} max={maxDistCount} accent="bg-vs-purple" />
              </div>
              <div className="w-20 text-right text-xs font-semibold text-vs-text">{b.count.toLocaleString()}</div>
              <div className="w-12 text-right text-xs text-vs-text-3">
                {walletStats.totalWallets > 0 ? Math.round((b.count / walletStats.totalWallets) * 100) : 0}%
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        {/* Referrals */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <SectionTitle>Referral Conversion (All Time)</SectionTitle>
          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <p className="text-4xl font-bold text-vs-purple">{referrals.conversionRate}%</p>
              <p className="text-xs text-vs-text-3 mt-1">conversion rate</p>
            </div>
            <div className="space-y-2 text-xs text-right">
              <div>
                <p className="text-vs-text-3">Total referrals</p>
                <p className="font-bold text-vs-text text-base">{referrals.total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-vs-text-3">Converted (deposited)</p>
                <p className="font-bold text-vs-lime text-base">{referrals.converted.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-vs-text-3">Not converted</p>
                <p className="font-bold text-vs-warning text-base">{(referrals.total - referrals.converted).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Idle + Pending */}
        <div className="space-y-4">
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <SectionTitle>Idle Depositors</SectionTitle>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <p className="text-3xl font-bold text-vs-warning">{idleDepositors.count.toLocaleString()}</p>
                <p className="text-xs text-vs-text-3 mt-1">deposited but never placed a bet</p>
              </div>
              <div className="text-right text-xs space-y-1">
                <p><span className="text-vs-text-3">Of deposited users</span> <span className="font-semibold text-vs-warning ml-2">{idleDepositors.pct}%</span></p>
                <p className="text-vs-text-3 italic">Funds sitting unused</p>
              </div>
            </div>
          </div>

          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <SectionTitle>Pending Withdrawals</SectionTitle>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <p className="text-3xl font-bold text-vs-danger">{pendingWithdrawals.count.toLocaleString()}</p>
                <p className="text-xs text-vs-text-3 mt-1">pending or processing</p>
              </div>
              <div className="text-right text-xs">
                <p className="text-vs-text-3">Total value</p>
                <p className="font-bold text-vs-danger text-base mt-0.5">{fmtUSD(pendingWithdrawals.totalUSD)}</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
