import { useState } from 'react';
import Collection from './Collection';
import NgnDeposits from './NgnDeposits';
import NgnWithdrawals from './NgnWithdrawals';

const TABS = ['All Transactions', 'NGN Deposits', 'NGN Withdrawals'];

export default function Transactions() {
  const [tab, setTab] = useState('All Transactions');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vs-text">Transactions</h1>
        <p className="text-sm text-vs-text-3 mt-1">All platform transactions, NGN deposits and withdrawals</p>
      </div>

      <div className="flex gap-1 mb-6 bg-vs-elevated rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-vs-card text-vs-text shadow-sm' : 'text-vs-text-3 hover:text-vs-text'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'All Transactions' && <Collection collectionName="transactions" />}
      {tab === 'NGN Deposits'     && <NgnDeposits hideHeader />}
      {tab === 'NGN Withdrawals'  && <NgnWithdrawals hideHeader />}
    </div>
  );
}
