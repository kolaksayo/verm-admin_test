import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { computePrizes } from '../config/prizeTiers';
import { formatMoney, currencySymbol } from '../utils/currency';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtKickoff(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function contestLabel(c) {
  const match = c.match.homeTeam && c.match.awayTeam
    ? `${c.match.homeTeam} vs ${c.match.awayTeam}`
    : (c.bookingCode || c.id);
  return c.bookingCode ? `${match} — ${c.bookingCode}` : match;
}

const pillCls = (active) =>
  `px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
    active
      ? 'bg-vs-purple text-white'
      : 'text-vs-text-2 hover:text-vs-text'
  }`;

export default function PrizeProjector({ embedded = false }) {
  const [contests, setContests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode]         = useState('maximum'); // 'maximum' | 'current'

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/game-bets/open')
      .then((r) => {
        const list = r.data || [];
        setContests(list);
        setSelectedId((prev) => prev || (list[0]?.id ?? ''));
      })
      .catch(() => setError('Failed to load open contests'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const contest = contests.find((c) => c.id === selectedId) || null;

  if (loading) {
    return (
      <div>
        <div className="h-10 bg-vs-elevated rounded-lg animate-pulse mb-4 max-w-md" />
        <div className="h-24 bg-vs-card border border-vs-border rounded-xl animate-pulse mb-4" />
        <div className="h-64 bg-vs-card border border-vs-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">
        {error}
      </div>
    );
  }

  if (!contests.length) {
    return (
      <div className="bg-vs-card border border-vs-border rounded-xl p-8 text-center text-vs-text-3 text-sm">
        No open multiplayer contests right now.
      </div>
    );
  }

  const pot = contest
    ? contest.amount * (mode === 'maximum' ? contest.capacity : contest.participantCount)
    : 0;
  const prizes = contest ? computePrizes(pot, contest.capacity) : [];

  return (
    <div>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-vs-text">Prize Projector</h1>
          <p className="text-sm text-vs-text-3 mt-1">Projected winnings per position for an open contest</p>
        </div>
      )}

      {/* Contest selector */}
      <div className="mb-5 max-w-md">
        <label className="block text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1.5">Contest</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
        >
          {contests.map((c) => (
            <option key={c.id} value={c.id}>{contestLabel(c)}</option>
          ))}
        </select>
      </div>

      {contest && (
        <>
          {/* Header card */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-lg font-bold text-vs-text">
                  {contest.match.homeTeam && contest.match.awayTeam
                    ? `${contest.match.homeTeam} vs ${contest.match.awayTeam}`
                    : (contest.bookingCode || 'Contest')}
                </p>
                {fmtKickoff(contest.match.date) && (
                  <p className="text-xs text-vs-text-3 mt-0.5">{fmtKickoff(contest.match.date)}</p>
                )}
              </div>
              <span className="px-3 py-1 rounded-lg bg-vs-elevated border border-vs-border text-sm font-medium text-vs-text-2">
                {currencySymbol(contest.currency)}{contest.currency.name || ''}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-5">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Min Entries</p>
                <p className="text-2xl font-bold text-vs-text">{contest.minParticipants.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Max Entries</p>
                <p className="text-2xl font-bold text-vs-text">{contest.capacity.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Maximum | Current toggle */}
          <div className="flex justify-center mb-5">
            <div className="inline-flex gap-1 bg-vs-elevated border border-vs-border rounded-full p-1">
              {[['maximum', 'Maximum'], ['current', 'Current']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => setMode(val)} className={pillCls(mode === val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Prize table */}
          <div className="bg-vs-card border border-vs-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold uppercase tracking-wider text-vs-text-3">
                {mode === 'maximum' ? 'Prize pool at full capacity' : 'Prize pool at current entries'}
              </p>
              <p className="text-sm font-semibold text-vs-text">
                Pot {formatMoney(pot, contest.currency)}
                <span className="text-vs-text-3 font-normal ml-1">
                  ({(mode === 'maximum' ? contest.capacity : contest.participantCount).toLocaleString()} entries)
                </span>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vs-border">
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Position</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Prize</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden sm:table-cell">% of pot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {prizes.map((row) => (
                    <tr key={row.position} className="hover:bg-vs-elevated/50 transition-colors">
                      <td className="px-4 py-2.5 text-vs-text font-medium">{ordinal(row.position)}</td>
                      <td className="px-4 py-2.5 text-right text-vs-lime font-semibold">{formatMoney(row.amount, contest.currency)}</td>
                      <td className="px-4 py-2.5 text-right text-vs-text-3 hidden sm:table-cell">{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-vs-text-3 mt-4 pt-3 border-t border-vs-border">
              {prizes.length} paying position{prizes.length !== 1 ? 's' : ''} · projected winnings each player receives.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
