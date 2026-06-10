import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const ROLE_COLORS = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
};

const ROLES = ['superadmin', 'admin', 'viewer'];

function RoleBadge({ role }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'}`}>
      {role}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'viewer' });
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/admin-users')
      .then((res) => setUsers(res.data))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await api.post('/admin-users', form);
      setShowCreate(false);
      setForm({ email: '', username: '', password: '', role: 'viewer' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const payload = {};
      if (editRole !== editUser.role) payload.role = editRole;
      if (editPassword) payload.password = editPassword;
      if (Object.keys(payload).length) await api.patch(`/admin-users/${editUser.id}`, payload);
      setEditUser(null);
      setEditPassword('');
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/admin-users/${deleteUser.id}`);
      setDeleteUser(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (str) => {
    try { return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return str; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
          <p className="text-sm text-gray-400 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setFormError(''); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add User
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">2FA</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No admin users found.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {u.email || u.username}
                  {u.username === currentUser && (
                    <span className="ml-2 text-xs text-gray-400">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3">
                  {u.two_factor_enabled
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">✓ Enabled</span>
                    : <span className="text-xs text-gray-400">Disabled</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setEditUser(u); setEditRole(u.role); setEditPassword(''); setFormError(''); }}
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                    >
                      Edit
                    </button>
                    {u.username !== currentUser && (
                      <button
                        onClick={() => { setDeleteUser(u); setFormError(''); }}
                        className="text-xs text-red-400 hover:text-red-600 font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal title="Add Admin User" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                placeholder="Defaults to email prefix"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60">
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editUser && (
        <Modal title={`Edit — ${editUser.email || editUser.username}`} onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            {formError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
              <input
                type="password"
                minLength={8}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditUser(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteUser && (
        <Modal title="Delete User" onClose={() => setDeleteUser(null)}>
          <p className="text-sm text-gray-600 mb-5">
            Are you sure you want to delete <strong>{deleteUser.email || deleteUser.username}</strong>? This cannot be undone.
          </p>
          {formError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{formError}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteUser(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-60">
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
