import { useState, useEffect } from 'react';
import api from '../api';
import { COLLECTION_REFERENCES } from '../config/references';
import DocumentModal from './DocumentModal';

const MAX_COLS = 7;
const CELL_MAX_LEN = 60;

function isISODate(val) {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val);
}

function formatDate(val) {
  try {
    return new Date(val).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return val; }
}

function cellValue(val) {
  if (val === null || val === undefined) return <span className="text-gray-300">—</span>;
  if (typeof val === 'boolean') return val ? '✓' : '✗';
  if (isISODate(val)) return <span className="text-gray-500">{formatDate(val)}</span>;
  if (typeof val === 'object') {
    const str = JSON.stringify(val);
    return <span className="text-gray-400 italic">{str.length > CELL_MAX_LEN ? str.slice(0, CELL_MAX_LEN) + '…' : str}</span>;
  }
  const str = String(val);
  return str.length > CELL_MAX_LEN ? str.slice(0, CELL_MAX_LEN) + '…' : str;
}

function pickColumns(docs) {
  if (!docs.length) return [];
  const sample = docs[0];
  const keys = Object.keys(sample);
  const priority = ['_id'];
  const timestamps = keys.filter((k) => k === 'createdAt' || k === 'updatedAt');
  const rest = keys.filter((k) => !priority.includes(k) && !timestamps.includes(k));
  return [...priority, ...rest, ...timestamps].slice(0, MAX_COLS);
}

export default function DataTable({ docs, total, page, totalPages, limit, sort, order, onSort, onPage, collectionName, onUserClick }) {
  const [selectedId, setSelectedId] = useState(null);
  const [nameMap, setNameMap] = useState({});
  const [fieldTypeMap, setFieldTypeMap] = useState({});

  useEffect(() => {
    const refs = COLLECTION_REFERENCES[collectionName];
    if (!refs || !docs.length) { setNameMap({}); setFieldTypeMap({}); return; }

    const typeMap = {};
    refs.forEach(({ field, type }) => { if (type) typeMap[field] = type; });
    setFieldTypeMap(typeMap);

    Promise.all(
      refs.map(async ({ field, collection }) => {
        const ids = [...new Set(
          docs.map((d) => d[field]).filter(Boolean).map(String)
        )];
        if (!ids.length) return { field, map: {} };
        try {
          const res = await api.post(`/lookup/${collection}`, { ids });
          return { field, map: res.data };
        } catch {
          return { field, map: {} };
        }
      })
    ).then((results) => {
      const combined = {};
      results.forEach(({ field, map }) => { combined[field] = map; });
      setNameMap(combined);
    });
  }, [docs, collectionName]);

  const columns = pickColumns(docs);

  const handleSort = (col) => {
    onSort(col, col === sort && order === 'desc' ? 'asc' : 'desc');
  };

  const resolvedCell = (field, value, doc) => {
    if (nameMap[field] && value) {
      const resolved = nameMap[field][String(value)];
      if (resolved) {
        const isUser = fieldTypeMap[field] === 'user';
        const displayName = typeof resolved === 'object' ? resolved.name : resolved;
        const imageUrl = typeof resolved === 'object' ? resolved.image : null;

        const inner = (
          <span className="inline-flex items-center gap-1.5">
            {imageUrl && (
              <img src={imageUrl} alt="" className="w-5 h-5 object-contain rounded-sm flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
            )}
            <span className={isUser ? 'text-blue-600 font-medium underline decoration-dotted underline-offset-2' : 'text-blue-600 font-medium'}>
              {displayName}
            </span>
          </span>
        );

        if (isUser && onUserClick) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onUserClick(String(value), displayName); }}
              className="hover:opacity-75 transition-opacity"
            >
              {inner}
            </button>
          );
        }
        return inner;
      }
    }
    return cellValue(value);
  };

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                  >
                    {col}
                    {sort === col && (
                      <span className="ml-1 text-blue-500">{order === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No documents found.
                  </td>
                </tr>
              )}
              {docs.map((doc, i) => (
                <tr key={String(doc._id ?? i)} className="hover:bg-gray-50 transition-colors">
                  {columns.map((col) => (
                    <td key={col} className="px-4 py-3 text-gray-700 font-mono text-xs max-w-xs truncate">
                      {resolvedCell(col, doc[col], doc)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedId(String(doc._id))}
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            {total === 0 ? 'No results' : `Showing ${start}–${end} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => onPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">«</button>
            <button onClick={() => onPage(page - 1)} disabled={page === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">‹</button>
            <span className="px-3 py-1 text-xs text-gray-600">{page} / {totalPages || 1}</span>
            <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">›</button>
            <button onClick={() => onPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">»</button>
          </div>
        </div>
      </div>

      {selectedId && (
        <DocumentModal
          collectionName={collectionName}
          docId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
