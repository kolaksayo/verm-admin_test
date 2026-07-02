import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import UserProfileModal from '../components/UserProfileModal';

function SectionTitle({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wider text-vs-text-3 mb-3">{children}</h2>;
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-vs-purple' : 'bg-vs-elevated'} border border-vs-border ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
      <span className="text-sm text-vs-text-2">{label}</span>
    </label>
  );
}

const STATUS_STYLES = {
  granted:   'bg-vs-success/15 text-vs-success',
  pending:   'bg-vs-elevated text-vs-text-3',
  no_wallet: 'bg-vs-warning/15 text-vs-warning',
  error:     'bg-vs-warning/15 text-vs-warning',
  no_rule:   'bg-vs-elevated text-vs-text-3',
  gave_up:   'bg-vs-danger/15 text-vs-danger',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || 'bg-vs-elevated text-vs-text-3'}`}>
      {status}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function ElevationGate({ children }) {
  const { requestElevation } = useAuth();
  const [elevating, setElevating] = useState(false);
  const [elevErr, setElevErr]     = useState('');

  const handleElevate = async () => {
    setElevating(true); setElevErr('');
    try { await requestElevation('Signup bonus settings'); }
    catch (e) { setElevErr(e.response?.data?.error || e.message || 'Failed'); }
    finally { setElevating(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-vs-text-3">Edit access required to make changes.</p>
      <button onClick={handleElevate} disabled={elevating}
        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
        {elevating ? 'Requesting…' : '🔓 Request Edit Access'}
      </button>
      {elevErr && <p className="text-xs text-vs-danger">{elevErr}</p>}
      {children}
    </div>
  );
}

function BonusSettingsPanel() {
  const { editMode } = useAuth();
  const [enabled, setEnabled] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');

  useEffect(() => {
    api.get('/signup-bonus/settings').then((r) => setEnabled(r.data.enabled)).catch(() => {});
  }, []);

  const save = async (next) => {
    setSaving(true); setMsg('');
    try {
      await api.post('/signup-bonus/settings', { enabled: next });
      setEnabled(next);
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (enabled === null) return null;

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-vs-text">Signup Bonus Watcher</p>
      </div>
      {!editMode ? (
        <ElevationGate>
          <div className="mt-2 opacity-60 pointer-events-none">
            <Toggle checked={enabled} onChange={() => {}} label="Automatically credit configured signup bonuses" disabled />
          </div>
        </ElevationGate>
      ) : (
        <div className="space-y-3">
          <Toggle
            checked={enabled}
            onChange={save}
            label="Automatically credit configured signup bonuses"
            disabled={saving}
          />
          <p className="text-xs text-vs-text-3">
            Global kill switch — turning this off pauses all automatic crediting instantly, without
            affecting the per-code rules below.
          </p>
          {msg && <p className={`text-xs ${msg === 'Saved' ? 'text-vs-success' : 'text-vs-danger'}`}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

function RuleForm({ currencies, editingRule, onSaved, onCancel }) {
  const [code, setCode]         = useState(editingRule?.referralCode || '');
  const [amount, setAmount]     = useState(editingRule ? String(editingRule.amount) : '');
  const [currencyId, setCurrencyId] = useState(editingRule?.currencyId || '');
  const [notes, setNotes]       = useState(editingRule?.notes || '');
  const [active, setActive]     = useState(editingRule ? editingRule.active : true);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) { setErr('Referral code is required'); return; }
    if (!currencyId) { setErr('Currency is required'); return; }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) { setErr('Amount must be a positive number'); return; }

    setSaving(true); setErr('');
    try {
      const res = await api.post(`/signup-bonus/rules/${encodeURIComponent(code.trim())}`, {
        amount: parsedAmount, currencyId, notes: notes.trim() || undefined, active,
      });
      onSaved(res.data);
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-vs-elevated border border-vs-border rounded-lg p-4 mb-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
      <div className="col-span-2 md:col-span-1">
        <label className="block text-xs text-vs-text-3 mb-1">Referral Code</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!editingRule}
          className="w-full px-3 py-1.5 bg-vs-card border border-vs-border rounded-lg text-sm text-vs-text disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-vs-purple" />
      </div>
      <div>
        <label className="block text-xs text-vs-text-3 mb-1">Amount</label>
        <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-1.5 bg-vs-card border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
      </div>
      <div>
        <label className="block text-xs text-vs-text-3 mb-1">Currency</label>
        <select value={currencyId} onChange={(e) => setCurrencyId(e.target.value)}
          className="w-full px-3 py-1.5 bg-vs-card border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple">
          <option value="">Select…</option>
          {currencies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>
      <div className="col-span-2 md:col-span-1">
        <label className="block text-xs text-vs-text-3 mb-1">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-1.5 bg-vs-card border border-vs-border rounded-lg text-sm text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple" />
      </div>
      <div>
        <Toggle checked={active} onChange={setActive} label="Active" />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving}
          className="px-3 py-1.5 bg-vs-purple hover:bg-vs-purple-on text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : editingRule ? 'Update Rule' : 'Add Rule'}
        </button>
        {editingRule && (
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 text-xs text-vs-text-3 hover:text-vs-text border border-vs-border rounded-lg hover:bg-vs-hover transition-colors">
            Cancel
          </button>
        )}
      </div>
      {err && <p className="col-span-full text-xs text-vs-danger">{err}</p>}
    </form>
  );
}

function RulesPanel() {
  const { editMode } = useAuth();
  const [rules, setRules]         = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editingRule, setEditingRule] = useState(null);
  const [showForm, setShowForm]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/signup-bonus/rules'),
      api.get('/collections/currencytypes', { params: { limit: 100 } }),
    ])
      .then(([rulesRes, currRes]) => {
        setRules(rulesRes.data);
        setCurrencies(currRes.data.docs || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = () => {
    setShowForm(false);
    setEditingRule(null);
    load();
  };

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Bonus Rules ({rules.length})</SectionTitle>
        {editMode && !showForm && (
          <button onClick={() => { setEditingRule(null); setShowForm(true); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-vs-purple hover:bg-vs-purple-on text-white transition-colors">
            + Add Rule
          </button>
        )}
      </div>

      {editMode && showForm && (
        <RuleForm
          currencies={currencies}
          editingRule={editingRule}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditingRule(null); }}
        />
      )}

      {loading ? (
        <div className="h-24 bg-vs-elevated rounded-lg animate-pulse" />
      ) : rules.length === 0 ? (
        <p className="text-vs-text-3 text-sm text-center py-8">No signup bonus rules configured yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vs-border">
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Code</th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Amount</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Currency</th>
                <th className="text-center px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Active</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Notes</th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Updated</th>
                {editMode && <th className="px-4 py-2 w-16" />}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.referralCode} className="border-b border-vs-border last:border-0 hover:bg-vs-elevated/50 transition-colors">
                  <td className="px-4 py-2 font-mono text-vs-text">{r.referralCode}</td>
                  <td className="px-4 py-2 text-right text-vs-lime font-medium">{r.amount.toLocaleString()}</td>
                  <td className="px-4 py-2 text-vs-text-2">{r.currencyName || '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${r.active ? 'bg-vs-success' : 'bg-vs-text-3'}`} />
                  </td>
                  <td className="px-4 py-2 text-vs-text-3 hidden md:table-cell">{r.notes || '—'}</td>
                  <td className="px-4 py-2 text-right text-vs-text-3 hidden md:table-cell">{fmtDate(r.updatedAt)}</td>
                  {editMode && (
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => { setEditingRule(r); setShowForm(true); }}
                        className="text-xs text-vs-purple hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STATUS_FILTERS = ['', 'granted', 'pending', 'no_wallet', 'error', 'no_rule', 'gave_up'];

function GrantsPanel() {
  const [grants, setGrants]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState('');
  const [profileUser, setProfileUser] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/signup-bonus/grants', { params: status ? { status } : {} })
      .then((r) => setGrants(r.data))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-vs-card border border-vs-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionTitle>Bonuses Granted ({grants.length})</SectionTitle>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-1.5 bg-vs-elevated border border-vs-border rounded-lg text-xs text-vs-text focus:outline-none focus:ring-2 focus:ring-vs-purple">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
          <button onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-vs-elevated border border-vs-border text-vs-text-3 hover:text-vs-text hover:bg-vs-hover transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-24 bg-vs-elevated rounded-lg animate-pulse" />
      ) : grants.length === 0 ? (
        <p className="text-vs-text-3 text-sm text-center py-8">No signup bonuses recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vs-border">
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Status</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">User</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Referral Code</th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3">Amount</th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Currency</th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-vs-text-3 hidden md:table-cell">Granted At</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-vs-border last:border-0 hover:bg-vs-elevated/50 transition-colors">
                  <td className="px-4 py-2"><StatusBadge status={g.status} /></td>
                  <td className="px-4 py-2">
                    <button onClick={() => setProfileUser({ id: g.userId, displayName: g.username })}
                      className="text-vs-purple hover:underline">
                      {g.username}
                    </button>
                  </td>
                  <td className="px-4 py-2 font-mono text-vs-text-2">{g.referralCode || '—'}</td>
                  <td className="px-4 py-2 text-right text-vs-lime font-medium">{g.amount != null ? g.amount.toLocaleString() : '—'}</td>
                  <td className="px-4 py-2 text-vs-text-2 hidden md:table-cell">{g.currencyName || '—'}</td>
                  <td className="px-4 py-2 text-right text-vs-text-3 hidden md:table-cell">{fmtDate(g.grantedAt || g.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {profileUser && (
        <UserProfileModal
          userId={profileUser.id}
          displayName={profileUser.displayName}
          onClose={() => setProfileUser(null)}
        />
      )}
    </div>
  );
}

export default function SignupBonusDashboard({ embedded = false }) {
  const { role } = useAuth();
  const canSeeGrants = role === 'superadmin' || role === 'admin';

  return (
    <div>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-vs-text">Signup Bonuses</h1>
          <p className="text-sm text-vs-text-3 mt-1">
            Automatically credit new users who register with a configured referral code.
          </p>
        </div>
      )}
      <BonusSettingsPanel />
      <RulesPanel />
      {canSeeGrants && <GrantsPanel />}
    </div>
  );
}
