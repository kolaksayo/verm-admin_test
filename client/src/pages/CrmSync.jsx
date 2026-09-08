import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';

// Pushes dashboard contacts to Twenty CRM through an n8n webhook.
// The admin never talks to Twenty directly — n8n owns the CRM credentials and
// the field mapping, so the CRM side can change without a deploy here.

const input = 'w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple';

function explainError(err) {
  if (!err) return 'Unknown error';
  if (err === 'not_configured') return 'No webhook URL saved yet.';
  if (err === 'timeout') return 'n8n did not respond in time — check the workflow is active.';
  if (/^HTTP 404/.test(err)) return `${err} — the webhook path is wrong, or the workflow is not active (test URLs only accept one call after you press "Test step").`;
  if (/^HTTP 401|^HTTP 403/.test(err)) return `${err} — the workflow rejected the signature. Check the shared secret matches.`;
  if (/^HTTP 5/.test(err)) return `${err} — the workflow errored. Open the n8n execution log for the failing node.`;
  return err;
}

export default function CrmSync() {
  const [cfg, setCfg]             = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [secret, setSecret]       = useState('');
  const [batchSize, setBatchSize] = useState(50);
  const [callingCode, setCallingCode] = useState('234');
  const [rateLimit, setRateLimit] = useState(100);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [segments, setSegments]   = useState([]);
  const [counts, setCounts]       = useState(null);
  const [totalContacts, setTotalContacts] = useState(null);
  const [picked, setPicked]       = useState([]);      // empty = all contacts
  const [loadingSegs, setLoadingSegs] = useState(false);

  const [job, setJob]             = useState(null);
  const [starting, setStarting]   = useState(false);
  const [error, setError]         = useState('');
  const [showFailed, setShowFailed] = useState(false);
  const [failedRows, setFailedRows] = useState([]);
  const pollRef = useRef(null);

  const loadConfig = useCallback(async () => {
    try {
      const r = await api.get('/n8n/config');
      setCfg(r.data);
      setWebhookUrl(r.data.webhookUrl || '');
      setBatchSize(r.data.batchSize ?? 20);
      setRateLimit(r.data.rateLimitPerMin ?? 100);
      setCallingCode(r.data.callingCode || '234');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load CRM sync settings');
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/n8n/sync/status');
      setJob(r.data.idle ? null : r.data);
      if (r.data.idle || r.data.running === false) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        loadConfig();
      }
    } catch { /* transient */ }
  }, [loadConfig]);

  const loadSegments = useCallback(async (withCounts = true) => {
    setLoadingSegs(true);
    try {
      const r = await api.get('/n8n/segments', { params: withCounts ? {} : { counts: 0 } });
      setSegments(r.data.segments || []);
      setCounts(r.data.counts || null);
      setTotalContacts(r.data.total ?? null);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load segments');
    } finally {
      setLoadingSegs(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadStatus();
    loadSegments(false);       // definitions first; counts are a full scan
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadConfig, loadStatus, loadSegments]);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(loadStatus, 1500);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setSaveMsg('');
    try {
      await api.post('/n8n/config', {
        webhookUrl, batchSize: Number(batchSize), callingCode,
        rateLimitPerMin: Number(rateLimit),
        secret: secret || undefined,        // blank keeps the stored secret
      });
      setSecret('');
      setSaveMsg('Saved');
      await loadConfig();
    } catch (err) {
      setSaveMsg(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.post('/n8n/test');
      setTestResult(r.data);
    } catch (err) {
      setTestResult({ ok: false, error: err.response?.data?.error || 'Request failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async (mode) => {
    setStarting(true); setError('');
    try {
      const r = await api.post('/n8n/sync', { mode, segments: picked });
      if (!r.data.started) setError(r.data.reason || 'Nothing to push.');
      else { await loadStatus(); startPolling(); }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start sync');
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    try { await api.post('/n8n/sync/cancel'); } catch { /* ignore */ }
    loadStatus();
  };

  const loadFailed = async () => {
    try {
      const r = await api.get('/n8n/logs', { params: { failed: 1, limit: 200 } });
      setFailedRows(r.data.rows || []);
    } catch { /* ignore */ }
  };

  const toggleSeg = (slug) => {
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  };

  const stats = cfg?.stats || { total: 0, pushed: 0, failed: 0 };
  const pct = job && job.total ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-vs-text">CRM Sync</h1>
        <p className="text-sm text-vs-text-3 mt-1">
          Push contacts to Twenty CRM through an n8n workflow. Contacts carry their
          segments, and re-running only sends what has changed.
        </p>
      </div>

      {error && <p className="text-xs text-vs-danger">{error}</p>}

      {/* Connection */}
      <form onSubmit={handleSave} className="bg-vs-card border border-vs-border rounded-xl p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Connection</p>
        <div>
          <label className="text-xs text-vs-text-3 block mb-1">n8n Webhook URL</label>
          <input type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://n8n.example.com/webhook/vermo-contacts" className={input} />
          <p className="text-xs text-vs-text-3 mt-1">
            The production URL from the workflow's Webhook node. The /webhook-test/ URL only
            accepts one call after you press "Test step" in n8n.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Shared secret</label>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder={cfg?.secretSet ? '•••••• (saved)' : 'optional but recommended'} className={input} />
          </div>
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Batch size</label>
            <input type="number" min={1} max={200} value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Twenty rate limit /min</label>
            <input type="number" min={10} max={10000} value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Default calling code</label>
            <input type="text" value={callingCode} onChange={(e) => setCallingCode(e.target.value)}
              placeholder="234" className={input} />
          </div>
        </div>
        <p className="text-xs text-vs-text-3">
          Each contact costs <strong>two</strong> Twenty calls (a lookup, then a create or update),
          so a batch of {batchSize || 0} uses {(Number(batchSize) || 0) * 2} of your {rateLimit || 0}/minute
          budget. Batches are spaced to stay inside it; raise the limit only if you have raised
          Twenty's own.
        </p>
        <p className="text-xs text-vs-text-3">
          The secret signs each batch (<span className="font-mono">x-vermo-signature</span>). Paste the
          same value into the workflow's Config node so it can verify the request.
        </p>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={handleTest} disabled={testing || !cfg?.configured}
            className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
            {testing ? 'Sending…' : 'Send test contact'}
          </button>
          {saveMsg && <p className={`text-xs ${saveMsg === 'Saved' ? 'text-vs-success' : 'text-vs-danger'}`}>{saveMsg}</p>}
          {testResult && (
            <p className={`text-xs ${testResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
              {testResult.ok ? 'Delivered — check Twenty for "Vermo Test Contact".' : explainError(testResult.error)}
            </p>
          )}
        </div>
      </form>

      {/* Segments */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Segments</p>
          <button type="button" onClick={() => loadSegments(true)} disabled={loadingSegs}
            className="px-2.5 py-1 border border-vs-border text-vs-text text-xs rounded-lg hover:bg-vs-border transition-colors disabled:opacity-50">
            {loadingSegs ? 'Counting…' : counts ? 'Refresh counts' : 'Count contacts'}
          </button>
        </div>
        <p className="text-xs text-vs-text-3 mb-3">
          Every contact is tagged with the segments it matches, and those go to the CRM with it.
          Select segments to push only those contacts — leave all unselected to push everyone.
          {totalContacts != null && <> {' '}<span className="text-vs-text">{totalContacts.toLocaleString()}</span> contacts have an email or phone.</>}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {segments.map((s) => {
            const on = picked.includes(s.slug);
            return (
              <label key={s.slug}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors select-none ${
                  on ? 'border-vs-purple/50 bg-vs-purple/10' : 'border-vs-border hover:bg-vs-elevated'
                }`}>
                <input type="checkbox" checked={on} onChange={() => toggleSeg(s.slug)}
                  className="w-4 h-4 mt-0.5 accent-purple-500" />
                <span className="min-w-0">
                  <span className="text-sm text-vs-text block">
                    {s.label}
                    {counts && <span className="text-vs-text-3 font-normal"> — {(counts[s.slug] ?? 0).toLocaleString()}</span>}
                  </span>
                  <span className="text-xs text-vs-text-3 block">{s.description}</span>
                  <span className="text-xs text-vs-text-3 font-mono block">{s.slug}</span>
                </span>
              </label>
            );
          })}
        </div>
        {picked.length > 0 && (
          <p className="text-xs text-vs-text-3 mt-3">
            Pushing contacts in {picked.length} selected segment{picked.length !== 1 ? 's' : ''}.
            {' '}<button type="button" onClick={() => setPicked([])} className="underline hover:text-vs-text">Clear</button>
          </p>
        )}
      </div>

      {/* Push */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-3">Push</p>

        <div className="flex flex-wrap items-center gap-4 text-xs text-vs-text-3 mb-3">
          <span>Pushed: <span className="text-vs-success font-semibold">{stats.pushed.toLocaleString()}</span></span>
          {stats.failed > 0 && (
            <button type="button"
              onClick={() => { const n = !showFailed; setShowFailed(n); if (n) loadFailed(); }}
              className="underline hover:text-vs-text">
              Failed: <span className="text-vs-danger font-semibold">{stats.failed.toLocaleString()}</span>
              <span className="ml-1">{showFailed ? '▲ hide' : '▼ show'}</span>
            </button>
          )}
        </div>

        {showFailed && (
          <div className="mb-4 border border-vs-border rounded-lg max-h-56 overflow-y-auto">
            {failedRows.length === 0 && <p className="text-xs text-vs-text-3 px-3 py-3 text-center">No failures recorded.</p>}
            {failedRows.map((r) => (
              <div key={r.user_id} className="px-3 py-2 border-b border-vs-border last:border-0">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className="text-xs text-vs-text">{r.name || '(no name)'}</p>
                  <p className="text-xs text-vs-text-3 font-mono">{r.email || r.phone || '—'}</p>
                </div>
                <p className="text-xs text-vs-danger mt-0.5">{explainError(r.error)}</p>
              </div>
            ))}
          </div>
        )}

        {job && job.running ? (
          <div className="space-y-2">
            <div className="h-2 bg-vs-elevated rounded-full overflow-hidden">
              <div className="h-full bg-vs-purple transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-vs-text-3">
                Pushing {job.processed.toLocaleString()} / {job.total.toLocaleString()} ({pct}%) —
                {' '}{job.batches} batch{job.batches !== 1 ? 'es' : ''}, {job.failed} failed
                {job.etaMs ? `, about ${Math.max(1, Math.round(job.etaMs / 60000))} min total` : ''}
                {job.rateLimitHits ? ` · paused ${job.rateLimitHits}× for rate limits` : ''}
              </p>
              <button type="button" onClick={handleCancel}
                className="px-2.5 py-1 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => handleSync('changed')} disabled={starting || !cfg?.configured}
              className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {starting ? 'Starting…' : 'Push new & changed'}
            </button>
            {stats.failed > 0 && (
              <button type="button" onClick={() => handleSync('failed')} disabled={starting || !cfg?.configured}
                className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                Retry {stats.failed.toLocaleString()} failed
              </button>
            )}
            <button type="button" onClick={() => handleSync('all')} disabled={starting || !cfg?.configured}
              className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              Push everyone
            </button>
            {job && !job.running && job.finishedAt && (
              <p className="text-xs text-vs-text-3">
                Last run: pushed {job.pushed}, failed {job.failed} across {job.batches} batches
                {job.rateLimitHits ? `, ${job.rateLimitHits} rate-limit pause(s)` : ''}
                {job.error ? ` — ${job.error}` : ''}
              </p>
            )}
            {!cfg?.configured && <p className="text-xs text-vs-text-3">Save a webhook URL to enable syncing.</p>}
          </div>
        )}
        <p className="text-xs text-vs-text-3 mt-3">
          "Push new &amp; changed" skips contacts whose details and segments are unchanged since the
          last successful push, so it is safe to run often. A large first sync is deliberately slow —
          it is paced to Twenty's rate limit and keeps running if you leave the page.
        </p>
      </div>
    </div>
  );
}
