import { useState } from 'react';
import { computePrizes } from '../config/prizeTiers';
import { formatMoney } from '../utils/currency';

// Prize Projector is USD-only per product decision — the contest's own currency
// is intentionally ignored for display here.
const USD = { name: 'USD', symbol: '$' };

const WAGER_TYPE_LABELS = {
  GOALSANDCARDS: 'Goals & Cards',
  SHOTSOFFGOAL:  'Shots off Goal',
  WINNER:        'Winner',
};

function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function wagerTypeLabel(betType) {
  if (!betType) return '—';
  return WAGER_TYPE_LABELS[betType] || titleCase(betType);
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtGameDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Row({ label, value, valueClass = 'text-vs-text', sub }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm text-vs-text-3">{label}</span>
      <span className="flex items-center gap-2">
        {sub != null && <span className="text-[10px] text-vs-text-3">{sub}</span>}
        <span className={`text-sm text-right ${valueClass}`}>{value}</span>
      </span>
    </div>
  );
}

export default function WagerDetailsModal({ contest, onClose }) {
  const [mode, setMode] = useState('maximum'); // 'maximum' | 'current'

  if (!contest) return null;

  const pot = contest.amount * (mode === 'maximum' ? contest.capacity : contest.participantCount);
  const prizes = computePrizes(pot, contest.capacity);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{ backgroundColor: '#1C1B20' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-4 border-b" style={{ backgroundColor: '#24232A', borderColor: '#313038' }}>
          <button onClick={onClose} aria-label="Close" className="p-1 -ml-1 text-vs-text-2 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <p className="flex-1 text-center text-[17px] font-semibold text-white pr-5">
            Wager – {contest.bookingCode || '—'}
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Chips row — Wager Details active; others presentational */}
          <div className="flex gap-3">
            {['Leader Board', 'Selections'].map((c) => (
              <span key={c} className="px-3.5 py-2 rounded-lg text-sm text-white select-none" style={{ backgroundColor: '#24232A' }}>
                {c}
              </span>
            ))}
            <span className="px-3.5 py-2 rounded-lg text-sm font-medium text-white select-none" style={{ backgroundColor: '#775CDF' }}>
              Wager Details
            </span>
          </div>

          {/* Maximum | Current toggle */}
          <div className="inline-flex gap-1 rounded-full p-1" style={{ backgroundColor: '#313038' }}>
            {[['maximum', 'Maximum'], ['current', 'Current']].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setMode(val)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === val ? 'bg-vs-purple text-white' : 'text-vs-text-2 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Card 1 — details */}
          <div className="rounded-lg px-3 py-2" style={{ backgroundColor: '#24232A' }}>
            <Row label="Wager Code" value={contest.bookingCode || '—'} />
            <Row label="Players" value={`${contest.participantCount.toLocaleString()} / ${contest.capacity.toLocaleString()}`} />
            <Row label="Tournament" value={contest.betMode ? titleCase(contest.betMode) : '—'} />
            <Row label="Wager Type" value={wagerTypeLabel(contest.betType)} />
            <Row label="First Game" value={fmtGameDate(contest.firstGame)} />
            <Row label="Last Game" value={fmtGameDate(contest.lastGame)} />
          </div>

          {/* Card 2 — stake & prizes */}
          <div className="rounded-lg px-3 py-2" style={{ backgroundColor: '#24232A' }}>
            <div className="flex items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: '#313038' }}>
              <span className="text-sm text-vs-text-3">Stake</span>
              <span className="text-sm font-bold text-vs-lime">{formatMoney(contest.amount, USD)}</span>
            </div>
            <div className="pt-2">
              {prizes.map((row) => (
                <Row
                  key={row.position}
                  label={`${ordinal(row.position)} Place`}
                  sub={`${row.pct}%`}
                  value={formatMoney(row.amount, USD)}
                  valueClass="text-vs-lime font-bold"
                />
              ))}
            </div>
          </div>

          {/* Card 3 — wager rules */}
          <div className="rounded-lg px-3 py-3" style={{ backgroundColor: '#24232A' }}>
            <p className="text-xs font-medium text-white mb-2">Wager Rules</p>
            <ul className="space-y-2">
              {[
                `Minimum ${contest.minParticipants} players required to start`,
                `Top ${prizes.length} player${prizes.length !== 1 ? 's' : ''} win prizes`,
                'No refunds after wager confirmation',
              ].map((rule) => (
                <li key={rule} className="flex gap-2 text-sm text-vs-text-3">
                  <span aria-hidden>•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-vs-text-3 text-center">
            Projected winnings — amounts each player receives.
          </p>
        </div>
      </div>
    </div>
  );
}
