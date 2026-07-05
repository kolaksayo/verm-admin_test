import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { ALWAYS_ALLOWED_CATEGORY } from '../config/navCategories';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode]                     = useState(false);
  const [elevationExpiry, setElevationExpiry]       = useState(null);
  const [elevationSessionId, setElevationSessionId] = useState(null);
  const [mfaSetupToken, setMfaSetupToken]           = useState('');
  const pollRef = useRef(null);

  const applyElevationData = (data) => {
    if (data.active) {
      setEditMode(true);
      setElevationExpiry(new Date(data.expiresAt));
      setElevationSessionId(data.sessionId);
    } else {
      setEditMode(false);
      setElevationExpiry(null);
      setElevationSessionId(null);
    }
  };

  const syncElevation = useCallback(async () => {
    try {
      const r = await api.get('/auth/elevation-status');
      applyElevationData(r.data);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('verm_admin_token');
    if (token) {
      api.get('/auth/me')
        .then(async (res) => {
          setUser(res.data.username);
          setRole(res.data.role);
          setPermissions(res.data.permissions || []);
          try {
            const r = await api.get('/auth/elevation-status');
            applyElevationData(r.data);
          } catch { /* non-fatal */ }
        })
        .catch(() => {
          localStorage.removeItem('verm_admin_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Poll every 60 s so session expiry is reflected automatically
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(syncElevation, 60000);
    return () => clearInterval(pollRef.current);
  }, [user, syncElevation]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.requires2fa) {
      return { requires2fa: true, tempToken: res.data.tempToken };
    }
    if (res.data.requiresMfaSetup) {
      setMfaSetupToken(res.data.tempToken);
      return { requiresMfaSetup: true, tempToken: res.data.tempToken };
    }
    localStorage.setItem('verm_admin_token', res.data.token);
    setUser(res.data.username);
    setRole(res.data.role);
    setPermissions(res.data.permissions || []);
    return { requires2fa: false };
  };

  const completeMfaSetup = async (tempToken) => {
    const res = await api.post('/auth/complete-mfa-setup', { tempToken });
    localStorage.setItem('verm_admin_token', res.data.token);
    setUser(res.data.username);
    setRole(res.data.role);
    setPermissions(res.data.permissions || []);
    setMfaSetupToken('');
  };

  const verify2fa = async (tempToken, code) => {
    const res = await api.post('/auth/verify-2fa', { tempToken, code });
    localStorage.setItem('verm_admin_token', res.data.token);
    setUser(res.data.username);
    setRole(res.data.role);
    setPermissions(res.data.permissions || []);
  };

  const logout = () => {
    localStorage.removeItem('verm_admin_token');
    setUser(null);
    setRole(null);
    setPermissions([]);
    setEditMode(false);
    setElevationExpiry(null);
    setElevationSessionId(null);
  };

  // Client-side check is UX only (hides nav/routes) — the real access-control
  // boundary is the server's requirePermission/requireCollectionPermission
  // middleware, which enforces the identical rule independently.
  const hasPermission = useCallback((category, subcategory) => {
    if (role === 'superadmin') return true;
    if (category === ALWAYS_ALLOWED_CATEGORY) return true;
    const list = Array.isArray(permissions) ? permissions : [];
    return list.some((p) => p.category === category && p.subcategory === subcategory);
  }, [role, permissions]);

  const requestElevation = async (reason = '') => {
    const res = await api.post('/auth/elevate', { reason });
    setEditMode(true);
    setElevationExpiry(new Date(res.data.expiresAt));
    setElevationSessionId(res.data.sessionId);
    return res.data;
  };

  const dropElevation = async () => {
    try { await api.post('/auth/drop-elevation'); } catch { /* best-effort */ }
    setEditMode(false);
    setElevationExpiry(null);
    setElevationSessionId(null);
  };

  return (
    <AuthContext.Provider value={{
      user, role, permissions, hasPermission, loading,
      editMode, elevationExpiry, elevationSessionId,
      mfaSetupToken, setMfaSetupToken,
      login, verify2fa, logout,
      requestElevation, dropElevation,
      completeMfaSetup,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
