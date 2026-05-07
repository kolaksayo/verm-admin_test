import { useEffect, useState } from 'react';
import api from '../api';

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return val; }
}

function InfoBadge({ label, value, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return (
    <div className="flex flex-col items-center bg-gray-50 rounded-lg px-4 py-3">
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[color]}`}>{value || '—'}</span>
      <span className="text-xs text-gray-400 mt-1">{label}</span>
    </div>
  );
}

function FixtureRow({ fixture }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
      <span className="font-medium text-gray-800">{fixture.homeTeam} <span className="text-gray-400 mx-1">vs</span> {fixture.awayTeam}</span>
      <div className="text-right flex-shrink-0 ml-3">
        {fixture.status && <span className="text-xs text-gray-400 block">{fixture.status}</span>}
        {fixture.date && <span className="text-xs text-gray-400">{formatDate(fixture.date)}</span>}
      </div>
    </div>
  );
}

function ParticipantRow({ participant, onUserClick }) {
  const [expanded, setExpanded] = useState(false);
  const hasPicks = participant.picks && participant.picks.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
            {(participant.username || '?')[0].toUpperCase()}
          </div>
          {/* Name — clickable to open user profile */}
          <span
            className="text-sm font-semibold text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-800"
            onClick={(e) => {
              e.stopPropagation();
              if (onUserClick && participant.userId) onUserClick(participant.userId, participant.username);
            }}
          >
            {participant.username || 'Unknown'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {hasPicks && <span>{participant.picks.length} pick{participant.picks.length !== 1 ? 's' : ''}</span>}
          <span className="text-gray-300">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          {hasPicks ? (
            <div className="space-y-2">
              {participant.picks.map((pick, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-gray-600 flex-1">
                    {pick.fixture || <span className="text-gray-400 italic">Unknown fixture</span>}
                  </span>
                  <span className="font-medium text-gray-800 text-right flex-shrink-0 capitalize">
                    {pick.prediction ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // Fallback: show raw resolved data as key-value pairs
            <div className="space-y-1">
              {Object.entries(participant.raw || {}).map(([key, val]) => {
                if (key === 'user' || key === 'userId') return null;
                const display = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—');
                return (
                  <div key={key} className="flex gap-3 text-xs">
                    <span className="text-gray-400 w-28 flex-shrink-0 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-gray-700 break-all">{display.length > 80 ? display.slice(0, 80) + '…' : display}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ['Overview', 'Fixtures', 'Participants'];

export default function GameBetModal({ betId, bookingCode, onClose, onUserClick }) {
  const [bet, setBet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/game-bets/${betId}`)
      .then((res) => setBet(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load bet details'))
      .finally(() => setLoading(false));
  }, [betId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Game Bet</span>
              {bet?.status && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium capitalize">{bet.status}</span>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900 font-mono mt-0.5">{bookingCode || bet?.bookingCode || '…'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              {t === 'Participants' && bet && (
                <span className="ml-1 text-xs text-gray-400">({bet.participantCount})</span>
              )}
              {t === 'Fixtures' && bet && (
                <span className="ml-1 text-xs text-gray-400">({bet.fixtures.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">Loading…</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {!loading && !error && bet && tab === 'Overview' && (
            <div className="space-y-5">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <InfoBadge label="Participants" value={bet.participantCount} color="blue" />
                <InfoBadge label="Fixtures" value={bet.fixtures.length} color="purple" />
                <InfoBadge label="Currency" value={bet.currency?.name || '—'} color="green" />
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm">
                {bet.league && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">League</span>
                    <span className="flex items-center gap-1.5 font-medium text-gray-800">
                      {bet.league.image && <img src={bet.league.image} alt="" className="w-4 h-4 object-contain" onError={(e) => e.target.remove()} />}
                      {bet.league.name}
                    </span>
                  </div>
                )}
                {bet.createdBy && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Created by</span>
                    <span className="font-medium text-gray-800">{bet.createdBy}</span>
                  </div>
                )}
                {bet.createdAt && (
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">Created</span>
                    <span className="font-medium text-gray-800">{formatDate(bet.createdAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && !error && bet && tab === 'Fixtures' && (
            <div className="space-y-2">
              {bet.fixtures.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No fixtures linked to this bet.</p>
              ) : (
                bet.fixtures.map((f) => <FixtureRow key={f._id} fixture={f} />)
              )}
            </div>
          )}

          {!loading && !error && bet && tab === 'Participants' && (
            <div className="space-y-2">
              {bet.participants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No participants found.</p>
              ) : (
                bet.participants.map((p, i) => (
                  <ParticipantRow key={p.userId || i} participant={p} onUserClick={onUserClick} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
