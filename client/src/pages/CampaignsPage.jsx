import { useState, useRef } from 'react';
import api from '../api';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TELEGRAM_CAPTION_LIMIT = 1024;

export default function CampaignsPage() {
  const [content, setContent]         = useState('');
  const [chTelegram, setChTelegram]   = useState(true);
  const [chWaGroup, setChWaGroup]     = useState(true);
  const [chWaChannel, setChWaChannel] = useState(true);
  const [sending, setSending]         = useState(false);
  const [results, setResults]         = useState(null);
  const [image, setImage]             = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError]   = useState('');
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

  const handleSend = async () => {
    if (!content.trim()) return;
    const channels = [];
    if (chTelegram)  channels.push('telegram');
    if (chWaGroup)   channels.push('whatsapp_group');
    if (chWaChannel) channels.push('whatsapp_channel');
    if (!channels.length) return;

    setSending(true); setResults(null);
    try {
      let r;
      if (image) {
        // Multipart when an image is attached — the browser sets the boundary;
        // the shared api instance still adds the Authorization header.
        const fd = new FormData();
        fd.append('content', content);
        fd.append('channels', JSON.stringify(channels));
        fd.append('image', image);
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

  const captionTooLongForTelegram = !!image && chTelegram && content.length > TELEGRAM_CAPTION_LIMIT;
  const canSend = !sending && content.trim().length > 0 && (chTelegram || chWaGroup || chWaChannel) && !captionTooLongForTelegram;

  const CHANNEL_LABELS = {
    telegram:        'Telegram',
    whatsapp_group:  'WhatsApp Group',
    whatsapp_channel:'WhatsApp Channel',
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Campaigns</h1>
        <p className="text-sm text-vs-text-3 mt-1">Paste your campaign message and broadcast it to your channels</p>
      </div>

      <div className="max-w-2xl space-y-5">

        {/* Message */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Campaign Message</p>
            {content && (
              <span className={`text-xs ${captionTooLongForTelegram ? 'text-vs-danger font-semibold' : 'text-vs-text-3'}`}>
                {content.length} chars{image ? ` / ${TELEGRAM_CAPTION_LIMIT} caption limit` : ''}
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

          {/* Optional image attachment */}
          <div className="mt-3">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={handleImagePick} className="hidden" />
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
                <button type="button" onClick={clearImage} aria-label="Remove image"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-vs-text-3 hover:text-vs-danger hover:bg-vs-elevated transition-colors">
                  ✕
                </button>
              </div>
            )}
            {imageError && <p className="text-xs text-vs-danger mt-1.5">{imageError}</p>}
            {captionTooLongForTelegram && (
              <p className="text-xs text-vs-danger mt-1.5">
                Telegram photo captions are limited to {TELEGRAM_CAPTION_LIMIT} characters. Shorten the message or unselect Telegram.
              </p>
            )}
          </div>
        </div>

        {/* Channels + Send */}
        <div className="bg-vs-card border border-vs-border rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Send To</p>

          <div className="flex flex-wrap gap-3 mb-5">
            {[
              { label: 'Telegram',         checked: chTelegram,  set: setChTelegram  },
              { label: 'WhatsApp Group',   checked: chWaGroup,   set: setChWaGroup   },
              { label: 'WhatsApp Channel', checked: chWaChannel, set: setChWaChannel },
            ].map(({ label, checked, set }) => (
              <label key={label}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors select-none ${
                  checked
                    ? 'border-vs-purple/50 bg-vs-purple/10 text-vs-text'
                    : 'border-vs-border text-vs-text-3 hover:bg-vs-elevated'
                }`}>
                <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)}
                  className="w-4 h-4 accent-purple-500" />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button onClick={handleSend} disabled={!canSend}
              className="px-6 py-2.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40">
              {sending ? 'Sending…' : '📣 Send Campaign'}
            </button>

            {results && (
              <div className="flex items-center gap-4 flex-wrap text-xs">
                {results._error && (
                  <span className="text-vs-danger">{results._error}</span>
                )}
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
    </div>
  );
}
