import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NAV_ITEM_PERMISSIONS, COLLECTION_PERMISSIONS } from './config/navCategories';
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
import WagerCardFrame from './pages/WagerCardFrame';
import InfluencerDashboard from './pages/InfluencerDashboard';
import RequestLogs from './pages/RequestLogs';

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

// Generalized nav-category route guard. Client-side only — a UX convenience
// that redirects away from a hidden page; the server's requirePermission/
// requireCollectionPermission middleware is the real access-control boundary.
function PermissionRoute({ category, subcategory, children }) {
  const { user, hasPermission, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasPermission(category, subcategory)) return <Navigate to="/" replace />;
  return children;
}

// Collection routes resolve their category/subcategory from the :name param.
function CollectionRoute() {
  const { name } = useParams();
  const { user, hasPermission, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Fail closed: an unmapped collection name is treated as not permitted, not as
  // permitted-by-default — matches Layout.jsx's nav-filtering default and means a
  // missing registry entry hides/blocks a page instead of silently exposing it.
  const perm = NAV_ITEM_PERMISSIONS[name] || COLLECTION_PERMISSIONS[name];
  if (!perm || !hasPermission(perm.category, perm.subcategory)) return <Navigate to="/" replace />;
  return <Collection />;
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
        <Route path="collections/:name" element={<CollectionRoute />} />
        <Route path="cash-flow" element={<PermissionRoute category="overview" subcategory="cash_flow"><CashFlow /></PermissionRoute>} />
        <Route path="user-snapshot" element={<PermissionRoute category="overview" subcategory="user_snapshot"><UserSnapshot /></PermissionRoute>} />
        <Route path="user-activity" element={<PermissionRoute category="overview" subcategory="user_activity"><UserActivity /></PermissionRoute>} />
        <Route path="transactions" element={<PermissionRoute category="users_finance" subcategory="transactions"><Transactions /></PermissionRoute>} />
        <Route path="football-data" element={<PermissionRoute category="football" subcategory="football_data"><FootballData /></PermissionRoute>} />
        <Route path="dollar-naira-rate" element={<PermissionRoute category="system" subcategory="dollar_naira_rate"><DollarNairaRate /></PermissionRoute>} />
        <Route path="notifications" element={<PermissionRoute category="system" subcategory="notifications"><NotificationsPage /></PermissionRoute>} />
        <Route path="campaigns" element={<PermissionRoute category="system" subcategory="campaigns"><CampaignsPage /></PermissionRoute>} />
        <Route path="telegram" element={<Navigate to="/notifications" replace />} />
        <Route path="social-data" element={<PermissionRoute category="social" subcategory="social_data"><SocialData /></PermissionRoute>} />
        <Route path="system-logs" element={<PermissionRoute category="system" subcategory="logs"><SystemLogs /></PermissionRoute>} />
        <Route path="audit" element={<PermissionRoute category="system" subcategory="audit"><AuditPage /></PermissionRoute>} />
        <Route path="request-logs" element={<PermissionRoute category="system" subcategory="request_logs"><RequestLogs /></PermissionRoute>} />
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
      <Route path="/influencer/:code" element={<InfluencerPortal />} />
      {/* Off-screen render target for notification card screenshots (no auth,
          data supplied entirely via the ?d= query param). */}
      <Route path="/wager-card" element={<WagerCardFrame />} />
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
