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
    const status = err.response?.status;
    const requestUrl = err.config?.url || '';
    const isAuthRequest = requestUrl.startsWith('/auth/login') || requestUrl.startsWith('/auth/verify-2fa');

    if (status === 401 && !isAuthRequest) {
      localStorage.removeItem('verm_admin_token');
      localStorage.removeItem('verm_admin_user');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
