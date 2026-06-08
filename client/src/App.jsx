import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Collection from './pages/Collection';
import AdminUsers from './pages/AdminUsers';
import Profile from './pages/Profile';
import CashFlow from './pages/CashFlow';
import UserSnapshot from './pages/UserSnapshot';
import UserActivity from './pages/UserActivity';
import DollarNairaRate from './pages/DollarNairaRate';
import Transactions from './pages/Transactions';
import FootballData from './pages/FootballData';
import NotificationsPage from './pages/NotificationsPage';
import CampaignsPage from './pages/CampaignsPage';
import SocialData from './pages/SocialData';
import SystemLogs from './pages/SystemLogs';
import AuditPage from './pages/AuditPage';
import InfluencerPortal from './pages/InfluencerPortal';
import InfluencerDashboard from './pages/InfluencerDashboard';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400 text-sm">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function SuperadminRoute({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== 'superadmin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="collections/:name" element={<Collection />} />
        <Route path="cash-flow" element={<CashFlow />} />
        <Route path="user-snapshot" element={<UserSnapshot />} />
        <Route path="user-activity" element={<UserActivity />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="football-data" element={<FootballData />} />
        <Route path="dollar-naira-rate" element={<DollarNairaRate />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="telegram" element={<Navigate to="/notifications" replace />} />
        <Route path="social-data" element={<SocialData />} />
        <Route path="system-logs" element={<SystemLogs />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="admin-users"
          element={
            <SuperadminRoute>
              <AdminUsers />
            </SuperadminRoute>
          }
        />
      </Route>
      <Route path="/influencer" element={<InfluencerPortal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
