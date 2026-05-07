import { useEffect, useState } from 'react';
import api from '../api';

function formatDate(val) {
  if (!val) return '—';
  try { return new Date(val).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

function StatusBadge({ status }) {
  if (!status) return null;
  const s = status.toUpperCase();
  const cls = s === 'FINISHED' ? 'bg-gray-100 text-gray-600'
    : s === 'ACTIVE' || s === 'LIVE' ? 'bg-green-100 text-green-700'
    : s === 'PENDING' ? 'bg-yellow-100 text-yellow-700'
    : 'bg-blue-100 text-blue-700';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

function Scoreline({ scoreline, homeTeam, awayTeam }) {
  if (!scoreline) return null;
  return (
    <div className="bg-gray-900 rounded-xl px-6 py-4 flex items-center justify-between text-white mb-4">
      <span className="text-sm font-semibold flex-1 text-left">{homeTeam || 'Home'}</span>
      <div className="flex items-center gap-3 mx-4">
        <span className="text-3xl font-bold">{scoreline.home}</span>
        <span className="text-gray-500 text-lg">–</span>
        <span className="text-3xl font-bold">{scoreline.away}</span>
      </div>
      <span className="text-sm font-semibold flex-1 text-right">{awayTeam || 'Away'}</span>
    </div>
  );
}

function FixtureSelection({ sel, isGoalsAndCards }) {
  const hasScored = sel.scoredPlayerEvents?.length > 0 || sel.scoredTimeEvents?.length > 0;
  const hasPicks = sel.players?.length > 0 || sel.times?.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Fixture header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">{sel.fixtureLabel}</span>
        <div className="flex items-center gap-2">
          {sel.pointsEarned > 0 && (
            <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              +{sel.pointsEarned} pts
            </span>
          )}
          <StatusBadge status={sel.status} />
        </div>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* Selections */}
        {hasPicks && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Picks</p>
            <div className="flex flex-wrap gap-1.5">
              {(sel.players || []).map((pl, i) => (
                <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  {pl.name || pl.id}
                </span>
              ))}
              {(sel.times || []).map((t, i) => (
                <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                  {t}'
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Scored events */}
        {hasScored && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Scored events</p>
            <div className="space-y-1">
              {(sel.scoredPlayerEvents || []).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">
                    <span className="font-medium">{e.player}</span>
                    {e.event && <span className="text-gray-400 ml-1">· {e.event}</span>}
                    {e.type && <span className="ml-1 text-gray-400 italic">({e.type})</span>}
                  </span>
                  {e.points > 0 && <span className="text-green-600 font-semibold ml-2">+{e.points}</span>}
                </div>
              ))}
              {(sel.scoredTimeEvents || []).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">
                    <span className="font-medium">{e.minute}'</span>
                    {e.event && <span className="text-gray-400 ml-1">· {e.event}</span>}
                    {e.type && <span className="ml-1 text-gray-400 italic">({e.type})</span>}
                  </span>
                  {e.points > 0 && <span className="text-green-600 font-semibold ml-2">+{e.points}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasPicks && !hasScored && (
          <p className="text-xs text-gray-400 italic">No selections</p>
        )}
      </div>
    </div>
  );
}

function ParticipantRow({ participant, isGoalsAndCards, onUserClick }) {
  const [expanded, setExpanded] = useState(false);

  const hasBreakdown = isGoalsAndCards && participant.fixtureSelections?.length > 0;
  const hasPointBreakdown = isGoalsAndCards && (
    participant.totalPointPlayer != null ||
    participant.totalPointTime != null
  );

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      participant.isWinner ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
    }`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 transition-colors text-left"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold flex-shrink-0">
          {(participant.username || '?')[0].toUpperCase()}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2"
              onClick={(e) => { e.stopPropagation(); if (onUserClick && participant.userId) onUserClick(participant.userId, participant.username); }}
            >
              {participant.username}
            </button>
            {participant.isCreator && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Creator</span>
            )}
            {participant.isWinner && (
              <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-semibold">🏆 Winner</span>
            )}
          </div>
          {/* WINNER type: show team pick inline */}
          {!isGoalsAndCards && participant.chosenTeam && (
            <p className="text-xs text-gray-500 mt-0.5">Picked: <span className="font-medium text-gray-700">{participant.chosenTeam}</span></p>
          )}
        </div>

        {/* Score + expand toggle */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {participant.currentScore != null && (
            <div className="text-right">
              <p className="text-sm font-bold text-gray-800">{participant.currentScore}</p>
              <p className="text-xs text-gray-400">pts</p>
            </div>
          )}
          {(hasBreakdown || !isGoalsAndCards) && (
            <span className="text-gray-400 text-sm">{expanded ? '▾' : '▸'}</span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">

          {/* WINNER type: team selection */}
          {!isGoalsAndCards && (
            <div>
              {participant.chosenTeam ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Team selection:</span>
                  <span className="text-sm font-semibold text-gray-800">{participant.chosenTeam}</span>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No team selection recorded</p>
              )}
            </div>
          )}

          {/* GOALSANDCARDS type: per-fixture breakdown */}
          {isGoalsAndCards && (
            <>
              {/* Points breakdown */}
              {hasPointBreakdown && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {participant.totalPointPlayer != null && (
                    <div className="bg-white rounded-lg px-2 py-1.5 text-center border border-gray-100">
                      <p className="text-sm font-bold text-gray-800">{participant.totalPointPlayer}</p>
                      <p className="text-xs text-gray-400">Player pts</p>
                    </div>
                  )}
                  {participant.totalPointTime != null && (
                    <div className="bg-white rounded-lg px-2 py-1.5 text-center border border-gray-100">
                      <p className="text-sm font-bold text-gray-800">{participant.totalPointTime}</p>
                      <p className="text-xs text-gray-400">Time pts</p>
                    </div>
                  )}
                  {participant.totalPlayerGoalPoints != null && (
                    <div className="bg-white rounded-lg px-2 py-1.5 text-center border border-gray-100">
                      <p className="text-sm font-bold text-gray-800">{participant.totalPlayerGoalPoints}</p>
                      <p className="text-xs text-gray-400">Goal pts</p>
                    </div>
                  )}
                  {participant.totalPlayerYellowCardPoints != null && (
                    <div className="bg-white rounded-lg px-2 py-1.5 text-center border border-gray-100">
                      <p className="text-sm font-bold text-gray-800">{participant.totalPlayerYellowCardPoints}</p>
                      <p className="text-xs text-gray-400">Yellow pts</p>
                    </div>
                  )}
                  {participant.totalPlayerRedCardPoints != null && (
                    <div className="bg-white rounded-lg px-2 py-1.5 text-center border border-gray-100">
                      <p className="text-sm font-bold text-gray-800">{participant.totalPlayerRedCardPoints}</p>
                      <p className="text-xs text-gray-400">Red pts</p>
                    </div>
                  )}
                </div>
              )}

              {/* Fixture selections */}
              {participant.fixtureSelections?.length > 0 ? (
                <div className="space-y-2">
                  {participant.fixtureSelections.map((sel, i) => (
                    <FixtureSelection key={i} sel={sel} isGoalsAndCards={isGoalsAndCards} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No fixture selections recorded</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ['Overview', 'Participants'];

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

  const mainFixture = bet?.mainFixture;
  const isGoalsAndCards = bet?.betType === 'GOALSANDCARDS';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{bet?.betMode || 'Game Bet'}</span>
              {bet?.betType && <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">· {bet.betType}</span>}
              {bet?.status && <StatusBadge status={bet.status} />}
            </div>
            <h2 className="text-lg font-bold text-gray-900 font-mono">{bookingCode || bet?.bookingCode || '…'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              {t === 'Participants' && bet && <span className="ml-1 text-xs text-gray-400">({bet.participantCount})</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">Loading…</div>}
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}

          {!loading && !error && bet && tab === 'Overview' && (
            <div className="space-y-4">
              {/* Scoreline banner */}
              {bet.scoreline && mainFixture && (
                <Scoreline scoreline={bet.scoreline} homeTeam={mainFixture.homeTeam} awayTeam={mainFixture.awayTeam} />
              )}

              {/* Main fixture (if no scoreline yet) */}
              {mainFixture && !bet.scoreline && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-center text-sm font-semibold text-gray-800">
                  {mainFixture.homeTeam} <span className="text-gray-400 mx-1">vs</span> {mainFixture.awayTeam}
                  {mainFixture.date && <p className="text-xs text-gray-400 font-normal mt-1">{formatDate(mainFixture.date)}</p>}
                </div>
              )}

              {/* GOALSANDCARDS: list all fixtures */}
              {isGoalsAndCards && bet.allFixtures?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fixtures ({bet.allFixtures.length})</p>
                  {bet.allFixtures.map((fx) => (
                    <div key={fx._id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="font-medium text-gray-800">{fx.homeTeam} <span className="text-gray-400">vs</span> {fx.awayTeam}</span>
                      <div className="flex items-center gap-2">
                        {fx.scoreHome != null && fx.scoreAway != null && (
                          <span className="font-mono text-xs font-bold text-gray-700">{fx.scoreHome}–{fx.scoreAway}</span>
                        )}
                        <StatusBadge status={fx.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Winner callout */}
              {bet.winner && (
                <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <p className="text-sm font-bold text-yellow-900">Winner</p>
                    <button
                      onClick={() => bet.winner?.id && onUserClick?.(bet.winner.id, bet.winner.username)}
                      className="text-sm text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-800"
                    >
                      {bet.winner.username}
                    </button>
                  </div>
                  {bet.winnerSplit && bet.winnerSplit[0] > 0 && (
                    <div className="ml-auto text-right">
                      <span className="text-sm font-bold text-yellow-800">{bet.winnerSplit[0]}%</span>
                      {bet.winnerSplit.length > 1 && (
                        <p className="text-xs text-yellow-600">{bet.winnerSplit.join(' / ')}%</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-sm font-bold text-gray-800">{bet.amount} {bet.currency?.symbol || ''}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Entry fee</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-sm font-bold text-gray-800">{bet.capacity}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Capacity</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-sm font-bold text-gray-800">{bet.betType}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Bet type</p>
                </div>
              </div>

              {/* Details list */}
              <div className="text-sm space-y-0">
                {bet.league && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">League</span>
                    <span className="flex items-center gap-1.5 font-medium text-gray-800">
                      {bet.league.image && <img src={bet.league.image} alt="" className="w-4 h-4 object-contain" onError={(e) => e.target.remove()} />}
                      {bet.league.name}
                    </span>
                  </div>
                )}
                {bet.currency && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Currency</span>
                    <span className="font-medium text-gray-800">{bet.currency.name}</span>
                  </div>
                )}
                {bet.createdBy && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Created by</span>
                    <button
                      onClick={() => bet.createdBy?.id && onUserClick?.(bet.createdBy.id, bet.createdBy.username)}
                      className="font-medium text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-800"
                    >
                      {bet.createdBy.username}
                    </button>
                  </div>
                )}
                {bet.acceptedBy && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Accepted by</span>
                    <button
                      onClick={() => bet.acceptedBy?.id && onUserClick?.(bet.acceptedBy.id, bet.acceptedBy.username)}
                      className="font-medium text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-800"
                    >
                      {bet.acceptedBy.username}
                    </button>
                  </div>
                )}
                {bet.possibleStartPeriod && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Start period</span>
                    <span className="font-medium text-gray-800">{formatDate(bet.possibleStartPeriod)}</span>
                  </div>
                )}
                {bet.totalFeesDeducted > 0 && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Fees deducted</span>
                    <span className="font-medium text-gray-800">{bet.totalFeesDeducted}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Created</span>
                  <span className="font-medium text-gray-800">{formatDate(bet.createdAt)}</span>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && bet && tab === 'Participants' && (
            <div className="space-y-2">
              {bet.participants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No participants found.</p>
              ) : (
                bet.participants.map((p) => (
                  <ParticipantRow
                    key={p.userId}
                    participant={p}
                    isGoalsAndCards={isGoalsAndCards}
                    onUserClick={onUserClick}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
