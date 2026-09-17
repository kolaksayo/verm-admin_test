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
  1: { color: '#F4B83F' },
  2: { color: '#B0B5C0' },
  3: { color: '#B87945' },
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const Icon = {
  trophy: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3" />
    </svg>
  ),
  hash: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 8h10M7 16h10M9 4l-2 16M17 4l-2 16" />
    </svg>
  ),
  ball: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
        d="M12 7l4 3-1.5 5h-5L8 10l4-3z" />
    </svg>
  ),
  check: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  users: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-2a3 3 0 10-2.5-1.34" />
    </svg>
  ),
  trend: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 17l6-6 4 4 8-8M21 7h-5M21 7v5" />
    </svg>
  ),
  share: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 3v13m0-13L8 7m4-4l4 4" />
    </svg>
  ),
  download: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2M12 3v12m0 0l-4-4m4 4l4-4" />
    </svg>
  ),
  filter: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
    </svg>
  ),
  chevronDown: (cls) => (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
    </svg>
  ),
};

// ── RankBadge ─────────────────────────────────────────────────────────────────

function RankBadge({ rank }) {
  const medal = MEDAL[rank];
  if (!medal) return null;
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
      style={{
        border: `2px solid ${medal.color}`,
        color: '#0D111A',
        background: `linear-gradient(160deg, ${medal.color}, ${medal.color}cc)`,
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
    <div className="flex flex-col items-center relative pt-5">
      {/* Badge floating above card */}
      <div className="absolute top-0 z-10">
        <RankBadge rank={rank} />
      </div>

      <div
        className={`flex flex-col items-center gap-3 rounded-2xl border w-full
          ${isFirst ? 'pt-10 pb-6 px-6' : 'pt-9 pb-5 px-5 mt-1'}`}
        style={{
          backgroundColor: '#111722',
          borderColor: isFirst ? `${medal.color}55` : '#252B36',
          boxShadow: isFirst ? `0 6px 28px ${medal.color}1f` : 'none',
        }}
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
            className="text-base font-bold text-vs-text hover:text-vs-purple-light transition-colors text-center max-w-[130px] truncate"
          >
            {entry.username || 'Unknown'}
          </button>
        ) : (
          <p className="text-base font-bold text-vs-text text-center max-w-[130px] truncate">
            {entry.username || 'Unknown'}
          </p>
        )}

        {/* Score pill */}
        {entry.currentScore != null && (
          <span
            className="px-4 py-1 rounded-full text-sm font-bold border"
            style={{ color: medal.color, borderColor: `${medal.color}55`, backgroundColor: '#0F141D' }}
          >
            {typeof entry.currentScore === 'number'
              ? entry.currentScore.toLocaleString()
              : entry.currentScore} pts
          </span>
        )}

        {/* Correct picks stat line (only if data present) */}
        {entry.correctPickPercent != null && (
          <div className="flex items-center gap-1.5 text-xs text-vs-text-3">
            {Icon.check('w-3.5 h-3.5')}
            <span>{entry.correctPickPercent}% Correct picks</span>
          </div>
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
    <div className="flex flex-wrap items-end gap-4 mb-6">
      {first && (
        <div className="order-1 w-full md:w-auto md:order-2 md:flex-1">
          <PodiumCard entry={first} rank={1} onUserClick={onUserClick} />
        </div>
      )}
      {second && (
        <div className="order-2 flex-1 md:order-1">
          <PodiumCard entry={second} rank={2} onUserClick={onUserClick} />
        </div>
      )}
      {third && (
        <div className="order-3 flex-1">
          <PodiumCard entry={third} rank={3} onUserClick={onUserClick} />
        </div>
      )}
    </div>
  );
}

// ── MetaChip ──────────────────────────────────────────────────────────────────

function MetaChip({ children, icon, iconColor, onClick, active, className = '' }) {
  const base = `inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border border-vs-border bg-vs-elevated text-vs-text-2 select-none ${className}`;
  const inner = (
    <>
      {icon && (
        <span style={iconColor ? { color: iconColor } : undefined} className={iconColor ? '' : 'text-vs-text-3'}>
          {icon}
        </span>
      )}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} hover:bg-vs-hover transition-colors cursor-pointer ${active ? 'text-vs-success border-vs-success/30' : ''}`}
        title="Click to copy"
      >
        {inner}
      </button>
    );
  }
  return <span className={base}>{inner}</span>;
}

// ── GameMetaChips ─────────────────────────────────────────────────────────────

function GameMetaChips({ comp }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard?.writeText(comp.bookingCode || comp._id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const finished = comp.status === 'FINISHED';
  const live = comp.status === 'ACTIVE' || comp.status === 'LIVE';
  const statusColor = finished ? '#6F7684' : live ? '#4ADE80' : '#F4B83F';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MetaChip
        icon={Icon.hash('w-3.5 h-3.5')}
        iconColor="#8B5CF6"
        onClick={copyCode}
        active={copied}
      >
        <span className="font-mono">{copied ? 'Copied!' : (comp.bookingCode || comp._id)}</span>
      </MetaChip>
      {comp.betType && (
        <MetaChip icon={Icon.ball('w-3.5 h-3.5')}>{comp.betType}</MetaChip>
      )}
      {comp.status && (
        <span
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border font-semibold"
          style={{ color: statusColor, borderColor: `${statusColor}40`, backgroundColor: `${statusColor}14` }}
        >
          <span style={{ color: statusColor }}>{Icon.check('w-3.5 h-3.5')}</span>
          {comp.status}
        </span>
      )}
      <MetaChip icon={Icon.users('w-3.5 h-3.5')}>
        {comp.participants.length} player{comp.participants.length !== 1 ? 's' : ''}
      </MetaChip>
    </div>
  );
}

// ── TrendIndicator ────────────────────────────────────────────────────────────

function TrendIndicator({ trend }) {
  if (trend == null) return null;
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-vs-success" aria-label={`Up ${trend}`}>
        <span aria-hidden="true">▲</span>{trend}
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-vs-danger" aria-label={`Down ${Math.abs(trend)}`}>
        <span aria-hidden="true">▼</span>{Math.abs(trend)}
      </span>
    );
  }
  return <span className="text-xs text-vs-text-3" aria-label="No change">—</span>;
}

// ── RankingRow ────────────────────────────────────────────────────────────────

function RankingRow({ entry, onUserClick }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-vs-border last:border-0 hover:bg-vs-hover transition-colors">
      <div className="w-7 text-center flex-shrink-0">
        <span className="text-sm font-bold text-vs-text-3 font-mono">{entry.displayRank}</span>
      </div>
      <Avatar name={entry.username} size="sm" />
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {onUserClick && entry.userId ? (
          <button
            onClick={() => onUserClick(entry.userId, entry.username)}
            className="text-sm font-semibold text-vs-text hover:text-vs-purple-light transition-colors truncate text-left"
          >
            {entry.username || 'Unknown'}
          </button>
        ) : (
          <p className="text-sm font-semibold text-vs-text-2 truncate">{entry.username || 'Unknown'}</p>
        )}
        <TrendIndicator trend={entry.trend} />
      </div>
      {entry.currentScore != null && (
        <div className="text-right flex-shrink-0">
          <span className="text-base font-bold text-vs-text">
            {typeof entry.currentScore === 'number' ? entry.currentScore.toLocaleString() : entry.currentScore}
          </span>
          <span className="text-xs text-vs-text-3 ml-1">pts</span>
        </div>
      )}
      <span className="text-vs-text-3 flex-shrink-0">{Icon.chevronDown('w-4 h-4 -rotate-90')}</span>
    </div>
  );
}

// ── FullRankingsTable ─────────────────────────────────────────────────────────

function FullRankingsTable({ entries, onUserClick }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-2xl border border-vs-border overflow-hidden" style={{ backgroundColor: '#0D111A' }}>
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-vs-border">
        <div className="flex items-center gap-2">
          <span className="text-vs-purple">{Icon.trend('w-4 h-4')}</span>
          <span className="text-sm font-semibold text-vs-text">Full Rankings</span>
        </div>
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
    <div className="mb-6">
      {/* Meta chips header (clickable to collapse) */}
      <div className="flex items-center justify-between mb-5">
        <GameMetaChips comp={comp} />
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-vs-text-3 hover:text-vs-text-2 transition-colors ml-3 flex-shrink-0"
          aria-label={open ? 'Collapse' : 'Expand'}
          aria-expanded={open}
        >
          {Icon.chevronDown(`w-5 h-5 transition-transform ${open ? '' : '-rotate-90'}`)}
        </button>
      </div>

      {open && (
        <>
          {top3.length > 0 && <TopThreePodium top3={top3} onUserClick={onUserClick} />}
          <FullRankingsTable entries={rest} onUserClick={onUserClick} />
          {comp.participants.length === 0 && (
            <p className="text-sm text-vs-text-3 text-center py-6">No participants yet.</p>
          )}
        </>
      )}
    </div>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────────

function PageHeader({ total, page, totalPages, onShare }) {
  const btnCls = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-vs-text-2 bg-vs-elevated border border-vs-border rounded-lg hover:bg-vs-hover hover:text-vs-text transition-colors';
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div className="flex items-center gap-3">
        {/* Trophy badge */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border"
          style={{
            background: 'linear-gradient(160deg, #F4B83F, #B87945)',
            borderColor: '#F4B83F66',
            color: '#0D111A',
          }}
        >
          {Icon.trophy('w-6 h-6')}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-vs-text leading-tight">Game Bet Leaderboard</h1>
          <p className="text-sm text-vs-text-3 mt-0.5">
            {total.toLocaleString()} game bet{total !== 1 ? 's' : ''}
            <span className="mx-1.5 text-vs-text-3">•</span>
            page {page} of {totalPages}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onShare} className={btnCls} title="Copy page URL">
          {Icon.share('w-4 h-4')} Share
        </button>
        <button className={btnCls} title="Export (coming soon)" disabled>
          {Icon.download('w-4 h-4')} Export
        </button>
        <button className={btnCls} title="Filter (coming soon)" disabled>
          {Icon.filter('w-4 h-4')} Filter
          {Icon.chevronDown('w-3.5 h-3.5')}
        </button>
      </div>
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

  return (
    <div>
      <PageHeader
        total={total}
        page={page}
        totalPages={totalPages}
        onShare={shareLeaderboard}
      />

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
