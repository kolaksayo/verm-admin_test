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

function fmtAmount(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function TxTypeBadge({ type }) {
  const isDebit = type === 'DEBIT';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isDebit ? 'bg-vs-danger/15 text-vs-danger' : 'bg-vs-success/15 text-vs-success'}`}>
      {type}
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

// ── Finance Audit tab ─────────────────────────────────────────────────────────

function FinanceAuditTab() {
  const [loading, setLoading]   = useState(false);
  const [data, setData]         = useState(null);
  const [error, setError]       = useState(null);
  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterType, setFilterType]   = useState('');

  const load = async (admin, txType) => {
    const a = admin   !== undefined ? admin   : filterAdmin;
    const t = txType  !== undefined ? txType  : filterType;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (a) params.set('admin', a);
      if (t) params.set('txType', t);
      const r = await api.get(`/audit/finance-log?${params}`);
      setData(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-semibold text-vs-text">Finance Audit — Admin Credits & Debits</p>
          <p className="text-xs text-vs-text-3 mt-0.5">All manual wallet balance adjustments made by admins. Stored locally in SQLite.</p>
        </div>
        <button onClick={() => load()} disabled={loading}
          className="px-3 py-1.5 text-xs bg-vs-elevated hover:bg-vs-hover text-vs-text-3 hover:text-vs-text rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-wrap gap-2 mb-4">
        <select value={filterAdmin} onChange={(e) => setFilterAdmin(e.target.value)}
          className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple">
          <option value="">All admins</option>
          {(data?.admins || []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple">
          <option value="">Credits & Debits</option>
          <option value="CREDIT">Credits only</option>
          <option value="DEBIT">Debits only</option>
        </select>
        <button type="submit"
          className="px-3 py-1.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-xs font-medium rounded-lg transition-colors">
          Filter
        </button>
      </form>

      {error && <p className="text-xs text-vs-danger mb-3">{error}</p>}

      {!data && loading && <div className="h-20 animate-pulse bg-vs-elevated rounded-lg" />}

      {data && (
        data.rows.length === 0 ? (
          <p className="text-xs text-vs-text-3">No finance adjustments recorded yet.</p>
        ) : (
          <div className="rounded-lg border border-vs-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-vs-border bg-vs-elevated/60">
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">When</th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Type</th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Admin</th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">User ID</th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Currency</th>
                    <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Amount</th>
                    <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Before</th>
                    <th className="text-right px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">After</th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Description</th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-vs-text-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vs-border">
                  {data.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-vs-elevated/40 transition-colors">
                      <td className="px-4 py-2.5 text-vs-text-3 whitespace-nowrap">{timeAgo(row.createdAt)}</td>
                      <td className="px-4 py-2.5"><TxTypeBadge type={row.txType} /></td>
                      <td className="px-4 py-2.5 font-medium text-vs-text">{row.adminUser}</td>
                      <td className="px-4 py-2.5 font-mono text-vs-text-3">{shortId(row.userId)}</td>
                      <td className="px-4 py-2.5 text-vs-text-3">{row.currencyName || '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold font-mono ${row.txType === 'DEBIT' ? 'text-vs-danger' : 'text-vs-success'}`}>
                        {row.txType === 'DEBIT' ? '−' : '+'}{fmtAmount(row.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-vs-text-3">{fmtAmount(row.balanceBefore)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-vs-text">{fmtAmount(row.balanceAfter)}</td>
                      <td className="px-4 py-2.5 text-vs-text-3">{row.description || '—'}</td>
                      <td className="px-4 py-2.5 text-vs-text-3 italic">{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Admin Activity tab ────────────────────────────────────────────────────────

function AdminActivityTab() {
  const [loading, setLoading]   = useState(false);
  const [data, setData]         = useState(null);
  const [error, setError]       = useState(null);
  const [filterUser, setFilterUser]             = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [expandedRow, setExpandedRow]           = useState(null);

  const load = async (user, collection) => {
    const u = user       !== undefined ? user       : filterUser;
    const c = collection !== undefined ? collection : filterCollection;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (u) params.set('user', u);
      if (c) params.set('collection', c);
      const r = await api.get(`/audit/activity-log?${params}`);
      setData(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-semibold text-vs-text">Admin Activity Log</p>
          <p className="text-xs text-vs-text-3 mt-0.5">Every document edit and deletion made while in edit mode (excludes wallet balance adjustments).</p>
        </div>
        <button onClick={() => load()} disabled={loading}
          className="px-3 py-1.5 text-xs bg-vs-elevated hover:bg-vs-hover text-vs-text-3 hover:text-vs-text rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-wrap gap-2 mb-4">
        <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)}
          className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple">
          <option value="">All users</option>
          {(data?.users || []).map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={filterCollection} onChange={(e) => setFilterCollection(e.target.value)}
          className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple">
          <option value="">All collections</option>
          {(data?.collections || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit"
          className="px-3 py-1.5 bg-vs-purple hover:bg-vs-purple/90 text-white text-xs font-medium rounded-lg transition-colors">
          Filter
        </button>
      </form>

      {error && <p className="text-xs text-vs-danger mb-3">{error}</p>}

      {!data && loading && <div className="h-20 animate-pulse bg-vs-elevated rounded-lg" />}

      {data && (
        data.rows.length === 0 ? (
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
                  {data.rows.flatMap((row) => {
                    const key = String(row._id);
                    const isExpanded = expandedRow === key;
                    return [
                      <tr key={key} className="hover:bg-vs-elevated/40 transition-colors cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : key)}>
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
    </div>
  );
}

// ── Orphaned Wallets tab ──────────────────────────────────────────────────────

function OrphanedWalletsTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get('/audit/orphaned-wallets');
      setData(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <p className="text-sm font-semibold text-vs-text">Wallet Users Without a Linked Account</p>
          <p className="text-xs text-vs-text-3 mt-0.5">
            Wallet records whose <span className="font-mono">user</span> / <span className="font-mono">userId</span> field
            is missing or references a user that no longer exists.
          </p>
        </div>
        <button onClick={run} disabled={loading}
          className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
          {loading ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-vs-danger">{error}</p>}

      {data && !error && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              data.count === 0 ? 'bg-vs-success/15 text-vs-success' : 'bg-vs-warning/15 text-vs-warning'
            }`}>
              {data.count === 0 ? '✓ No orphaned wallets found' : `${data.count} orphaned wallet${data.count !== 1 ? 's' : ''} found`}
            </span>
            {data.count >= 500 && <span className="text-xs text-vs-text-3">Showing first 500</span>}
          </div>

          {data.count > 0 && (
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
                    {data.rows.map((row) => {
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
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isMissing ? 'bg-vs-danger/15 text-vs-danger' : 'bg-vs-warning/15 text-vs-warning'}`}>
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

      {!data && !loading && !error && (
        <p className="mt-4 text-xs text-vs-text-3">Click "Run Audit" to scan the database.</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = ['Finance Audit', 'Admin Activity', 'Orphaned Wallets'];

export default function AuditPage() {
  const [tab, setTab] = useState('Finance Audit');

  const pillCls = (active) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
      active
        ? 'bg-vs-purple text-white'
        : 'text-vs-text-3 hover:text-vs-text hover:bg-vs-elevated'
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Audit</h1>
        <p className="text-sm text-vs-text-3 mt-1">Finance records, admin activity, and data quality reports</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={pillCls(tab === t)}>{t}</button>
        ))}
      </div>

      {tab === 'Finance Audit'    && <FinanceAuditTab />}
      {tab === 'Admin Activity'   && <AdminActivityTab />}
      {tab === 'Orphaned Wallets' && <OrphanedWalletsTab />}
    </div>
  );
}
