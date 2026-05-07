import { useState, useEffect, useCallback } from 'react';
import api from '../api';

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_PALETTE = [
  '#775CDF', '#B5DB1C', '#1CDB2F', '#F5CB3E',
  '#EB3333', '#B19CFF', '#7E9E00', '#6247CF',
];

function avatarBg(name) {
  if (!name) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function Avatar({ name, size = 'md' }) {
  const sz = size === 'lg' ? 'w-14 h-14 text-base' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: avatarBg(name) }}
    >
      {initials(name)}
    </div>
  );
}

// ── Podium ──────────────────────────────────────────────────────────────────

const PODIUM_CONFIG = {
  1: { medal: '🥇', height: 'h-20', ring: '2px solid #F5CB3E', platform: 'bg-vs-warning/10 border-t-2 border-vs-warning/40' },
  2: { medal: '🥈', height: 'h-14', ring: '2px solid #9F9F9F', platform: 'bg-vs-elevated border-t-2 border-vs-text-3/30' },
  3: { medal: '🥉', height: 'h-10', ring: '2px solid #B5DB1C', platform: 'bg-vs-lime/5 border-t-2 border-vs-lime/30' },
};

function PodiumSlot({ entry, rank, onUserClick }) {
  const cfg = PODIUM_CONFIG[rank];
  return (
    <div className={`flex flex-col items-center gap-1.5 flex-1 ${rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3'}`}>
      <span className="text-xl">{cfg.medal}</span>
      <div className="rounded-full p-0.5" style={{ boxShadow: `0 0 0 ${cfg.ring}` }}>
        <Avatar name={entry.username} size="lg" />
      </div>
      {onUserClick && entry.userId ? (
        <button
          onClick={() => onUserClick(entry.userId, entry.username)}
          className="text-xs font-bold text-vs-purple-light hover:text-vs-purple underline decoration-dotted underline-offset-2 text-center max-w-[90px] truncate"
        >
          {entry.username || 'Unknown'}
        </button>
      ) : (
        <p className="text-xs font-bold text-vs-text-2 text-center max-w-[90px] truncate">{entry.username || 'Unknown'}</p>
      )}
      {entry.currentScore != null && (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-vs-elevated text-vs-text-3 border border-vs-border">
          {typeof entry.currentScore === 'number' ? entry.currentScore.toLocaleString() : entry.currentScore} pts
        </span>
      )}
      <div className={`${cfg.height} w-full rounded-t-md ${cfg.platform}`} />
    </div>
  );
}

function Podium({ top3, onUserClick }) {
  const ordered = [
    top3.find((e) => e.displayRank === 2),
    top3.find((e) => e.displayRank === 1),
    top3.find((e) => e.displayRank === 3),
  ].filter(Boolean);

  return (
    <div className="flex items-end gap-3 mb-4 px-4 py-4 bg-vs-card rounded-xl border border-vs-border">
      {ordered.map((e) => (
        <PodiumSlot key={e.userId} entry={e} rank={e.displayRank} onUserClick={onUserClick} />
      ))}
    </div>
  );
}

// ── Row (rank 4+) ────────────────────────────────────────────────────────────

function EntryRow({ entry, onUserClick }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-vs-border last:border-0 hover:bg-vs-hover transition-colors">
      <div className="w-8 text-center flex-shrink-0">
        <span className="text-sm font-bold text-vs-text-3">#{entry.displayRank}</span>
      </div>
      <Avatar name={entry.username} size="sm" />
      <div className="flex-1 min-w-0">
        {onUserClick && entry.userId ? (
          <button
            onClick={() => onUserClick(entry.userId, entry.username)}
            className="text-sm font-semibold text-vs-purple-light hover:text-vs-purple underline decoration-dotted underline-offset-2 truncate block text-left"
          >
            {entry.username || 'Unknown'}
          </button>
        ) : (
          <p className="text-sm font-semibold text-vs-text-2 truncate">{entry.username || 'Unknown'}</p>
        )}
        {entry.isWinner && <span className="text-xs text-vs-warning">🏆 Winner</span>}
      </div>
      {entry.currentScore != null && (
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-vs-text">{typeof entry.currentScore === 'number' ? entry.currentScore.toLocaleString() : entry.currentScore}</p>
          <p className="text-xs text-vs-text-3">pts</p>
        </div>
      )}
    </div>
  );
}

// ── Competition section ───────────────────────────────────────────────────────

function CompetitionSection({ comp, onUserClick, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  const top3 = comp.participants.filter((p) => p.displayRank <= 3);
  const rest = comp.participants.filter((p) => p.displayRank > 3);

  const statusCls = comp.status === 'FINISHED'
    ? 'bg-vs-elevated text-vs-text-3'
    : comp.status === 'ACTIVE' || comp.status === 'LIVE'
    ? 'bg-vs-success/10 text-vs-success'
    : 'bg-vs-warning/10 text-vs-warning';

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-vs-text font-mono">{comp.bookingCode || comp._id}</span>
          {comp.betType && <span className="text-xs text-vs-text-3 bg-vs-elevated px-2 py-0.5 rounded border border-vs-border">{comp.betType}</span>}
          {comp.status && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusCls}`}>{comp.status}</span>}
          <span className="text-xs text-vs-text-3">{comp.participants.length} player{comp.participants.length !== 1 ? 's' : ''}</span>
        </div>
        <span className="text-vs-text-3 group-hover:text-vs-text-2 text-sm transition-colors">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          {top3.length > 0 && <Podium top3={top3} onUserClick={onUserClick} />}
          {rest.length > 0 && (
            <div className="bg-vs-card rounded-xl border border-vs-border overflow-hidden">
              {rest.map((e) => <EntryRow key={e.userId} entry={e} onUserClick={onUserClick} />)}
            </div>
          )}
          {comp.participants.length === 0 && (
            <p className="text-sm text-vs-text-3 text-center py-4">No participants yet.</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function LeaderboardView({ onUserClick }) {
  const [competitions, setCompetitions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/game-bets/leaderboard', { params: { page, limit: 20 } });
      setCompetitions(res.data.competitions);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div>
      {!loading && (
        <p className="text-sm text-vs-text-3 mb-5">
          {total.toLocaleString()} game bet{total !== 1 ? 's' : ''} · page {page} of {totalPages}
        </p>
      )}

      {error && (
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 bg-vs-card rounded-xl border border-vs-border animate-pulse" />
          ))}
        </div>
      ) : competitions.length === 0 ? (
        <div className="bg-vs-card rounded-xl border border-vs-border p-8 text-center text-vs-text-3 text-sm">
          No game bets found.
        </div>
      ) : (
        <>
          {competitions.map((comp, i) => (
            <CompetitionSection key={comp._id} comp={comp} onUserClick={onUserClick} defaultOpen={i === 0} />
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-vs-border">
              <span className="text-xs text-vs-text-3">Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">«</button>
                <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">‹</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">»</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
