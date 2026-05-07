import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import DataTable from '../components/DataTable';
import FixturesView from '../components/FixturesView';
import LeaderboardView from '../components/LeaderboardView';
import UserProfileModal from '../components/UserProfileModal';

function formatName(name) {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Collections that have a fully custom view (no DataTable)
const CUSTOM_VIEWS = ['football_fixtures', 'game_bet_leaderboard'];

export default function Collection() {
  const { name } = useParams();

  const [data, setData] = useState({ docs: [], total: 0, page: 1, totalPages: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('_id');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [profileUser, setProfileUser] = useState(null); // { id, displayName }

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

  const handleUserClick = (userId, displayName) => {
    setProfileUser({ id: userId, displayName });
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/" className="hover:text-gray-600">Dashboard</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">{formatName(name)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{formatName(name)}</h1>
          {!isCustom && !loading && (
            <p className="text-sm text-gray-400 mt-0.5">
              {data.total.toLocaleString()} document{data.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Search — only for standard table views */}
        {!isCustom && (
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by ID or field value…"
              className="w-72 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
              >
                Clear
              </button>
            )}
          </form>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Custom views */}
      {name === 'football_fixtures' && (
        <FixturesView />
      )}

      {name === 'game_bet_leaderboard' && (
        <LeaderboardView onUserClick={handleUserClick} />
      )}

      {/* Standard table view */}
      {!isCustom && (
        loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm animate-pulse">
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
          />
        )
      )}

      {/* User profile modal */}
      {profileUser && (
        <UserProfileModal
          userId={profileUser.id}
          displayName={profileUser.displayName}
          onClose={() => setProfileUser(null)}
        />
      )}
    </div>
  );
}
