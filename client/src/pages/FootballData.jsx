import { useState } from 'react';
import Collection from './Collection';

const TABS = [
  { label: 'Leagues', collection: 'football_leagues' },
  { label: 'Seasons', collection: 'football_seasons' },
  { label: 'Teams',   collection: 'football_teams' },
  { label: 'Players', collection: 'football_team_players' },
];

export default function FootballData() {
  const [tab, setTab] = useState('Leagues');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Football Data</h1>
        <p className="text-sm text-vs-text-3 mt-1">Leagues, seasons, teams and players</p>
      </div>

      <div className="flex gap-1 mb-6 bg-vs-elevated rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.label} onClick={() => setTab(t.label)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t.label ? 'bg-vs-card text-vs-text shadow-sm' : 'text-vs-text-3 hover:text-vs-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {TABS.map((t) => tab === t.label && (
        <Collection key={t.collection} collectionName={t.collection} />
      ))}
    </div>
  );
}
