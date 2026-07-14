import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { formatMoney } from '../utils/currency';
import WagerDetailsModal from '../components/WagerDetailsModal';

// Prize Projector is USD-only per product decision.
const USD = { name: 'USD', symbol: '$' };

function fmtKickoff(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PrizeProjector({ embedded = false }) {
  const [contests, setContests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState(null);
  const [mode, setMode]         = useState('maximum'); // 'maximum' | 'current'

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/game-bets/open')
      .then((r) => setContests(r.data || []))
      .catch(() => setError('Failed to load open contests'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-vs-card border border-vs-border rounded-xl animate-pulse" />
        ))}
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

  return (
    <div>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-vs-text">Prize Projector</h1>
          <p className="text-sm text-vs-text-3 mt-1">Projected winnings per position for open contests</p>
        </div>
      )}

      {/* Payout basis — chosen here, then shown as a label inside the pop-up. */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <span className="text-xs text-vs-text-3">Projected payout basis</span>
        <div className="inline-flex rounded-lg bg-vs-elevated p-1">
          {[
            { key: 'maximum', label: 'Maximum' },
            { key: 'current', label: 'Current' },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setMode(o.key)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                mode === o.key ? 'bg-vs-purple text-white' : 'text-vs-text-3 hover:text-vs-text-2'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vs-border">
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Match</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden sm:table-cell">Wager Code</th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Players</th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Stake</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-vs-border">
              {contests.map((c) => (
                <tr key={c.id} className="hover:bg-vs-elevated/50 transition-colors">
                  <td className="px-4 py-3 text-vs-text">
                    <div className="font-medium">
                      {c.match.homeTeam && c.match.awayTeam ? `${c.match.homeTeam} vs ${c.match.awayTeam}` : (c.bookingCode || 'Contest')}
                    </div>
                    <div className="text-xs text-vs-text-3">{fmtKickoff(c.match.date)}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-vs-text-2 hidden sm:table-cell">{c.bookingCode || '—'}</td>
                  <td className="px-4 py-3 text-right text-vs-text-2">{c.participantCount.toLocaleString()} / {c.capacity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-vs-lime font-medium">{formatMoney(c.amount, USD)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(c)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-vs-purple hover:bg-vs-purple-on text-white transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <WagerDetailsModal contest={selected} mode={mode} onClose={() => setSelected(null)} />}
    </div>
  );
}
