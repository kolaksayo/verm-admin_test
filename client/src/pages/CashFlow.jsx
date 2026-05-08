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
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}
function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function SummaryCard({ title, value, sub, sub2, accent = 'text-vs-purple' }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">{title}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-vs-text-3 mt-1">{sub}</p>}
      {sub2 && <p className="text-xs text-vs-text-3/70 mt-0.5 italic">{sub2}</p>}
    </div>
  );
}

function MiniBar({ value, max, accent = 'bg-vs-purple' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-vs-elevated rounded-full h-1.5">
      <div className={`${accent} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function CashFlow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    api.get('/cashflow/summary')
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load cash flow data'))
      .finally(() => setLoading(false));
  }, []);

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
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

  const { summary, monthly, typeBreakdown, distinctTypes } = data;

  // ── Build unified monthly timeline ──────────────────────────────────────────
  const allKeys = new Set([
    ...monthly.betFees.map((m) => monthKey(m.year, m.month)),
    ...monthly.deposits.map((m) => monthKey(m.year, m.month)),
    ...monthly.withdrawals.map((m) => monthKey(m.year, m.month)),
  ]);
  const sortedKeys = [...allKeys].sort();

  const betByMonth = Object.fromEntries(monthly.betFees.map((m) => [monthKey(m.year, m.month), m]));
  const depByMonth = Object.fromEntries(monthly.deposits.map((m) => [monthKey(m.year, m.month), m]));
  const withByMonth = Object.fromEntries(monthly.withdrawals.map((m) => [monthKey(m.year, m.month), m]));

  const timeline = sortedKeys.map((key) => {
    const [y, m] = key.split('-').map(Number);
    return {
      label: monthLabel(y, m),
      betFees: betByMonth[key]?.fees ?? 0,
      betCount: betByMonth[key]?.count ?? 0,
      depFeeNGN: depByMonth[key]?.feeNGN ?? 0,
      depCount: depByMonth[key]?.count ?? 0,
      depTotalUSD: depByMonth[key]?.totalUSD ?? 0,
      depAvgRate: depByMonth[key]?.avgRateCharged ?? null,
      witFeeNGN: withByMonth[key]?.feeNGN ?? 0,
      witCount: withByMonth[key]?.count ?? 0,
      witTotalUSD: withByMonth[key]?.totalUSD ?? 0,
      witAvgRate: withByMonth[key]?.avgRateCharged ?? null,
    };
  });

  const maxBet = Math.max(...timeline.map((t) => t.betFees), 0.01);
  const maxDep = Math.max(...timeline.map((t) => t.depFeeNGN), 1);
  const maxWit = Math.max(...timeline.map((t) => t.witFeeNGN), 1);
  const maxTxCount = Math.max(...typeBreakdown.map((t) => t.count), 1);

  const noSafehaven = summary.depositFees.txCount === 0 && summary.withdrawalFees.txCount === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Cash Flow</h1>
        <p className="text-sm text-vs-text-3 mt-1">Platform revenue across all streams</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Bet Fee Revenue"
          value={fmtUSD(summary.betFees.totalUSD)}
          sub={`${summary.betFees.betCount.toLocaleString()} bets`}
          sub2="20% cut (totalFeesDeducted) per bet"
          accent="text-vs-purple"
        />
        <SummaryCard
          title="Deposit Fees"
          value={fmtNGN(summary.depositFees.feeNGN)}
          sub={`${summary.depositFees.txCount.toLocaleString()} top-ups · ${fmtUSD(summary.depositFees.totalUSD)} credited`}
          sub2={summary.depositFees.avgRateCharged
            ? `Avg rate charged: ${fmtRate(summary.depositFees.avgRateCharged)}/USD`
            : 'No top-ups detected yet'}
          accent="text-vs-lime"
        />
        <SummaryCard
          title="Withdrawal Fees"
          value={fmtNGN(summary.withdrawalFees.feeNGN)}
          sub={`${summary.withdrawalFees.txCount.toLocaleString()} withdrawals · ${fmtUSD(summary.withdrawalFees.totalUSD)} withdrawn`}
          sub2={summary.withdrawalFees.avgRateCharged
            ? `Avg rate paid: ${fmtRate(summary.withdrawalFees.avgRateCharged)}/USD`
            : 'No withdrawals detected yet'}
          accent="text-vs-warning"
        />
        <SummaryCard
          title="Tx Type Coverage"
          value={distinctTypes.length}
          sub="distinct transaction types"
          sub2="See Transaction Types tab to verify"
          accent="text-vs-text"
        />
      </div>

      {/* Rate insight box — shown when we have deposit data */}
      {summary.depositFees.avgRateCharged && (
        <div className="bg-vs-elevated/50 border border-vs-border rounded-xl p-4 mb-5 text-xs text-vs-text-3 flex flex-wrap gap-6">
          <div>
            <span className="text-vs-text-2 font-semibold">Avg platform rate (deposits)</span>
            <span className="ml-2 text-vs-lime font-bold text-sm">{fmtRate(summary.depositFees.avgRateCharged)}/USD</span>
          </div>
          <div>
            <span className="text-vs-text-2 font-semibold">Est. market rate</span>
            <span className="ml-2 font-bold text-sm">{fmtRate((summary.depositFees.avgRateCharged || 0) - 100)}/USD</span>
          </div>
          {summary.withdrawalFees.avgRateCharged && (
            <>
              <div>
                <span className="text-vs-text-2 font-semibold">Avg rate paid (withdrawals)</span>
                <span className="ml-2 text-vs-warning font-bold text-sm">{fmtRate(summary.withdrawalFees.avgRateCharged)}/USD</span>
              </div>
              <div>
                <span className="text-vs-text-2 font-semibold">Est. market rate</span>
                <span className="ml-2 font-bold text-sm">{fmtRate((summary.withdrawalFees.avgRateCharged || 0) + 200)}/USD</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'overview', label: 'Monthly Overview' },
          { key: 'types', label: 'Transaction Types' },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={pillCls(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {timeline.length === 0 ? (
            <div className="bg-vs-card border border-vs-border rounded-xl p-8 text-center text-vs-text-3 text-sm">
              No monthly data available yet.
            </div>
          ) : (
            <div className="bg-vs-card border border-vs-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-vs-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Month</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-purple">Bet Fees</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Bets</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-lime">Dep. Fees (₦)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Avg Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-warning">With. Fees (₦)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden lg:table-cell">Avg Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {timeline.map((row) => (
                    <tr key={row.label} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-vs-text whitespace-nowrap">{row.label}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-vs-purple font-semibold">{fmtUSD(row.betFees)}</span>
                          <MiniBar value={row.betFees} max={maxBet} accent="bg-vs-purple" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-vs-text-3 hidden lg:table-cell">{row.betCount}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-vs-lime font-semibold">{fmtNGN(row.depFeeNGN)}</span>
                          <MiniBar value={row.depFeeNGN} max={maxDep} accent="bg-vs-lime" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-vs-text-3 text-xs hidden lg:table-cell">
                        {row.depAvgRate ? fmtRate(row.depAvgRate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-vs-warning font-semibold">{fmtNGN(row.witFeeNGN)}</span>
                          <MiniBar value={row.witFeeNGN} max={maxWit} accent="bg-vs-warning" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-vs-text-3 text-xs hidden lg:table-cell">
                        {row.witAvgRate ? fmtRate(row.witAvgRate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-vs-border bg-vs-elevated/30">
                    <td className="px-4 py-3 font-bold text-vs-text-2 text-xs uppercase tracking-wider">Totals</td>
                    <td className="px-4 py-3 text-right font-bold text-vs-purple">{fmtUSD(timeline.reduce((s, r) => s + r.betFees, 0))}</td>
                    <td className="px-4 py-3 text-right text-vs-text-3 hidden lg:table-cell">{timeline.reduce((s, r) => s + r.betCount, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-vs-lime">{fmtNGN(timeline.reduce((s, r) => s + r.depFeeNGN, 0))}</td>
                    <td className="px-4 py-3 hidden lg:table-cell" />
                    <td className="px-4 py-3 text-right font-bold text-vs-warning">{fmtNGN(timeline.reduce((s, r) => s + r.witFeeNGN, 0))}</td>
                    <td className="px-4 py-3 hidden lg:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Warning when Safehaven transactions not found */}
          {noSafehaven && (
            <div className="mt-4 bg-vs-warning/10 border border-vs-warning/30 rounded-xl p-4">
              <p className="text-xs font-semibold text-vs-warning mb-1">Deposit / withdrawal transactions not matched</p>
              <p className="text-xs text-vs-text-3">
                The filter looks for <code className="bg-vs-elevated px-1 rounded">type: CREDIT, description: TOP UP</code> with gateway data.
                Check the Transaction Types tab to see actual type/description combinations and share if the pattern needs adjusting.
              </p>
            </div>
          )}
        </>
      )}

      {tab === 'types' && (
        <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-vs-border">
            <p className="text-xs text-vs-text-3">
              All type + description combinations in the{' '}
              <code className="bg-vs-elevated px-1 rounded text-vs-text-2">transactions</code> collection.
              Deposit top-ups should show <code className="bg-vs-elevated px-1 rounded">CREDIT / TOP UP</code>.
            </p>
          </div>
          {typeBreakdown.length === 0 ? (
            <p className="text-center text-vs-text-3 text-sm p-8">No transactions found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Count</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Total Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-vs-text-3 w-36 hidden md:table-cell">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-border">
                {typeBreakdown.map((row, i) => {
                  const isDeposit = /^CREDIT$/i.test(row.type) && /^TOP\s*UP$/i.test(row.description);
                  const isWithdrawal = /^DEBIT$/i.test(row.type) && /withdraw/i.test(row.description);
                  return (
                    <tr key={i} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-vs-text-2 bg-vs-elevated px-2 py-0.5 rounded">{row.type || '—'}</span>
                        {isDeposit && <span className="ml-2 text-xs text-vs-lime font-semibold">deposit fee</span>}
                        {isWithdrawal && <span className="ml-2 text-xs text-vs-warning font-semibold">withdrawal fee</span>}
                      </td>
                      <td className="px-4 py-3 text-vs-text-3 text-xs">{row.description || '—'}</td>
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
          )}
        </div>
      )}
    </div>
  );
}
