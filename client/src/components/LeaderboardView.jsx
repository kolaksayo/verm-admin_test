import { useState, useEffect, useCallback } from 'react';
import api from '../api';

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, size = 'md' }) {
  const sz = size === 'lg' ? 'w-14 h-14 text-base' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials(name)}
    </div>
  );
}

// ── Podium (rank 1–3) ────────────────────────────────────────────────────────

const PODIUM_CONFIG = {
  1: { label: '🥇', height: 'h-24', order: 'order-2', badge: 'bg-yellow-400 text-yellow-900', ring: 'ring-2 ring-yellow-400' },
  2: { label: '🥈', height: 'h-16', order: 'order-1', badge: 'bg-gray-300 text-gray-700', ring: 'ring-2 ring-gray-300' },
  3: { label: '🥉', height: 'h-12', order: 'order-3', badge: 'bg-amber-600 text-amber-100', ring: 'ring-2 ring-amber-500' },
};

function PodiumSlot({ entry, rank, onUserClick }) {
  const cfg = PODIUM_CONFIG[rank];
  return (
    <div className={`flex flex-col items-center gap-2 flex-1 ${cfg.order}`}>
      {/* Medal emoji above */}
      <span className="text-2xl">{cfg.label}</span>

      {/* Avatar */}
      <div className={`rounded-full ${cfg.ring}`}>
        <Avatar name={entry.username} size="lg" />
      </div>

      {/* Name */}
      {onUserClick && entry.userId ? (
        <button
          onClick={() => onUserClick(entry.userId, entry.username)}
          className="text-sm font-bold text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2 text-center max-w-[100px] truncate"
        >
          {entry.username || 'Unknown'}
        </button>
      ) : (
        <p className="text-sm font-bold text-gray-800 text-center max-w-[100px] truncate">
          {entry.username || 'Unknown'}
        </p>
      )}

      {/* Points */}
      {entry.points !== null && entry.points !== undefined && (
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
          {typeof entry.points === 'number' ? entry.points.toLocaleString() : entry.points} pts
        </span>
      )}

      {/* Prediction accuracy */}
      {entry.correct !== null && entry.correct !== undefined && (
        <span className="text-xs text-gray-400">{entry.correct}/{entry.total ?? '?'} correct</span>
      )}

      {/* Podium platform */}
      <div className={`${cfg.height} w-full rounded-t-lg ${rank === 1 ? 'bg-yellow-100 border-t-2 border-yellow-300' : rank === 2 ? 'bg-gray-100 border-t-2 border-gray-300' : 'bg-amber-50 border-t-2 border-amber-300'}`} />
    </div>
  );
}

function Podium({ top3, onUserClick }) {
  // Render order: 2nd, 1st, 3rd
  const slots = [
    top3.find((e) => e.displayRank === 2),
    top3.find((e) => e.displayRank === 1),
    top3.find((e) => e.displayRank === 3),
  ].filter(Boolean);

  return (
    <div className="flex items-end gap-4 mb-6 px-4 py-5 bg-white rounded-xl border border-gray-200">
      {slots.map((e) => (
        <PodiumSlot key={String(e._id)} entry={e} rank={e.displayRank} onUserClick={onUserClick} />
      ))}
    </div>
  );
}

// ── Row (rank 4+) ────────────────────────────────────────────────────────────

function EntryRow({ entry, onUserClick }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
      <div className="w-8 text-center">
        <span className="text-sm font-bold text-gray-400">#{entry.displayRank}</span>
      </div>
      <Avatar name={entry.username} size="sm" />
      <div className="flex-1 min-w-0">
        {onUserClick && entry.userId ? (
          <button
            onClick={() => onUserClick(entry.userId, entry.username)}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2 truncate block text-left"
          >
            {entry.username || 'Unknown'}
          </button>
        ) : (
          <p className="text-sm font-semibold text-gray-800 truncate">{entry.username || 'Unknown'}</p>
        )}
        {entry.correct !== null && entry.correct !== undefined && (
          <p className="text-xs text-gray-400">{entry.correct}/{entry.total ?? '?'} correct</p>
        )}
      </div>
      {entry.points !== null && entry.points !== undefined && (
        <div className="text-right">
          <p className="text-sm font-bold text-gray-800">{typeof entry.points === 'number' ? entry.points.toLocaleString() : entry.points}</p>
          <p className="text-xs text-gray-400">pts</p>
        </div>
      )}
    </div>
  );
}

// ── Competition section ───────────────────────────────────────────────────────

function CompetitionSection({ name, entries, onUserClick, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  const sorted = [...entries].sort((a, b) => (a.displayRank ?? 999) - (b.displayRank ?? 999));
  const top3 = sorted.filter((e) => e.displayRank <= 3);
  const rest = sorted.filter((e) => e.displayRank > 3);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-gray-800">{name}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{entries.length} players</span>
        </div>
        <span className="text-gray-400 group-hover:text-gray-600 text-sm">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          {top3.length > 0 && <Podium top3={top3} onUserClick={onUserClick} />}
          {rest.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {rest.map((e) => (
                <EntryRow key={String(e._id)} entry={e} onUserClick={onUserClick} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function LeaderboardView({ onUserClick }) {
  const [groups, setGroups] = useState([]);
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
        params: { page, limit: 100, sort: 'rank', order: 'asc' },
      });
      const raw = res.data.docs;
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);

      const userIds = [...new Set(raw.map((d) => d.user).filter(Boolean).map(String))];
      const gameBetIds = [...new Set(raw.map((d) => d.gameBet).filter(Boolean).map(String))];

      const [userMap, gameBetMap] = await Promise.all([
        userIds.length ? api.post('/lookup/users', { ids: userIds }).then((r) => r.data) : {},
        gameBetIds.length ? api.post('/lookup/game_bet', { ids: gameBetIds }).then((r) => r.data) : {},
      ]);

      const resolved = raw.map((d, i) => {
        const userVal = d.user ? userMap[String(d.user)] : null;
        const username = userVal ? (typeof userVal === 'object' ? userVal.name : userVal) : null;
        const gameBetVal = d.gameBet ? gameBetMap[String(d.gameBet)] : null;
        const competition = gameBetVal ? (typeof gameBetVal === 'object' ? gameBetVal.name : gameBetVal) : 'Unknown';

        return {
          _id: d._id,
          userId: d.user ? String(d.user) : null,
          username,
          competition,
          displayRank: d.rank ?? d.position ?? i + 1,
          points: d.points ?? d.score ?? d.totalPoints ?? null,
          correct: d.correctPredictions ?? null,
          total: d.totalPredictions ?? null,
        };
      });

      // Group by competition
      const grouped = {};
      resolved.forEach((e) => {
        (grouped[e.competition] = grouped[e.competition] || []).push(e);
      });
      setGroups(Object.entries(grouped));
    } catch {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  return (
    <div>
      {!loading && (
        <p className="text-sm text-gray-400 mb-5">{total.toLocaleString()} entr{total !== 1 ? 'ies' : 'y'} across {groups.length} competition{groups.length !== 1 ? 's' : ''}</p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          No leaderboard entries found.
        </div>
      ) : (
        <>
          {groups.map(([name, entries], i) => (
            <CompetitionSection
              key={name}
              name={name}
              entries={entries}
              onUserClick={onUserClick}
              defaultOpen={i === 0}
            />
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
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
