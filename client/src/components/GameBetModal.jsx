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
  const cls = s === 'FINISHED' ? 'bg-vs-elevated text-vs-text-3'
    : s === 'ACTIVE' || s === 'LIVE' ? 'bg-vs-success/10 text-vs-success'
    : s === 'PENDING' ? 'bg-vs-warning/10 text-vs-warning'
    : 'bg-vs-purple/10 text-vs-purple-light';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

function Scoreline({ scoreline, homeTeam, awayTeam }) {
  if (!scoreline) return null;
  return (
    <div className="bg-vs-elevated rounded-xl px-6 py-4 flex items-center justify-between text-vs-text mb-4 border border-vs-border">
      <span className="text-sm font-semibold flex-1 text-left text-vs-text-2">{homeTeam || 'Home'}</span>
      <div className="flex items-center gap-3 mx-4">
        <span className="text-3xl font-bold">{scoreline.home}</span>
        <span className="text-vs-text-3 text-lg">–</span>
        <span className="text-3xl font-bold">{scoreline.away}</span>
      </div>
      <span className="text-sm font-semibold flex-1 text-right text-vs-text-2">{awayTeam || 'Away'}</span>
    </div>
  );
}

function FixtureSelection({ sel }) {
  const hasScored = sel.scoredPlayerEvents?.length > 0 || sel.scoredTimeEvents?.length > 0;
  const hasPicks = sel.players?.length > 0 || sel.times?.length > 0;

  return (
    <div className="rounded-lg border border-vs-border bg-vs-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-vs-elevated border-b border-vs-border">
        <span className="text-xs font-semibold text-vs-text-2">{sel.fixtureLabel}</span>
        <div className="flex items-center gap-2">
          {sel.pointsEarned > 0 && (
            <span className="text-xs font-bold text-vs-success bg-vs-success/10 px-2 py-0.5 rounded-full">
              +{sel.pointsEarned} pts
            </span>
          )}
          <StatusBadge status={sel.status} />
        </div>
      </div>
      <div className="px-3 py-2 space-y-2">
        {hasPicks && (
          <div>
            <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wide mb-1">Picks</p>
            <div className="flex flex-wrap gap-1.5">
              {(sel.players || []).map((pl, i) => (
                <span key={i} className="text-xs bg-vs-purple/15 text-vs-purple-light px-2 py-0.5 rounded-full">
                  {pl.name || pl.id}
                </span>
              ))}
              {(sel.times || []).map((t, i) => (
                <span key={i} className="text-xs bg-vs-lime/10 text-vs-lime px-2 py-0.5 rounded-full">
                  {t}'
                </span>
              ))}
            </div>
          </div>
        )}
        {hasScored && (
          <div>
            <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wide mb-1">Scored events</p>
            <div className="space-y-1">
              {(sel.scoredPlayerEvents || []).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-vs-text-2">
                    <span className="font-medium">{e.player}</span>
                    {e.event && <span className="text-vs-text-3 ml-1">· {e.event}</span>}
                    {e.type && <span className="ml-1 text-vs-text-3 italic">({e.type})</span>}
                  </span>
                  {e.points > 0 && <span className="text-vs-success font-semibold ml-2">+{e.points}</span>}
                </div>
              ))}
              {(sel.scoredTimeEvents || []).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-vs-text-2">
                    <span className="font-medium">{e.minute}'</span>
                    {e.event && <span className="text-vs-text-3 ml-1">· {e.event}</span>}
                    {e.type && <span className="ml-1 text-vs-text-3 italic">({e.type})</span>}
                  </span>
                  {e.points > 0 && <span className="text-vs-success font-semibold ml-2">+{e.points}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {!hasPicks && !hasScored && (
          <p className="text-xs text-vs-text-3 italic">No selections</p>
        )}
      </div>
    </div>
  );
}

function ParticipantRow({ participant, isGoalsAndCards, onUserClick }) {
  const [expanded, setExpanded] = useState(false);
  const hasPointBreakdown = isGoalsAndCards && (
    participant.totalPointPlayer != null || participant.totalPointTime != null
  );

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      participant.isWinner ? 'border-vs-warning/50 bg-vs-warning/5' : 'border-vs-border bg-vs-elevated'
    }`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-vs-hover transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-vs-purple flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {(participant.username || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="text-sm font-semibold text-vs-purple-light hover:text-vs-purple underline decoration-dotted underline-offset-2"
              onClick={(e) => { e.stopPropagation(); if (onUserClick && participant.userId) onUserClick(participant.userId, participant.username); }}
            >
              {participant.username}
            </button>
            {participant.isCreator && (
              <span className="text-xs bg-vs-purple/15 text-vs-purple-light px-1.5 py-0.5 rounded font-medium">Creator</span>
            )}
            {participant.isWinner && (
              <span className="text-xs bg-vs-warning/20 text-vs-warning px-1.5 py-0.5 rounded font-semibold">🏆 Winner</span>
            )}
          </div>
          {!isGoalsAndCards && participant.chosenTeam && (
            <p className="text-xs text-vs-text-3 mt-0.5">Picked: <span className="font-medium text-vs-text-2">{participant.chosenTeam}</span></p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {participant.currentScore != null && (
            <div className="text-right">
              <p className="text-sm font-bold text-vs-text">{participant.currentScore}</p>
              <p className="text-xs text-vs-text-3">pts</p>
            </div>
          )}
          <span className="text-vs-text-3 text-sm">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-vs-border px-4 py-3 bg-vs-card space-y-3">
          {!isGoalsAndCards && (
            participant.chosenTeam
              ? <div className="flex items-center gap-2 text-sm"><span className="text-vs-text-3">Team:</span><span className="font-semibold text-vs-text">{participant.chosenTeam}</span></div>
              : <p className="text-xs text-vs-text-3 italic">No team selection recorded</p>
          )}

          {isGoalsAndCards && (
            <>
              {hasPointBreakdown && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { val: participant.totalPointPlayer, label: 'Player pts' },
                    { val: participant.totalPointTime, label: 'Time pts' },
                    { val: participant.totalPlayerGoalPoints, label: 'Goal pts' },
                    { val: participant.totalPlayerYellowCardPoints, label: 'Yellow pts' },
                    { val: participant.totalPlayerRedCardPoints, label: 'Red pts' },
                  ].filter(x => x.val != null).map(({ val, label }) => (
                    <div key={label} className="bg-vs-elevated rounded-lg px-2 py-1.5 text-center border border-vs-border">
                      <p className="text-sm font-bold text-vs-text">{val}</p>
                      <p className="text-xs text-vs-text-3">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              {participant.fixtureSelections?.length > 0
                ? <div className="space-y-2">{participant.fixtureSelections.map((sel, i) => <FixtureSelection key={i} sel={sel} />)}</div>
                : <p className="text-xs text-vs-text-3 italic">No fixture selections recorded</p>
              }
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-vs-card rounded-2xl border border-vs-border shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vs-border flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">{bet?.betMode || 'Game Bet'}</span>
              {bet?.betType && <span className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">· {bet.betType}</span>}
              {bet?.status && <StatusBadge status={bet.status} />}
            </div>
            <h2 className="text-lg font-bold text-vs-text font-mono">{bookingCode || bet?.bookingCode || '…'}</h2>
          </div>
          <button onClick={onClose} className="text-vs-text-3 hover:text-vs-text text-2xl leading-none transition-colors">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-vs-border flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'text-vs-purple-light border-b-2 border-vs-purple' : 'text-vs-text-3 hover:text-vs-text-2'
              }`}
            >
              {t}
              {t === 'Participants' && bet && <span className="ml-1 text-xs text-vs-text-3">({bet.participantCount})</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {loading && <div className="flex items-center justify-center h-32 text-vs-text-3 text-sm animate-pulse">Loading…</div>}
          {error && <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">{error}</div>}

          {!loading && !error && bet && tab === 'Overview' && (
            <div className="space-y-4">
              {bet.scoreline && mainFixture && (
                <Scoreline scoreline={bet.scoreline} homeTeam={mainFixture.homeTeam} awayTeam={mainFixture.awayTeam} />
              )}

              {mainFixture && !bet.scoreline && (
                <div className="bg-vs-elevated rounded-xl px-4 py-3 text-center text-sm font-semibold text-vs-text border border-vs-border">
                  {mainFixture.homeTeam} <span className="text-vs-text-3 mx-1">vs</span> {mainFixture.awayTeam}
                  {mainFixture.date && <p className="text-xs text-vs-text-3 font-normal mt-1">{formatDate(mainFixture.date)}</p>}
                </div>
              )}

              {isGoalsAndCards && bet.allFixtures?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wide">Fixtures ({bet.allFixtures.length})</p>
                  {bet.allFixtures.map((fx) => (
                    <div key={fx._id} className="flex items-center justify-between bg-vs-elevated rounded-lg px-3 py-2 text-sm border border-vs-border">
                      <span className="font-medium text-vs-text-2">{fx.homeTeam} <span className="text-vs-text-3">vs</span> {fx.awayTeam}</span>
                      <div className="flex items-center gap-2">
                        {fx.scoreHome != null && fx.scoreAway != null && (
                          <span className="font-mono text-xs font-bold text-vs-text">{fx.scoreHome}–{fx.scoreAway}</span>
                        )}
                        <StatusBadge status={fx.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {bet.winner && (
                <div className="flex items-center gap-3 bg-vs-warning/5 border border-vs-warning/30 rounded-xl px-4 py-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <p className="text-sm font-bold text-vs-warning">Winner</p>
                    <button
                      onClick={() => bet.winner?.id && onUserClick?.(bet.winner.id, bet.winner.username)}
                      className="text-sm text-vs-purple-light underline decoration-dotted underline-offset-2 hover:text-vs-purple"
                    >
                      {bet.winner.username}
                    </button>
                  </div>
                  {bet.winnerSplit && bet.winnerSplit[0] > 0 && (
                    <div className="ml-auto text-right">
                      <span className="text-sm font-bold text-vs-warning">{bet.winnerSplit[0]}%</span>
                      {bet.winnerSplit.length > 1 && (
                        <p className="text-xs text-vs-text-3">{bet.winnerSplit.join(' / ')}%</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: `${bet.amount} ${bet.currency?.symbol || ''}`, label: 'Entry fee' },
                  { val: bet.capacity, label: 'Capacity' },
                  { val: bet.betType, label: 'Bet type' },
                ].map(({ val, label }) => (
                  <div key={label} className="bg-vs-elevated rounded-lg px-3 py-2 text-center border border-vs-border">
                    <p className="text-sm font-bold text-vs-text">{val}</p>
                    <p className="text-xs text-vs-text-3 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Details list */}
              <div className="text-sm space-y-0">
                {bet.league && (
                  <div className="flex justify-between py-2 border-b border-vs-border">
                    <span className="text-vs-text-3">League</span>
                    <span className="flex items-center gap-1.5 font-medium text-vs-text-2">
                      {bet.league.image && (
                        <span className="w-5 h-5 rounded bg-white/90 flex items-center justify-center flex-shrink-0 p-0.5 inline-flex">
                          <img src={bet.league.image} alt="" className="w-4 h-4 object-contain" onError={(e) => e.target.parentElement.remove()} />
                        </span>
                      )}
                      {bet.league.name}
                    </span>
                  </div>
                )}
                {bet.currency && (
                  <div className="flex justify-between py-2 border-b border-vs-border">
                    <span className="text-vs-text-3">Currency</span>
                    <span className="font-medium text-vs-text-2">{bet.currency.name}</span>
                  </div>
                )}
                {bet.createdBy && (
                  <div className="flex justify-between py-2 border-b border-vs-border">
                    <span className="text-vs-text-3">Created by</span>
                    <button onClick={() => bet.createdBy?.id && onUserClick?.(bet.createdBy.id, bet.createdBy.username)} className="font-medium text-vs-purple-light underline decoration-dotted underline-offset-2 hover:text-vs-purple">
                      {bet.createdBy.username}
                    </button>
                  </div>
                )}
                {bet.acceptedBy && (
                  <div className="flex justify-between py-2 border-b border-vs-border">
                    <span className="text-vs-text-3">Accepted by</span>
                    <button onClick={() => bet.acceptedBy?.id && onUserClick?.(bet.acceptedBy.id, bet.acceptedBy.username)} className="font-medium text-vs-purple-light underline decoration-dotted underline-offset-2 hover:text-vs-purple">
                      {bet.acceptedBy.username}
                    </button>
                  </div>
                )}
                {bet.possibleStartPeriod && (
                  <div className="flex justify-between py-2 border-b border-vs-border">
                    <span className="text-vs-text-3">Start period</span>
                    <span className="font-medium text-vs-text-2">{formatDate(bet.possibleStartPeriod)}</span>
                  </div>
                )}
                {bet.totalFeesDeducted > 0 && (
                  <div className="flex justify-between py-2 border-b border-vs-border">
                    <span className="text-vs-text-3">Fees deducted</span>
                    <span className="font-medium text-vs-text-2">{bet.totalFeesDeducted}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-vs-text-3">Created</span>
                  <span className="font-medium text-vs-text-2">{formatDate(bet.createdAt)}</span>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && bet && tab === 'Participants' && (
            <div className="space-y-2">
              {bet.participants.length === 0
                ? <p className="text-sm text-vs-text-3 text-center py-8">No participants found.</p>
                : bet.participants.map((p) => (
                    <ParticipantRow key={p.userId} participant={p} isGoalsAndCards={isGoalsAndCards} onUserClick={onUserClick} />
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
