import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/' }],
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
  superadmin: 'text-purple-400',
  admin: 'text-blue-400',
  viewer: 'text-gray-400',
};

const linkClass = ({ isActive }) =>
  `block px-3 py-1.5 rounded text-sm transition-colors ${
    isActive
      ? 'bg-blue-600 text-white font-medium'
      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
  }`;

export default function Layout() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'} flex-shrink-0 bg-gray-900 flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-700 flex-shrink-0">
          <span className="text-blue-400 text-lg font-bold">⚡</span>
          <span className="text-white font-bold text-base tracking-wide">VermoSports Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-4 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
              <p className="px-4 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
        <div className="px-4 py-3 border-t border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-white font-medium truncate">{user}</p>
            <span className={`text-xs font-medium ${ROLE_COLORS[role] || 'text-gray-400'}`}>{role}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <NavLink to="/profile" className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
              Profile
            </NavLink>
            <span className="text-gray-600 text-xs">·</span>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-gray-500 hover:text-gray-700 p-1 rounded"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm text-gray-400">vermo-production</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
