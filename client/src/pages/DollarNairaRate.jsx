import { useEffect, useState, useCallback } from 'react';
import api from '../api';

const PERIODS = ['morning', 'midday', 'night'];
const PERIOD_LABELS = { morning: 'Morning', midday: 'Midday', night: 'Night' };
const PERIOD_TIMES  = { morning: '6 AM – 12 PM', midday: '12 PM – 6 PM', night: '6 PM – 6 AM' };
const PERIOD_COLORS = { morning: 'text-vs-warning', midday: 'text-vs-lime', night: 'text-vs-purple-light' };

function fmtRate(n) {
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-NG');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DollarNairaRate() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [formDate, setFormDate]       = useState(today());
  const [formMorning, setFormMorning] = useState('');
  const [formMidday, setFormMidday]   = useState('');
  const [formNight, setFormNight]     = useState('');

  const loadCurrent = useCallback(() =>
    api.get('/dollar-naira-rate/current').then((r) => setCurrent(r.data)).catch(() => {}),
  []);

  const loadHistory = useCallback(() => {
    setLoading(true);
    api.get('/dollar-naira-rate', { params: { page, limit: 30 } })
      .then((r) => { setHistory(r.data.docs); setTotal(r.data.total); setTotalPages(r.data.totalPages); })
      .catch(() => setError('Failed to load rates'))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!formMorning && !formMidday && !formNight) {
      setError('Enter at least one rate.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/dollar-naira-rate', {
        date: formDate,
        morning: formMorning ? Number(formMorning) : null,
        midday:  formMidday  ? Number(formMidday)  : null,
        night:   formNight   ? Number(formNight)   : null,
      });
      setSuccess(`Rate saved for ${fmtDate(formDate)}`);
      setFormMorning(''); setFormMidday(''); setFormNight('');
      loadCurrent();
      loadHistory();
    } catch {
      setError('Failed to save rate.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (date) => {
    if (!confirm(`Delete rates for ${fmtDate(date)}?`)) return;
    await api.delete(`/dollar-naira-rate/${date}`);
    loadHistory();
    loadCurrent();
  };

  // Pre-fill form from a history row
  const prefill = (doc) => {
    setFormDate(doc.date);
    setFormMorning(doc.morning ?? '');
    setFormMidday(doc.midday ?? '');
    setFormNight(doc.night ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Dollar / Naira Rate</h1>
        <p className="text-sm text-vs-text-3 mt-1">Three rates per day — used for exchange calculations based on Nigerian time</p>
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

      {/* Entry form */}
      <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-4">Add / Update Rates</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-vs-text-3 block mb-1">Date</label>
              <input
                type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required
                className="px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple"
              />
            </div>
            {PERIODS.map((p) => (
              <div key={p}>
                <label className={`text-xs font-medium block mb-1 ${PERIOD_COLORS[p]}`}>
                  {PERIOD_LABELS[p]} <span className="text-vs-text-3 font-normal">({PERIOD_TIMES[p]})</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-vs-text-3">₦</span>
                  <input
                    type="number" min="1" step="0.01"
                    placeholder="e.g. 1580"
                    value={p === 'morning' ? formMorning : p === 'midday' ? formMidday : formNight}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (p === 'morning') setFormMorning(v);
                      else if (p === 'midday') setFormMidday(v);
                      else setFormNight(v);
                    }}
                    className="pl-7 pr-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text w-36 focus:outline-none focus:ring-2 focus:ring-vs-purple"
                  />
                </div>
              </div>
            ))}
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Rates'}
            </button>
          </div>
          {error   && <p className="text-xs text-vs-danger">{error}</p>}
          {success && <p className="text-xs text-vs-success">{success}</p>}
        </form>
      </div>

      {/* History table */}
      <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-vs-border flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3">History</p>
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
              <th className="px-5 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-vs-border">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-5 py-3"><div className="h-4 bg-vs-elevated rounded animate-pulse" /></td>
                ))}</tr>
              ))
            ) : history.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-vs-text-3 text-sm">No rates saved yet.</td></tr>
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
                    <td className="px-5 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => prefill(doc)}
                          className="text-xs text-vs-text-3 hover:text-vs-text px-2 py-1 rounded border border-vs-border hover:bg-vs-elevated transition-colors">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(doc.date)}
                          className="text-xs text-vs-danger hover:text-vs-danger/80 px-2 py-1 rounded border border-vs-danger/30 hover:bg-vs-danger/10 transition-colors">
                          Del
                        </button>
                      </div>
                    </td>
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
    </div>
  );
}
