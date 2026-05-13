import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api';

function fmtNGN(n) {
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return val; }
}

function StatusBadge({ status }) {
  if (!status) return <span className="text-vs-text-3">—</span>;
  const s = status.toLowerCase();
  const cls = s === 'completed' || s === 'paid' || s === 'success'
    ? 'bg-vs-success/15 text-vs-success'
    : s === 'pending' || s === 'processing'
      ? 'bg-vs-warning/15 text-vs-warning'
      : s === 'failed' || s === 'reversed'
        ? 'bg-vs-danger/15 text-vs-danger'
        : 'bg-vs-elevated text-vs-text-3';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${cls}`}>
      {status}
    </span>
  );
}

export default function NgnWithdrawals() {
  const [docs, setDocs]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statuses, setStatuses]   = useState([]);
  const [expanded, setExpanded]   = useState(null);
  const searchRef = useRef();
  const debounceTimer = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = { page, limit: 50 };
    if (search)       params.search   = search;
    if (dateFrom)     params.dateFrom = dateFrom;
    if (dateTo)       params.dateTo   = dateTo;
    if (statusFilter) params.status   = statusFilter;
    api.get('/ngn-withdrawals', { params })
      .then((res) => {
        setDocs(res.data.docs);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
        if (res.data.statuses?.length) setStatuses(res.data.statuses);
      })
      .catch(() => setError('Failed to load NGN withdrawals'))
      .finally(() => setLoading(false));
  }, [page, search, dateFrom, dateTo, statusFilter]);

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, statusFilter]);
  useEffect(() => { load(); }, [load]);

  const handleSearchChange = (val) => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setSearch(val), 400);
  };

  const toggleExpand = (id) => setExpanded((prev) => (prev === id ? null : id));

  const clearAll = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('');
    if (searchRef.current) searchRef.current.value = '';
  };

  const hasFilter = search || dateFrom || dateTo || statusFilter;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vs-text">NGN Withdrawals</h1>
          <p className="text-sm text-vs-text-3 mt-1">
            SafeHaven Naira transfer transactions
            {!loading && <span className="ml-2 font-medium text-vs-text">{total.toLocaleString()} total</span>}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search name, account, reference…"
            onChange={(e) => handleSearchChange(e.target.value)}
            className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple w-56"
          />
          {statuses.length > 0 && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-vs-text-3 whitespace-nowrap">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-vs-text-3 whitespace-nowrap">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
          </div>
          {hasFilter && (
            <button onClick={clearAll}
              className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1.5 rounded-lg border border-vs-border hover:bg-vs-elevated transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {/* Table */}
      <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vs-border bg-vs-elevated/40">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Platform User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Recipient Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Recipient Acct</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Platform Acct</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Platform Acct Name</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-warning">NGN Paid Out</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">USD Withdrawn</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vs-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-vs-elevated rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-vs-text-3 text-sm">
                    No withdrawals found{hasFilter ? ' for this filter' : ''}.
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <>
                    <tr
                      key={d._id}
                      className="hover:bg-vs-elevated/40 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(d._id)}
                    >
                      <td className="px-4 py-3 text-xs text-vs-text-3 whitespace-nowrap">{fmtDate(d.createdAt)}</td>
                      <td className="px-4 py-3">
                        {d.username
                          ? <span className="font-mono text-xs font-medium text-vs-purple-light">{d.username}</span>
                          : <span className="text-vs-text-3 text-xs italic">—</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-vs-text text-xs">{d.recipientName || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-vs-text-2">{d.recipientAccountNumber || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-vs-text-2">{d.platformAccountNumber || '—'}</td>
                      <td className="px-4 py-3 text-xs text-vs-text-2 max-w-[140px] truncate" title={d.platformAccountName}>
                        {d.platformAccountName || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-vs-warning whitespace-nowrap">{fmtNGN(d.amountNGN)}</td>
                      <td className="px-4 py-3 text-right text-vs-text-2 whitespace-nowrap">{fmtUSD(d.amountUSD)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={d.status} /></td>
                    </tr>

                    {/* Expanded detail row */}
                    {expanded === d._id && (
                      <tr key={`${d._id}-detail`} className="bg-vs-elevated/30">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 text-xs">
                            <div>
                              <p className="text-vs-text-3 mb-0.5">Payment Reference</p>
                              <p className="font-mono text-vs-text break-all">{d.paymentRef || '—'}</p>
                            </div>
                            <div>
                              <p className="text-vs-text-3 mb-0.5">Session ID</p>
                              <p className="font-mono text-vs-text break-all">{d.sessionId || '—'}</p>
                            </div>
                            <div>
                              <p className="text-vs-text-3 mb-0.5">Narration</p>
                              <p className="text-vs-text">{d.narration || '—'}</p>
                            </div>
                            <div>
                              <p className="text-vs-text-3 mb-0.5">Wallet Balance</p>
                              <p className="text-vs-text">
                                {fmtUSD(d.balanceBefore)}
                                <span className="text-vs-text-3 mx-1">→</span>
                                <span className={d.balanceAfter < d.balanceBefore ? 'text-vs-danger' : 'text-vs-success'}>
                                  {fmtUSD(d.balanceAfter)}
                                </span>
                              </p>
                            </div>
                            <div>
                              <p className="text-vs-text-3 mb-0.5">Bank Fees</p>
                              <p className="text-vs-warning">{fmtNGN(d.fees)}</p>
                            </div>
                            <div>
                              <p className="text-vs-text-3 mb-0.5">VAT</p>
                              <p className="text-vs-text-2">{fmtNGN(d.vat)}</p>
                            </div>
                            <div>
                              <p className="text-vs-text-3 mb-0.5">Stamp Duty</p>
                              <p className="text-vs-text-2">{fmtNGN(d.stampDuty)}</p>
                            </div>
                            <div>
                              <p className="text-vs-text-3 mb-0.5">Total NGN Deducted</p>
                              <p className="font-semibold text-vs-warning">
                                {d.amountNGN != null
                                  ? fmtNGN((d.amountNGN ?? 0) + (d.fees ?? 0) + (d.vat ?? 0) + (d.stampDuty ?? 0))
                                  : '—'}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-vs-border bg-vs-elevated/20">
            <span className="text-xs text-vs-text-3">
              Page {page} of {totalPages} · {total.toLocaleString()} records
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated transition-colors">«</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated transition-colors">‹</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated transition-colors">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated transition-colors">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
