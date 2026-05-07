import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('verm_admin_token');
    if (token) {
      api.get('/auth/me')
        .then((res) => {
          setUser(res.data.username);
          setRole(res.data.role);
        })
        .catch(() => {
          localStorage.removeItem('verm_admin_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

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
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, verify2fa, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
