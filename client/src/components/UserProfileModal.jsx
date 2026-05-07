import { useEffect, useState, useCallback } from 'react';
import api from '../api';

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return val; }
}

function StatCard({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
      <p className="text-xl font-bold text-gray-800">{value ?? '—'}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right max-w-[60%] truncate">{value ?? '—'}</span>
    </div>
  );
}

// ── Transaction sub-tab ───────────────────────────────────────────────────────

function TransactionList({ userId, type }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetch = useCallback(() => {
    setLoading(true);
    api.get(`/user-profile/${userId}/transactions`, { params: { type, page, limit: 20 } })
      .then((res) => {
        setDocs(res.data.docs);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      })
      .catch(() => setError('Failed to load transactions'))
      .finally(() => setLoading(false));
  }, [userId, type, page]);

  useEffect(() => { setPage(1); }, [type]);
  useEffect(() => { fetch(); }, [fetch]);

  const isCredit = (t) => ['credit', 'deposit', 'fund', 'top-up'].includes((t.type || '').toLowerCase());

  if (loading) return <div className="py-8 text-center text-sm text-gray-400 animate-pulse">Loading…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>;
  if (docs.length === 0) return <p className="text-sm text-gray-400 text-center py-8">No {type || ''} transactions found.</p>;

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">{total.toLocaleString()} transaction{total !== 1 ? 's' : ''}</p>
      <div className="space-y-2">
        {docs.map((t) => (
          <div key={t._id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isCredit(t) ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className="text-sm font-medium text-gray-800 capitalize">{t.type || 'Unknown'}</span>
                {t.currency && (
                  <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">{t.currency.name}</span>
                )}
              </div>
              {t.description && <p className="text-xs text-gray-500 mt-1 truncate">{t.description}</p>}
              {t.reference && <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{t.reference}</p>}
              {t.status && t.status !== 'success' && t.status !== 'completed' && (
                <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 capitalize">{t.status}</span>
              )}
              <p className="text-xs text-gray-400 mt-1">{formatDate(t.createdAt)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-bold ${isCredit(t) ? 'text-green-600' : 'text-red-500'}`}>
                {isCredit(t) ? '+' : '−'}{typeof t.amount === 'number' ? t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : t.amount}
              </p>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <span className="text-xs text-gray-400">Page {page} / {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">‹</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">›</button>
          </div>
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

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/user-profile/${userId}`)
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [userId]);

  const totalTx = (profile?.transactions || []).reduce((s, t) => s + t.total, 0);
  const txSummary = {};
  (profile?.transactions || []).forEach((t) => { txSummary[t._id] = t; });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-lg font-bold flex-shrink-0">
            {(displayName || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{displayName || profile?.user?.username || 'User'}</h2>
            {profile?.user?.email && (
              <p className="text-sm text-gray-400 truncate">{profile.user.email}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-shrink-0">×</button>
        </div>

        {/* Main tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Transaction subtabs */}
        {tab === 'Transactions' && (
          <div className="flex gap-1 px-6 pt-4 pb-1 flex-shrink-0">
            {TX_SUBTABS.map((s) => (
              <button
                key={s.key}
                onClick={() => setTxSubtab(s.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  txSubtab === s.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.label}
                {s.key === 'credit' && txSummary.credit && (
                  <span className="ml-1.5 text-green-300 font-bold">
                    +{txSummary.credit.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                )}
                {s.key === 'debit' && txSummary.debit && (
                  <span className="ml-1.5 text-red-300 font-bold">
                    −{txSummary.debit.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">
              Loading profile…
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {/* Overview */}
          {!loading && !error && profile && tab === 'Overview' && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Account</p>
                <InfoRow label="Username" value={profile.user.username} />
                <InfoRow label="Name" value={profile.user.name} />
                <InfoRow label="Phone" value={profile.user.phone} />
                <InfoRow label="Verified" value={profile.user.isVerified ? 'Yes' : 'No'} />
                <InfoRow label="Status" value={profile.user.isActive ? 'Active' : 'Inactive'} />
                <InfoRow label="Joined" value={formatDate(profile.user.createdAt)} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Activity</p>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Transactions" value={totalTx.toLocaleString()} />
                  <StatCard label="Bets Created" value={(profile.betsCreated?.total ?? 0).toLocaleString()} />
                  <StatCard label="Competitions" value={profile.leaderboard.length} />
                </div>
              </div>

              {profile.wallets.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Wallets</p>
                  <div className="space-y-2">
                    {profile.wallets.map((w, i) => (
                      <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {w.currency?.name || 'Unknown'}
                          {w.currency?.symbol ? ` (${w.currency.symbol})` : ''}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {typeof w.balance === 'number'
                            ? w.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : w.balance}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transactions — paginated individual records */}
          {!loading && !error && profile && tab === 'Transactions' && (
            <TransactionList key={txSubtab} userId={userId} type={txSubtab || undefined} />
          )}

          {/* Competitions */}
          {!loading && !error && profile && tab === 'Competitions' && (
            <div className="space-y-3">
              {profile.leaderboard.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No competitions found.</p>
              ) : (
                profile.leaderboard.map((entry, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-4 py-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{entry.competition}</p>
                        {entry.competitionDate && (
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.competitionDate)}</p>
                        )}
                        {entry.correct !== null && entry.correct !== undefined && (
                          <p className="text-xs text-gray-500 mt-1">
                            {entry.correct} / {entry.total ?? '?'} correct predictions
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        {entry.rank !== null && entry.rank !== undefined && (
                          <p className="text-sm font-bold text-gray-700">#{entry.rank}</p>
                        )}
                        {entry.points !== null && entry.points !== undefined && (
                          <p className="text-xs text-blue-600 font-medium">{entry.points} pts</p>
                        )}
                        {entry.source === 'direct' && (
                          <p className="text-xs text-gray-400">Participated</p>
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
