import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Sun, Moon, Menu, ChevronDown, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NAV_ITEM_PERMISSIONS } from '../config/navCategories';
import api from '../api';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: '/' },
      { label: 'Cash Flow', path: '/cash-flow' },
      { label: 'User Snapshot', path: '/user-snapshot' },
      { label: 'User Activity', path: '/user-activity' },
    ],
  },
  {
    label: 'Users & Finance',
    items: [
      { name: 'users', label: 'Users' },
      { name: 'walletusers', label: 'Wallet Users' },
      { label: 'Transactions', path: '/transactions', badgeKey: 'transactions' },
      { name: 'referrals', label: 'Referrals' },
      { name: 'contracts', label: 'Contracts' },
    ],
  },
  {
    label: 'Betting',
    items: [
      { name: 'game_bet', label: 'Game Bets' },
      { name: 'game_bet_leaderboard', label: 'Leaderboard' },
      { name: 'game_bet_user_rankings', label: 'User Rankings' },
      { name: 'football_bet_template', label: 'Bet Templates' },
    ],
  },
  {
    label: 'Football',
    items: [
      { name: 'football_fixtures', label: 'Fixtures' },
      { label: 'Football Data', path: '/football-data' },
      { name: 'football_fixture_stats', label: 'Fixture Stats' },
      { name: 'football_fixture_head_to_head', label: 'Head to Head' },
    ],
  },
  {
    label: 'Social',
    items: [
      { label: 'Social Data', path: '/social-data' },
      { name: 'chatrooms', label: 'Chat Rooms' },
      { name: 'userchatsubscriptions', label: 'Chat Subscriptions' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Logs', path: '/system-logs' },
      { label: 'Audit', path: '/audit' },
      { label: 'Request Logs', path: '/request-logs' },
      { name: 'currencytypes', label: 'Currency Types' },
      { label: 'Dollar/Naira Rate', path: '/dollar-naira-rate' },
      { label: 'Notifications', path: '/notifications' },
      { label: 'Campaigns', path: '/campaigns' },
      { label: 'CRM Sync', path: '/crm-sync' },
    ],
  },
];

// Sidebar is always dark (globe colour) — fixed so it stays dark in both themes.
const SIDEBAR_BG      = '#1C1B20';   // globe
const SIDEBAR_BORDER  = '#303030';   // divider light

const ROLE_COLORS = {
  superadmin: 'text-[#B19CFF]',   // accent_primary (light purple)
  admin:      'text-vs-lime',      // secondary (lime)
  viewer:     'text-[#9F9F9F]',   // text tertiary
};

const linkClass = ({ isActive }) =>
  `flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
    isActive
      ? 'bg-[#775CDF]/15 text-[#B19CFF] font-medium'
      : 'text-[#9F9F9F] hover:bg-[#313038] hover:text-white'
  }`;

function ElevationBanner({ expiry, onDrop }) {
  const [minsLeft, setMinsLeft] = useState(null);

  const tick = useCallback(() => {
    if (!expiry) return;
    const secs = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
    setMinsLeft(secs > 0 ? Math.ceil(secs / 60) : 0);
  }, [expiry]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [tick]);

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-6 py-2 bg-amber-500/10 border-b border-amber-500/30 text-xs">
      <span className="flex items-center gap-1.5 text-amber-400 font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        Edit mode active — all changes are logged.
        {minsLeft != null && <span className="opacity-70 ml-1">({minsLeft} min remaining)</span>}
      </span>
      <button
        onClick={onDrop}
        className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 font-medium transition-colors"
      >
        Drop access
      </button>
    </div>
  );
}

// Dashboard is always visible — it's the post-login landing page and is
// intentionally outside the permission model (see NAV_ITEM_PERMISSIONS).
function isNavItemVisible(item, hasPermission) {
  if (item.path === '/') return true;
  const perm = NAV_ITEM_PERMISSIONS[item.path ?? item.name];
  return perm ? hasPermission(perm.category, perm.subcategory) : false;
}

export default function Layout() {
  const { user, role, hasPermission, logout, editMode, elevationExpiry, dropElevation } = useAuth();
  const { theme, toggle } = useTheme();

  const visibleGroups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => isNavItemVisible(item, hasPermission)) }))
    .filter((group) => group.items.length > 0);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nav_collapsed') || '{}'); } catch { return {}; }
  });
  const [badges, setBadges] = useState({});

  useEffect(() => {
    const fetchBadges = () => {
      api.get('/nav-badges').then((res) => setBadges(res.data)).catch(() => {});
    };
    fetchBadges();
    const id = setInterval(fetchBadges, 60000);
    return () => clearInterval(id);
  }, []);

  const toggleGroup = (label) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem('nav_collapsed', JSON.stringify(next));
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-vs-bg">
      {/* Sidebar — always dark (Gentelella signature dark-navy panel) */}
      <aside style={{ backgroundColor: SIDEBAR_BG, borderColor: SIDEBAR_BORDER }} className={`${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'} flex-shrink-0 flex flex-col transition-all duration-200 border-r`}>
        {/* Logo */}
        <div style={{ borderColor: SIDEBAR_BORDER }} className="flex items-center gap-2.5 px-4 py-4 border-b flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-vs-purple flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">V</span>
          </div>
          <span className="text-white font-bold text-sm tracking-wide">VermoSports Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className={`${gi > 0 ? 'mt-4' : ''} mb-1`}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-4 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#4a4858] hover:text-[#9F9F9F] transition-colors"
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={`w-2.5 h-2.5 transition-transform ${collapsed[group.label] ? '-rotate-90' : ''}`}
                />
              </button>
              {!collapsed[group.label] && (
                <ul className="px-2 space-y-0.5 mt-1">
                  {group.items.map((item) => {
                    const badgeCount = item.badgeKey ? (badges[item.badgeKey] || 0) : 0;
                    return (
                      <li key={item.label}>
                        <NavLink
                          to={item.path ?? `/collections/${item.name}`}
                          end={item.path === '/'}
                          className={linkClass}
                        >
                          <span>{item.label}</span>
                          {badgeCount > 0 && (
                            <span className="ml-auto text-[10px] font-semibold bg-vs-purple/20 text-vs-purple-light px-1.5 py-0.5 rounded-full leading-none">
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}

          {/* Admin users — superadmin only */}
          {role === 'superadmin' && (
            <div className="mt-4 mb-1">
              <button
                onClick={() => toggleGroup('Admin')}
                className="w-full flex items-center justify-between px-4 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#4a4858] hover:text-[#9F9F9F] transition-colors"
              >
                <span>Admin</span>
                <ChevronDown
                  className={`w-2.5 h-2.5 transition-transform ${collapsed['Admin'] ? '-rotate-90' : ''}`}
                />
              </button>
              {!collapsed['Admin'] && (
                <ul className="px-2 space-y-0.5 mt-1">
                  <li>
                    <NavLink to="/admin-users" className={linkClass}>
                      Admin Users
                    </NavLink>
                  </li>
                </ul>
              )}
            </div>
          )}
        </nav>

        {/* User footer */}
        <div style={{ borderColor: SIDEBAR_BORDER }} className="px-4 py-3 border-t flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-vs-purple flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{(user || '?')[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{user}</p>
              <span className={`text-xs font-medium ${ROLE_COLORS[role] || 'text-[#7b8fa3]'}`}>{role}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-9">
            <NavLink to="/profile" className="text-xs text-[#9F9F9F] hover:text-white transition-colors">
              Profile
            </NavLink>
            <span className="text-[#4a4858] text-xs">·</span>
            <button onClick={handleLogout} className="text-xs text-[#7b8fa3] hover:text-vs-danger transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 flex items-center gap-3 px-6 py-3 bg-vs-card border-b border-vs-border">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-vs-text-3 hover:text-vs-text p-1.5 rounded-lg hover:bg-vs-elevated transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-vs-success inline-block" />
            <span className="text-xs text-vs-text-3">vermo-production</span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="ml-auto p-1.5 rounded-lg text-vs-text-3 hover:text-vs-text hover:bg-vs-elevated transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {editMode && (
          <ElevationBanner expiry={elevationExpiry} onDrop={dropElevation} />
        )}

        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
