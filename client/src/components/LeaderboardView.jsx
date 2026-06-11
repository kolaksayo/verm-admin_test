import { useState, useEffect, useCallback } from 'react';
import api from '../api';

// ── Avatar ────────────────────────────────────────────────────────────────────

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
  const sz =
    size === 'xl' ? 'w-20 h-20 text-xl' :
    size === 'lg' ? 'w-14 h-14 text-base' :
    size === 'sm' ? 'w-8 h-8 text-xs' :
                    'w-10 h-10 text-sm';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: avatarBg(name) }}
    >
      {initials(name)}
    </div>
  );
}

// ── Medal colors ──────────────────────────────────────────────────────────────

const MEDAL = {
  1: { color: '#F4B83F', label: '1st' },
  2: { color: '#B0B5C0', label: '2nd' },
  3: { color: '#B87945', label: '3rd' },
};

// ── RankBadge ─────────────────────────────────────────────────────────────────

function RankBadge({ rank }) {
  const medal = MEDAL[rank];
  if (!medal) return null;
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
      style={{
        border: `2px solid ${medal.color}`,
        color: medal.color,
        backgroundColor: `${medal.color}14`,
      }}
    >
      {rank}
    </div>
  );
}

// ── PodiumCard ────────────────────────────────────────────────────────────────

function PodiumCard({ entry, rank, onUserClick }) {
  const isFirst = rank === 1;
  const medal = MEDAL[rank];

  return (
    <div className="flex flex-col items-center gap-1 relative pt-5">
      {/* Badge floating above card */}
      <div className="absolute top-0 z-10">
        <RankBadge rank={rank} />
      </div>

      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border border-vs-border w-full
          ${isFirst
            ? 'bg-vs-card pt-10 pb-6 px-6 shadow-lg'
            : 'bg-vs-card pt-8 pb-5 px-5'
          }`}
        style={isFirst ? { boxShadow: `0 4px 24px ${medal.color}18` } : undefined}
      >
        {/* Ring around avatar for 1st place */}
        <div
          className="rounded-full p-0.5"
          style={isFirst ? { boxShadow: `0 0 0 2px ${medal.color}` } : undefined}
        >
          <Avatar name={entry.username} size={isFirst ? 'xl' : 'lg'} />
        </div>

        {/* Name */}
        {onUserClick && entry.userId ? (
          <button
            onClick={() => onUserClick(entry.userId, entry.username)}
            className="text-sm font-bold text-vs-purple-light hover:text-vs-purple underline decoration-dotted underline-offset-2 text-center max-w-[110px] truncate"
          >
            {entry.username || 'Unknown'}
          </button>
        ) : (
          <p className="text-sm font-bold text-vs-text text-center max-w-[110px] truncate">
            {entry.username || 'Unknown'}
          </p>
        )}

        {/* Score pill */}
        {entry.currentScore != null && (
          <span
            className="px-3 py-1 rounded-full text-xs font-bold bg-vs-elevated border border-vs-border"
            style={{ color: medal.color }}
          >
            {typeof entry.currentScore === 'number'
              ? entry.currentScore.toLocaleString()
              : entry.currentScore} pts
          </span>
        )}
      </div>
    </div>
  );
}

// ── TopThreePodium ────────────────────────────────────────────────────────────

function TopThreePodium({ top3, onUserClick }) {
  const first  = top3.find((e) => e.displayRank === 1);
  const second = top3.find((e) => e.displayRank === 2);
  const third  = top3.find((e) => e.displayRank === 3);

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      {/* 1st: full-width on mobile, centered on desktop */}
      {first && (
        <div className="order-1 w-full md:w-auto md:order-2 md:flex-1">
          <PodiumCard entry={first} rank={1} onUserClick={onUserClick} />
        </div>
      )}
      {/* 2nd: left on desktop */}
      {second && (
        <div className="order-2 flex-1 md:order-1">
          <PodiumCard entry={second} rank={2} onUserClick={onUserClick} />
        </div>
      )}
      {/* 3rd: right */}
      {third && (
        <div className="order-3 flex-1">
          <PodiumCard entry={third} rank={3} onUserClick={onUserClick} />
        </div>
      )}
    </div>
  );
}

// ── MetaChip ──────────────────────────────────────────────────────────────────

function MetaChip({ children, mono, onClick, className = '' }) {
  const base = `inline-flex items-center px-3 py-1 rounded-full text-xs border border-vs-border bg-vs-elevated text-vs-text-3 select-none ${className}`;
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} hover:bg-vs-hover hover:text-vs-text-2 transition-colors cursor-pointer`}
        title="Click to copy"
      >
        {mono ? <span className="font-mono">{children}</span> : children}
      </button>
    );
  }
  return (
    <span className={base}>
      {mono ? <span className="font-mono">{children}</span> : children}
    </span>
  );
}

// ── GameMetaChips ─────────────────────────────────────────────────────────────

function GameMetaChips({ comp }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard?.writeText(comp.bookingCode || comp._id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const statusCls =
    comp.status === 'FINISHED'
      ? 'bg-vs-elevated text-vs-text-3 border-vs-border'
      : comp.status === 'ACTIVE' || comp.status === 'LIVE'
      ? 'bg-vs-success/10 text-vs-success border-vs-success/20'
      : 'bg-vs-warning/10 text-vs-warning border-vs-warning/20';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MetaChip mono onClick={copyCode} className={copied ? 'text-vs-success border-vs-success/30' : ''}>
        {copied ? 'Copied!' : (comp.bookingCode || comp._id)}
      </MetaChip>
      {comp.betType && <MetaChip>{comp.betType}</MetaChip>}
      {comp.status && (
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border font-semibold ${statusCls}`}>
          {comp.status}
        </span>
      )}
      <MetaChip>
        {comp.participants.length} player{comp.participants.length !== 1 ? 's' : ''}
      </MetaChip>
    </div>
  );
}

// ── RankingRow ────────────────────────────────────────────────────────────────

function RankingRow({ entry, onUserClick }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-vs-border last:border-0 hover:bg-vs-hover transition-colors">
      <div className="w-8 text-center flex-shrink-0">
        <span className="text-sm font-bold text-vs-text-3 font-mono">#{entry.displayRank}</span>
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
        {entry.isWinner && (
          <span className="text-xs text-vs-warning">Winner</span>
        )}
      </div>
      {entry.currentScore != null && (
        <div className="text-right flex-shrink-0">
          <span className="text-sm font-bold text-vs-text">
            {typeof entry.currentScore === 'number' ? entry.currentScore.toLocaleString() : entry.currentScore}
          </span>
          <span className="text-xs text-vs-text-3 ml-1">pts</span>
        </div>
      )}
      <span className="text-vs-text-3 text-sm flex-shrink-0">›</span>
    </div>
  );
}

// ── FullRankingsTable ─────────────────────────────────────────────────────────

function FullRankingsTable({ entries, onUserClick }) {
  if (entries.length === 0) return null;
  return (
    <div className="bg-vs-card rounded-xl border border-vs-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-vs-border">
        <span className="text-sm font-semibold text-vs-text">Full Rankings</span>
        <span className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider">Points</span>
      </div>
      {entries.map((e) => (
        <RankingRow key={e.userId || e.username} entry={e} onUserClick={onUserClick} />
      ))}
    </div>
  );
}

// ── CompetitionSection ────────────────────────────────────────────────────────

function CompetitionSection({ comp, onUserClick, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  const top3 = comp.participants.filter((p) => p.displayRank <= 3);
  const rest = comp.participants.filter((p) => p.displayRank > 3);

  return (
    <div className="mb-6 bg-vs-card border border-vs-border rounded-2xl overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-vs-hover transition-colors group"
      >
        <GameMetaChips comp={comp} />
        <span className="text-vs-text-3 group-hover:text-vs-text-2 text-sm transition-colors ml-4 flex-shrink-0">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1">
          {top3.length > 0 && (
            <TopThreePodium top3={top3} onUserClick={onUserClick} />
          )}
          <FullRankingsTable entries={rest} onUserClick={onUserClick} />
          {comp.participants.length === 0 && (
            <p className="text-sm text-vs-text-3 text-center py-6">No participants yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── LeaderboardView ───────────────────────────────────────────────────────────

export default function LeaderboardView({ onUserClick }) {
  const [competitions, setCompetitions] = useState([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  const load = useCallback(async () => {
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

  useEffect(() => { load(); }, [load]);

  const shareLeaderboard = () => {
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
  };

  const btnCls = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-vs-text-3 bg-vs-elevated border border-vs-border rounded-lg hover:bg-vs-hover hover:text-vs-text-2 transition-colors';

  return (
    <div>
      {/* Action bar */}
      {!loading && (
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-vs-text-3">
            {total.toLocaleString()} game bet{total !== 1 ? 's' : ''} · page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={shareLeaderboard} className={btnCls} title="Copy page URL">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
            <button className={btnCls} title="Export (coming soon)" disabled>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 bg-vs-card rounded-2xl border border-vs-border animate-pulse" />
          ))}
        </div>
      ) : competitions.length === 0 ? (
        <div className="bg-vs-card rounded-2xl border border-vs-border p-10 text-center text-vs-text-3 text-sm">
          No game bets found.
        </div>
      ) : (
        <>
          {competitions.map((comp, i) => (
            <CompetitionSection
              key={comp._id}
              comp={comp}
              onUserClick={onUserClick}
              defaultOpen={i === 0}
            />
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
