import WagerDetailsModal from '../components/WagerDetailsModal';

// Off-screen render harness for the Wager Details card.
//
// server/wagerCard.js points headless Chromium at /wager-card?d=<base64url JSON>
// and screenshots #wager-panel. All data arrives in the URL — this route makes
// no API call and needs no auth, so it renders identically headlessly and never
// exposes anything the caller didn't already supply.
function decodeContest(raw) {
  if (!raw) return null;
  try {
    // base64url → base64, then UTF-8 safe decode.
    const b64  = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bin  = atob(b64);
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function WagerCardFrame() {
  const params  = new URLSearchParams(window.location.search);
  const contest = decodeContest(params.get('d'));
  const mode    = params.get('mode') === 'current' ? 'current' : 'maximum';

  if (!contest) {
    // Visible marker so a malformed URL fails loudly in the screenshot instead
    // of silently producing a blank image.
    return <div id="wager-error" style={{ color: '#fff', padding: 16, fontFamily: 'sans-serif' }}>Invalid or missing contest data</div>;
  }

  return (
    <div style={{ display: 'inline-block', background: 'transparent' }}>
      <WagerDetailsModal contest={contest} mode={mode} capture onClose={() => {}} />
    </div>
  );
}
