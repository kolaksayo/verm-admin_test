import { useState } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

function StatCard({ label, value, sub, accent = 'text-white' }) {
  return (
    <div className="bg-vs-card border border-vs-border rounded-2xl p-6 flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-vs-text-3">{label}</p>
      <p className={`text-3xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-vs-text-3 mt-0.5">{sub}</p>}
    </div>
  );
}

function FunnelStep({ step, label, count, pct, accent, isLast }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${accent}`}>
          {step}
        </div>
        {!isLast && <div className="w-px flex-1 bg-vs-border mt-1 mb-1 min-h-[24px]" />}
      </div>
      <div className="pb-6 flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-vs-text">{label}</p>
          <p className="text-sm font-bold text-vs-text">{count.toLocaleString()}</p>
        </div>
        {pct != null && (
          <div className="mt-2">
            <div className="w-full bg-vs-elevated rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${accent}`} style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
            <p className="text-xs text-vs-text-3 mt-1">{pct}% of signups</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InfluencerPortal() {
  const [code, setCode]     = useState('');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await api.get('/influencer-public', { params: { code: code.trim() } });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const fundedPct = data?.referred > 0 ? Math.round((data.funded / data.referred) * 100) : 0;
  const betPct    = data?.referred > 0 ? Math.round((data.bet    / data.referred) * 100) : 0;

  return (
    <div className="min-h-screen bg-vs-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-vs-border bg-vs-card/60 backdrop-blur px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-bold text-vs-text">Influencer Dashboard</h1>
          <p className="text-xs text-vs-text-3">Enter your referral code to see your stats</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-10">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Code input */}
          <form onSubmit={handleSubmit} className="bg-vs-card border border-vs-border rounded-2xl p-6">
            <label className="block text-sm font-semibold text-vs-text mb-3">Your Referral Code</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABDUL302"
                className="flex-1 px-4 py-3 bg-vs-elevated border border-vs-border rounded-xl text-vs-text text-sm font-mono uppercase placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="px-6 py-3 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? 'Loading…' : 'View Stats'}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-sm text-vs-danger">
                {error === 'Referral code not found' ? 'That referral code was not found. Double-check and try again.' : error}
              </p>
            )}
          </form>

          {/* Results */}
          {data && (
            <>
              {/* Identity */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-vs-purple/20 flex items-center justify-center text-vs-purple font-bold text-sm">
                  {(data.name || data.username)?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  {data.name && <p className="text-sm font-semibold text-vs-text">{data.name}</p>}
                  <p className={`${data.name ? 'text-xs text-vs-text-3' : 'text-sm font-semibold text-vs-text'}`}>{data.username}</p>
                  <p className="text-xs font-mono text-vs-text-3">{data.referralCode}</p>
                </div>
              </div>

              {/* Signup count (always visible) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                  label="Total Signups"
                  value={data.referred.toLocaleString()}
                  sub="Users who joined using your code"
                  accent="text-vs-text"
                />
                {data.showEarnings && data.earnings != null && (
                  <StatCard
                    label="Estimated Earnings"
                    value={`₦${data.earnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    sub={`₦${(data.rate || 0).toLocaleString()} per full conversion`}
                    accent="text-vs-lime"
                  />
                )}
              </div>

              {/* Conversion funnel */}
              {data.showFunnel && data.referred > 0 && (
                <div className="bg-vs-card border border-vs-border rounded-2xl p-6">
                  <p className="text-xs font-semibold uppercase tracking-widest text-vs-text-3 mb-6">Conversion Funnel</p>
                  <FunnelStep step={1} label="Signed Up"    count={data.referred} pct={null}      accent="bg-vs-text-3"  isLast={false} />
                  <FunnelStep step={2} label="Funded Wallet" count={data.funded}   pct={fundedPct} accent="bg-vs-lime"    isLast={false} />
                  <FunnelStep step={3} label="Placed a Bet"  count={data.bet}      pct={betPct}    accent="bg-vs-purple"  isLast={true}  />
                </div>
              )}

              {data.referred === 0 && (
                <div className="bg-vs-elevated border border-vs-border rounded-2xl p-8 text-center">
                  <p className="text-vs-text-3 text-sm">No referrals yet. Share your code to get started!</p>
                  <p className="font-mono text-vs-purple font-bold text-lg mt-2">{data.referralCode}</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
