import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const MEDALS = ['🥇', '🥈', '🥉'];

const RANK_STYLES = [
  'border-yellow-300 bg-gradient-to-r from-yellow-50 to-amber-50',
  'border-gray-300 bg-gradient-to-r from-gray-50 to-slate-50',
  'border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50',
];

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function RankCard({ entry, rank, onUserClick }) {
  const medal = MEDALS[rank - 1];
  const rankStyle = RANK_STYLES[rank - 1] || 'border-gray-100 bg-white';

  return (
    <div className={`flex items-center gap-4 px-5 py-4 rounded-xl border ${rankStyle} transition-all`}>
      {/* Rank */}
      <div className="flex-shrink-0 w-10 text-center">
        {medal
          ? <span className="text-2xl">{medal}</span>
          : <span className="text-lg font-bold text-gray-400">#{rank}</span>
        }
      </div>

      {/* Avatar */}
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">
        {initials(entry.username)}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        {onUserClick && entry.userId ? (
          <button
            onClick={() => onUserClick(entry.userId, entry.username)}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2 truncate block"
          >
            {entry.username || 'Unknown'}
          </button>
        ) : (
          <p className="text-sm font-semibold text-gray-800 truncate">{entry.username || 'Unknown'}</p>
        )}
        {entry.competition && (
          <p className="text-xs text-gray-400 truncate">{entry.competition}</p>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5 flex-shrink-0 text-right">
        {entry.points !== null && entry.points !== undefined && (
          <div>
            <p className="text-lg font-bold text-gray-800">{typeof entry.points === 'number' ? entry.points.toLocaleString() : entry.points}</p>
            <p className="text-xs text-gray-400">pts</p>
          </div>
        )}
        {entry.correct !== null && entry.correct !== undefined && (
          <div>
            <p className="text-sm font-semibold text-gray-700">{entry.correct}/{entry.total ?? '?'}</p>
            <p className="text-xs text-gray-400">correct</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeaderboardView({ onUserClick }) {
  const [entries, setEntries] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [selectedComp, setSelectedComp] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/collections/game_bet_leaderboard', {
        params: { page, limit: 50, sort: 'rank', order: 'asc' },
      });
      const raw = res.data.docs;
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);

      const userIds = [...new Set(raw.map((d) => d.user).filter(Boolean).map(String))];
      const gameBetIds = [...new Set(raw.map((d) => d.gameBet).filter(Boolean).map(String))];

      const [userMap, gameBetMap] = await Promise.all([
        userIds.length
          ? api.post('/lookup/users', { ids: userIds }).then((r) => r.data)
          : {},
        gameBetIds.length
          ? api.post('/lookup/game_bet', { ids: gameBetIds }).then((r) => r.data)
          : {},
      ]);

      const comps = new Map();
      gameBetIds.forEach((id) => {
        const name = gameBetMap[id];
        if (name) comps.set(id, typeof name === 'object' ? name.name : name);
      });
      setCompetitions([...comps.entries()].map(([id, name]) => ({ id, name })));

      const resolved = raw.map((d) => {
        const userVal = d.user ? userMap[String(d.user)] : null;
        const username = userVal ? (typeof userVal === 'object' ? userVal.name : userVal) : null;
        const gameBetVal = d.gameBet ? gameBetMap[String(d.gameBet)] : null;
        const competition = gameBetVal ? (typeof gameBetVal === 'object' ? gameBetVal.name : gameBetVal) : null;

        return {
          _id: d._id,
          userId: d.user ? String(d.user) : null,
          username,
          competition,
          rank: d.rank ?? d.position ?? null,
          points: d.points ?? d.score ?? d.totalPoints ?? null,
          correct: d.correctPredictions ?? null,
          total: d.totalPredictions ?? null,
        };
      });

      setEntries(resolved);
    } catch {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const filtered = selectedComp
    ? entries.filter((e) => {
        const comp = competitions.find((c) => c.id === selectedComp);
        return comp && e.competition === comp.name;
      })
    : entries;

  const ranked = filtered.map((e, i) => ({ ...e, displayRank: e.rank ?? i + 1 }));

  return (
    <div>
      {/* Filter */}
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm text-gray-500 font-medium">Competition</label>
        <select
          value={selectedComp}
          onChange={(e) => setSelectedComp(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All competitions</option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {!loading && (
          <span className="text-sm text-gray-400">{total.toLocaleString()} entr{total !== 1 ? 'ies' : 'y'}</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          No leaderboard entries found.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {ranked.map((entry) => (
              <RankCard
                key={String(entry._id)}
                entry={entry}
                rank={entry.displayRank}
                onUserClick={onUserClick}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">«</button>
                <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">‹</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">»</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
