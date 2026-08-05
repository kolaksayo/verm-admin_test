import { useState } from 'react';
import { computePrizes, minPlayersToStart } from '../config/prizeTiers';
import { formatMoney } from '../utils/currency';

// Prize Projector is USD-only per product decision — the contest's own currency
// is intentionally ignored for display here.
const USD = { name: 'USD', symbol: '$' };

// Exact Figma palette (also the app's vs-* tokens).
const C = {
  globe:    '#1C1B20',
  island:   '#24232A',
  onIsland: '#313038',
  purple:   '#775CDF',
  lime:     '#B5DB1C',
  text:     '#FFFFFF',
  text2:    '#E2E2E2',
  text3:    '#9F9F9F',
};

const WAGER_TYPE_LABELS = {
  GOALSANDCARDS: 'Goals & Cards',
  SHOTSOFFGOAL:  'Shots off Goal',
  WINNER:        'Winner',
};

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function wagerTypeLabel(betType) {
  if (!betType) return '—';
  return WAGER_TYPE_LABELS[betType] || titleCase(betType);
}
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function fmtGameDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── iOS status-bar glyphs ─────────────────────────────────────────────────────
function Signal() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill={C.text} aria-hidden>
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="4.7" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="9.4" y="3" width="3" height="9" rx="1" />
      <rect x="14.1" y="0.5" width="3" height="11.5" rx="1" />
    </svg>
  );
}
function Wifi() {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden>
      <path d="M2.4 4.7a9 9 0 0112.2 0" stroke={C.text} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.8 7.1a5.4 5.4 0 017.4 0" stroke={C.text} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.5 9.5a1.3 1.3 0 100 2.6 1.3 1.3 0 000-2.6z" fill={C.text} />
    </svg>
  );
}
function Battery() {
  return (
    <svg width="28" height="13" viewBox="0 0 28 13" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={C.text} opacity="0.4" />
      <rect x="2" y="2" width="18" height="9" rx="2" fill={C.text} />
      <path d="M25.3 4.2c.9.4.9 4.2 0 4.6V4.2z" fill={C.text} opacity="0.5" />
    </svg>
  );
}

// ── Team crest — logo with first-initial circle fallback (FixturesView pattern) ──
function Crest({ logo, name }) {
  const [failed, setFailed] = useState(false);
  const showImg = logo && !failed;
  return (
    <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {showImg ? (
        <img
          src={logo}
          alt={name || ''}
          style={{ width: 40, height: 40, objectFit: 'contain' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: C.onIsland,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.text3, fontSize: 13, fontWeight: 700,
        }}>
          {name?.[0]?.toUpperCase() || '?'}
        </div>
      )}
    </div>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────────
function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2" style={{ height: 30 }}>
      <span style={{ fontSize: 14, color: C.text3, letterSpacing: '-0.01em' }}>{label}</span>
      <span style={{ fontSize: 14, color: C.text, letterSpacing: '-0.01em', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// `capture` renders the card for off-screen screenshotting (see
// server/wagerCard.js): panel only — no backdrop, no height cap and no inner
// scrolling — so the full card is captured at its natural height.
export default function WagerDetailsModal({ contest, mode = 'maximum', onClose, capture = false }) {
  if (!contest) return null;

  // Pot basis chosen on the list page (no toggle inside the pop-up):
  //   Maximum → entry fee × capacity;  Current → entry fee × players joined.
  const isMax = mode !== 'current';
  const pot = isMax
    ? contest.amount * contest.capacity
    : contest.amount * contest.participantCount;
  const modeLabel = isMax ? 'Maximum payout' : 'Current payout';
  const prizes = computePrizes(pot, contest.capacity);
  const homeTeam = contest.match?.homeTeam;
  const awayTeam = contest.match?.awayTeam;
  const hasTeams = homeTeam && awayTeam;

  const chip = (label, active) => (
    <span
      key={label}
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '9px 14px',
        fontSize: 14, borderRadius: 8, whiteSpace: 'nowrap', userSelect: 'none',
        letterSpacing: '-0.01em',
        background: active ? C.purple : C.island,
        color: C.text, fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </span>
  );

  const panel = (
      <div
        id="wager-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 375, maxWidth: '100%',
          ...(capture ? {} : { maxHeight: '92vh' }),
          background: C.globe, borderRadius: 30, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          boxShadow: capture ? 'none' : '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Top app bar (island): status bar + nav row ── */}
        <div style={{ background: C.island, borderBottom: `0.5px solid ${C.onIsland}` }}>
          {/* Status bar */}
          <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 21px' }}>
            <span style={{ color: C.text, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>9:41</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Signal /><Wifi /><Battery />
            </div>
          </div>
          {/* Nav row */}
          <div style={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center' }}>
            <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', left: 8, padding: 8, color: C.text2, display: 'flex' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.text2} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <p style={{ flex: 1, textAlign: 'center', color: C.text, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>
              Wager – {contest.bookingCode || '—'}
            </p>
            <span aria-hidden style={{ position: 'absolute', right: 12, padding: '10px 9px', display: 'flex', color: C.text }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={C.text} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.6 8.3A8 8 0 004.1 4.6M2.4 11.7A8 8 0 0015.9 15.4" />
                <path d="M17.5 3v3.5H14" /><path d="M2.5 17v-3.5H6" />
              </svg>
            </span>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ overflowY: capture ? 'visible' : 'auto', flex: 1 }}>
          {/* Chips */}
          <div style={{ display: 'flex', gap: 12, padding: '12px 16px' }}>
            {chip('Leader Board', false)}
            {chip('Selections', false)}
            {chip('Wager Details', true)}
          </div>

          {/* Match crest row + selected payout basis (label only — no toggle) */}
          <div style={{ padding: '0 16px 12px' }}>
            {hasTeams && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Crest logo={contest.match?.homeLogo} name={homeTeam} />
                <span style={{ fontSize: 14, fontWeight: 500, color: C.text, letterSpacing: '-0.01em', textAlign: 'center' }}>
                  {homeTeam} <span style={{ color: C.text3, fontWeight: 400 }}>vs</span> {awayTeam}
                </span>
                <Crest logo={contest.match?.awayLogo} name={awayTeam} />
              </div>
            )}
            <p style={{ marginTop: hasTeams ? 8 : 0, textAlign: 'center', fontSize: 12, fontWeight: 500, color: C.purple, letterSpacing: '-0.01em' }}>
              {modeLabel}
            </p>
          </div>

          {/* Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 16px 20px' }}>
            {/* Card 1 — details */}
            <div style={{ background: C.island, borderRadius: 8, padding: '8px 12px' }}>
              <DetailRow label="Wager Code" value={contest.bookingCode || '—'} />
              <DetailRow label="Players" value={`${contest.participantCount.toLocaleString()} / ${contest.capacity.toLocaleString()}`} />
              <DetailRow label="Tournament" value={contest.betMode ? titleCase(contest.betMode) : '—'} />
              <DetailRow label="Wager Type" value={wagerTypeLabel(contest.betType)} />
              <DetailRow label="First Game" value={fmtGameDate(contest.firstGame)} />
              <DetailRow label="Last Game" value={fmtGameDate(contest.lastGame)} />
            </div>

            {/* Card 2 — stake & prizes */}
            <div style={{ background: C.island, borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: `1px solid ${C.onIsland}` }}>
                <span style={{ fontSize: 14, color: C.text3, letterSpacing: '-0.01em' }}>Stake</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.lime, letterSpacing: '-0.01em' }}>{formatMoney(contest.amount, USD)}</span>
              </div>
              <div style={{ paddingTop: 8 }}>
                {prizes.map((row) => (
                  <div key={row.position} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 26 }}>
                    <span style={{ fontSize: 14, color: C.text3, letterSpacing: '-0.01em' }}>{ordinal(row.position)} Place</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: C.text3, letterSpacing: '-0.01em' }}>{row.pct}%</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.lime, letterSpacing: '-0.01em' }}>{formatMoney(row.amount, USD)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3 — wager rules */}
            <div style={{ background: C.island, borderRadius: 8, padding: '12px' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: C.text, letterSpacing: '-0.01em', marginBottom: 8 }}>Wager Rules</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  `Minimum ${minPlayersToStart(contest.capacity)} players required to start`,
                  `Top ${prizes.length} player${prizes.length !== 1 ? 's' : ''} win prizes`,
                  'No refunds after wager confirmation',
                ].map((rule) => (
                  <div key={rule} style={{ display: 'flex', gap: 8, fontSize: 14, color: C.text3, letterSpacing: '-0.01em' }}>
                    <span aria-hidden>•</span><span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
  );

  if (capture) return panel;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      {panel}
    </div>
  );
}
