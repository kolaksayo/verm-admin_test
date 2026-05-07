import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, verify2fa } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa'
  const [tempToken, setTempToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
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

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl">⚡</span>
          <h1 className="text-2xl font-bold text-white mt-2">VermoSports Admin</h1>
          <p className="text-gray-400 text-sm mt-1">
            {step === '2fa' ? 'Enter your authenticator code' : 'Sign in to continue'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          {/* Step 1: Credentials */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentials} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  placeholder="admin"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {/* Step 2: 2FA */}
          {step === '2fa' && (
            <form onSubmit={handle2fa} className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🔐</span>
                </div>
                <p className="text-sm text-gray-600">
                  Open your authenticator app and enter the 6-digit code for <strong>Verm Admin</strong>.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Authentication Code</label>
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600"
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
