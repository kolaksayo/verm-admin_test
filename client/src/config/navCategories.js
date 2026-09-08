// Canonical category/subcategory registry for the nav access-permission system.
// MUST STAY IN SYNC with server/permissionCategories.js — any category or
// subcategory added/renamed here needs a matching change there, and vice versa.

export const ALWAYS_ALLOWED_CATEGORY = 'betting';

export const CATEGORIES = [
  {
    slug: 'overview',
    label: 'Overview',
    subcategories: [
      { slug: 'cash_flow', label: 'Cash Flow' },
      { slug: 'user_snapshot', label: 'User Snapshot' },
      { slug: 'user_activity', label: 'User Activity' },
    ],
  },
  {
    slug: 'users_finance',
    label: 'Users & Finance',
    subcategories: [
      { slug: 'users', label: 'Users' },
      { slug: 'wallet_users', label: 'Wallet Users' },
      { slug: 'transactions', label: 'Transactions' },
      { slug: 'referrals', label: 'Referrals' },
      { slug: 'contracts', label: 'Contracts' },
    ],
  },
  {
    slug: 'betting',
    label: 'Betting',
    // Always fully granted by default — see ALWAYS_ALLOWED_CATEGORY.
    subcategories: [
      { slug: 'game_bets', label: 'Game Bets' },
      { slug: 'leaderboard', label: 'Leaderboard' },
      { slug: 'user_rankings', label: 'User Rankings' },
      { slug: 'bet_templates', label: 'Bet Templates' },
    ],
  },
  {
    slug: 'football',
    label: 'Football',
    subcategories: [
      { slug: 'fixtures', label: 'Fixtures' },
      { slug: 'football_data', label: 'Football Data' },
      { slug: 'fixture_stats', label: 'Fixture Stats' },
      { slug: 'head_to_head', label: 'Head to Head' },
    ],
  },
  {
    slug: 'social',
    label: 'Social',
    subcategories: [
      { slug: 'chat_rooms', label: 'Chat Rooms' },
      { slug: 'chat_subscriptions', label: 'Chat Subscriptions' },
      { slug: 'social_data', label: 'Social Data' },
    ],
  },
  {
    slug: 'system',
    label: 'System',
    subcategories: [
      { slug: 'currency_types', label: 'Currency Types' },
      { slug: 'dollar_naira_rate', label: 'Dollar/Naira Rate' },
      { slug: 'notifications', label: 'Notifications' },
      { slug: 'campaigns', label: 'Campaigns' },
      { slug: 'crm_sync', label: 'CRM Sync' },
      { slug: 'logs', label: 'Logs' },
      { slug: 'audit', label: 'Audit' },
      { slug: 'request_logs', label: 'Request Logs' },
    ],
  },
];

// Per-nav-item permission lookup, keyed the same way Layout.jsx renders each
// item (its `name` for /collections/:name items, its `path` for dedicated
// pages). Dashboard ('/') is intentionally absent — it's always visible,
// outside the permission model entirely.
export const NAV_ITEM_PERMISSIONS = {
  // Overview
  '/cash-flow':        { category: 'overview', subcategory: 'cash_flow' },
  '/user-snapshot':    { category: 'overview', subcategory: 'user_snapshot' },
  '/user-activity':    { category: 'overview', subcategory: 'user_activity' },

  // Users & Finance
  users:               { category: 'users_finance', subcategory: 'users' },
  walletusers:         { category: 'users_finance', subcategory: 'wallet_users' },
  '/transactions':     { category: 'users_finance', subcategory: 'transactions' },
  referrals:           { category: 'users_finance', subcategory: 'referrals' },
  contracts:           { category: 'users_finance', subcategory: 'contracts' },

  // Betting (always-allow, listed for completeness/route-guard use)
  game_bet:                  { category: 'betting', subcategory: 'game_bets' },
  game_bet_leaderboard:      { category: 'betting', subcategory: 'leaderboard' },
  game_bet_user_rankings:    { category: 'betting', subcategory: 'user_rankings' },
  football_bet_template:     { category: 'betting', subcategory: 'bet_templates' },

  // Football
  football_fixtures:              { category: 'football', subcategory: 'fixtures' },
  '/football-data':                { category: 'football', subcategory: 'football_data' },
  football_fixture_stats:         { category: 'football', subcategory: 'fixture_stats' },
  football_fixture_head_to_head:  { category: 'football', subcategory: 'head_to_head' },

  // Social
  '/social-data':          { category: 'social', subcategory: 'social_data' },
  chatrooms:               { category: 'social', subcategory: 'chat_rooms' },
  userchatsubscriptions:   { category: 'social', subcategory: 'chat_subscriptions' },

  // System
  '/system-logs':          { category: 'system', subcategory: 'logs' },
  '/audit':                { category: 'system', subcategory: 'audit' },
  '/request-logs':         { category: 'system', subcategory: 'request_logs' },
  currencytypes:           { category: 'system', subcategory: 'currency_types' },
  '/dollar-naira-rate':    { category: 'system', subcategory: 'dollar_naira_rate' },
  '/notifications':        { category: 'system', subcategory: 'notifications' },
  '/campaigns':            { category: 'system', subcategory: 'campaigns' },
  '/crm-sync':            { category: 'system', subcategory: 'crm_sync' },
};

// Same mapping, keyed by collection name only — used by App.jsx's
// /collections/:name route guard to resolve category/subcategory from the
// route param.
export const COLLECTION_PERMISSIONS = {
  users: NAV_ITEM_PERMISSIONS.users,
  walletusers: NAV_ITEM_PERMISSIONS.walletusers,
  referrals: NAV_ITEM_PERMISSIONS.referrals,
  contracts: NAV_ITEM_PERMISSIONS.contracts,
  game_bet: NAV_ITEM_PERMISSIONS.game_bet,
  game_bet_leaderboard: NAV_ITEM_PERMISSIONS.game_bet_leaderboard,
  game_bet_user_rankings: NAV_ITEM_PERMISSIONS.game_bet_user_rankings,
  football_bet_template: NAV_ITEM_PERMISSIONS.football_bet_template,
  football_fixtures: NAV_ITEM_PERMISSIONS.football_fixtures,
  football_fixture_stats: NAV_ITEM_PERMISSIONS.football_fixture_stats,
  football_fixture_head_to_head: NAV_ITEM_PERMISSIONS.football_fixture_head_to_head,
  chatrooms: NAV_ITEM_PERMISSIONS.chatrooms,
  userchatsubscriptions: NAV_ITEM_PERMISSIONS.userchatsubscriptions,
  currencytypes: NAV_ITEM_PERMISSIONS.currencytypes,
  transactions: NAV_ITEM_PERMISSIONS['/transactions'],
  dollar_naira_rate: NAV_ITEM_PERMISSIONS['/dollar-naira-rate'],
  // Tabbed-page-only collections (Football Data / Social Data / System Logs) —
  // gated at the same subcategory as their parent page.
  football_leagues: { category: 'football', subcategory: 'football_data' },
  football_seasons: { category: 'football', subcategory: 'football_data' },
  football_teams: { category: 'football', subcategory: 'football_data' },
  football_team_players: { category: 'football', subcategory: 'football_data' },
  follows: { category: 'social', subcategory: 'social_data' },
  likes: { category: 'social', subcategory: 'social_data' },
  likedsports: { category: 'social', subcategory: 'social_data' },
  comments: { category: 'social', subcategory: 'social_data' },
  adminauditlogs: { category: 'system', subcategory: 'logs' },
  hook_logs: { category: 'system', subcategory: 'logs' },
};
