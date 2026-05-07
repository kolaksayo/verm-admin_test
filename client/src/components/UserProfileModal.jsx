import { useEffect, useState } from 'react';
import api from '../api';

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return val; }
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
      <p className="text-xl font-bold text-gray-800">{value ?? '—'}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
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

const TABS = ['Overview', 'Transactions', 'Competitions'];

export default function UserProfileModal({ userId, displayName, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/user-profile/${userId}`)
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [userId]);

  const txByType = {};
  (profile?.transactions || []).forEach((t) => { txByType[t._id || 'unknown'] = t; });
  const credit = txByType['credit'] || txByType['deposit'] || null;
  const debit = txByType['debit'] || txByType['withdrawal'] || null;
  const totalTx = (profile?.transactions || []).reduce((s, t) => s + t.total, 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
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

        {/* Tabs */}
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

          {!loading && !error && profile && tab === 'Overview' && (
            <div className="space-y-5">
              {/* Account info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Account</p>
                <div>
                  <InfoRow label="Username" value={profile.user.username} />
                  <InfoRow label="Name" value={profile.user.name} />
                  <InfoRow label="Phone" value={profile.user.phone} />
                  <InfoRow label="Verified" value={profile.user.isVerified ? 'Yes' : 'No'} />
                  <InfoRow label="Status" value={profile.user.isActive ? 'Active' : 'Inactive'} />
                  <InfoRow label="Joined" value={formatDate(profile.user.createdAt)} />
                </div>
              </div>

              {/* Activity summary */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Activity</p>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Transactions" value={totalTx.toLocaleString()} />
                  <StatCard label="Bets Created" value={(profile.betsCreated?.total ?? 0).toLocaleString()} />
                  <StatCard label="Competitions" value={profile.leaderboard.length} />
                </div>
              </div>

              {/* Wallets */}
              {profile.wallets.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Wallets</p>
                  <div className="space-y-2">
                    {profile.wallets.map((w, i) => (
                      <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-3">
                        <span className="text-sm text-gray-600">{w.currency?.name || 'Unknown'} {w.currency?.symbol ? `(${w.currency.symbol})` : ''}</span>
                        <span className="text-sm font-bold text-gray-900">{typeof w.balance === 'number' ? w.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : w.balance}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !error && profile && tab === 'Transactions' && (
            <div className="space-y-4">
              {profile.transactions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No transactions found.</p>
              ) : (
                profile.transactions.map((t) => (
                  <div key={t._id} className="bg-gray-50 rounded-lg px-4 py-3 flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 capitalize">{t._id || 'Other'}</p>
                      <p className="text-xs text-gray-400">{t.total} transaction{t.total !== 1 ? 's' : ''}</p>
                      {t.last && <p className="text-xs text-gray-400 mt-0.5">Last: {formatDate(t.last)}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${t._id === 'credit' || t._id === 'deposit' ? 'text-green-600' : 'text-red-500'}`}>
                        {typeof t.amount === 'number' ? t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : t.amount}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && !error && profile && tab === 'Competitions' && (
            <div className="space-y-3">
              {profile.leaderboard.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Not entered in any competitions yet.</p>
              ) : (
                profile.leaderboard.map((entry, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-4 py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{entry.competition}</p>
                        {entry.correct !== null && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {entry.correct} / {entry.total ?? '?'} correct predictions
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {entry.rank !== null && (
                          <p className="text-sm font-bold text-gray-700">#{entry.rank}</p>
                        )}
                        {entry.points !== null && (
                          <p className="text-xs text-gray-500">{entry.points} pts</p>
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
