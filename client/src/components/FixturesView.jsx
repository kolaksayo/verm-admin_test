import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import DocumentModal from './DocumentModal';

function formatMatchTime(dateStr) {
  if (!dateStr) return { time: '—', label: '' };
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((matchDay - today) / 86400000);
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return { time, label: 'Today' };
    if (diffDays === 1) return { time, label: 'Tomorrow' };
    if (diffDays === -1) return { time, label: 'Yesterday' };
    return {
      time,
      label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: diffDays < -7 || diffDays > 7 ? 'numeric' : undefined }),
    };
  } catch { return { time: '—', label: '' }; }
}

function StatusPill({ status, elapsed }) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes('not started') || s === 'ns' || s === 'tbd') return null;
  if (s.includes('halftime') || s === 'ht') {
    return <span className="text-xs font-semibold text-vs-warning bg-vs-warning/10 px-2 py-0.5 rounded-full">HT</span>;
  }
  if (s.includes('live') || s === '1h' || s === '2h' || s === 'et') {
    return (
      <span className="text-xs font-semibold text-vs-success bg-vs-success/10 px-2 py-0.5 rounded-full animate-pulse">
        {elapsed ? `${elapsed}'` : 'LIVE'}
      </span>
    );
  }
  if (s.includes('finished') || s === 'ft' || s === 'aet' || s === 'pen') {
    return <span className="text-xs font-medium text-vs-text-3">FT</span>;
  }
  return <span className="text-xs text-vs-text-3">{status}</span>;
}

function TeamBlock({ team, align = 'left' }) {
  const isRight = align === 'right';
  return (
    <div className={`flex items-center gap-3 flex-1 ${isRight ? 'flex-row-reverse' : ''}`}>
      <div className="w-11 h-11 flex items-center justify-center flex-shrink-0">
        {team.logo
          ? <img src={team.logo} alt={team.name} className="w-11 h-11 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          : <div className="w-9 h-9 rounded-full bg-vs-elevated border border-vs-border flex items-center justify-center text-vs-text-3 text-xs font-bold">{team.name?.[0] ?? '?'}</div>
        }
      </div>
      <span className={`text-sm font-semibold text-vs-text ${isRight ? 'text-right' : 'text-left'}`}>{team.name}</span>
    </div>
  );
}

function FixtureCard({ fixture, onClick }) {
  const { time, label } = formatMatchTime(fixture.date);
  const hasScore = fixture.scoreHome !== null && fixture.scoreAway !== null;

  return (
    <button
      onClick={onClick}
      className="w-full bg-vs-card hover:bg-vs-elevated border border-vs-border hover:border-vs-purple/40 rounded-xl px-5 py-4 transition-all text-left group"
    >
      <div className="flex items-center gap-4">
        <TeamBlock team={fixture.homeTeam} align="left" />
        <div className="flex flex-col items-center flex-shrink-0 min-w-[90px]">
          {hasScore ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-vs-text">{fixture.scoreHome}</span>
              <span className="text-vs-text-3 font-bold">–</span>
              <span className="text-2xl font-bold text-vs-text">{fixture.scoreAway}</span>
            </div>
          ) : (
            <span className="text-xl font-bold text-vs-text tracking-wide">{time}</span>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {label && <span className="text-xs text-vs-text-3">{label}</span>}
            <StatusPill status={fixture.statusLong} elapsed={fixture.elapsed} />
          </div>
        </div>
        <TeamBlock team={fixture.awayTeam} align="right" />
      </div>
    </button>
  );
}

export default function FixturesView() {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState({ id: '', name: '' });
  const [dateFilter, setDateFilter] = useState('all');
  const [customDate, setCustomDate] = useState(todayStr);
  const [search, setSearch] = useState('');
  const [fixtures, setFixtures] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    api.get('/fixtures/leagues').then((res) => setLeagues(res.data)).catch(() => {});
  }, []);

  function getDateRange() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (dateFilter === 'today') return { dateFrom: fmt(now), dateTo: fmt(now) };
    if (dateFilter === 'tomorrow') {
      const t = new Date(now); t.setDate(t.getDate() + 1);
      return { dateFrom: fmt(t), dateTo: fmt(t) };
    }
    if (dateFilter === 'week') {
      const end = new Date(now); end.setDate(end.getDate() + 7);
      return { dateFrom: fmt(now), dateTo: fmt(end) };
    }
    if (dateFilter === 'custom') return { dateFrom: customDate, dateTo: customDate };
    return {};
  }

  const fetchFixtures = useCallback(() => {
    setLoading(true);
    setError('');
    const dateRange = getDateRange();
    api.get('/fixtures', { params: {
      page, limit: 20,
      leagueId:   selectedLeague.id   || undefined,
      leagueName: selectedLeague.name || undefined,
      search:     search              || undefined,
      ...dateRange,
    } })
      .then((res) => {
        setFixtures(res.data.fixtures);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      })
      .catch(() => setError('Failed to load fixtures'))
      .finally(() => setLoading(false));
  }, [page, selectedLeague.id, selectedLeague.name, dateFilter, customDate, search]);

  useEffect(() => { setPage(1); }, [selectedLeague.id, dateFilter, customDate, search]);
  useEffect(() => { fetchFixtures(); }, [fetchFixtures]);

  const pillCls = (active) => `px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
    active ? 'bg-vs-purple text-white' : 'bg-vs-elevated text-vs-text-3 border border-vs-border hover:bg-vs-hover hover:text-vs-text'
  }`;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {[
          { key: 'all', label: 'All' },
          { key: 'today', label: 'Today' },
          { key: 'tomorrow', label: 'Tomorrow' },
          { key: 'week', label: 'Next 7 days' },
          { key: 'custom', label: 'Pick date' },
        ].map((f) => (
          <button key={f.key} onClick={() => setDateFilter(f.key)} className={pillCls(dateFilter === f.key)}>
            {f.label}
          </button>
        ))}

        {dateFilter === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
          />
        )}

          <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team or fixture ID…"
          className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple w-52"
        />

        {leagues.length > 0 && (
          <select
            value={selectedLeague.id}
            onChange={(e) => {
              const opt = e.target.selectedOptions[0];
              setSelectedLeague({ id: e.target.value, name: opt?.dataset?.name || '' });
            }}
            className="px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
          >
            <option value="">All leagues</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id} data-name={l.name}>{l.name}</option>
            ))}
          </select>
        )}

        {!loading && (
          <span className="text-sm text-vs-text-3 ml-auto">{total.toLocaleString()} fixture{total !== 1 ? 's' : ''}</span>
        )}
      </div>

      {error && (
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-vs-card rounded-xl border border-vs-border animate-pulse" />
          ))}
        </div>
      ) : fixtures.length === 0 ? (
        <div className="bg-vs-card rounded-xl border border-vs-border p-8 text-center text-vs-text-3 text-sm">
          No fixtures found.
        </div>
      ) : (
        <>
          {Object.entries(
            fixtures.reduce((acc, f) => {
              const key = f.league ? `${f.league.name}__${f.league.image || ''}` : 'Other';
              (acc[key] = acc[key] || []).push(f);
              return acc;
            }, {})
          ).map(([key, items]) => {
            const [leagueName, leagueImage] = key.split('__');
            return (
              <div key={key} className="mb-6">
                <div className="flex items-center gap-2 mb-2 px-1">
                  {leagueImage && (
                    <div className="w-5 h-5 rounded bg-white/90 flex items-center justify-center flex-shrink-0 p-0.5">
                      <img src={leagueImage} alt="" className="w-4 h-4 object-contain" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                    </div>
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">{leagueName}</span>
                </div>
                <div className="space-y-2">
                  {items.map((f) => (
                    <FixtureCard key={f._id} fixture={f} onClick={() => setSelectedId(f._id)} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-vs-border">
            <span className="text-xs text-vs-text-3">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">«</button>
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">‹</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">»</button>
            </div>
          </div>
        </>
      )}

      {selectedId && (
        <DocumentModal
          collectionName="football_fixtures"
          docId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
