import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return val; }
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-vs-border last:border-0">
      <span className="text-sm text-vs-text-3">{label}</span>
      <span className="text-sm font-medium text-vs-text-2 text-right max-w-[60%] truncate">{value ?? '—'}</span>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-vs-elevated rounded-lg px-4 py-3 text-center">
      <p className="text-xl font-bold text-vs-text">{value ?? '—'}</p>
      <p className="text-xs font-medium text-vs-text-3 mt-0.5">{label}</p>
    </div>
  );
}

// ── Transaction list ──────────────────────────────────────────────────────────

function TransactionList({ userId, type, description }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    setLoading(true);

    // Admin adjustments from SQLite — show for matching type/description filter
    const adminTopUpMatch = !description || description === 'Admin TOP UP';
    const adminDebitMatch = !description || description === 'Admin Debit';
    const showAdminHistory =
      (!type && (adminTopUpMatch || adminDebitMatch)) ||
      (type === 'credit' && adminTopUpMatch) ||
      (type === 'debit'  && adminDebitMatch);
    const adminCreditPromise = showAdminHistory
      ? api.get(`/admin-credit/history/${userId}`).then((r) => r.data).catch(() => [])
      : Promise.resolve([]);

    // Skip MongoDB if filter exclusively targets admin-only descriptions
    const adminOnlyFilter = description === 'Admin TOP UP' || description === 'Admin Debit';
    const mongoPromise = adminOnlyFilter
      ? Promise.resolve({ docs: [], total: 0, totalPages: 1 })
      : (() => {
          const params = { page, limit: 20 };
          if (type) params.type = type;
          if (description) params.description = description;
          return api.get(`/user-profile/${userId}/transactions`, { params })
            .then((r) => r.data)
            .catch(() => null);
        })();

    Promise.all([mongoPromise, adminCreditPromise])
      .then(([mongo, adminHistory]) => {
        if (!mongo) { setError('Failed to load transactions'); return; }

        // Filter admin rows by type if a type tab is active
        const filteredAdmin = adminHistory.filter((c) => {
          const txType = (c.txType || 'CREDIT').toUpperCase();
          if (type === 'credit' && txType !== 'CREDIT') return false;
          if (type === 'debit'  && txType !== 'DEBIT')  return false;
          return true;
        });

        // Map to transaction shape
        const adminDocs = filteredAdmin.map((c) => ({
          _id:         `ac-${c.id}`,
          type:        c.txType || 'CREDIT',
          description: c.description,
          amount:      c.amount,
          currency:    c.currencyName ? { name: c.currencyName } : null,
          createdAt:   c.createdAt,
          isAdminAdjustment: true,
          adminUser:   c.adminUser,
          notes:       c.notes,
        }));

        // Merge: admin adjustments only appear on page 1 (they're few)
        const merged = page === 1
          ? [...adminDocs, ...mongo.docs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          : mongo.docs;

        setDocs(merged);
        setTotal(mongo.total + (page === 1 ? adminDocs.length : 0));
        setTotalPages(mongo.totalPages || 1);
      })
      .finally(() => setLoading(false));
  }, [userId, type, description, page]);

  useEffect(() => { setPage(1); }, [type, description]);
  useEffect(() => { load(); }, [load]);

  const isCredit = (t) => ['credit', 'deposit', 'fund', 'top-up'].includes((t.type || '').toLowerCase());

  if (loading) return <div className="py-8 text-center text-sm text-vs-text-3 animate-pulse">Loading…</div>;
  if (error) return <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-3 py-2">{error}</div>;
  if (docs.length === 0) return <p className="text-sm text-vs-text-3 text-center py-8">No transactions found.</p>;

  return (
    <div>
      <p className="text-xs text-vs-text-3 mb-3">{total.toLocaleString()} transaction{total !== 1 ? 's' : ''}</p>
      <div className="space-y-2">
        {docs.map((t) => (
          <div key={t._id} className="bg-vs-elevated rounded-lg px-4 py-3 flex items-start justify-between gap-3 border border-vs-border">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isCredit(t) ? 'bg-vs-success' : 'bg-vs-danger'}`} />
                <span className="text-sm font-medium text-vs-text capitalize">{t.type || 'Unknown'}</span>
                {t.currency && (
                  <span className="text-xs text-vs-text-3 bg-vs-hover px-1.5 py-0.5 rounded">{t.currency.name}</span>
                )}
              </div>
              {t.description && <p className="text-xs text-vs-text-3 mt-1 truncate">{t.description}</p>}
              {t.isAdminAdjustment && t.adminUser && (
                <p className="text-xs text-vs-purple-light opacity-70 mt-0.5">by {t.adminUser}{t.notes ? ` · ${t.notes}` : ''}</p>
              )}
              {t.reference && <p className="text-xs text-vs-text-3 mt-0.5 font-mono truncate opacity-60">{t.reference}</p>}
              {t.status && !/^(success|completed|paid)$/i.test(t.status) && (
                <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-vs-warning/10 text-vs-warning capitalize">{t.status}</span>
              )}
              <p className="text-xs text-vs-text-3 mt-1 opacity-60">{formatDate(t.createdAt)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-bold ${isCredit(t) ? 'text-vs-success' : 'text-vs-danger'}`}>
                {isCredit(t) ? '+' : '−'}{typeof t.amount === 'number' ? t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : t.amount}
              </p>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-vs-border">
          <span className="text-xs text-vs-text-3">Page {page} / {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">‹</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-vs-border text-vs-text-3 disabled:opacity-30 hover:bg-vs-hover transition-colors">›</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Welcome DM button ─────────────────────────────────────────────────────────

function WelcomeDmButton({ userId }) {
  const [status, setStatus]   = useState(null); // null | { sent, ok, error, sentAt }
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null);

  useEffect(() => {
    api.get(`/notifications/dm/user-status/${userId}`)
      .then((r) => setStatus(r.data))
      .catch(() => setStatus({ sent: false, ok: false, error: null, sentAt: null }));
  }, [userId]);

  const send = async () => {
    setSending(true); setResult(null);
    try {
      const r = await api.post(`/notifications/dm/send-welcome/${userId}`);
      setResult(r.data);
      if (r.data.ok) setStatus({ sent: true, ok: true, error: null, sentAt: new Date().toISOString() });
    } catch (err) {
      const reason = err.response?.data?.reason || err.message || 'Failed';
      setResult({ ok: false, reason });
    } finally {
      setSending(false);
    }
  };

  if (!status) return <div className="h-8 w-40 animate-pulse bg-vs-elevated rounded-lg" />;

  const alreadySent = status.ok === true;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <button
          onClick={send}
          disabled={alreadySent || sending}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
            alreadySent
              ? 'bg-vs-success/15 text-vs-success cursor-default'
              : 'bg-vs-purple hover:bg-vs-purple/90 text-white disabled:opacity-50'
          }`}
        >
          {alreadySent ? '✓ Welcome DM Sent' : sending ? 'Sending…' : '📱 Send Welcome DM'}
        </button>
        {alreadySent && status.sentAt && (
          <span className="text-xs text-vs-text-3">
            {new Date(status.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        )}
        {!alreadySent && status.sent && !status.ok && (
          <span className="text-xs text-vs-danger">Last attempt failed: {status.error || 'unknown error'}</span>
        )}
      </div>
      {result && (
        <p className={`text-xs ${result.ok ? 'text-vs-success' : 'text-vs-danger'}`}>
          {result.ok ? 'Sent successfully via Interakt' : `Failed: ${result.reason}`}
        </p>
      )}
    </div>
  );
}

// ── Wallet adjustment panel (credit + debit) ─────────────────────────────────

function AdjustmentPanel({ wallet, userId, onSuccess }) {
  const { role, editMode, requestElevation } = useAuth();
  const canAdjust = ['superadmin', 'admin'].includes(role);
  const [mode, setMode]         = useState(null); // null | 'credit' | 'debit'
  const [amount, setAmount]     = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [elevating, setElevating] = useState(false);
  const [elevReason, setElevReason] = useState('');
  const [elevErr, setElevErr]   = useState('');

  if (!canAdjust) return null;

  const close = () => { setMode(null); setAmount(''); setNotes(''); setMsg(''); setElevErr(''); };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setMsg('Enter a valid amount'); return; }
    setSaving(true); setMsg('');
    try {
      const endpoint = mode === 'credit' ? '/admin-credit' : '/admin-credit/debit';
      const res = await api.post(endpoint, { walletId: wallet.id, userId, amount: amt, notes });
      const verb = mode === 'credit' ? 'Credited' : 'Debited';
      setMsg(`${verb} ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} — new balance: ${res.data.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
      setAmount(''); setNotes('');
      onSuccess();
    } catch (err) {
      setMsg(err.response?.data?.error || `${mode === 'credit' ? 'Credit' : 'Debit'} failed`);
    } finally {
      setSaving(false);
    }
  };

  const handleElevate = async () => {
    setElevating(true); setElevErr('');
    try { await requestElevation(elevReason); }
    catch (err) { setElevErr(err.response?.data?.error || 'Failed'); }
    finally { setElevating(false); }
  };

  return (
    <div className="mt-2">
      {!mode ? (
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('credit'); setMsg(''); }}
            className="text-xs text-vs-success hover:text-vs-success/80 font-medium transition-colors"
          >
            + Credit
          </button>
          <span className="text-vs-border text-xs">·</span>
          <button
            onClick={() => { setMode('debit'); setMsg(''); }}
            className="text-xs text-vs-danger hover:text-vs-danger/80 font-medium transition-colors"
          >
            − Debit
          </button>
        </div>
      ) : (
        <div className={`mt-1 rounded-lg border p-3 space-y-2 ${mode === 'credit' ? 'border-vs-success/30 bg-vs-success/5' : 'border-vs-danger/30 bg-vs-danger/5'}`}>
          <p className={`text-xs font-semibold ${mode === 'credit' ? 'text-vs-success' : 'text-vs-danger'}`}>
            {mode === 'credit' ? 'Add Credit' : 'Remove Credit'} · {wallet.currency?.name || 'Wallet'}
          </p>
          {!editMode ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-400">Edit access required.</p>
              <input
                type="text"
                value={elevReason}
                onChange={(e) => setElevReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full px-2 py-1.5 bg-vs-elevated border border-vs-border rounded text-xs text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-1 focus:ring-vs-purple"
              />
              <div className="flex gap-2">
                <button onClick={handleElevate} disabled={elevating}
                  className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded transition-colors disabled:opacity-50">
                  {elevating ? 'Requesting…' : 'Request Edit Access'}
                </button>
                <button onClick={close} className="px-3 py-1.5 text-xs bg-vs-elevated hover:bg-vs-hover text-vs-text-3 rounded transition-colors">Cancel</button>
              </div>
              {elevErr && <p className="text-xs text-vs-danger">{elevErr}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-400">Edit mode active — adjustment will be logged.</p>
              <div className="flex gap-2">
                <input
                  type="number" min="0.01" step="any"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setMsg(''); }}
                  placeholder="Amount"
                  className="w-28 px-2 py-1.5 bg-vs-elevated border border-vs-border rounded text-xs text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-1 focus:ring-vs-purple"
                />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="flex-1 px-2 py-1.5 bg-vs-elevated border border-vs-border rounded text-xs text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-1 focus:ring-vs-purple"
                />
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  onClick={handleSubmit}
                  disabled={saving || !amount}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors disabled:opacity-50 ${
                    mode === 'credit'
                      ? 'bg-vs-success/20 hover:bg-vs-success/30 text-vs-success border border-vs-success/30'
                      : 'bg-vs-danger/20 hover:bg-vs-danger/30 text-vs-danger border border-vs-danger/30'
                  }`}
                >
                  {saving ? 'Saving…' : mode === 'credit' ? 'Apply Credit' : 'Apply Debit'}
                </button>
                <button onClick={close} className="px-3 py-1.5 text-xs bg-vs-elevated hover:bg-vs-hover text-vs-text-3 rounded transition-colors">Cancel</button>
                {msg && <span className={`text-xs ${msg.includes('Credited') || msg.includes('Debited') ? (mode === 'credit' ? 'text-vs-success' : 'text-vs-danger') : 'text-vs-danger'}`}>{msg}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Transactions', 'Competitions'];
const TX_SUBTABS = [
  { key: '', label: 'All' },
  { key: 'credit', label: 'Credit' },
  { key: 'debit', label: 'Debit' },
];

export default function UserProfileModal({ userId, displayName, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');
  const [txSubtab, setTxSubtab] = useState('');
  const [descFilter, setDescFilter] = useState('');
  const [descriptions, setDescriptions] = useState([]);
  const [descLoading, setDescLoading] = useState(false);

  const loadProfile = useCallback(() => {
    setLoading(true);
    setError('');
    api.get(`/user-profile/${userId}`)
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Fetch distinct descriptions whenever credit/debit subtab is selected
  useEffect(() => {
    setDescFilter('');
    if (!txSubtab) { setDescriptions([]); return; }
    setDescLoading(true);
    const mongoDesc = api.get(`/user-profile/${userId}/transaction-descriptions`, { params: { type: txSubtab } })
      .then((res) => res.data).catch(() => []);
    // Also inject admin adjustment description pills from SQLite
    const adminDesc = (txSubtab === 'credit' || txSubtab === 'debit')
      ? api.get(`/admin-credit/history/${userId}`).then((r) => {
          const pills = [];
          const hasCredit = r.data.some((x) => (x.txType || 'CREDIT') === 'CREDIT');
          const hasDebit  = r.data.some((x) => x.txType === 'DEBIT');
          if (txSubtab === 'credit' && hasCredit) pills.push('Admin TOP UP');
          if (txSubtab === 'debit'  && hasDebit)  pills.push('Admin Debit');
          return pills;
        }).catch(() => [])
      : Promise.resolve([]);
    Promise.all([mongoDesc, adminDesc]).then(([md, ad]) => {
      const merged = [...new Set([...md, ...ad])].sort();
      setDescriptions(merged);
    }).finally(() => setDescLoading(false));
  }, [userId, txSubtab]);

  const totalTx = (profile?.transactions || []).reduce((s, t) => s + t.total, 0);
  const txSummary = {};
  (profile?.transactions || []).forEach((t) => {
    if (t._id) txSummary[(t._id).toLowerCase()] = t;
  });

  const pillCls = (active) =>
    `px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
      active
        ? 'bg-vs-purple border-vs-purple text-white'
        : 'bg-vs-elevated border-vs-border text-vs-text-3 hover:bg-vs-hover hover:text-vs-text'
    }`;

  const descPillCls = (active) =>
    `px-2.5 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
      active
        ? 'bg-vs-purple/20 border-vs-purple text-vs-purple-light'
        : 'bg-vs-elevated border-vs-border text-vs-text-3 hover:bg-vs-hover hover:text-vs-text'
    }`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-vs-card rounded-2xl border border-vs-border shadow-2xl w-full max-w-[45rem] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-vs-border flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-vs-purple flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {(displayName || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-vs-text truncate">{displayName || profile?.user?.username || 'User'}</h2>
            {profile?.user?.email && (
              <p className="text-sm text-vs-text-3 truncate">{profile.user.email}</p>
            )}
          </div>
          <button onClick={onClose} className="text-vs-text-3 hover:text-vs-text text-2xl leading-none flex-shrink-0 transition-colors">×</button>
        </div>

        {/* Main tabs */}
        <div className="flex border-b border-vs-border flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'text-vs-purple-light border-b-2 border-vs-purple'
                  : 'text-vs-text-3 hover:text-vs-text-2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Transaction filters */}
        {tab === 'Transactions' && (
          <div className="px-6 pt-4 pb-3 space-y-2.5 flex-shrink-0 border-b border-vs-border">
            {/* Type subtabs */}
            <div className="flex gap-1.5 flex-wrap">
              {TX_SUBTABS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setTxSubtab(s.key)}
                  className={pillCls(txSubtab === s.key)}
                >
                  {s.label}
                  {s.key === 'credit' && txSummary.credit && (
                    <span className="ml-1.5 text-vs-success font-bold">
                      +{txSummary.credit.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {s.key === 'debit' && txSummary.debit && (
                    <span className="ml-1.5 text-vs-danger font-bold">
                      −{txSummary.debit.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Description sub-filters — only shown when credit or debit is active */}
            {txSubtab && (
              <div className="flex gap-1.5 flex-wrap items-center min-h-[28px]">
                {descLoading ? (
                  <span className="text-xs text-vs-text-3 animate-pulse">Loading filters…</span>
                ) : descriptions.length > 0 ? (
                  <>
                    <button
                      onClick={() => setDescFilter('')}
                      className={descPillCls(descFilter === '')}
                    >
                      All
                    </button>
                    {descriptions.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDescFilter(descFilter === d ? '' : d)}
                        className={descPillCls(descFilter === d)}
                        title={d}
                      >
                        {d.length > 30 ? d.slice(0, 28) + '…' : d}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {loading && (
            <div className="flex items-center justify-center h-32 text-vs-text-3 text-sm animate-pulse">
              Loading profile…
            </div>
          )}
          {error && (
            <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {/* Overview */}
          {!loading && !error && profile && tab === 'Overview' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-2">Account</p>
                <InfoRow label="Username" value={profile.user.username} />
                <InfoRow label="Name" value={profile.user.name} />
                <InfoRow label="Phone" value={profile.user.phone} />
                <InfoRow label="Verified" value={profile.user.isVerified ? 'Yes' : 'No'} />
                <InfoRow label="Status" value={profile.user.isActive ? 'Active' : 'Inactive'} />
                <InfoRow label="Joined" value={formatDate(profile.user.createdAt)} />
                <div className="pt-3">
                  <p className="text-xs text-vs-text-3 mb-2">WhatsApp Welcome Message</p>
                  <WelcomeDmButton userId={userId} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-2">Activity</p>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Transactions" value={totalTx.toLocaleString()} />
                  <StatCard label="Bets Created" value={(profile.betsCreated?.total ?? 0).toLocaleString()} />
                  <StatCard label="Competitions" value={profile.leaderboard.length} />
                </div>
              </div>

              {profile.wallets.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-vs-text-3 mb-2">Wallets</p>
                  <div className="space-y-3">
                    {profile.wallets.map((w, i) => (
                      <div key={i} className="bg-vs-elevated rounded-lg px-4 py-3 border border-vs-border">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-vs-text-3">
                            {w.currency?.name || 'Unknown'}
                            {w.currency?.symbol ? ` (${w.currency.symbol})` : ''}
                          </span>
                          <span className="text-sm font-bold text-vs-text">
                            {typeof w.balance === 'number'
                              ? w.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : w.balance}
                          </span>
                        </div>
                        <AdjustmentPanel wallet={w} userId={userId} onSuccess={loadProfile} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transactions */}
          {!loading && !error && profile && tab === 'Transactions' && (
            <TransactionList key={`${txSubtab}::${descFilter}`} userId={userId} type={txSubtab || ''} description={descFilter} />
          )}

          {/* Competitions */}
          {!loading && !error && profile && tab === 'Competitions' && (
            <div className="space-y-3">
              {profile.leaderboard.length === 0 ? (
                <p className="text-sm text-vs-text-3 text-center py-8">No competitions found.</p>
              ) : (
                profile.leaderboard.map((entry, i) => (
                  <div key={i} className="bg-vs-elevated rounded-lg px-4 py-3 border border-vs-border">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-vs-text truncate">{entry.competition}</p>
                        {entry.competitionDate && (
                          <p className="text-xs text-vs-text-3 mt-0.5">{formatDate(entry.competitionDate)}</p>
                        )}
                        {entry.correct !== null && entry.correct !== undefined && (
                          <p className="text-xs text-vs-text-3 mt-1">
                            {entry.correct} / {entry.total ?? '?'} correct predictions
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        {entry.rank !== null && entry.rank !== undefined && (
                          <p className="text-sm font-bold text-vs-text">#{entry.rank}</p>
                        )}
                        {entry.points !== null && entry.points !== undefined && (
                          <p className="text-xs text-vs-purple-light font-medium">{entry.points} pts</p>
                        )}
                        {entry.source === 'direct' && (
                          <p className="text-xs text-vs-text-3">Participated</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
