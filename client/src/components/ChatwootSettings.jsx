import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';

// Turns the stored failure codes into something an operator can act on.
// Anything unrecognised is shown verbatim.
const ERROR_HINTS = {
  no_phone_or_email: 'No phone number or email on the account — nothing to sync.',
  not_configured:    'Chatwoot credentials were missing when this ran.',
  timeout:           'Chatwoot did not respond in time — retrying usually clears this.',
  duplicate:         'Chatwoot reports a conflicting contact that could not be matched back — check for an existing contact with this phone or email.',
};

function explainError(err) {
  if (!err) return 'Unknown error';
  if (ERROR_HINTS[err]) return ERROR_HINTS[err];
  if (/^HTTP 4\d\d/.test(err)) return `Chatwoot rejected the contact — ${err}`;
  if (/^HTTP 5\d\d/.test(err)) return `Chatwoot server error — ${err}. Retrying usually clears this.`;
  return err;
}

// Chatwoot contact sync — credentials, connection test, and the bulk push.
// Rendered in Notification Center -> Settings.
export default function ChatwootSettings() {
  const [cfg, setCfg]           = useState(null);
  const [baseUrl, setBaseUrl]   = useState('');
  const [accountId, setAccountId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [inboxId, setInboxId]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [eligible, setEligible] = useState(null);
  const [job, setJob]           = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError]       = useState('');
  const [showFailed, setShowFailed]     = useState(false);
  const [failedRows, setFailedRows]     = useState([]);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [checkingDeleted, setCheckingDeleted] = useState(false);
  const [preview, setPreview]   = useState(null);
  const pollRef = useRef(null);

  const loadConfig = useCallback(async () => {
    try {
      const r = await api.get('/chatwoot/config');
      setCfg(r.data);
      setBaseUrl(r.data.baseUrl || '');
      setAccountId(r.data.accountId || '');
      setInboxId(r.data.inboxId || '');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load Chatwoot settings');
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/chatwoot/sync/status');
      setJob(r.data.idle ? null : r.data);
      // Stop polling once the run finishes, then refresh the totals.
      if (r.data.idle || r.data.running === false) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        loadConfig();
      }
    } catch { /* transient */ }
  }, [loadConfig]);

  useEffect(() => {
    loadConfig();
    loadStatus();
    api.get('/chatwoot/eligible-count').then((r) => setEligible(r.data.count)).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadConfig, loadStatus]);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(loadStatus, 1500);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setSaveMsg('');
    try {
      await api.post('/chatwoot/config', {
        baseUrl, accountId, inboxId,
        apiToken: apiToken || undefined,      // blank keeps the stored token
      });
      setApiToken('');
      setSaveMsg('Saved');
      await loadConfig();
      api.get('/chatwoot/eligible-count').then((r) => setEligible(r.data.count)).catch(() => {});
    } catch (err) {
      setSaveMsg(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await api.post('/chatwoot/test');
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
      await api.post('/chatwoot/sync', { mode });
      setShowFailed(false);
      await loadStatus();
      startPolling();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start sync');
    } finally {
      setStarting(false);
    }
  };

  const loadFailed = useCallback(async () => {
    setLoadingFailed(true);
    try {
      const r = await api.get('/chatwoot/logs', { params: { failed: 1, limit: 500 } });
      setFailedRows(r.data.rows || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load sync errors');
    } finally {
      setLoadingFailed(false);
    }
  }, []);

  // Deletion check runs as preview -> confirm, since marking is hard to undo.
  const handleCheckDeleted = async () => {
    setCheckingDeleted(true); setError(''); setPreview(null);
    try {
      const r = await api.get('/chatwoot/reconcile/preview');
      setPreview(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check for deleted users');
    } finally {
      setCheckingDeleted(false);
    }
  };

  const handleMarkDeleted = async (confirm) => {
    setStarting(true); setError('');
    try {
      const r = await api.post('/chatwoot/reconcile', { confirm });
      setPreview(null);
      if (r.data.started) { await loadStatus(); startPolling(); }
    } catch (err) {
      const d = err.response?.data;
      if (d?.needsConfirmation) setPreview({ ...d, needsConfirmation: true });
      else setError(d?.error || 'Failed to mark deleted contacts');
    } finally {
      setStarting(false);
    }
  };

  const toggleFailed = () => {
    const next = !showFailed;
    setShowFailed(next);
    if (next) loadFailed();
  };

  // Failures are worth triaging outside the browser when there are many.
  const downloadFailedCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      'user_id,name,phone,email,error,attempted_at',
      ...failedRows.map((r) => [r.user_id, r.name, r.phone, r.email, r.error, r.synced_at].map(esc).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'chatwoot-sync-failures.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCancel = async () => {
    try { await api.post('/chatwoot/sync/cancel'); } catch { /* ignore */ }
    loadStatus();
  };

  const toggleAuto = async () => {
    const next = !cfg?.autoSync;
    setCfg((c) => ({ ...c, autoSync: next }));
    try {
      await api.post('/chatwoot/config', { autoSync: next });
    } catch {
      setCfg((c) => ({ ...c, autoSync: !next }));   // revert
    }
  };

  const stats = cfg?.stats || { total: 0, synced: 0, failed: 0 };
  const pct = job && job.total ? Math.round((job.processed / job.total) * 100) : 0;
  const input = 'w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text font-mono placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple';

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Chatwoot Contacts</p>
      <p className="text-xs text-vs-text-3 mb-4">
        Push dashboard users into Chatwoot as contacts. Contacts are matched on the user's ID, so
        syncing repeatedly updates existing contacts instead of creating duplicates.
      </p>

      {error && <p className="text-xs text-vs-danger mb-3">{error}</p>}

      <form onSubmit={handleSave} className="space-y-3 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Base URL</label>
            <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://app.chatwoot.com" className={input} />
          </div>
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Account ID</label>
            <input type="text" value={accountId} onChange={(e) => setAccountId(e.target.value)}
              placeholder="1" className={input} />
          </div>
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Access Token</label>
            <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)}
              placeholder={cfg?.apiTokenSet ? `${cfg.apiToken} (saved)` : 'from Chatwoot Profile Settings'} className={input} />
            <p className="text-xs text-vs-text-3 mt-1">
              Chatwoot → Profile Settings → Access Token, from an administrator account.
              {cfg?.apiTokenSet && ' Leave blank to keep the current token.'}
            </p>
          </div>
          <div>
            <label className="text-xs text-vs-text-3 block mb-1">Inbox ID (optional)</label>
            <input type="text" value={inboxId} onChange={(e) => setInboxId(e.target.value)}
              placeholder="leave blank for none" className={input} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={handleTest} disabled={testing || !cfg?.configured}
            className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {saveMsg && <p className={`text-xs ${saveMsg === 'Saved' ? 'text-vs-success' : 'text-vs-danger'}`}>{saveMsg}</p>}
          {testResult && (
            <p className={`text-xs ${testResult.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
              {testResult.ok ? 'Connected!' : (testResult.error || 'Failed')}
            </p>
          )}
        </div>
      </form>

      <div className="border-t border-vs-border pt-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-medium text-vs-text">Auto-sync new signups</p>
            <p className="text-xs text-vs-text-3 mt-0.5">
              New users with a phone or email are pushed to Chatwoot automatically, in batches, every few minutes.
            </p>
          </div>
          <button type="button" onClick={toggleAuto}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${cfg?.autoSync ? 'bg-vs-success' : 'bg-vs-elevated border border-vs-border'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cfg?.autoSync ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-vs-text-3 mb-3">
          {eligible != null && <span>Eligible contacts: <span className="text-vs-text font-semibold">{eligible.toLocaleString()}</span></span>}
          <span>Synced: <span className="text-vs-success font-semibold">{stats.synced.toLocaleString()}</span></span>
          {stats.failed > 0 && (
            <button type="button" onClick={toggleFailed} className="underline hover:text-vs-text transition-colors">
              Failed: <span className="text-vs-danger font-semibold">{stats.failed.toLocaleString()}</span>
              <span className="ml-1 text-vs-text-3">{showFailed ? '▲ hide' : '▼ show details'}</span>
            </button>
          )}
        </div>

        {showFailed && (
          <div className="mb-4 border border-vs-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-vs-elevated">
              <p className="text-xs text-vs-text-3">
                {loadingFailed ? 'Loading…' : `${failedRows.length.toLocaleString()} contact(s) failed their last sync`}
              </p>
              <div className="flex items-center gap-2">
                {failedRows.length > 0 && (
                  <button type="button" onClick={downloadFailedCsv}
                    className="px-2.5 py-1 border border-vs-border text-vs-text text-xs rounded-lg hover:bg-vs-border transition-colors">
                    Download CSV
                  </button>
                )}
                <button type="button" onClick={loadFailed} disabled={loadingFailed}
                  className="px-2.5 py-1 border border-vs-border text-vs-text text-xs rounded-lg hover:bg-vs-border transition-colors disabled:opacity-50">
                  Refresh
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {!loadingFailed && failedRows.length === 0 && (
                <p className="text-xs text-vs-text-3 px-3 py-4 text-center">No failures recorded.</p>
              )}
              {failedRows.map((r) => (
                <div key={r.user_id} className="px-3 py-2 border-t border-vs-border">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p className="text-xs font-medium text-vs-text">{r.name || '(no name)'}</p>
                    <p className="text-xs text-vs-text-3 font-mono">{r.phone || r.email || '—'}</p>
                  </div>
                  <p className="text-xs text-vs-danger mt-0.5">{explainError(r.error)}</p>
                  <p className="text-xs text-vs-text-3 mt-0.5 font-mono break-all">
                    {r.user_id}{r.error && explainError(r.error) !== r.error ? ` · ${r.error}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {job && job.running ? (
          <div className="space-y-2">
            <div className="h-2 bg-vs-elevated rounded-full overflow-hidden">
              <div className="h-full bg-vs-purple transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-vs-text-3">
                Syncing {job.processed.toLocaleString()} / {job.total.toLocaleString()} ({pct}%) —
                {' '}created {job.created}, updated {job.updated}, failed {job.failed}
              </p>
              <button type="button" onClick={handleCancel}
                className="px-2.5 py-1 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => handleSync('new')} disabled={starting || !cfg?.configured}
              className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {starting ? 'Starting…' : 'Sync all contacts'}
            </button>
            {stats.failed > 0 && (
              <button type="button" onClick={() => handleSync('failed')} disabled={starting || !cfg?.configured}
                className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                Retry {stats.failed.toLocaleString()} failed
              </button>
            )}
            <button type="button" onClick={() => handleSync('all')} disabled={starting || !cfg?.configured}
              className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              Re-sync everyone
            </button>
            {job && !job.running && job.finishedAt && (
              <p className="text-xs text-vs-text-3">
                Last run: created {job.created}, updated {job.updated}, failed {job.failed}
                {job.skipped ? `, skipped ${job.skipped}` : ''}
                {job.error ? ` — ${job.error}` : ''}
              </p>
            )}
            {!cfg?.configured && <p className="text-xs text-vs-text-3">Save your Chatwoot credentials to enable syncing.</p>}
          </div>
        )}
        <div className="border-t border-vs-border mt-4 pt-4">
          <p className="text-sm font-medium text-vs-text">Deleted users</p>
          <p className="text-xs text-vs-text-3 mt-0.5 mb-3">
            Finds synced contacts whose user no longer exists in the app and labels them
            <span className="font-mono text-vs-text"> deleted-from-app</span> in Chatwoot.
            Contacts are never removed, so conversation history is kept.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleCheckDeleted}
              disabled={checkingDeleted || starting || !cfg?.configured || (job && job.running)}
              className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              {checkingDeleted ? 'Checking…' : 'Check for deleted users'}
            </button>
            {preview && preview.vanished === 0 && (
              <p className="text-xs text-vs-success">No deleted users found — everything is up to date.</p>
            )}
          </div>

          {preview && preview.vanished > 0 && (
            <div className={`mt-3 border rounded-lg p-3 ${preview.needsConfirmation ? 'border-vs-danger' : 'border-vs-border'}`}>
              <p className="text-xs text-vs-text">
                <span className="font-semibold">{preview.vanished.toLocaleString()}</span> contact(s)
                {preview.checked ? ` of ${preview.checked.toLocaleString()} synced` : ''} no longer exist in the app.
              </p>
              {preview.needsConfirmation && (
                <p className="text-xs text-vs-danger mt-1">
                  That is an unusually large share. If the app database was unreachable or only partly
                  loaded, this could wrongly flag live customers — check before confirming.
                </p>
              )}
              {preview.sample?.length > 0 && (
                <div className="max-h-32 overflow-y-auto mt-2 space-y-0.5">
                  {preview.sample.map((r) => (
                    <p key={r.user_id} className="text-xs text-vs-text-3">
                      {r.name || '(no name)'} <span className="font-mono">· {r.user_id}</span>
                    </p>
                  ))}
                  {preview.vanished > preview.sample.length && (
                    <p className="text-xs text-vs-text-3">…and {(preview.vanished - preview.sample.length).toLocaleString()} more</p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <button type="button" onClick={() => handleMarkDeleted(preview.needsConfirmation)} disabled={starting}
                  className={`px-3 py-2 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${preview.needsConfirmation ? 'bg-vs-danger hover:bg-vs-danger/90' : 'bg-vs-purple hover:bg-vs-purple/90'}`}>
                  {preview.needsConfirmation ? `Yes, mark all ${preview.vanished.toLocaleString()}` : `Mark ${preview.vanished.toLocaleString()} as deleted`}
                </button>
                <button type="button" onClick={() => setPreview(null)}
                  className="px-3 py-2 bg-vs-elevated hover:bg-vs-border border border-vs-border text-vs-text text-xs rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-vs-text-3 mt-3">
          "Sync all contacts" pushes everyone not yet synced. "Re-sync everyone" re-pushes all contacts,
          refreshing names and numbers in Chatwoot.
        </p>
      </div>
    </div>
  );
}
