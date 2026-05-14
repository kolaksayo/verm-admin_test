import { useEffect, useState, useCallback } from 'react';
import api from '../api';

const PERIODS = ['morning', 'midday', 'night'];
const PERIOD_LABELS = { morning: 'Morning', midday: 'Midday', night: 'Night' };
const PERIOD_TIMES  = { morning: '6 AM – 12 PM', midday: '12 PM – 6 PM', night: '6 PM – 6 AM' };
const PERIOD_COLORS = { morning: 'text-vs-warning', midday: 'text-vs-lime', night: 'text-vs-purple-light' };
const PERIOD_BADGE  = {
  morning: 'bg-vs-warning/15 text-vs-warning',
  midday:  'bg-vs-lime/15 text-vs-lime',
  night:   'bg-vs-purple/15 text-vs-purple-light',
};

function fmtRate(n) {
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-NG');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DollarNairaRate() {
  const [current, setCurrent]   = useState(null);
  const [history, setHistory]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]   = useState(true);

  const [sqliteRows, setSqliteRows]         = useState([]);
  const [sqliteTotal, setSqliteTotal]       = useState(0);
  const [sqlitePage, setSqlitePage]         = useState(1);
  const [sqliteTotalPages, setSqliteTotalPages] = useState(1);
  const [sqliteLoading, setSqliteLoading]   = useState(true);
  const [snapshotting, setSnapshotting]     = useState(false);
  const [snapshotMsg, setSnapshotMsg]       = useState('');

  const loadCurrent = useCallback(() =>
    api.get('/dollar-naira-rate/current').then((r) => setCurrent(r.data)).catch(() => {}),
  []);

  const loadHistory = useCallback(() => {
    setLoading(true);
    api.get('/dollar-naira-rate', { params: { page, limit: 30 } })
      .then((r) => { setHistory(r.data.docs); setTotal(r.data.total); setTotalPages(r.data.totalPages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const loadSqlite = useCallback(() => {
    setSqliteLoading(true);
    api.get('/dollar-naira-rate/sqlite', { params: { page: sqlitePage, limit: 30 } })
      .then((r) => { setSqliteRows(r.data.rows); setSqliteTotal(r.data.total); setSqliteTotalPages(r.data.totalPages); })
      .catch(() => {})
      .finally(() => setSqliteLoading(false));
  }, [sqlitePage]);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadSqlite(); }, [loadSqlite]);

  const handleSnapshot = async (period) => {
    setSnapshotting(true); setSnapshotMsg('');
    try {
      const r = await api.post('/dollar-naira-rate/sqlite/snapshot', { period });
      setSnapshotMsg(`Saved ${PERIOD_LABELS[period]} rate ${fmtRate(r.data.rate)} to SQLite`);
      loadCurrent();
      loadHistory();
      loadSqlite();
    } catch (err) {
      setSnapshotMsg(err?.response?.data?.error || 'Snapshot failed');
    } finally {
      setSnapshotting(false);
    }
  };

  // Disable snap buttons for periods that haven't started yet today
  const PERIOD_ORDER = ['morning', 'midday', 'night'];
  const currentPeriodIdx = current ? PERIOD_ORDER.indexOf(current.period) : -1;
  const isPeriodFuture = (p) => currentPeriodIdx >= 0 && PERIOD_ORDER.indexOf(p) > currentPeriodIdx;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Dollar / Naira Rate</h1>
        <p className="text-sm text-vs-text-3 mt-1">Three rates per day — snapshotted from the platform to local SQLite at 6 AM, 12 PM and 6 PM (Nigeria time)</p>
      </div>

      {/* Current rate banner */}
      {current && (
        <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-1">Active Now</p>
              <p className="text-xs text-vs-text-3 capitalize mb-2">{current.period} · {PERIOD_TIMES[current.period]}</p>
              <p className="text-4xl font-bold text-vs-lime">
                {current.rate ? fmtRate(current.rate) : <span className="text-vs-text-3 text-2xl">Not set</span>}
              </p>
              <p className="text-xs text-vs-text-3 mt-1">per USD · {fmtDate(current.date)}</p>
            </div>
            <div className="flex gap-4 flex-wrap">
              {PERIODS.map((p) => (
                <div key={p} className="bg-vs-elevated rounded-lg px-4 py-3 text-center min-w-[90px]">
                  <p className={`text-xs font-semibold mb-0.5 ${PERIOD_COLORS[p]}`}>{PERIOD_LABELS[p]}</p>
                  <p className="text-xs text-vs-text-3 mb-1">{PERIOD_TIMES[p]}</p>
                  <p className="text-sm font-bold text-vs-text">{fmtRate(current.today[p])}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MongoDB history — read-only */}
      <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-vs-border flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">Rate History by Day</p>
          <p className="text-xs text-vs-text-3">{total} entries</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vs-border bg-vs-elevated/40">
              <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Date</th>
              <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-warning">Morning</th>
              <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-lime">Midday</th>
              <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-purple-light">Night</th>
              <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vs-border">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-5 py-3"><div className="h-4 bg-vs-elevated rounded animate-pulse" /></td>
                ))}</tr>
              ))
            ) : history.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-vs-text-3 text-sm">No snapshots recorded yet.</td></tr>
            ) : (
              history.map((doc) => {
                const vals = PERIODS.map((p) => doc[p]).filter(Boolean);
                const avg  = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
                return (
                  <tr key={doc.date} className="hover:bg-vs-elevated/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-vs-text">{fmtDate(doc.date)}</td>
                    <td className="px-5 py-3 text-right font-mono text-vs-warning">{fmtRate(doc.morning)}</td>
                    <td className="px-5 py-3 text-right font-mono text-vs-lime">{fmtRate(doc.midday)}</td>
                    <td className="px-5 py-3 text-right font-mono text-vs-purple-light">{fmtRate(doc.night)}</td>
                    <td className="px-5 py-3 text-right font-mono text-vs-text-3">{fmtRate(avg)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-vs-border">
            <span className="text-xs text-vs-text-3">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated">‹</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated">›</button>
            </div>
          </div>
        )}
      </div>

      {/* SQLite Snapshots */}
      <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-vs-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">SQLite Snapshots</p>
            <p className="text-xs text-vs-text-3 mt-0.5">{sqliteTotal} entries · auto-saved 3×/day from MongoDB</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {PERIODS.map((p) => {
              const future = isPeriodFuture(p);
              return (
                <button key={p} onClick={() => handleSnapshot(p)}
                  disabled={snapshotting || future}
                  title={future ? `${PERIOD_LABELS[p]} hasn't started yet` : undefined}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${PERIOD_BADGE[p]} border-current/30 ${snapshotting || future ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80'}`}>
                  {snapshotting ? '…' : `Snap ${PERIOD_LABELS[p]}`}
                </button>
              );
            })}
          </div>
        </div>
        {snapshotMsg && (
          <div className="px-5 py-2 border-b border-vs-border text-xs text-vs-text-3">{snapshotMsg}</div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vs-border bg-vs-elevated/40">
              <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Date</th>
              <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Period</th>
              <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-lime">Rate</th>
              <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Source</th>
              <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Captured</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vs-border">
            {sqliteLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-5 py-3"><div className="h-4 bg-vs-elevated rounded animate-pulse" /></td>
                ))}</tr>
              ))
            ) : sqliteRows.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-vs-text-3 text-sm">No snapshots yet — rates are auto-saved at 6 AM, 12 PM and 6 PM (Nigeria time).</td></tr>
            ) : (
              sqliteRows.map((row) => (
                <tr key={row.id} className="hover:bg-vs-elevated/40 transition-colors">
                  <td className="px-5 py-3 font-medium text-vs-text">{fmtDate(row.date)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PERIOD_BADGE[row.period]}`}>
                      {PERIOD_LABELS[row.period]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-vs-lime">{fmtRate(row.rate)}</td>
                  <td className="px-5 py-3 text-vs-text-3 capitalize">{row.source}</td>
                  <td className="px-5 py-3 text-vs-text-3 text-xs">{row.captured_at}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {sqliteTotalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-vs-border">
            <span className="text-xs text-vs-text-3">Page {sqlitePage} of {sqliteTotalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setSqlitePage((p) => Math.max(1, p - 1))} disabled={sqlitePage === 1}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated">‹</button>
              <button onClick={() => setSqlitePage((p) => Math.min(sqliteTotalPages, p + 1))} disabled={sqlitePage >= sqliteTotalPages}
                className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-elevated">›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
