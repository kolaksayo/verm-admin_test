import { useEffect, useState } from 'react';
import api from '../api';
import ReadableView from './ReadableView';

export default function DocumentModal({ collectionName, docId, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details'); // 'details' | 'json'
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get(`/collections/${collectionName}/${docId}`)
      .then((res) => setDoc(res.data))
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [collectionName, docId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{collectionName}</p>
            <p className="text-xs font-mono text-gray-500 truncate mt-0.5">{docId}</p>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setTab('details')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === 'details' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setTab('json')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === 'json' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                JSON
              </button>
            </div>
            {tab === 'json' && (
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-gray-400">Loading…</div>
            </div>
          )}

          {!loading && !doc && (
            <p className="text-sm text-red-500">Document not found.</p>
          )}

          {doc && tab === 'details' && <ReadableView doc={doc} />}

          {doc && tab === 'json' && (
            <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(doc, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
