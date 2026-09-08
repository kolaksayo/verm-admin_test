// Canonical category/subcategory registry for the nav access-permission system.
// MUST STAY IN SYNC with client/src/config/navCategories.js — any category or
// subcategory added/renamed here needs a matching change there, and vice versa.

const ALWAYS_ALLOWED_CATEGORY = 'betting';

const CATEGORIES = [
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
    // Always fully granted by default — see ALWAYS_ALLOWED_CATEGORY. No grant
    // rows are ever stored for this category.
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

// Maps every entry in collections.js's ALLOWED_COLLECTIONS to {category, subcategory}.
// Collections that back the same tabbed page (Football Data, Social Data, System Logs)
// intentionally collapse into one shared subcategory each.
const COLLECTION_PERMISSION_MAP = {
  users:                          { category: 'users_finance', subcategory: 'users' },
  walletusers:                    { category: 'users_finance', subcategory: 'wallet_users' },
  transactions:                   { category: 'users_finance', subcategory: 'transactions' },
  referrals:                      { category: 'users_finance', subcategory: 'referrals' },
  contracts:                      { category: 'users_finance', subcategory: 'contracts' },

  game_bet:                       { category: 'betting', subcategory: 'game_bets' },
  game_bet_leaderboard:           { category: 'betting', subcategory: 'leaderboard' },
  football_bet_template:          { category: 'betting', subcategory: 'bet_templates' },

  football_fixtures:              { category: 'football', subcategory: 'fixtures' },
  football_fixture_stats:         { category: 'football', subcategory: 'fixture_stats' },
  football_fixture_head_to_head:  { category: 'football', subcategory: 'head_to_head' },
  football_leagues:               { category: 'football', subcategory: 'football_data' },
  football_seasons:               { category: 'football', subcategory: 'football_data' },
  football_teams:                 { category: 'football', subcategory: 'football_data' },
  football_team_players:          { category: 'football', subcategory: 'football_data' },

  chatrooms:                      { category: 'social', subcategory: 'chat_rooms' },
  userchatsubscriptions:          { category: 'social', subcategory: 'chat_subscriptions' },
  follows:                        { category: 'social', subcategory: 'social_data' },
  likes:                          { category: 'social', subcategory: 'social_data' },
  likedsports:                    { category: 'social', subcategory: 'social_data' },
  comments:                       { category: 'social', subcategory: 'social_data' },

  currencytypes:                  { category: 'system', subcategory: 'currency_types' },
  dollar_naira_rate:              { category: 'system', subcategory: 'dollar_naira_rate' },
  adminauditlogs:                 { category: 'system', subcategory: 'logs' },
  hook_logs:                      { category: 'system', subcategory: 'logs' },
};

function isAlwaysAllowedCategory(category) {
  return category === ALWAYS_ALLOWED_CATEGORY;
}

// Built once at module load — every (category, subcategory) pair CATEGORIES actually
// defines. Single source of truth for validating grant payloads (e.g. PUT
// /admin-users/:id/permissions) rather than re-deriving this Set per request.
const VALID_PAIRS = new Set();
for (const cat of CATEGORIES) {
  for (const sub of cat.subcategories) VALID_PAIRS.add(`${cat.slug}:${sub.slug}`);
}

function isValidPair(category, subcategory) {
  return VALID_PAIRS.has(`${category}:${subcategory}`);
}

module.exports = {
  CATEGORIES,
  ALWAYS_ALLOWED_CATEGORY,
  COLLECTION_PERMISSION_MAP,
  isAlwaysAllowedCategory,
  isValidPair,
};
