import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: '/' },
      { label: 'Cash Flow', path: '/cash-flow' },
      { label: 'User Dashboard', path: '/user-dashboard' },
    ],
  },
  {
    label: 'Users & Finance',
    items: [
      { name: 'users', label: 'Users' },
      { name: 'walletusers', label: 'Wallet Users' },
      { name: 'transactions', label: 'Transactions' },
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
      { name: 'football_leagues', label: 'Leagues' },
      { name: 'football_seasons', label: 'Seasons' },
      { name: 'football_teams', label: 'Teams' },
      { name: 'football_team_players', label: 'Players' },
      { name: 'football_fixture_stats', label: 'Fixture Stats' },
      { name: 'football_fixture_head_to_head', label: 'Head to Head' },
    ],
  },
  {
    label: 'Social',
    items: [
      { name: 'follows', label: 'Follows' },
      { name: 'likes', label: 'Likes' },
      { name: 'likedsports', label: 'Liked Sports' },
      { name: 'comments', label: 'Comments' },
      { name: 'chatrooms', label: 'Chat Rooms' },
      { name: 'userchatsubscriptions', label: 'Chat Subscriptions' },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'adminauditlogs', label: 'Audit Logs' },
      { name: 'hook_logs', label: 'Hook Logs' },
      { name: 'currencytypes', label: 'Currency Types' },
      { name: 'dollar_naira_rate', label: 'Dollar/Naira Rate' },
    ],
  },
];

const ROLE_COLORS = {
  superadmin: 'text-vs-purple-light',
  admin:      'text-vs-lime',
  viewer:     'text-vs-text-3',
};

const linkClass = ({ isActive }) =>
  `block px-3 py-1.5 rounded-lg text-sm transition-colors ${
    isActive
      ? 'bg-vs-purple text-white font-medium'
      : 'text-vs-text-3 hover:bg-vs-elevated hover:text-vs-text'
  }`;

export default function Layout() {
  const { user, role, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-4 mb-1 text-xs font-semibold uppercase tracking-wider text-vs-text-3 opacity-60">
                {group.label}
              </p>
              <ul className="px-2 space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <NavLink
                      to={item.path ?? `/collections/${item.name}`}
                      end={item.path === '/'}
                      className={linkClass}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Admin users — superadmin only */}
          {role === 'superadmin' && (
            <div className="mb-4">
              <p className="px-4 mb-1 text-xs font-semibold uppercase tracking-wider text-vs-text-3 opacity-60">
                Admin
              </p>
              <ul className="px-2 space-y-0.5">
                <li>
                  <NavLink to="/admin-users" className={linkClass}>
                    Admin Users
                  </NavLink>
                </li>
              </ul>
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
