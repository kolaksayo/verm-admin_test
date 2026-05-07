import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => localStorage.getItem('verm_admin_user'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('verm_admin_token');
    if (token) {
      api.get('/auth/me')
        .then((res) => setUser(res.data.username))
        .catch(() => {
          localStorage.removeItem('verm_admin_token');
          localStorage.removeItem('verm_admin_user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('verm_admin_token', res.data.token);
    localStorage.setItem('verm_admin_user', res.data.username);
    setUser(res.data.username);
  };

  const logout = () => {
    localStorage.removeItem('verm_admin_token');
    localStorage.removeItem('verm_admin_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
