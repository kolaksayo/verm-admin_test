import { useState } from 'react';
import Collection from './Collection';

const TABS = [
  { label: 'Audit Logs', collection: 'adminauditlogs' },
  { label: 'Hook Logs',  collection: 'hook_logs' },
];

export default function SystemLogs() {
  const [tab, setTab] = useState('Audit Logs');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Logs</h1>
        <p className="text-sm text-vs-text-3 mt-1">Audit logs and hook logs</p>
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
