import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import ReadableView from './ReadableView';
import { useAuth } from '../context/AuthContext';

const READONLY_COLLECTIONS = new Set([
  'adminauditlogs', 'transactions', 'game_bet', 'game_bet_leaderboard',
  'hook_logs', 'referrals', 'telegram_notified',
]);

export default function DocumentModal({ collectionName, docId, onClose }) {
  const { role, editMode, requestElevation } = useAuth();
  const canEdit = ['superadmin', 'admin'].includes(role) && !READONLY_COLLECTIONS.has(collectionName);

  const [doc, setDoc]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState('details');
  const [copied, setCopied] = useState(false);

  // Edit state
  const [editJson, setEditJson]         = useState('');
  const [jsonError, setJsonError]       = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [deleting, setDeleting]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [elevating, setElevating]       = useState(false);
  const [elevateReason, setElevateReason] = useState('');
  const [elevateError, setElevateError] = useState('');

  const loadDoc = useCallback(() => {
    setLoading(true);
    api.get(`/collections/${collectionName}/${docId}`)
      .then((res) => {
        setDoc(res.data);
        setEditJson(JSON.stringify(res.data, null, 2));
      })
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [collectionName, docId]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleJsonChange = (val) => {
    setEditJson(val);
    setJsonError('');
    try { JSON.parse(val); } catch (e) { setJsonError(e.message); }
  };

  const handleSave = async () => {
    let parsed;
    try { parsed = JSON.parse(editJson); } catch (e) { setJsonError(e.message); return; }
    setSaving(true); setSaveMsg('');
    try {
      await api.patch(`/collections/${collectionName}/${docId}`, parsed);
      setSaveMsg('Saved successfully');
      loadDoc();
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setSaveMsg(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleting(true);
    try {
      await api.delete(`/collections/${collectionName}/${docId}`);
      onClose();
    } catch (err) {
      setSaveMsg(err.response?.data?.error || 'Delete failed');
      setDeleting(false);
    }
  };

  const handleRequestElevation = async () => {
    setElevating(true); setElevateError('');
    try {
      await requestElevation(elevateReason);
    } catch (err) {
      setElevateError(err.response?.data?.error || 'Failed to elevate access');
    } finally {
      setElevating(false);
    }
  };

  const tabs = ['details', 'json', ...(canEdit ? ['edit'] : [])];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-vs-card border border-vs-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-vs-border flex-shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-vs-text-3 uppercase tracking-wider">{collectionName}</p>
            <p className="text-xs font-mono text-vs-text-3 truncate mt-0.5">{docId}</p>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <div className="flex bg-vs-elevated rounded-lg p-0.5">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                    tab === t ? 'bg-vs-card text-vs-text shadow-sm' : 'text-vs-text-3 hover:text-vs-text-2'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === 'json' && (
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1.5 rounded-lg bg-vs-elevated hover:bg-vs-hover text-vs-text-3 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-vs-text-3 hover:text-vs-text w-7 h-7 flex items-center justify-center rounded-lg hover:bg-vs-elevated text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-vs-text-3">Loading…</div>
            </div>
          )}

          {!loading && !doc && (
            <p className="text-sm text-vs-danger">Document not found.</p>
          )}

          {doc && tab === 'details' && <ReadableView doc={doc} />}

          {doc && tab === 'json' && (
            <pre className="text-xs font-mono text-vs-text whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(doc, null, 2)}
            </pre>
          )}

          {doc && tab === 'edit' && (
            <div className="space-y-4">
              {!editMode ? (
                /* Locked state — must elevate first */
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                  <p className="text-sm font-semibold text-amber-400 mb-1">Edit access required</p>
                  <p className="text-xs text-vs-text-3 mb-4">
                    You must request temporary edit access before modifying documents. All changes will be logged.
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={elevateReason}
                      onChange={(e) => setElevateReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    <button
                      onClick={handleRequestElevation}
                      disabled={elevating}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {elevating ? 'Requesting…' : '🔓 Request Edit Access'}
                    </button>
                    {elevateError && <p className="text-xs text-vs-danger">{elevateError}</p>}
                  </div>
                </div>
              ) : (
                /* Edit mode active */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <span>⚠</span>
                    <span>Edit mode active — changes will be saved to the database and logged.</span>
                  </div>

                  <textarea
                    value={editJson}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    rows={16}
                    spellCheck={false}
                    className={`w-full px-3 py-3 bg-vs-elevated border rounded-lg text-xs font-mono text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 resize-y ${
                      jsonError ? 'border-vs-danger focus:ring-vs-danger/50' : 'border-vs-border focus:ring-vs-purple/50'
                    }`}
                  />

                  {jsonError && (
                    <p className="text-xs text-vs-danger font-mono">JSON error: {jsonError}</p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleSave}
                      disabled={saving || !!jsonError}
                      className="px-4 py-2 bg-vs-purple hover:bg-vs-purple/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => { setEditJson(JSON.stringify(doc, null, 2)); setJsonError(''); setSaveMsg(''); }}
                      className="px-4 py-2 bg-vs-elevated hover:bg-vs-hover text-vs-text-2 text-sm rounded-lg transition-colors"
                    >
                      Reset
                    </button>
                    {saveMsg && (
                      <span className={`text-xs ${saveMsg.includes('uccess') ? 'text-vs-success' : 'text-vs-danger'}`}>
                        {saveMsg}
                      </span>
                    )}
                  </div>

                  {/* Delete zone */}
                  <div className="mt-4 pt-4 border-t border-vs-border">
                    <p className="text-xs font-semibold text-vs-danger mb-2">Danger Zone</p>
                    <p className="text-xs text-vs-text-3 mb-3">
                      Permanently delete this document. Type <span className="font-mono font-bold">DELETE</span> to confirm.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm font-mono text-vs-danger placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-danger/50 w-52"
                      />
                      <button
                        onClick={handleDelete}
                        disabled={deleting || deleteConfirm !== 'DELETE'}
                        className="px-4 py-2 bg-vs-danger/20 hover:bg-vs-danger/30 text-vs-danger text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                      >
                        {deleting ? 'Deleting…' : 'Delete Document'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
