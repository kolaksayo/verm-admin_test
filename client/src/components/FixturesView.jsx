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
    return <span className="text-xs font-semibold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">HT</span>;
  }
  if (s.includes('live') || s === '1h' || s === '2h' || s === 'et') {
    return (
      <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full animate-pulse">
        {elapsed ? `${elapsed}'` : 'LIVE'}
      </span>
    );
  }
  if (s.includes('finished') || s === 'ft' || s === 'aet' || s === 'pen') {
    return <span className="text-xs font-medium text-gray-400">FT</span>;
  }
  return <span className="text-xs text-gray-400">{status}</span>;
}

function TeamBlock({ team, align = 'left' }) {
  const isRight = align === 'right';
  return (
    <div className={`flex items-center gap-3 flex-1 ${isRight ? 'flex-row-reverse' : ''}`}>
      <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
        {team.logo
          ? <img src={team.logo} alt={team.name} className="w-12 h-12 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          : <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold">{team.name?.[0] ?? '?'}</div>
        }
      </div>
      <span className={`text-sm font-semibold text-white ${isRight ? 'text-right' : 'text-left'}`}>{team.name}</span>
    </div>
  );
}

function FixtureCard({ fixture, onClick }) {
  const { time, label } = formatMatchTime(fixture.date);
  const hasScore = fixture.scoreHome !== null && fixture.scoreAway !== null;

  return (
    <button
      onClick={onClick}
      className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-xl px-5 py-4 transition-all text-left group"
    >
      <div className="flex items-center gap-4">
        <TeamBlock team={fixture.homeTeam} align="left" />

        <div className="flex flex-col items-center flex-shrink-0 min-w-[90px]">
          {hasScore ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">{fixture.scoreHome}</span>
              <span className="text-gray-500 font-bold">–</span>
              <span className="text-2xl font-bold text-white">{fixture.scoreAway}</span>
            </div>
          ) : (
            <span className="text-xl font-bold text-white tracking-wide">{time}</span>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {label && <span className="text-xs text-gray-400">{label}</span>}
            <StatusPill status={fixture.statusLong} elapsed={fixture.elapsed} />
          </div>
        </div>

        <TeamBlock team={fixture.awayTeam} align="right" />
      </div>
    </button>
  );
}

export default function FixturesView({ total: parentTotal }) {
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('');
  const [fixtures, setFixtures] = useState([]);
  const [total, setTotal] = useState(parentTotal || 0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    api.get('/fixtures/leagues').then((res) => {
      setLeagues(res.data);
    }).catch(() => {});
  }, []);

  const fetchFixtures = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/fixtures', { params: { page, limit: 20, leagueId: selectedLeague || undefined } })
      .then((res) => {
        setFixtures(res.data.fixtures);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      })
      .catch(() => setError('Failed to load fixtures'))
      .finally(() => setLoading(false));
  }, [page, selectedLeague]);

  useEffect(() => { setPage(1); }, [selectedLeague]);
  useEffect(() => { fetchFixtures(); }, [fetchFixtures]);

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 font-medium">League</label>
          <select
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All leagues</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        {!loading && (
          <span className="text-sm text-gray-400">{total.toLocaleString()} fixture{total !== 1 ? 's' : ''}</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : fixtures.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center text-gray-400 text-sm">
          No fixtures found.
        </div>
      ) : (
        <>
          {/* Group by league */}
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
                    <img src={leagueImage} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{leagueName}</span>
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
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">«</button>
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">‹</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">»</button>
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
