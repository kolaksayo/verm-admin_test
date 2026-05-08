import { useEffect, useState } from 'react';
import api from '../api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(n, decimals = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

function SummaryCard({ title, value, sub, color = 'vs-purple', note }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-2">{title}</p>
      <p className={`text-2xl font-bold text-${color}`}>{value}</p>
      {sub && <p className="text-xs text-vs-text-3 mt-1">{sub}</p>}
      {note && <p className="text-xs text-vs-text-3/70 mt-1 italic">{note}</p>}
    </div>
  );
}

function MiniBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-vs-elevated rounded-full h-1.5">
      <div className="bg-vs-purple h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
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
            <div key={i} className="bg-vs-card rounded-xl border border-vs-border p-5 h-24 animate-pulse" />
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

  const DEP_FEE = 100;
  const WITH_FEE = 200;

  const timeline = sortedKeys.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const bet = betByMonth[key];
    const dep = depByMonth[key];
    const wit = withByMonth[key];
    return {
      label: monthLabel(y, m),
      betFees: bet?.fees ?? 0,
      betCount: bet?.count ?? 0,
      depositFeeNGN: (dep?.count ?? 0) * DEP_FEE,
      depositCount: dep?.count ?? 0,
      withdrawalFeeNGN: (wit?.count ?? 0) * WITH_FEE,
      withdrawalCount: wit?.count ?? 0,
    };
  });

  const maxBetFee = Math.max(...timeline.map((t) => t.betFees), 0.01);
  const maxDepFee = Math.max(...timeline.map((t) => t.depositFeeNGN), 1);
  const maxWithFee = Math.max(...timeline.map((t) => t.withdrawalFeeNGN), 1);

  // ── Transaction type breakdown max ──────────────────────────────────────────
  const maxTxCount = Math.max(...typeBreakdown.map((t) => t.count), 1);

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
          value={`$${fmt(summary.betFees.totalUSD)}`}
          sub={`${summary.betFees.betCount.toLocaleString()} bets`}
          color="vs-purple"
          note="20% of stake deducted per bet"
        />
        <SummaryCard
          title="Deposit Fees"
          value={`₦${fmt(summary.depositFees.totalNGN, 0)}`}
          sub={`${summary.depositFees.txCount.toLocaleString()} Safehaven deposits`}
          color="vs-lime"
          note="₦100 flat fee per deposit"
        />
        <SummaryCard
          title="Withdrawal Fees"
          value={`₦${fmt(summary.withdrawalFees.totalNGN, 0)}`}
          sub={`${summary.withdrawalFees.txCount.toLocaleString()} Safehaven withdrawals`}
          color="vs-warning"
          note="₦200 rate spread per withdrawal"
        />
        <SummaryCard
          title="Distinct Tx Types"
          value={distinctTypes.length}
          sub="transaction categories found"
          color="vs-text"
        />
      </div>

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
              No monthly data available. Safehaven deposit/withdrawal transaction types may not match expected patterns.
            </div>
          ) : (
            <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vs-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Month</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">
                      <span className="text-vs-purple">Bet Fees (USD)</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Bets</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">
                      <span className="text-vs-lime">Dep. Fees (₦)</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Deposits</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">
                      <span className="text-vs-warning">With. Fees (₦)</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Withdrawals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {timeline.map((row) => (
                    <tr key={row.label} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-vs-text whitespace-nowrap">{row.label}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-vs-purple font-semibold">${fmt(row.betFees)}</span>
                          <MiniBar value={row.betFees} max={maxBetFee} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-vs-text-3 hidden md:table-cell">{row.betCount}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-vs-lime font-semibold">₦{fmt(row.depositFeeNGN, 0)}</span>
                          <MiniBar value={row.depositFeeNGN} max={maxDepFee} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-vs-text-3 hidden md:table-cell">{row.depositCount}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-vs-warning font-semibold">₦{fmt(row.withdrawalFeeNGN, 0)}</span>
                          <MiniBar value={row.withdrawalFeeNGN} max={maxWithFee} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-vs-text-3 hidden md:table-cell">{row.withdrawalCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-vs-border bg-vs-elevated/30">
                    <td className="px-4 py-3 font-bold text-vs-text-2 text-xs uppercase tracking-wider">Totals</td>
                    <td className="px-4 py-3 text-right font-bold text-vs-purple">
                      ${fmt(timeline.reduce((s, r) => s + r.betFees, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-vs-text-3 hidden md:table-cell">
                      {timeline.reduce((s, r) => s + r.betCount, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-vs-lime">
                      ₦{fmt(timeline.reduce((s, r) => s + r.depositFeeNGN, 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-vs-text-3 hidden md:table-cell">
                      {timeline.reduce((s, r) => s + r.depositCount, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-vs-warning">
                      ₦{fmt(timeline.reduce((s, r) => s + r.withdrawalFeeNGN, 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-vs-text-3 hidden md:table-cell">
                      {timeline.reduce((s, r) => s + r.withdrawalCount, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Note about deposit/withdrawal detection */}
          {(summary.depositFees.txCount === 0 && summary.withdrawalFees.txCount === 0) && (
            <div className="mt-4 bg-vs-warning/10 border border-vs-warning/30 rounded-xl p-4">
              <p className="text-xs font-semibold text-vs-warning mb-1">Safehaven transactions not detected</p>
              <p className="text-xs text-vs-text-3">
                Deposit and withdrawal fee rows show zero because no transactions matched the Safehaven pattern.
                The Transaction Types tab below shows all actual type values — share them to refine the matching logic.
              </p>
              {distinctTypes.length > 0 && (
                <p className="text-xs text-vs-text-3 mt-1">
                  Found types: {distinctTypes.slice(0, 10).join(', ')}{distinctTypes.length > 10 ? ` +${distinctTypes.length - 10} more` : ''}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'types' && (
        <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-vs-border">
            <p className="text-xs text-vs-text-3">
              All distinct transaction types found in the <code className="bg-vs-elevated px-1 rounded text-vs-text-2">transactions</code> collection.
              Use this to verify Safehaven deposit/withdrawal type names.
            </p>
          </div>
          {typeBreakdown.length === 0 ? (
            <p className="text-center text-vs-text-3 text-sm p-8">No transactions found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Count</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Total Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-vs-text-3 w-40 hidden md:table-cell">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-border">
                {typeBreakdown.map((row) => {
                  const isSafehavenDep = /safehaven.*deposit|deposit.*safehaven|naira.*deposit|deposit.*naira/i.test(row.type);
                  const isSafehavenWith = /safehaven.*withdraw|withdraw.*safehaven|naira.*withdraw|withdraw.*naira/i.test(row.type);
                  return (
                    <tr key={row.type} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-vs-text-2 bg-vs-elevated px-2 py-0.5 rounded">{row.type}</span>
                        {isSafehavenDep && (
                          <span className="ml-2 text-xs text-vs-lime font-medium">deposit fee</span>
                        )}
                        {isSafehavenWith && (
                          <span className="ml-2 text-xs text-vs-warning font-medium">withdrawal fee</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-vs-text font-medium">{row.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-vs-text-3">{fmt(row.totalAmount)}</td>
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
