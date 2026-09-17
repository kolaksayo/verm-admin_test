import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const PAGE_SIZE = 50;

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function MethodBadge({ method }) {
  const m = (method || '').toUpperCase();
  const styles = {
    GET:    'bg-emerald-500/15 text-emerald-400',
    POST:   'bg-blue-500/15 text-blue-400',
    PUT:    'bg-yellow-500/15 text-yellow-400',
    PATCH:  'bg-orange-500/15 text-orange-400',
    DELETE: 'bg-vs-danger/15 text-vs-danger',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${styles[m] || 'bg-vs-elevated text-vs-text-3'}`}>
      {m}
    </span>
  );
}

function StatusBadge({ code }) {
  if (!code) return <span className="text-vs-text-3 text-xs">—</span>;
  const c = Number(code);
  const cls =
    c < 300 ? 'bg-emerald-500/15 text-emerald-400' :
    c < 400 ? 'bg-blue-500/15 text-blue-400' :
    c < 500 ? 'bg-yellow-500/15 text-yellow-400' :
              'bg-vs-danger/15 text-vs-danger';
  return <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${cls}`}>{code}</span>;
}

function TimeBadge({ ms }) {
  if (ms == null) return <span className="text-vs-text-3 text-xs">—</span>;
  const cls =
    ms < 100  ? 'text-emerald-400' :
    ms < 500  ? 'text-yellow-400'  :
                'text-vs-danger';
  return <span className={`text-xs font-mono ${cls}`}>{ms}ms</span>;
}

function JsonPanel({ label, data }) {
  let display;
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    display = JSON.stringify(parsed, null, 2);
  } catch {
    display = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }
  return (
    <div>
      <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wide mb-1">{label}</p>
      <pre className="text-xs font-mono text-vs-text bg-vs-bg rounded-lg p-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-all border border-vs-border">
        {display || '—'}
      </pre>
    </div>
  );
}

function LogRow({ doc }) {
  const [open, setOpen] = useState(false);
  const url = doc.url || '—';
  const shortUrl = url.length > 60 ? url.slice(0, 60) + '…' : url;

  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className="border-b border-vs-border hover:bg-vs-hover cursor-pointer transition-colors"
      >
        <td className="px-4 py-3 text-xs text-vs-text-3 whitespace-nowrap">{fmt(doc.timestamp)}</td>
        <td className="px-4 py-3">
          <span className="text-xs font-medium text-vs-text-2">{doc.apiProviderName || '—'}</span>
        </td>
        <td className="px-4 py-3"><MethodBadge method={doc.method} /></td>
        <td className="px-4 py-3 max-w-xs">
          <span className="text-xs font-mono text-vs-text-3 break-all">{shortUrl}</span>
        </td>
        <td className="px-4 py-3"><StatusBadge code={doc.status} /></td>
        <td className="px-4 py-3"><TimeBadge ms={doc.timeTaken} /></td>
        <td className="px-4 py-3 text-vs-text-3 text-xs">{open ? '▲' : '▼'}</td>
      </tr>
      {open && (
        <tr className="border-b border-vs-border bg-vs-elevated/40">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <JsonPanel label="Request" data={doc.requestData} />
              <JsonPanel label="Response" data={doc.responseData} />
            </div>
            <p className="text-xs text-vs-text-3 mt-3 font-mono break-all">
              <span className="font-semibold">URL:</span> {doc.url}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

export default function RequestLogs() {
  const [docs, setDocs]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [providers, setProviders] = useState([]);

  const [search,   setSearch]   = useState('');
  const [provider, setProvider] = useState('');
  const [status,   setStatus]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const [applied, setApplied] = useState({});

  useEffect(() => {
    api.get('/request-logs/providers').then((r) => setProviders(r.data)).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (filters, pg) => {
    setLoading(true);
    try {
      const params = { page: pg, limit: PAGE_SIZE, ...filters };
      const r = await api.get('/request-logs', { params });
      setDocs(r.data.docs);
      setTotal(r.data.total);
    } catch {
      setDocs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(applied, page);
  }, [applied, page, fetchLogs]);

  const handleApply = () => {
    setPage(1);
    setApplied({ search, provider, status, dateFrom, dateTo });
  };

  const handleClear = () => {
    setSearch(''); setProvider(''); setStatus('');
    setDateFrom(''); setDateTo('');
    setPage(1);
    setApplied({});
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end   = Math.min(page * PAGE_SIZE, total);

  const inputCls = 'px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple focus:border-transparent';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">API Request Logs</h1>
        <p className="text-sm text-vs-text-3 mt-1">Outbound API calls logged in vermoLog-production</p>
      </div>

      {/* Filters */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <input
            className={`${inputCls} col-span-2 md:col-span-1 lg:col-span-2`}
            placeholder="Search URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          />
          <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">All providers</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="success">Success (2xx)</option>
            <option value="error">Error (4xx/5xx)</option>
          </select>
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className={inputCls} value={dateTo}   onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleApply}
            className="px-4 py-2 bg-vs-purple hover:bg-vs-purple-on text-white text-sm font-medium rounded-lg transition-colors"
          >
            Apply
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-vs-elevated hover:bg-vs-hover text-vs-text-2 text-sm font-medium rounded-lg transition-colors border border-vs-border"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-vs-border">
          <span className="text-sm text-vs-text-3">
            {total > 0 ? `Showing ${start}–${end} of ${total.toLocaleString()}` : 'No results'}
          </span>
          {loading && <span className="text-xs text-vs-text-3 animate-pulse">Loading…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-vs-border bg-vs-elevated/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wide">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wide">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wide">Method</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wide">URL</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wide">Time</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-vs-text-3 text-sm">
                    No logs found
                  </td>
                </tr>
              )}
              {docs.map((doc) => <LogRow key={String(doc._id)} doc={doc} />)}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-vs-border">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm text-vs-text-2 bg-vs-elevated border border-vs-border rounded-lg disabled:opacity-40 hover:bg-vs-hover transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-vs-text-3">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm text-vs-text-2 bg-vs-elevated border border-vs-border rounded-lg disabled:opacity-40 hover:bg-vs-hover transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
