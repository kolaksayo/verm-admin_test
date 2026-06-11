import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import DataTable from '../components/DataTable';
import FixturesView from '../components/FixturesView';
import LeaderboardView from '../components/LeaderboardView';
import UserProfileModal from '../components/UserProfileModal';
import GameBetModal from '../components/GameBetModal';
import UserRankingsView from '../components/UserRankingsView';
import InfluencerDashboard from './InfluencerDashboard';

function formatName(name) {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const CUSTOM_VIEWS = ['football_fixtures', 'game_bet_leaderboard', 'game_bet_user_rankings'];

export default function Collection({ collectionName }) {
  const { name: routeName } = useParams();
  const name = collectionName ?? routeName;

  const [data, setData] = useState({ docs: [], total: 0, page: 1, totalPages: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('_id');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [profileUser, setProfileUser] = useState(null);
  const [gameBet, setGameBet] = useState(null);
  const [referralsTab, setReferralsTab] = useState('records');

  const isCustom = CUSTOM_VIEWS.includes(name);

  const fetchData = useCallback(() => {
    if (isCustom) return;
    setLoading(true);
    setError('');
    api
      .get(`/collections/${name}`, {
        params: { page, limit: 20, search, sort, order },
      })
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load collection data.'))
      .finally(() => setLoading(false));
  }, [name, page, search, sort, order, isCustom]);

  useEffect(() => {
    setPage(1);
    setSearch('');
    setSearchInput('');
    setSort('_id');
    setOrder('desc');
  }, [name]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSort = (col, dir) => {
    setSort(col);
    setOrder(dir);
    setPage(1);
  };

  const handleUserClick = (userId, displayName) => setProfileUser({ id: userId, displayName });
  const handleGameBetClick = (betId, bookingCode) => setGameBet({ id: betId, bookingCode });

  const isLeaderboard = name === 'game_bet_leaderboard';

  return (
    <div>
      {/* Breadcrumb */}
      {!isLeaderboard && (
        <div className="flex items-center gap-2 text-sm text-vs-text-3 mb-4">
          <Link to="/" className="hover:text-vs-text-2 transition-colors">Dashboard</Link>
          <span>›</span>
          <span className="text-vs-text-2 font-medium">{formatName(name)}</span>
        </div>
      )}

      {/* Header */}
      {!isLeaderboard && (
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-vs-text">{formatName(name)}</h1>
          {!isCustom && !loading && (
            <p className="text-sm text-vs-text-3 mt-0.5">
              {data.total.toLocaleString()} document{data.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {!isCustom && name !== 'referrals' && (
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={name === 'transactions' ? 'Search by description, type, status…' : 'Search by ID or field value…'}
              className="w-72 px-4 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-vs-purple hover:bg-vs-purple-on text-white text-sm font-medium rounded-lg transition-colors"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="px-3 py-2 text-sm text-vs-text-3 hover:text-vs-text border border-vs-border rounded-lg hover:bg-vs-elevated transition-colors"
              >
                Clear
              </button>
            )}
          </form>
        )}
        {name === 'referrals' && referralsTab === 'records' && (
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by ID or field value…"
              className="w-72 px-4 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-purple"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-vs-purple hover:bg-vs-purple-on text-white text-sm font-medium rounded-lg transition-colors"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="px-3 py-2 text-sm text-vs-text-3 hover:text-vs-text border border-vs-border rounded-lg hover:bg-vs-elevated transition-colors"
              >
                Clear
              </button>
            )}
          </form>
        )}
      </div>
      )}

      {error && (
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {name === 'referrals' && (
        <div className="flex gap-1 mb-5 border-b border-vs-border">
          {['records', 'influencers'].map((tab) => (
            <button
              key={tab}
              onClick={() => setReferralsTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                referralsTab === tab
                  ? 'border-vs-purple text-vs-purple'
                  : 'border-transparent text-vs-text-3 hover:text-vs-text-2'
              }`}
            >
              {tab === 'records' ? 'Records' : 'Influencers'}
            </button>
          ))}
        </div>
      )}

      {name === 'referrals' && referralsTab === 'influencers' && <InfluencerDashboard embedded />}

      {name === 'football_fixtures' && <FixturesView />}
      {name === 'game_bet_leaderboard' && <LeaderboardView onUserClick={handleUserClick} />}
      {name === 'game_bet_user_rankings' && <UserRankingsView onUserClick={handleUserClick} />}

      {!isCustom && !(name === 'referrals' && referralsTab === 'influencers') && (
        loading ? (
          <div className="bg-vs-card rounded-xl border border-vs-border p-8 text-center text-vs-text-3 text-sm animate-pulse">
            Loading…
          </div>
        ) : (
          <DataTable
            docs={data.docs}
            total={data.total}
            page={data.page}
            totalPages={data.totalPages}
            limit={data.limit}
            sort={sort}
            order={order}
            onSort={handleSort}
            onPage={setPage}
            collectionName={name}
            onUserClick={handleUserClick}
            onGameBetClick={handleGameBetClick}
          />
        )
      )}

      {profileUser && (
        <UserProfileModal
          userId={profileUser.id}
          displayName={profileUser.displayName}
          onClose={() => setProfileUser(null)}
        />
      )}

      {gameBet && (
        <GameBetModal
          betId={gameBet.id}
          bookingCode={gameBet.bookingCode}
          onClose={() => setGameBet(null)}
          onUserClick={(userId, uname) => { setGameBet(null); setProfileUser({ id: userId, displayName: uname }); }}
        />
      )}
    </div>
  );
}
