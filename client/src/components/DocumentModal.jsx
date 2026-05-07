import { useEffect, useState } from 'react';
import api from '../api';

function serialize(value) {
  return JSON.stringify(value, null, 2);
}

export default function DocumentModal({ collectionName, docId, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get(`/collections/${collectionName}/${docId}`)
      .then((res) => setDoc(res.data))
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [collectionName, docId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(serialize(doc));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-400 font-mono">{collectionName}</p>
            <p className="text-sm font-mono text-gray-700 break-all">{String(docId)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {!loading && !doc && <p className="text-sm text-red-500">Document not found.</p>}
          {doc && (
            <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-all leading-relaxed">
              {serialize(doc)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
