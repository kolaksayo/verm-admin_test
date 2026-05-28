import { useState, useEffect } from 'react';
import api from '../api';

function timeAgo(iso) {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function shortId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length > 16 ? s.slice(0, 8) + '…' + s.slice(-4) : s;
}

function ActionBadge({ action }) {
  const styles = {
    update: 'bg-blue-500/15 text-blue-400',
    delete: 'bg-vs-danger/15 text-vs-danger',
    create: 'bg-vs-success/15 text-vs-success',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[action] || 'bg-vs-elevated text-vs-text-3'}`}>
      {action}
    </span>
  );
}

function DiffPanel({ before, after }) {
  const [side, setSide] = useState(after ? 'after' : 'before');
  const data = side === 'before' ? before : after;
  return (
    <div className="mt-2 rounded-lg border border-vs-border overflow-hidden">
      <div className="flex border-b border-vs-border bg-vs-elevated/60">
        {before && (
          <button
            onClick={() => setSide('before')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${side === 'before' ? 'text-vs-text' : 'text-vs-text-3 hover:text-vs-text-2'}`}
          >
            Before
          </button>
        )}
        {after && (
          <button
            onClick={() => setSide('after')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${side === 'after' ? 'text-vs-text' : 'text-vs-text-3 hover:text-vs-text-2'}`}
          >
            After
          </button>
        )}
      </div>
      <pre className="text-xs font-mono text-vs-text p-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditPage() {
  // ── Orphaned wallets ──────────────────────────────────────────────────────
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditData, setAuditData]       = useState(null);
  const [auditError, setAuditError]     = useState(null);

  const runAudit = async () => {
    setAuditLoading(true); setAuditError(null);
    try {
      const r = await api.get('/audit/orphaned-wallets');
      setAuditData(r.data);
    } catch (err) {
      setAuditError(err.response?.data?.error || 'Request failed');
    } finally {
      setAuditLoading(false);
    }
  };

  // ── Activity log ──────────────────────────────────────────────────────────
  const [actLoading, setActLoading]     = useState(false);
  const [actData, setActData]           = useState(null);
  const [actError, setActError]         = useState(null);
  const [actFilterUser, setActFilterUser]           = useState('');
  const [actFilterCollection, setActFilterCollection] = useState('');
  const [expandedRow, setExpandedRow]   = useState(null);

  const loadActivity = async (user, collection) => {
    const u = user       !== undefined ? user       : actFilterUser;
    const c = collection !== undefined ? collection : actFilterCollection;
    setActLoading(true); setActError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (u) params.set('user', u);
      if (c) params.set('collection', c);
      const r = await api.get(`/audit/activity-log?${params}`);
      setActData(r.data);
    } catch (err) {
      setActError(err.response?.data?.error || 'Request failed');
    } finally {
      setActLoading(false);
    }
  };

  useEffect(() => { loadActivity(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Audit</h1>
        <p className="text-sm text-vs-text-3 mt-1">Data quality reports and admin activity log</p>
      </div>

      {/* ── Activity Log ─────────────────────────────────────────────────── */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-sm font-semibold text-vs-text">Admin Activity Log</p>
            <p className="text-xs text-vs-text-3 mt-0.5">Every document edit and deletion made while in edit mode.</p>
          </div>
          <button
            onClick={() => loadActivity()}
            disabled={actLoading}
            className="px-3 py-1.5 text-xs bg-vs-elevated hover:bg-vs-hover text-vs-text-3 hover:text-vs-text rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {actLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Filters */}
        <form
          onSubmit={(e) => { e.preventDefault(); loadActivity(); }}
          className="flex flex-wrap gap-2 mb-4"
        >
          <select
            value={actFilterUser}
            onChange={(e) => setActFilterUser(e.target.value)}
            className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
          >
            <option value="">All users</option>
            {(actData?.users || []).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select
            value={actFilterCollection}
            onChange={(e) => setActFilterCollection(e.target.value)}
            className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
          >
            <option value="">All collections</option>
            {(actData?.collections || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Filter
          </button>
        </form>

        {actError && <p className="text-xs text-vs-danger mb-3">{actError}</p>}

        {actData && (
          actData.rows.length === 0 ? (
            <p className="text-xs text-vs-text-3">No activity recorded yet. Edits made in edit mode will appear here.</p>
          ) : (
            <div className="rounded-lg border border-vs-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-vs-border bg-vs-elevated/60">
                      <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">When</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Action</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Collection</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Document</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vs-border">
                    {actData.rows.flatMap((row) => {
                      const key = String(row._id);
                      const isExpanded = expandedRow === key;
                      return [
                        <tr
                          key={key}
                          className="hover:bg-vs-elevated/40 transition-colors cursor-pointer"
                          onClick={() => setExpandedRow(isExpanded ? null : key)}
                        >
                          <td className="px-4 py-2.5 text-vs-text-3 whitespace-nowrap">{timeAgo(row.timestamp)}</td>
                          <td className="px-4 py-2.5 font-medium text-vs-text">{row.adminUser}</td>
                          <td className="px-4 py-2.5"><ActionBadge action={row.action} /></td>
                          <td className="px-4 py-2.5 font-mono text-vs-text-3">{row.collection}</td>
                          <td className="px-4 py-2.5 font-mono text-vs-text-3">{shortId(row.documentId)}</td>
                          <td className="px-4 py-2.5 text-vs-text-3 text-right text-[10px]">{isExpanded ? '▲' : '▼'}</td>
                        </tr>,
                        isExpanded && (
                          <tr key={`${key}-exp`} className="bg-vs-elevated/20">
                            <td colSpan={6} className="px-4 pb-4 pt-0">
                              <DiffPanel before={row.before} after={row.after} />
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {!actData && actLoading && (
          <div className="h-20 animate-pulse bg-vs-elevated rounded-lg" />
        )}
      </div>

      {/* ── Orphaned Wallets ──────────────────────────────────────────────── */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-sm font-semibold text-vs-text">Wallet Users Without a Linked Account</p>
            <p className="text-xs text-vs-text-3 mt-0.5">
              Wallet records whose <span className="font-mono">user</span> / <span className="font-mono">userId</span> field
              is missing or references a user that no longer exists.
            </p>
          </div>
          <button
            onClick={runAudit}
            disabled={auditLoading}
            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {auditLoading ? 'Running…' : 'Run Audit'}
          </button>
        </div>

        {auditError && <p className="mt-3 text-xs text-vs-danger">{auditError}</p>}

        {auditData && !auditError && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                auditData.count === 0
                  ? 'bg-vs-success/15 text-vs-success'
                  : 'bg-vs-warning/15 text-vs-warning'
              }`}>
                {auditData.count === 0 ? '✓ No orphaned wallets found' : `${auditData.count} orphaned wallet${auditData.count !== 1 ? 's' : ''} found`}
              </span>
              {auditData.count >= 500 && (
                <span className="text-xs text-vs-text-3">Showing first 500</span>
              )}
            </div>

            {auditData.count > 0 && (
              <div className="rounded-lg border border-vs-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-vs-border bg-vs-elevated/60">
                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Wallet ID</th>
                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">User Ref</th>
                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Issue</th>
                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Currency</th>
                        <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Balance</th>
                        <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-vs-border">
                      {auditData.rows.map((row) => {
                        const ref = row.user || row.userId;
                        const isMissing = !ref;
                        const balance = row.walletBalance ?? row.balance ?? null;
                        const currency = row.currencyType
                          ? (typeof row.currencyType === 'object' ? (row.currencyType.code || row.currencyType.symbol || row.currencyType.name) : shortId(row.currencyType))
                          : '—';

                        return (
                          <tr key={String(row._id)} className="hover:bg-vs-elevated/40 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-vs-text">{shortId(row._id)}</td>
                            <td className="px-4 py-2.5 font-mono text-vs-text-3">
                              {isMissing ? <span className="text-vs-text-3 italic">none</span> : shortId(ref)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                isMissing
                                  ? 'bg-vs-danger/15 text-vs-danger'
                                  : 'bg-vs-warning/15 text-vs-warning'
                              }`}>
                                {isMissing ? 'No user ref' : 'User not found'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-vs-text-3">{currency}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-vs-text">
                              {balance != null ? Number(balance).toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-vs-text-3 whitespace-nowrap">
                              {timeAgo(row.updatedAt || row.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!auditData && !auditLoading && !auditError && (
          <p className="mt-4 text-xs text-vs-text-3">Click "Run Audit" to scan the database.</p>
        )}
      </div>
    </div>
  );
}
