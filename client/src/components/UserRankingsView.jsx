import { useState, useEffect, useCallback } from 'react';
import api from '../api';

function formatNum(n) {
  if (n == null) return '—';
  return typeof n === 'number' ? n.toLocaleString() : n;
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function UserRankingsView({ onUserClick }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/game-bets/user-rankings', { params: { page, limit: 50 } });
      setRows(res.data.rankings);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      setError('Failed to load rankings');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div>
      {!loading && (
        <p className="text-sm text-vs-text-3 mb-4">
          {total.toLocaleString()} player{total !== 1 ? 's' : ''} ranked by cumulative points
        </p>
      )}

      {error && (
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="bg-vs-card rounded-xl border border-vs-border p-8 text-center text-vs-text-3 text-sm animate-pulse">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-vs-card rounded-xl border border-vs-border p-8 text-center text-vs-text-3 text-sm">No data found.</div>
      ) : (
        <>
          <div className="bg-vs-card rounded-xl border border-vs-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-vs-elevated border-b border-vs-border">
                    {['Rank', 'Player', 'Total Pts', 'Bets', 'Avg / Bet', 'Player Pts', 'Time Pts', 'Goal Pts', 'Yellow Pts'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {rows.map((r) => (
                    <tr
                      key={r.userId || r.rank}
                      className={`hover:bg-vs-elevated transition-colors ${r.rank <= 3 ? 'bg-vs-warning/3' : ''}`}
                    >
                      {/* Rank */}
                      <td className="px-4 py-3 text-vs-text-3 font-mono text-xs whitespace-nowrap">
                        {MEDAL[r.rank] || `#${r.rank}`}
                      </td>

                      {/* Username */}
                      <td className="px-4 py-3">
                        {onUserClick && r.userId ? (
                          <button
                            onClick={() => onUserClick(r.userId, r.username)}
                            className="text-sm font-semibold text-vs-purple-light hover:text-vs-purple underline decoration-dotted underline-offset-2 transition-colors"
                          >
                            {r.username}
                          </button>
                        ) : (
                          <span className="text-sm font-semibold text-vs-text-2">{r.username}</span>
                        )}
                      </td>

                      {/* Total score */}
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-vs-text">{formatNum(r.totalScore)}</span>
                      </td>

                      {/* Bets count */}
                      <td className="px-4 py-3 text-vs-text-3 text-xs font-mono">{formatNum(r.betsCount)}</td>

                      {/* Avg per bet */}
                      <td className="px-4 py-3 text-vs-text-3 text-xs font-mono">{formatNum(r.avgScore)}</td>

                      {/* Point breakdown */}
                      <td className="px-4 py-3 text-vs-text-3 text-xs font-mono">{formatNum(r.playerPoints)}</td>
                      <td className="px-4 py-3 text-vs-text-3 text-xs font-mono">{formatNum(r.timePoints)}</td>
                      <td className="px-4 py-3 text-vs-text-3 text-xs font-mono">{formatNum(r.goalPoints)}</td>
                      <td className="px-4 py-3 text-vs-text-3 text-xs font-mono">{formatNum(r.yellowCardPoints)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-vs-border bg-vs-elevated">
                <span className="text-xs text-vs-text-3">Page {page} / {totalPages}</span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">«</button>
                  <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">‹</button>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">›</button>
                  <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">»</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
