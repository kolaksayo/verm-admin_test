import { useState, useRef, useEffect } from 'react';
import api from '../api';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TELEGRAM_CAPTION_LIMIT = 1024;
const TABS = ['Broadcast', 'Direct Messages'];

// ── Shared message + optional-image composer ────────────────────────────────────
// Both tabs reuse this. `captionLimit` (Telegram only) triggers the length
// warning; the DM tab passes null so no cap is shown (WhatsApp captions are long).
function MessageComposer({
  content, setContent, image, imagePreview, imageError,
  onPickImage, onClearImage, fileInputRef, captionLimit,
}) {
  const overCaption = captionLimit != null && !!image && content.length > captionLimit;
  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Campaign Message</p>
        {content && (
          <span className={`text-xs ${overCaption ? 'text-vs-danger font-semibold' : 'text-vs-text-3'}`}>
            {content.length} chars{captionLimit != null && image ? ` / ${captionLimit} caption limit` : ''}
          </span>
        )}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={12}
        placeholder="Paste or write your campaign message here…"
        className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple resize-y"
      />

      {/* Optional image attachment — message text becomes the caption */}
      <div className="mt-3">
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
          onChange={onPickImage} className="hidden" />
        {!image ? (
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium text-vs-text-2 border border-vs-border rounded-lg hover:bg-vs-elevated transition-colors">
            🖼 Attach image <span className="text-vs-text-3 font-normal">(optional — JPEG/PNG/WebP, max 5MB)</span>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <img src={imagePreview} alt="attachment preview"
              className="w-16 h-16 object-cover rounded-lg border border-vs-border" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-vs-text truncate">{image.name}</p>
              <p className="text-xs text-vs-text-3">{(image.size / 1024).toFixed(0)} KB — message text becomes the caption</p>
            </div>
            <button type="button" onClick={onClearImage} aria-label="Remove image"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-vs-text-3 hover:text-vs-danger hover:bg-vs-elevated transition-colors">
              ✕
            </button>
          </div>
        )}
        {imageError && <p className="text-xs text-vs-danger mt-1.5">{imageError}</p>}
        {overCaption && (
          <p className="text-xs text-vs-danger mt-1.5">
            Telegram photo captions are limited to {captionLimit} characters. Shorten the message or unselect Telegram.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Reusable image-attachment hook ──────────────────────────────────────────────
function useImageAttachment() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef(null);

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview(null);
    setImageError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      clearImage();
      setImageError('Only JPEG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      clearImage();
      setImageError('Image too large — max 5MB.');
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
    setImageError('');
  };

  return { image, imagePreview, imageError, fileInputRef, clearImage, handleImagePick };
}

// ── Broadcast tab (Telegram / WhatsApp group / channel) ─────────────────────────
function BroadcastTab() {
  const [content, setContent]         = useState('');
  const [chTelegram, setChTelegram]   = useState(true);
  const [chTgChannel, setChTgChannel] = useState(false);
  const [chWaGroup, setChWaGroup]     = useState(true);
  const [chWaChannel, setChWaChannel] = useState(true);
  const [avail, setAvail]             = useState(null);
  const [sending, setSending]         = useState(false);
  const [results, setResults]         = useState(null);
  const img = useImageAttachment();

  const handleSend = async () => {
    if (!content.trim()) return;
    const channels = [];
    if (chTelegram)  channels.push('telegram');
    if (chTgChannel) channels.push('telegram_channel');
    if (chWaGroup)   channels.push('whatsapp_group');
    if (chWaChannel) channels.push('whatsapp_channel');
    if (!channels.length) return;

    setSending(true); setResults(null);
    try {
      let r;
      if (img.image) {
        const fd = new FormData();
        fd.append('content', content);
        fd.append('channels', JSON.stringify(channels));
        fd.append('image', img.image);
        r = await api.post('/campaigns/send', fd);
      } else {
        r = await api.post('/campaigns/send', { content, channels });
      }
      setResults(r.data.results || {});
    } catch (err) {
      setResults({ _error: err.response?.data?.error || 'Request failed' });
    } finally {
      setSending(false);
    }
  };

  // The channel picker reflects what is actually set up, so an unconfigured
  // destination cannot be selected into a send that would silently fail.
  useEffect(() => {
    api.get('/campaigns/channels')
      .then((r) => {
        setAvail(r.data);
        const usable = (k) => r.data[k]?.configured && r.data[k]?.enabled;
        // Turn off anything selected by default that isn't usable.
        if (!usable('telegram'))         setChTelegram(false);
        if (!usable('whatsapp_group'))   setChWaGroup(false);
        if (!usable('whatsapp_channel')) setChWaChannel(false);
        // The Telegram channel is opt-in, so only offer it pre-ticked when ready.
        if (usable('telegram_channel'))  setChTgChannel(true);
      })
      .catch(() => setAvail(null));   // fall back to leaving every box selectable
  }, []);

  const usable = (k) => !avail || (avail[k]?.configured && avail[k]?.enabled);
  const anyTelegram = chTelegram || chTgChannel;
  const captionTooLongForTelegram = !!img.image && anyTelegram && content.length > TELEGRAM_CAPTION_LIMIT;
  const canSend = !sending && content.trim().length > 0
    && (chTelegram || chTgChannel || chWaGroup || chWaChannel) && !captionTooLongForTelegram;

  const CHANNEL_LABELS = {
    telegram:        'Telegram',
    telegram_channel:'Telegram Channel',
    whatsapp_group:  'WhatsApp Group',
    whatsapp_channel:'WhatsApp Channel',
  };

  return (
    <div className="max-w-2xl space-y-5">
      <MessageComposer
        content={content} setContent={setContent}
        image={img.image} imagePreview={img.imagePreview} imageError={img.imageError}
        onPickImage={img.handleImagePick} onClearImage={img.clearImage}
        fileInputRef={img.fileInputRef} captionLimit={TELEGRAM_CAPTION_LIMIT}
      />

      {/* Channels + Send */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Send To</p>

        <div className="flex flex-wrap gap-3 mb-5">
          {[
            { key: 'telegram',         label: 'Telegram',          checked: chTelegram,  set: setChTelegram  },
            { key: 'telegram_channel', label: 'Telegram Channel',  checked: chTgChannel, set: setChTgChannel },
            { key: 'whatsapp_group',   label: 'WhatsApp Group',    checked: chWaGroup,   set: setChWaGroup   },
            { key: 'whatsapp_channel', label: 'WhatsApp Channel',  checked: chWaChannel, set: setChWaChannel },
          ].map(({ key, label, checked, set }) => {
            const ok = usable(key);
            return (
              <label key={key}
                title={ok ? undefined : 'Not configured or disabled — set it up in Notification Center → Settings'}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border transition-colors select-none ${
                  !ok
                    ? 'border-vs-border text-vs-text-3 opacity-40 cursor-not-allowed'
                    : checked
                      ? 'border-vs-purple/50 bg-vs-purple/10 text-vs-text cursor-pointer'
                      : 'border-vs-border text-vs-text-3 hover:bg-vs-elevated cursor-pointer'
                }`}>
                <input type="checkbox" checked={checked && ok} disabled={!ok}
                  onChange={(e) => set(e.target.checked)}
                  className="w-4 h-4 accent-purple-500" />
                <span className="text-sm font-medium">{label}</span>
              </label>
            );
          })}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={handleSend} disabled={!canSend}
            className="px-6 py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
            {sending ? 'Sending…' : '📣 Send Campaign'}
          </button>

          {results && (
            <div className="flex items-center gap-4 flex-wrap text-xs">
              {results._error && <span className="text-vs-danger">{results._error}</span>}
              {Object.entries(results).filter(([k]) => k !== '_error').map(([key, r]) => (
                <span key={key} className={r.ok ? 'text-vs-success' : 'text-vs-danger'}>
                  {CHANNEL_LABELS[key] || key}: {r.ok ? '✓ Sent' : (r.reason || 'Failed')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-vs-text-3">
        Configure WhatsApp Group ID, Channel ID, and Telegram in{' '}
        <a href="/notifications" className="text-vs-purple-light hover:underline">Notification Center → Channels</a>.
      </p>
    </div>
  );
}

// ── Direct Messages tab (WhatsApp DM to picked users) ───────────────────────────
function maskPhone(m) {
  if (!m) return '—';
  const s = String(m);
  return s.length <= 4 ? s : `${s.slice(0, 4)}•••${s.slice(-2)}`;
}

function DirectMessagesTab() {
  const [content, setContent] = useState('');
  const [search, setSearch]   = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState([]); // [{ id, username, mobile }]
  const [sending, setSending]     = useState(false);
  const [summary, setSummary]     = useState(null); // { sent, failed, results } | { _error }
  const [showDetail, setShowDetail] = useState(false);
  const img = useImageAttachment();

  // Debounced recipient search.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setMatches([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get('/campaigns/recipients', { params: { search: q } })
        .then((r) => setMatches(r.data || []))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const addRecipient = (u) => {
    setSelected((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));
  };
  const removeRecipient = (id) => setSelected((prev) => prev.filter((x) => x.id !== id));

  const handleSend = async () => {
    if (!content.trim() || !selected.length) return;
    setSending(true); setSummary(null); setShowDetail(false);
    try {
      const fd = new FormData();
      fd.append('content', content);
      fd.append('userIds', JSON.stringify(selected.map((u) => u.id)));
      if (img.image) fd.append('image', img.image);
      const r = await api.post('/campaigns/send-dm', fd);
      setSummary(r.data);
    } catch (err) {
      setSummary({ _error: err.response?.data?.error || 'Request failed' });
    } finally {
      setSending(false);
    }
  };

  const canSend = !sending && content.trim().length > 0 && selected.length > 0;
  const selectedIds = new Set(selected.map((u) => u.id));

  return (
    <div className="max-w-2xl space-y-5">
      <MessageComposer
        content={content} setContent={setContent}
        image={img.image} imagePreview={img.imagePreview} imageError={img.imageError}
        onPickImage={img.handleImagePick} onClearImage={img.clearImage}
        fileInputRef={img.fileInputRef} captionLimit={null}
      />

      {/* Recipients */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Recipients</p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by username, email, or phone…"
          className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
        />

        {/* Search results */}
        {search.trim().length >= 2 && (
          <div className="mt-2 border border-vs-border rounded-lg divide-y divide-vs-border max-h-56 overflow-y-auto">
            {searching ? (
              <p className="px-3 py-2 text-xs text-vs-text-3">Searching…</p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-2 text-xs text-vs-text-3">No users with a phone number match “{search.trim()}”.</p>
            ) : (
              matches.map((u) => {
                const added = selectedIds.has(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => addRecipient(u)} disabled={added}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                      added ? 'opacity-40 cursor-default' : 'hover:bg-vs-elevated'
                    }`}>
                    <span className="text-sm text-vs-text truncate">{u.username || u.email || u.id}</span>
                    <span className="text-xs text-vs-text-3 ml-3 flex-shrink-0">
                      {maskPhone(u.mobile)}{added ? ' · added' : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Selected chips */}
        <div className="mt-3">
          <p className="text-xs text-vs-text-3 mb-2">
            {selected.length ? `${selected.length} recipient${selected.length !== 1 ? 's' : ''} selected` : 'No recipients selected yet'}
          </p>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map((u) => (
                <span key={u.id}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-vs-purple/10 border border-vs-purple/40 text-xs text-vs-text">
                  {u.username || u.email || maskPhone(u.mobile)}
                  <button type="button" onClick={() => removeRecipient(u.id)} aria-label={`Remove ${u.username || u.id}`}
                    className="w-4 h-4 flex items-center justify-center rounded-full text-vs-text-3 hover:text-vs-danger hover:bg-vs-elevated transition-colors">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Send */}
        <div className="flex items-center gap-4 flex-wrap mt-5">
          <button onClick={handleSend} disabled={!canSend}
            className="px-6 py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
            {sending ? 'Sending…' : '💬 Send DM'}
          </button>

          {summary && (
            summary._error ? (
              <span className="text-xs text-vs-danger">{summary._error}</span>
            ) : (
              <div className="text-xs">
                <span className={summary.sent ? 'text-vs-success' : 'text-vs-text-3'}>✓ {summary.sent} sent</span>
                <span className="text-vs-text-3"> · </span>
                <span className={summary.failed ? 'text-vs-danger' : 'text-vs-text-3'}>{summary.failed} failed</span>
                {' '}
                <button type="button" onClick={() => setShowDetail((v) => !v)}
                  className="text-vs-purple-light hover:underline ml-1">
                  {showDetail ? 'hide' : 'details'}
                </button>
              </div>
            )
          )}
        </div>

        {summary && !summary._error && showDetail && (
          <div className="mt-3 border border-vs-border rounded-lg divide-y divide-vs-border max-h-56 overflow-y-auto">
            {summary.results.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span className="text-vs-text-2 truncate">{r.username || r.id}</span>
                <span className={r.ok ? 'text-vs-success ml-3 flex-shrink-0' : 'text-vs-danger ml-3 flex-shrink-0'}>
                  {r.ok ? '✓ Sent' : (r.reason || 'Failed')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-vs-text-3">
        DMs use the Direct-Message WhatsApp connection. Configure it in{' '}
        <a href="/notifications" className="text-vs-purple-light hover:underline">Notification Center → Direct Messages</a>.
      </p>
    </div>
  );
}

export default function CampaignsPage() {
  const [tab, setTab] = useState('Broadcast');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Campaigns</h1>
        <p className="text-sm text-vs-text-3 mt-1">Broadcast to your channels or send WhatsApp DMs to selected users</p>
      </div>

      <div className="flex gap-1 mb-6 bg-vs-elevated rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? 'bg-vs-card text-vs-text shadow-sm' : 'text-vs-text-3 hover:text-vs-text'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Broadcast' ? <BroadcastTab /> : <DirectMessagesTab />}
    </div>
  );
}
