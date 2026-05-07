import { useState } from 'react';

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

function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function isImageUrl(val) {
  if (typeof val !== 'string') return false;
  return /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(val) || val.includes('api-sports.io');
}

function PrimitiveValue({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-300 italic">null</span>;
  }
  if (typeof value === 'boolean') {
    return value
      ? <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Yes</span>
      : <span className="inline-block px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium">No</span>;
  }
  if (isISODate(value)) {
    return <span className="text-gray-700">{formatDate(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-gray-800">{value.toLocaleString()}</span>;
  }
  if (isImageUrl(value)) {
    return (
      <span className="inline-flex items-center gap-2">
        <img
          src={value}
          alt=""
          className="w-10 h-10 object-contain rounded border border-gray-100 bg-gray-50"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs break-all">{value}</a>
      </span>
    );
  }
  return <span className="text-gray-800 break-all">{String(value)}</span>;
}

function ArrayValue({ items, depth }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <span className="text-gray-300 italic">Empty</span>;
  }

  if (typeof items[0] !== 'object' || items[0] === null) {
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((v, i) => (
          <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
            {String(v)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
      >
        <span>{expanded ? '▾' : '▸'}</span>
        {items.length} item{items.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-400 mb-2 font-medium">#{i + 1}</p>
              <FieldList obj={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldValue({ value, depth }) {
  if (Array.isArray(value)) {
    return <ArrayValue items={value} depth={depth} />;
  }
  if (value !== null && typeof value === 'object') {
    return (
      <div className="mt-1 pl-3 border-l-2 border-gray-200">
        <FieldList obj={value} depth={depth + 1} />
      </div>
    );
  }
  return <PrimitiveValue value={value} />;
}

function FieldList({ obj, depth = 0 }) {
  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([key, value]) => (
        <div key={key} className={`flex gap-3 ${depth === 0 ? 'py-2 border-b border-gray-100 last:border-0' : ''}`}>
          <span className="text-xs text-gray-400 font-medium w-36 flex-shrink-0 pt-0.5">
            {formatLabel(key)}
          </span>
          <div className="flex-1 text-sm min-w-0">
            <FieldValue value={value} depth={depth} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReadableView({ doc }) {
  return <FieldList obj={doc} depth={0} />;
}
