import { useEffect, useState } from 'react';
import api from '../api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNGN(n) {
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtRate(n) {
  if (n == null || isNaN(n) || n === 0) return '—';
  return '₦' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MiniBar({ value, max, accent = 'bg-vs-purple' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-vs-elevated rounded-full h-1.5">
      <div className={`${accent} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Label helpers ────────────────────────────────────────────────────────────

function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}
function weekLabel(year, week) {
  return `W${String(week).padStart(2, '0')} ${year}`;
}
function dayLabel(year, month, day) {
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
}
function monthKey(year, month) {
  return `${year}-M${String(month).padStart(2, '0')}`;
}
function weekKey(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}
function dayKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Build unified timeline for a given period ────────────────────────────────

function buildTimeline(period, data) {
  const { deposits, withdrawals, betFees } = data[period];

  let keyFn, labelFn;
  if (period === 'monthly') {
    keyFn   = (m) => monthKey(m.year, m.month);
    labelFn = (m) => monthLabel(m.year, m.month);
  } else if (period === 'weekly') {
    keyFn   = (m) => weekKey(m.year, m.week);
    labelFn = (m) => weekLabel(m.year, m.week);
  } else {
    keyFn   = (m) => dayKey(m.year, m.month, m.day);
    labelFn = (m) => dayLabel(m.year, m.month, m.day);
  }

  const allKeys = new Set([
    ...deposits.map(keyFn),
    ...withdrawals.map(keyFn),
    ...betFees.map(keyFn),
  ]);
  const sortedKeys = [...allKeys].sort();

  const depMap = Object.fromEntries(deposits.map((m) => [keyFn(m), m]));
  const witMap = Object.fromEntries(withdrawals.map((m) => [keyFn(m), m]));
  const betMap = Object.fromEntries(betFees.map((m) => [keyFn(m), m]));

  return sortedKeys.map((key) => ({
    label:       labelFn(depMap[key] || witMap[key] || betMap[key] || {}),
    depFeeNGN:   depMap[key]?.feeNGN ?? 0,
    depCount:    depMap[key]?.count ?? 0,
    depAvgRate:  depMap[key]?.avgRateCharged ?? null,
    witFeeNGN:   witMap[key]?.feeNGN ?? 0,
    witCount:    witMap[key]?.count ?? 0,
    witAvgRate:  witMap[key]?.avgRatePaid ?? null,
    betFeeUSD:   betMap[key]?.fees ?? 0,
    betCount:    betMap[key]?.count ?? 0,
  }));
}

// ── Timeline table ────────────────────────────────────────────────────────────

function TimelineTable({ rows, periodLabel }) {
  const maxDep = Math.max(...rows.map((r) => r.depFeeNGN), 1);
  const maxWit = Math.max(...rows.map((r) => r.witFeeNGN), 1);
  const maxBet = Math.max(...rows.map((r) => r.betFeeUSD), 0.01);

  if (rows.length === 0) {
    return (
      <div className="bg-vs-card border border-vs-border rounded-xl p-8 text-center text-vs-text-3 text-sm">
        No {periodLabel.toLowerCase()} data in the selected range.
      </div>
    );
  }

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="border-b border-vs-border">
            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">{periodLabel}</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-lime">Dep. Fees (₦)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Top-ups</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Avg Rate</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-warning">With. Fees (₦)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Withdrawals</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Avg Rate Paid</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-purple">Bet Fees ($)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-vs-border">
          {rows.map((row) => (
            <tr key={row.label} className="hover:bg-vs-elevated/50 transition-colors">
              <td className="px-4 py-3 font-medium text-vs-text whitespace-nowrap">{row.label}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span className="text-vs-lime font-semibold">{fmtNGN(row.depFeeNGN)}</span>
                  <MiniBar value={row.depFeeNGN} max={maxDep} accent="bg-vs-lime" />
                </div>
              </td>
              <td className="px-4 py-3 text-right text-vs-text-3 hidden lg:table-cell">{row.depCount}</td>
              <td className="px-4 py-3 text-right text-vs-text-3 text-xs hidden lg:table-cell">{fmtRate(row.depAvgRate)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span className="text-vs-warning font-semibold">{fmtNGN(row.witFeeNGN)}</span>
                  <MiniBar value={row.witFeeNGN} max={maxWit} accent="bg-vs-warning" />
                </div>
              </td>
              <td className="px-4 py-3 text-right text-vs-text-3 hidden lg:table-cell">{row.witCount}</td>
              <td className="px-4 py-3 text-right text-vs-text-3 text-xs hidden lg:table-cell">{fmtRate(row.witAvgRate)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span className="text-vs-purple font-semibold">{fmtUSD(row.betFeeUSD)}</span>
                  <MiniBar value={row.betFeeUSD} max={maxBet} accent="bg-vs-purple" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-vs-border bg-vs-elevated/30">
            <td className="px-4 py-3 font-bold text-vs-text-2 text-xs uppercase tracking-wider">Totals</td>
            <td className="px-4 py-3 text-right font-bold text-vs-lime">{fmtNGN(rows.reduce((s, r) => s + r.depFeeNGN, 0))}</td>
            <td className="px-4 py-3 text-right text-vs-text-3 hidden lg:table-cell">{rows.reduce((s, r) => s + r.depCount, 0)}</td>
            <td className="px-4 py-3 hidden lg:table-cell" />
            <td className="px-4 py-3 text-right font-bold text-vs-warning">{fmtNGN(rows.reduce((s, r) => s + r.witFeeNGN, 0))}</td>
            <td className="px-4 py-3 text-right text-vs-text-3 hidden lg:table-cell">{rows.reduce((s, r) => s + r.witCount, 0)}</td>
            <td className="px-4 py-3 hidden lg:table-cell" />
            <td className="px-4 py-3 text-right font-bold text-vs-purple">{fmtUSD(rows.reduce((s, r) => s + r.betFeeUSD, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CashFlow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('monthly');
  const [dateFrom, setDateFrom] = useState('2026-03-01');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = { dateFrom };
    if (dateTo) params.dateTo = dateTo;
    api.get('/cashflow/summary', { params })
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load cash flow data'))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const pillCls = (active) =>
    `px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
      active
        ? 'bg-vs-purple text-white'
        : 'bg-vs-elevated text-vs-text-3 border border-vs-border hover:bg-vs-hover hover:text-vs-text'
    }`;

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">Cash Flow</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-vs-card rounded-xl border border-vs-border p-5 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">Cash Flow</h1>
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">{error || 'No data'}</div>
      </div>
    );
  }

  const { summary, typeBreakdown, distinctTypes } = data;
  const bank = summary.bankBalance || {};
  const dep  = summary.depositFees;
  const wit  = summary.withdrawalFees;
  const bet  = summary.betFees;

  const maxTxCount = Math.max(...typeBreakdown.map((t) => t.count), 1);

  const PERIOD_TABS = [
    { key: 'daily',   label: 'Daily',   periodLabel: 'Day' },
    { key: 'weekly',  label: 'Weekly',  periodLabel: 'Week' },
    { key: 'monthly', label: 'Monthly', periodLabel: 'Month' },
    { key: 'types',   label: 'Transaction Types', periodLabel: '' },
  ];

  return (
    <div>
      {/* Header + date filters */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vs-text">Cash Flow</h1>
          <p className="text-sm text-vs-text-3 mt-1">Safehaven NGN top-up and withdrawal revenue</p>
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
          {dateTo && (
            <button onClick={() => setDateTo('')}
              className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1.5 rounded-lg border border-vs-border hover:bg-vs-elevated transition-colors">
              Clear end
            </button>
          )}
        </div>
      </div>

      {/* Bank balance banner */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">
          Estimated Safehaven NGN Balance
        </p>
        <p className={`text-4xl font-bold mb-4 ${(bank.estimatedBalanceNGN ?? 0) >= 0 ? 'text-vs-success' : 'text-vs-danger'}`}>
          {fmtNGN(bank.estimatedBalanceNGN)}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {[
            { label: 'Total NGN received',     value: fmtNGN(bank.totalDepositNGN),      color: 'text-vs-text' },
            { label: 'Bank charges on deposits', value: `−${fmtNGN(bank.bankFeesOnDeposits)}`, color: 'text-vs-danger' },
            { label: 'Net NGN deposited',       value: fmtNGN(bank.netDepositNGN),        color: 'text-vs-lime' },
            { label: 'Est. NGN paid out',       value: `−${fmtNGN(bank.estimatedWithdrawalNGN)}`, color: 'text-vs-warning' },
          ].map((item) => (
            <div key={item.label} className="bg-vs-elevated/60 rounded-lg px-3 py-2">
              <p className="text-vs-text-3 mb-0.5">{item.label}</p>
              <p className={`font-semibold text-sm ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">

        {/* Deposit fees */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Deposit Spread Fees</p>
          <p className="text-3xl font-bold text-vs-lime">{fmtNGN(dep.feeNGN)}</p>
          <p className="text-xs text-vs-text-3 mt-1">
            {dep.txCount.toLocaleString()} top-ups · {fmtUSD(dep.totalUSD)} credited
          </p>
          {dep.avgRateCharged ? (
            <div className="mt-3 flex gap-4 text-xs">
              <div><p className="text-vs-text-3">Platform rate</p><p className="font-semibold text-vs-lime">{fmtRate(dep.avgRateCharged)}/USD</p></div>
              <div><p className="text-vs-text-3">Est. market rate</p><p className="font-semibold text-vs-text">{fmtRate(dep.avgRateCharged - 100)}/USD</p></div>
              <div><p className="text-vs-text-3">Spread</p><p className="font-semibold text-vs-text">+₦100/USD</p></div>
            </div>
          ) : (
            <p className="text-xs text-vs-text-3 italic mt-2">No top-ups detected</p>
          )}
        </div>

        {/* Withdrawal fees */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Withdrawal Spread Fees</p>
          <p className="text-3xl font-bold text-vs-warning">{fmtNGN(wit.feeNGN)}</p>
          <p className="text-xs text-vs-text-3 mt-1">
            {wit.txCount.toLocaleString()} withdrawals · {fmtUSD(wit.totalUSD)} withdrawn
          </p>
          {wit.avgRatePaid ? (
            <div className="mt-3 flex gap-4 text-xs">
              <div><p className="text-vs-text-3">Rate paid to user</p><p className="font-semibold text-vs-warning">{fmtRate(wit.avgRatePaid)}/USD</p></div>
              <div><p className="text-vs-text-3">Est. market rate</p><p className="font-semibold text-vs-text">{fmtRate((wit.avgRatePaid ?? 0) + 200)}/USD</p></div>
              <div><p className="text-vs-text-3">Spread</p><p className="font-semibold text-vs-text">−₦200/USD</p></div>
            </div>
          ) : (
            <p className="text-xs text-vs-text-3 italic mt-2">
              {wit.txCount > 0 ? 'Fee = USD withdrawn × ₦200' : 'No withdrawals detected'}
            </p>
          )}
        </div>

        {/* Bet fees */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Bet Fees</p>
          <p className="text-3xl font-bold text-vs-purple">{fmtUSD(bet.totalUSD)}</p>
          <p className="text-xs text-vs-text-3 mt-1">
            {(bet.betCount ?? 0).toLocaleString()} bets · platform cut from stakes
          </p>
          <div className="mt-3 text-xs">
            <p className="text-vs-text-3">Source</p>
            <p className="font-semibold text-vs-text font-mono text-xs">totalFeesDeducted per bet</p>
          </div>
        </div>
      </div>

      {/* Withdrawal not detected warning */}
      {wit.txCount === 0 && (
        <div className="bg-vs-warning/10 border border-vs-warning/30 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-vs-warning mb-1">Withdrawal transactions not matched</p>
          <p className="text-xs text-vs-text-3">
            Looking for <code className="bg-vs-elevated px-1 rounded">type: DEBIT, description: SafeHaven Naira transfer</code>.
            Check Transaction Types tab to confirm.
          </p>
        </div>
      )}

      {/* Period tabs */}
      <div className="flex gap-2 mb-5">
        {PERIOD_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={pillCls(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily'   && <TimelineTable rows={buildTimeline('daily',   data)} periodLabel="Day" />}
      {tab === 'weekly'  && <TimelineTable rows={buildTimeline('weekly',  data)} periodLabel="Week" />}
      {tab === 'monthly' && <TimelineTable rows={buildTimeline('monthly', data)} periodLabel="Month" />}

      {tab === 'types' && (
        <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-vs-border">
            <p className="text-xs text-vs-text-3">
              All type + description combinations in the transactions collection.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vs-border">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Description</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Count</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Total Amount</th>
                <th className="px-4 py-3 text-left text-xs w-36 hidden md:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-vs-border">
              {typeBreakdown.map((row, i) => {
                const isDeposit    = /^CREDIT$/i.test(row.type) && /^TOP\s*UP$/i.test(row.description);
                const isWithdrawal = /^DEBIT$/i.test(row.type)  && /safehaven naira transfer/i.test(row.description);
                return (
                  <tr key={i} className="hover:bg-vs-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-vs-elevated px-2 py-0.5 rounded text-vs-text-2">{row.type || '—'}</span>
                      {isDeposit    && <span className="ml-2 text-xs text-vs-lime font-semibold">deposit</span>}
                      {isWithdrawal && <span className="ml-2 text-xs text-vs-warning font-semibold">withdrawal</span>}
                    </td>
                    <td className="px-4 py-3 text-vs-text-3 text-xs font-mono">{row.description || '—'}</td>
                    <td className="px-4 py-3 text-right text-vs-text font-medium">{row.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-vs-text-3">{fmtUSD(row.totalAmount)}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <MiniBar value={row.count} max={maxTxCount} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
