import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, verify2fa } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('credentials');
  const [tempToken, setTempToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.requires2fa) {
        setTempToken(result.tempToken);
        setStep('2fa');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handle2fa = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verify2fa(tempToken, code);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple focus:border-transparent transition-colors';

  return (
    <div className="min-h-screen bg-vs-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-vs-purple mx-auto flex items-center justify-center mb-4">
            <span className="text-white text-2xl font-black">V</span>
          </div>
          <h1 className="text-2xl font-bold text-vs-text">VermoSports Admin</h1>
          <p className="text-vs-text-3 text-sm mt-1">
            {step === '2fa' ? 'Enter your authenticator code' : 'Sign in to continue'}
          </p>
        </div>

        <div className="bg-vs-card rounded-2xl border border-vs-border shadow-2xl p-8">
          {error && (
            <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          {step === 'credentials' && (
            <form onSubmit={handleCredentials} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-vs-text-2 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-vs-text-2 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-vs-purple hover:bg-vs-purple-on disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {step === '2fa' && (
            <form onSubmit={handle2fa} className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-vs-elevated rounded-full flex items-center justify-center mx-auto mb-3 border border-vs-border">
                  <span className="text-2xl">🔐</span>
                </div>
                <p className="text-sm text-vs-text-3">
                  Open your authenticator app and enter the 6-digit code for <strong className="text-vs-text-2">Verm Admin</strong>.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-vs-text-2 mb-1.5">Authentication Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  placeholder="000000"
                  className={`${inputCls} text-center text-2xl font-mono tracking-[0.5em]`}
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-vs-purple hover:bg-vs-purple-on disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
                className="w-full text-sm text-vs-text-3 hover:text-vs-text-2 transition-colors"
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
