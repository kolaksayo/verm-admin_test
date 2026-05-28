import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode]                     = useState(false);
  const [elevationExpiry, setElevationExpiry]       = useState(null);
  const [elevationSessionId, setElevationSessionId] = useState(null);
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

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    if (res.data.requires2fa) {
      return { requires2fa: true, tempToken: res.data.tempToken };
    }
    localStorage.setItem('verm_admin_token', res.data.token);
    setUser(res.data.username);
    setRole(res.data.role);
    return { requires2fa: false };
  };

  const verify2fa = async (tempToken, code) => {
    const res = await api.post('/auth/verify-2fa', { tempToken, code });
    localStorage.setItem('verm_admin_token', res.data.token);
    setUser(res.data.username);
    setRole(res.data.role);
  };

  const logout = () => {
    localStorage.removeItem('verm_admin_token');
    setUser(null);
    setRole(null);
    setEditMode(false);
    setElevationExpiry(null);
    setElevationSessionId(null);
  };

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
      user, role, loading,
      editMode, elevationExpiry, elevationSessionId,
      login, verify2fa, logout,
      requestElevation, dropElevation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
