// Maps collection name → list of fields that are foreign-key references
// field: the field name in the document
// collection: the collection to look up the display name from
export const COLLECTION_REFERENCES = {
  walletusers: [
    { field: 'user', collection: 'users' },
    { field: 'currencyType', collection: 'currencytypes' },
  ],
  transactions: [
    { field: 'user', collection: 'users' },
    { field: 'userId', collection: 'users' },
    { field: 'currencyType', collection: 'currencytypes' },
  ],
  game_bet: [
    { field: 'createdBy', collection: 'users' },
    { field: 'currencyType', collection: 'currencytypes' },
    { field: 'gameLeagueId', collection: 'football_leagues' },
  ],
  game_bet_leaderboard: [
    { field: 'gameBet', collection: 'game_bet' },
  ],
  football_teams: [
    { field: 'league', collection: 'football_leagues' },
  ],
  football_fixtures: [
    { field: 'league', collection: 'football_leagues' },
    { field: 'homeTeam', collection: 'football_teams' },
    { field: 'awayTeam', collection: 'football_teams' },
  ],
  football_fixture_stats: [
    { field: 'fixture', collection: 'football_fixtures' },
    { field: 'team', collection: 'football_teams' },
  ],
  football_fixture_head_to_head: [
    { field: 'league', collection: 'football_leagues' },
    { field: 'homeTeam', collection: 'football_teams' },
    { field: 'awayTeam', collection: 'football_teams' },
  ],
  football_team_players: [
    { field: 'team', collection: 'football_teams' },
  ],
};
