import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('verm_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only force a logout/redirect for a session that WAS authenticated and just
    // became invalid. Pre-auth calls (login, verify-2fa, complete-mfa-setup) never
    // carry a stored token and legitimately return 401 for wrong credentials — that
    // 401 must flow back to the caller's own catch/error UI, not trigger a hard page
    // navigation that wipes out the error message before it can render.
    const hadToken = !!localStorage.getItem('verm_admin_token');
    if (err.response?.status === 401 && hadToken) {
      localStorage.removeItem('verm_admin_token');
      localStorage.removeItem('verm_admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
