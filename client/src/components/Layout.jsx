import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
      { name: 'currencytypes', label: 'Currency Types' },
      { label: 'Dollar/Naira Rate', path: '/dollar-naira-rate' },
      { label: 'Notifications', path: '/telegram' },
    ],
  },
];

const ROLE_COLORS = {
  superadmin: 'text-vs-purple-light',
  admin:      'text-vs-lime',
  viewer:     'text-vs-text-3',
};

const linkClass = ({ isActive }) =>
  `flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
    isActive
      ? 'bg-vs-purple text-white font-medium'
      : 'text-vs-text-3 hover:bg-vs-hover hover:text-vs-text'
  }`;

export default function Layout() {
  const { user, role, logout } = useAuth();
  const { theme, toggle } = useTheme();
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
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'} flex-shrink-0 bg-vs-card flex flex-col transition-all duration-200 border-r border-vs-border`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-vs-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-vs-purple flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">V</span>
          </div>
          <span className="text-vs-text font-bold text-sm tracking-wide">VermoSports Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={`${gi > 0 ? 'mt-4' : ''} mb-1`}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-4 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-vs-text-3 opacity-40 hover:opacity-80 transition-opacity"
              >
                <span>{group.label}</span>
                <svg
                  className={`w-2.5 h-2.5 transition-transform ${collapsed[group.label] ? '-rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
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
                className="w-full flex items-center justify-between px-4 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-vs-text-3 opacity-40 hover:opacity-80 transition-opacity"
              >
                <span>Admin</span>
                <svg
                  className={`w-2.5 h-2.5 transition-transform ${collapsed['Admin'] ? '-rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
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
        <div className="px-4 py-3 border-t border-vs-border flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-vs-purple flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{(user || '?')[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-vs-text font-medium truncate">{user}</p>
              <span className={`text-xs font-medium ${ROLE_COLORS[role] || 'text-vs-text-3'}`}>{role}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-9">
            <NavLink to="/profile" className="text-xs text-vs-text-3 hover:text-vs-text-2 transition-colors">
              Profile
            </NavLink>
            <span className="text-vs-border text-xs">·</span>
            <button onClick={handleLogout} className="text-xs text-vs-text-3 hover:text-vs-danger transition-colors">
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-vs-success inline-block" />
            <span className="text-xs text-vs-text-3">vermo-production</span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="ml-auto p-1.5 rounded-lg text-vs-text-3 hover:text-vs-text hover:bg-vs-elevated transition-colors text-base leading-none"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
