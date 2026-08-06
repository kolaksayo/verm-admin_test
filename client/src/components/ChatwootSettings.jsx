import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';

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

  const handleSync = async (resync) => {
    setStarting(true); setError('');
    try {
      await api.post('/chatwoot/sync', { resync });
      await loadStatus();
      startPolling();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start sync');
    } finally {
      setStarting(false);
    }
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
          {stats.failed > 0 && <span>Failed: <span className="text-vs-danger font-semibold">{stats.failed.toLocaleString()}</span></span>}
        </div>

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
            <button type="button" onClick={() => handleSync(false)} disabled={starting || !cfg?.configured}
              className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {starting ? 'Starting…' : 'Sync all contacts'}
            </button>
            <button type="button" onClick={() => handleSync(true)} disabled={starting || !cfg?.configured}
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
        <p className="text-xs text-vs-text-3 mt-3">
          "Sync all contacts" pushes everyone not yet synced. "Re-sync everyone" re-pushes all contacts,
          refreshing names and numbers in Chatwoot.
        </p>
      </div>
    </div>
  );
}
