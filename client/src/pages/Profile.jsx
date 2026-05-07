import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const ROLE_COLORS = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
};

function Section({ title, description, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {description && <p className="text-sm text-gray-400 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function Profile() {
  const { user: currentUser, role } = useAuth();
  const [profile, setProfile] = useState(null);

  // Change password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // 2FA state
  const [tfaStep, setTfaStep] = useState('idle'); // idle | setup | confirm | disable
  const [qrCode, setQrCode] = useState('');
  const [tfaCode, setTfaCode] = useState('');
  const [tfaError, setTfaError] = useState('');
  const [tfaSaving, setTfaSaving] = useState(false);

  useEffect(() => {
    api.get('/admin-users/me').then((res) => setProfile(res.data));
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPw !== confirmPw) return setPwError('New passwords do not match');
    if (newPw.length < 8) return setPwError('Password must be at least 8 characters');
    setPwSaving(true);
    try {
      await api.patch('/admin-users/me/password', { currentPassword: currentPw, newPassword: newPw });
      setPwSuccess('Password updated successfully');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setPwSaving(false);
    }
  };

  const startSetup2fa = async () => {
    setTfaError('');
    setTfaSaving(true);
    try {
      const res = await api.post('/admin-users/me/2fa/setup');
      setQrCode(res.data.qrCode);
      setTfaStep('setup');
    } catch (err) {
      setTfaError(err.response?.data?.error || 'Failed to start 2FA setup');
    } finally {
      setTfaSaving(false);
    }
  };

  const confirmEnable2fa = async (e) => {
    e.preventDefault();
    setTfaError('');
    setTfaSaving(true);
    try {
      await api.post('/admin-users/me/2fa/enable', { code: tfaCode });
      setProfile((p) => ({ ...p, two_factor_enabled: true }));
      setTfaStep('idle');
      setTfaCode('');
      setQrCode('');
    } catch (err) {
      setTfaError(err.response?.data?.error || 'Invalid code');
      setTfaCode('');
    } finally {
      setTfaSaving(false);
    }
  };

  const disable2fa = async (e) => {
    e.preventDefault();
    setTfaError('');
    setTfaSaving(true);
    try {
      await api.delete('/admin-users/me/2fa', { data: { code: tfaCode } });
      setProfile((p) => ({ ...p, two_factor_enabled: false }));
      setTfaStep('idle');
      setTfaCode('');
    } catch (err) {
      setTfaError(err.response?.data?.error || 'Invalid code');
      setTfaCode('');
    } finally {
      setTfaSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

      {/* Account info */}
      <Section title="Account" description="Your admin account details">
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-500">Username</span>
            <span className="text-sm font-medium text-gray-800">{currentUser}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-500">Role</span>
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'}`}>
              {role}
            </span>
          </div>
        </div>
      </Section>

      {/* Change password */}
      <Section title="Change Password" description="Use a strong password of at least 8 characters">
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {pwError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</div>}
          {pwSuccess && <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{pwSuccess}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input type="password" required value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" required minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input type="password" required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="pt-1">
            <button type="submit" disabled={pwSaving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </Section>

      {/* 2FA */}
      <Section title="Two-Factor Authentication" description="Add an extra layer of security to your account">
        {tfaError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{tfaError}</div>}

        {profile?.two_factor_enabled && tfaStep === 'idle' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-green-500 text-lg">✓</span>
              <span className="text-sm font-medium text-green-600">2FA is enabled</span>
            </div>
            <button onClick={() => { setTfaStep('disable'); setTfaCode(''); setTfaError(''); }}
              className="text-sm text-red-400 hover:text-red-600 font-medium">
              Disable
            </button>
          </div>
        )}

        {!profile?.two_factor_enabled && tfaStep === 'idle' && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Not enabled</span>
            <button onClick={startSetup2fa} disabled={tfaSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
              {tfaSaving ? 'Loading…' : 'Enable 2FA'}
            </button>
          </div>
        )}

        {tfaStep === 'setup' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              1. Download <strong>Google Authenticator</strong> or <strong>Authy</strong> if you haven't already.<br />
              2. Scan the QR code below with your app.
            </p>
            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} alt="2FA QR Code" className="w-40 h-40 rounded-lg border border-gray-200" />
              </div>
            )}
            <p className="text-sm text-gray-600">3. Enter the 6-digit code from your app to confirm:</p>
            <form onSubmit={confirmEnable2fa} className="space-y-3">
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={tfaCode}
                onChange={(e) => setTfaCode(e.target.value.replace(/\D/g, ''))}
                required autoFocus placeholder="000000"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setTfaStep('idle'); setQrCode(''); }}
                  className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={tfaSaving || tfaCode.length !== 6}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg">
                  {tfaSaving ? 'Verifying…' : 'Confirm & Enable'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tfaStep === 'disable' && (
          <form onSubmit={disable2fa} className="space-y-3">
            <p className="text-sm text-gray-600">Enter your authenticator code to disable 2FA:</p>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              value={tfaCode}
              onChange={(e) => setTfaCode(e.target.value.replace(/\D/g, ''))}
              required autoFocus placeholder="000000"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setTfaStep('idle'); setTfaCode(''); setTfaError(''); }}
                className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={tfaSaving || tfaCode.length !== 6}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg">
                {tfaSaving ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </div>
          </form>
        )}
      </Section>
    </div>
  );
}
