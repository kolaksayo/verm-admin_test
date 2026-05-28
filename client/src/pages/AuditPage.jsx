import { useState } from 'react';
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

export default function AuditPage() {
  const [loading, setLoading]   = useState(false);
  const [data, setData]         = useState(null);
  const [error, setError]       = useState(null);

  const runAudit = async () => {
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Audit</h1>
        <p className="text-sm text-vs-text-3 mt-1">Data quality reports — find orphaned records and inconsistencies</p>
      </div>

      {/* Orphaned wallets report */}
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
            disabled={loading}
            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {loading ? 'Running…' : 'Run Audit'}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-xs text-vs-danger">{error}</p>
        )}

        {data && !error && (
          <div className="mt-4">
            {/* Summary badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                data.count === 0
                  ? 'bg-vs-success/15 text-vs-success'
                  : 'bg-vs-warning/15 text-vs-warning'
              }`}>
                {data.count === 0 ? '✓ No orphaned wallets found' : `${data.count} orphaned wallet${data.count !== 1 ? 's' : ''} found`}
              </span>
              {data.count >= 500 && (
                <span className="text-xs text-vs-text-3">Showing first 500</span>
              )}
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

        {!data && !loading && !error && (
          <p className="mt-4 text-xs text-vs-text-3">Click "Run Audit" to scan the database.</p>
        )}
      </div>
    </div>
  );
}
