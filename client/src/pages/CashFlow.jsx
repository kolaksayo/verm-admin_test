import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
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
function fmtNGN2(n) {
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRate(n) {
  if (n == null || isNaN(n) || n === 0) return '—';
  return '₦' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return Number(n).toFixed(2) + '%';
}
function fmtX(n) {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return Number(n).toFixed(2) + 'x';
}

function MiniBar({ value, max, accent = 'bg-vs-purple' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-vs-elevated rounded-full h-1.5">
      <div className={`${accent} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const Ic = {
  wallet:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M3 6h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zm13 7h.01"/></svg>,
  download:<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>,
  layers:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/></svg>,
  upload:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 20V8m0 0l-4 4m4-4l4 4M4 4h16"/></svg>,
  trend:   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 17l6-6 4 4 8-8M21 7h-5M21 7v5"/></svg>,
  pie:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>,
  swap:    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16h14M7 16l3-3m-3 3l3 3M17 8H3m14 0l-3-3m3 3l-3 3"/></svg>,
  bars:    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V10M10 19V5M16 19v-6M20 19h0M4 19h16"/></svg>,
};

// ── Label helpers ────────────────────────────────────────────────────────────

function monthLabel(year, month) { return `${MONTHS[month - 1]} ${year}`; }
function weekLabel(year, week)   { return `W${String(week).padStart(2, '0')} ${year}`; }
function dayLabel(year, month, day) { return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`; }
function monthKey(year, month)   { return `${year}-M${String(month).padStart(2, '0')}`; }
function weekKey(year, week)      { return `${year}-W${String(week).padStart(2, '0')}`; }
function dayKey(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }

// ── Build unified timeline for a given period ────────────────────────────────

function buildTimeline(period, data) {
  const { deposits, withdrawals, betFees, adminCredits = [], adminDebits = [] } = data[period];

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
    ...adminCredits.map(keyFn),
    ...adminDebits.map(keyFn),
  ]);
  const sortedKeys = [...allKeys].sort();

  const depMap = Object.fromEntries(deposits.map((m) => [keyFn(m), m]));
  const witMap = Object.fromEntries(withdrawals.map((m) => [keyFn(m), m]));
  const betMap = Object.fromEntries(betFees.map((m) => [keyFn(m), m]));
  const acMap  = Object.fromEntries(adminCredits.map((m) => [keyFn(m), m]));
  const adMap  = Object.fromEntries(adminDebits.map((m) => [keyFn(m), m]));

  return sortedKeys.map((key) => ({
    label:         labelFn(depMap[key] || witMap[key] || betMap[key] || acMap[key] || adMap[key] || {}),
    depFeeNGN:     depMap[key]?.feeNGN ?? 0,
    depTotalNGN:   depMap[key]?.totalNGN ?? 0,
    depCount:      depMap[key]?.count ?? 0,
    depAvgRate:    depMap[key]?.avgRateCharged ?? null,
    witFeeNGN:     witMap[key]?.feeNGN ?? 0,
    witNGNGateway: witMap[key]?.totalNGNGateway ?? 0,
    witCount:      witMap[key]?.count ?? 0,
    witAvgRate:    witMap[key]?.avgRatePaid ?? null,
    betFeeUSD:     betMap[key]?.fees ?? 0,
    betCount:      betMap[key]?.count ?? 0,
    adminCredUSD:  acMap[key]?.totalUSD ?? 0,
    adminCredCnt:  acMap[key]?.count ?? 0,
    adminDebitUSD: adMap[key]?.totalUSD ?? 0,
    adminDebitCnt: adMap[key]?.count ?? 0,
  }));
}

// ── KPI stat card ─────────────────────────────────────────────────────────────

function StatCard({ icon, iconBg, label, value, sub, valueColor = 'text-vs-text' }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 flex gap-4 items-start min-w-0">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: iconBg }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider mb-1.5 leading-tight">{label}</p>
        <p className={`text-2xl font-bold leading-none ${valueColor}`}>{value}</p>
        {sub && <p className="text-xs text-vs-text-3 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Key ratio row ──────────────────────────────────────────────────────────────

function RatioRow({ icon, name, desc, value }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-vs-border last:border-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-vs-elevated text-vs-text-3">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-vs-text leading-tight">{name}</p>
        <p className="text-xs text-vs-text-3 mt-0.5">{desc}</p>
      </div>
      <p className="text-lg font-bold text-vs-text flex-shrink-0">{value}</p>
    </div>
  );
}

// ── Timeline table (daily / weekly) ────────────────────────────────────────────

function TimelineTable({ rows, periodLabel }) {
  const maxDep = Math.max(...rows.map((r) => r.depFeeNGN), 1);
  const maxWit = Math.max(...rows.map((r) => r.witFeeNGN), 1);
  const maxBet = Math.max(...rows.map((r) => r.betFeeUSD), 0.01);
  const maxAC  = Math.max(...rows.map((r) => r.adminCredUSD ?? 0), 0.01);
  const maxAD  = Math.max(...rows.map((r) => r.adminDebitUSD ?? 0), 0.01);

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
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-success">Admin Credits ($)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-danger">Admin Debits ($)</th>
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
              <td className="px-4 py-3 text-right">
                {(row.adminCredUSD ?? 0) > 0 ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-vs-success font-semibold">{fmtUSD(row.adminCredUSD)}</span>
                    <MiniBar value={row.adminCredUSD} max={maxAC} accent="bg-vs-success" />
                  </div>
                ) : (
                  <span className="text-vs-text-3 opacity-30">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {(row.adminDebitUSD ?? 0) > 0 ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-vs-danger font-semibold">{fmtUSD(row.adminDebitUSD)}</span>
                    <MiniBar value={row.adminDebitUSD} max={maxAD} accent="bg-vs-danger" />
                  </div>
                ) : (
                  <span className="text-vs-text-3 opacity-30">—</span>
                )}
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
            <td className="px-4 py-3 text-right font-bold text-vs-success">{fmtUSD(rows.reduce((s, r) => s + (r.adminCredUSD ?? 0), 0))}</td>
            <td className="px-4 py-3 text-right font-bold text-vs-danger">{fmtUSD(rows.reduce((s, r) => s + (r.adminDebitUSD ?? 0), 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Monthly Breakdown table ─────────────────────────────────────────────────────

function MonthlyBreakdownTable({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="bg-vs-card border border-vs-border rounded-xl p-8 text-center text-vs-text-3 text-sm">
        No monthly data in the selected range.
      </div>
    );
  }

  const maxDep = Math.max(...rows.map((r) => r.depFeeNGN), 1);
  const maxWit = Math.max(...rows.map((r) => r.witFeeNGN), 1);
  const maxBet = Math.max(...rows.map((r) => r.betFeeUSD), 0.01);

  // Peak month by total fees (dep + wit)
  const totalFees = rows.map((r) => r.depFeeNGN + r.witFeeNGN);
  const peakIdx = totalFees.indexOf(Math.max(...totalFees));

  const payoutRatio = (r) => (r.depTotalNGN > 0 ? (r.witNGNGateway / r.depTotalNGN) * 100 : null);

  const noteFor = (i) => {
    if (i === peakIdx) return { text: 'Peak month (total fees)', dir: 'up' };
    const prev = totalFees[i - 1];
    const cur = totalFees[i];
    if (i === 0 || prev == null) return { text: 'First period', dir: 'flat' };
    if (cur > prev)  return { text: 'Fees increased', dir: 'up' };
    if (cur < prev)  return { text: 'Lower activity', dir: 'down' };
    return { text: 'Flat vs prev', dir: 'flat' };
  };

  const TrendMark = ({ dir }) => {
    if (dir === 'up')   return <span className="text-vs-success" aria-label="up">▲</span>;
    if (dir === 'down') return <span className="text-vs-danger" aria-label="down">▼</span>;
    return <span className="text-vs-text-3" aria-label="flat">—</span>;
  };

  const tot = {
    depCount: rows.reduce((s, r) => s + r.depCount, 0),
    depFee:   rows.reduce((s, r) => s + r.depFeeNGN, 0),
    witCount: rows.reduce((s, r) => s + r.witCount, 0),
    witFee:   rows.reduce((s, r) => s + r.witFeeNGN, 0),
    betFee:   rows.reduce((s, r) => s + r.betFeeUSD, 0),
    depNGN:   rows.reduce((s, r) => s + r.depTotalNGN, 0),
    witNGN:   rows.reduce((s, r) => s + r.witNGNGateway, 0),
  };
  const totPayout = tot.depNGN > 0 ? (tot.witNGN / tot.depNGN) * 100 : null;

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="border-b border-vs-border">
            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Month</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Top-ups (#)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-lime">Dep. Fees (₦)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Withdrawals (#)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-warning">With. Fees (₦)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-purple">Bet Fees ($)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden xl:table-cell">Avg Rate (₦/USD)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden xl:table-cell">Avg Rate Paid (₦/USD)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-vs-text-3">Payout Ratio (%)</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-vs-text-3">Notes / Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-vs-border">
          {rows.map((r, i) => {
            const note = noteFor(i);
            return (
              <tr key={r.label} className={`hover:bg-vs-elevated/50 transition-colors ${i === peakIdx ? 'bg-vs-purple/5' : ''}`}>
                <td className="px-4 py-3 font-medium text-vs-text whitespace-nowrap">{r.label}</td>
                <td className="px-4 py-3 text-right text-vs-text-2">{r.depCount}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-vs-lime font-semibold">{fmtNGN(r.depFeeNGN)}</span>
                    <MiniBar value={r.depFeeNGN} max={maxDep} accent="bg-vs-lime" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-vs-text-2">{r.witCount}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-vs-warning font-semibold">{fmtNGN(r.witFeeNGN)}</span>
                    <MiniBar value={r.witFeeNGN} max={maxWit} accent="bg-vs-warning" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-vs-purple font-semibold">{fmtUSD(r.betFeeUSD)}</span>
                    <MiniBar value={r.betFeeUSD} max={maxBet} accent="bg-vs-purple" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-vs-text-3 text-xs hidden xl:table-cell">{fmtRate(r.depAvgRate)}</td>
                <td className="px-4 py-3 text-right text-vs-text-3 text-xs hidden xl:table-cell">{fmtRate(r.witAvgRate)}</td>
                <td className="px-4 py-3 text-right font-semibold text-vs-text">{fmtPct(payoutRatio(r))}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-xs">
                    <TrendMark dir={note.dir} />
                    <span className="text-vs-text-3">{note.text}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-vs-border bg-vs-elevated/30">
            <td className="px-4 py-3 font-bold text-vs-text-2 text-xs uppercase tracking-wider">Totals</td>
            <td className="px-4 py-3 text-right font-bold text-vs-text-2">{tot.depCount}</td>
            <td className="px-4 py-3 text-right font-bold text-vs-lime">{fmtNGN(tot.depFee)}</td>
            <td className="px-4 py-3 text-right font-bold text-vs-text-2">{tot.witCount}</td>
            <td className="px-4 py-3 text-right font-bold text-vs-warning">{fmtNGN(tot.witFee)}</td>
            <td className="px-4 py-3 text-right font-bold text-vs-purple">{fmtUSD(tot.betFee)}</td>
            <td className="px-4 py-3 hidden xl:table-cell" />
            <td className="px-4 py-3 hidden xl:table-cell" />
            <td className="px-4 py-3 text-right font-bold text-vs-text">{fmtPct(totPayout)}</td>
            <td className="px-4 py-3 text-vs-text-3 text-xs">—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Revenue trend chart ───────────────────────────────────────────────────────

const RevTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-vs-card border border-vs-border rounded-lg px-3 py-2 text-xs shadow-lg min-w-[160px]">
      <p className="font-semibold text-vs-text mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium text-vs-text">
            {p.dataKey === 'betFeeUSD'
              ? '$' + Number(p.value).toFixed(2)
              : '₦' + Number(p.value).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
};

function RevenueTrendChart({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 flex items-center justify-center text-vs-text-3 text-sm h-full min-h-[300px]">
        No revenue data in the selected range.
      </div>
    );
  }

  // Peak + MoM annotations (descriptive of loaded series)
  const totalFees = rows.map((r) => r.depFeeNGN + r.witFeeNGN);
  const peakIdx = totalFees.indexOf(Math.max(...totalFees));
  const peak = rows[peakIdx];

  let mom = null;
  if (rows.length >= 2) {
    const last = totalFees[totalFees.length - 1];
    const prev = totalFees[totalFees.length - 2];
    const pct = prev > 0 ? ((last - prev) / prev) * 100 : null;
    mom = {
      pct,
      from: rows[rows.length - 2].label,
      to:   rows[rows.length - 1].label,
      up:   pct != null && pct >= 0,
    };
  }

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-bold text-vs-text">Revenue Trend</p>
          <p className="text-xs text-vs-text-3 mt-0.5">Fee revenue by type over time</p>
        </div>
        <div className="text-xs space-y-1 text-right">
          <p className="text-vs-text-3">
            Peak (total fees): <span className="text-vs-text font-semibold">{peak.label}</span>
            <span className="text-vs-text-2"> ({fmtNGN(totalFees[peakIdx])})</span>
          </p>
          {mom && mom.pct != null && (
            <p className="text-vs-text-3">
              MoM (total fees):{' '}
              <span className={mom.up ? 'text-vs-success font-semibold' : 'text-vs-danger font-semibold'}>
                {mom.up ? '↑' : '↓'} {Math.abs(mom.pct).toFixed(1)}%
              </span>
              <span className="text-vs-text-3"> ({mom.from} → {mom.to})</span>
            </p>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #1e293b)" strokeOpacity={0.5} />
          <XAxis dataKey="label" tick={{ fill: 'var(--color-text-3, #64748b)', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis yAxisId="ngn" orientation="left" tick={{ fill: 'var(--color-text-3, #64748b)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `₦${(v / 1000).toFixed(0)}k` : `₦${v}`} width={56} />
          <YAxis yAxisId="usd" orientation="right" tick={{ fill: 'var(--color-text-3, #64748b)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={40} />
          <Tooltip content={<RevTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: 'var(--color-text-3, #64748b)' }} />
          <Line yAxisId="ngn" type="monotone" dataKey="depFeeNGN"  name="Deposit Fees (₦)"    stroke="#84cc16" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line yAxisId="ngn" type="monotone" dataKey="witFeeNGN"  name="Withdrawal Fees (₦)" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line yAxisId="usd" type="monotone" dataKey="betFeeUSD"  name="Bet Fees ($)"         stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
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
    `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      active
        ? 'bg-vs-purple text-white'
        : 'bg-vs-elevated text-vs-text-3 border border-vs-border hover:bg-vs-hover hover:text-vs-text'
    }`;

  const inputCls = 'px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple';

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-vs-text mb-6">Cash Flow</h1>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-vs-card rounded-xl border border-vs-border h-28 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-vs-card rounded-xl border border-vs-border h-80 animate-pulse" />
          <div className="bg-vs-card rounded-xl border border-vs-border h-80 animate-pulse" />
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

  const { summary, typeBreakdown } = data;
  const bank = summary.bankBalance || {};
  const dep  = summary.depositFees;
  const wit  = summary.withdrawalFees;
  const bet  = summary.betFees;
  const ac   = summary.adminCredits || { count: 0, totalUSD: 0 };
  const ad   = summary.adminDebits  || { count: 0, totalUSD: 0 };

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const netSpreadNGN = (dep.feeNGN ?? 0) + (wit.feeNGN ?? 0);
  const paidOut      = bank.estimatedWithdrawalNGN ?? 0;
  const netDeposited = bank.netDepositNGN ?? 0;
  const payoutRatio  = netDeposited > 0 ? (paidOut / netDeposited) * 100 : null;
  const depToWith    = paidOut > 0 ? netDeposited / paidOut : null;
  const avgDepFee    = dep.txCount > 0 ? dep.feeNGN / dep.txCount : null;
  const avgWitFee    = wit.txCount > 0 ? wit.feeNGN / wit.txCount : null;

  const maxTxCount = Math.max(...typeBreakdown.map((t) => t.count), 1);

  const monthlyRows = buildTimeline('monthly', data);

  const PERIOD_TABS = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'weekly',  label: 'Weekly' },
    { key: 'daily',   label: 'Daily' },
    { key: 'types',   label: 'Transaction Types' },
  ];

  const chartPeriod = tab === 'types' ? 'monthly' : tab;

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
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-vs-text-3 whitespace-nowrap">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </div>
          {dateTo && (
            <button onClick={() => setDateTo('')} className="text-xs text-vs-text-3 hover:text-vs-text px-2.5 py-1.5 rounded-lg border border-vs-border hover:bg-vs-elevated transition-colors">
              Clear end
            </button>
          )}
        </div>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <StatCard
          icon={Ic.wallet} iconBg="#6D28D9"
          label="Estimated Safehaven NGN Balance"
          value={fmtNGN(bank.estimatedBalanceNGN)}
          sub="End-of-period balance"
          valueColor={(bank.estimatedBalanceNGN ?? 0) >= 0 ? 'text-vs-success' : 'text-vs-danger'}
        />
        <StatCard
          icon={Ic.download} iconBg="#1CDB2F"
          label="Total NGN Received"
          value={fmtNGN(bank.totalDepositNGN)}
          sub="Total top-up volume"
        />
        <StatCard
          icon={Ic.layers} iconBg="#0891B2"
          label="Net NGN Deposited"
          value={fmtNGN(bank.netDepositNGN)}
          sub="After charges on deposits"
        />
        <StatCard
          icon={Ic.upload} iconBg="#D97706"
          label="Estimated NGN Paid Out"
          value={fmtNGN(bank.estimatedWithdrawalNGN)}
          sub="Total withdrawal volume"
        />
        <StatCard
          icon={Ic.trend} iconBg="#775CDF"
          label="Net Spread Revenue"
          value={fmtNGN(netSpreadNGN)}
          sub="Deposit + Withdrawal fees (NGN)"
          valueColor="text-vs-purple-light"
        />
      </div>

      {/* Chart + Key Ratios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2">
          <RevenueTrendChart rows={buildTimeline(chartPeriod, data)} />
        </div>
        <div className="bg-vs-card border border-vs-border rounded-xl">
          <div className="px-4 py-3.5 border-b border-vs-border">
            <p className="text-sm font-bold text-vs-text">Key Ratios &amp; Averages</p>
            <p className="text-xs text-vs-text-3 mt-0.5">For the selected period</p>
          </div>
          <RatioRow icon={Ic.pie}  name="Payout Ratio"      desc="Paid out / Net deposited" value={fmtPct(payoutRatio)} />
          <RatioRow icon={Ic.swap} name="Dep. to With. Ratio" desc="Net deposited / Paid out" value={fmtX(depToWith)} />
          <RatioRow icon={Ic.bars} name="Avg Deposit Fee"   desc="Per top-up"               value={fmtNGN2(avgDepFee)} />
          <RatioRow icon={Ic.bars} name="Avg Withdrawal Fee" desc="Per withdrawal"          value={fmtNGN2(avgWitFee)} />
        </div>
      </div>

      {/* Fee cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Deposit Spread Fees</p>
          <p className="text-3xl font-bold text-vs-lime">{fmtNGN(dep.feeNGN)}</p>
          <p className="text-xs text-vs-text-3 mt-1">{dep.txCount.toLocaleString()} top-ups · {fmtUSD(dep.totalUSD)} credited</p>
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

        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Withdrawal Spread Fees</p>
          <p className="text-3xl font-bold text-vs-warning">{fmtNGN(wit.feeNGN)}</p>
          <p className="text-xs text-vs-text-3 mt-1">{wit.txCount.toLocaleString()} withdrawals · {fmtUSD(wit.totalUSD)} withdrawn</p>
          {wit.avgRatePaid ? (
            <div className="mt-3 flex gap-4 text-xs">
              <div><p className="text-vs-text-3">Rate paid to user</p><p className="font-semibold text-vs-warning">{fmtRate(wit.avgRatePaid)}/USD</p></div>
              <div><p className="text-vs-text-3">Est. market rate</p><p className="font-semibold text-vs-text">{fmtRate((wit.avgRatePaid ?? 0) + 200)}/USD</p></div>
              <div><p className="text-vs-text-3">Spread</p><p className="font-semibold text-vs-text">−₦200/USD</p></div>
            </div>
          ) : (
            <p className="text-xs text-vs-text-3 italic mt-2">{wit.txCount > 0 ? 'Fee = USD withdrawn × ₦200' : 'No withdrawals detected'}</p>
          )}
        </div>

        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Bet Fees</p>
          <p className="text-3xl font-bold text-vs-purple">{fmtUSD(bet.totalUSD)}</p>
          <p className="text-xs text-vs-text-3 mt-1">{(bet.betCount ?? 0).toLocaleString()} bets · platform cut from stakes</p>
          <div className="mt-3 text-xs">
            <p className="text-vs-text-3">Source</p>
            <p className="font-semibold text-vs-text font-mono text-xs">totalFeesDeducted per bet</p>
          </div>
        </div>

        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Admin Adjustments</p>
          <div className="flex items-end gap-4 mb-1">
            <div>
              <p className="text-[10px] text-vs-text-3 uppercase tracking-wider mb-0.5">Credits</p>
              <p className="text-2xl font-bold text-vs-success">{fmtUSD(ac.totalUSD)}</p>
              <p className="text-xs text-vs-text-3">{ac.count.toLocaleString()} credit{ac.count !== 1 ? 's' : ''}</p>
            </div>
            <span className="text-vs-text-3 text-lg mb-1">·</span>
            <div>
              <p className="text-[10px] text-vs-text-3 uppercase tracking-wider mb-0.5">Debits</p>
              <p className="text-2xl font-bold text-vs-danger">{fmtUSD(ad.totalUSD)}</p>
              <p className="text-xs text-vs-text-3">{ad.count.toLocaleString()} debit{ad.count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="mt-3 text-xs">
            <p className="text-vs-text-3">Net adjustment</p>
            <p className="font-semibold text-vs-text">{fmtUSD((ac.totalUSD ?? 0) - (ad.totalUSD ?? 0))}</p>
          </div>
        </div>
      </div>

      {/* Withdrawal not detected warning */}
      {wit.txCount === 0 && (
        <div className="bg-vs-warning/10 border border-vs-warning/30 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-vs-warning mb-1">Withdrawal transactions not matched</p>
          <p className="text-xs text-vs-text-3">
            Looking for <code className="bg-vs-elevated px-1 rounded">type: DEBIT, description: SafeHaven Naira transfer</code>.
            Check Transaction Types tab to confirm.
          </p>
        </div>
      )}

      {/* Breakdown section */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-bold text-vs-text">
          {tab === 'monthly' ? 'Monthly Breakdown'
            : tab === 'weekly' ? 'Weekly Breakdown'
            : tab === 'daily' ? 'Daily Breakdown'
            : 'Transaction Types'}
        </h2>
        <div className="flex gap-2">
          {PERIOD_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={pillCls(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'monthly' && <MonthlyBreakdownTable rows={monthlyRows} />}
      {tab === 'weekly'  && <TimelineTable rows={buildTimeline('weekly', data)} periodLabel="Week" />}
      {tab === 'daily'   && <TimelineTable rows={buildTimeline('daily',  data)} periodLabel="Day" />}

      {tab === 'types' && (
        <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-vs-border">
            <p className="text-xs text-vs-text-3">All type + description combinations in the transactions collection.</p>
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
                    <td className="px-4 py-3 hidden md:table-cell"><MiniBar value={row.count} max={maxTxCount} /></td>
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
