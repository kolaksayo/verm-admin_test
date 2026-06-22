import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import Badge from '../components/ui/Badge';

const ROLE_BADGE_VARIANT = {
  superadmin: 'default',
  admin:      'secondary',
  viewer:     'outline',
};

const ROLES = ['superadmin', 'admin', 'viewer'];

const inputCls = 'w-full px-3 py-2 bg-vs-elevated border border-vs-border rounded-lg text-sm text-vs-text placeholder-vs-text-3 focus:outline-none focus:ring-2 focus:ring-vs-ring focus:border-transparent transition-colors';
const labelCls = 'block text-sm font-medium text-vs-text-2 mb-1';

function RoleBadge({ role }) {
  return <Badge variant={ROLE_BADGE_VARIANT[role] || 'outline'}>{role}</Badge>;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-vs-border">
          <h2 className="text-sm font-semibold text-vs-text">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </Card>
    </div>
  );
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enforceMfa, setEnforceMfa] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'viewer' });
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/admin-users')
      .then((res) => setUsers(res.data))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
    api.get('/admin-users/mfa-settings').then(r => setEnforceMfa(r.data.enforceMfa)).catch(() => {});
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

  const handleResetMfa = async (user) => {
    if (!window.confirm(`Reset MFA for ${user.email || user.username}? They will need to set it up again.`)) return;
    setSaving(true);
    try {
      await api.delete(`/admin-users/${user.id}/2fa`);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to reset MFA');
    } finally {
      setSaving(false);
    }
  };

  const handleDisableMfa = async (user) => {
    if (!window.confirm(`Disable MFA for ${user.email || user.username} and mark them as exempt? They will be able to log in without MFA even if enforcement is on.`)) return;
    setSaving(true);
    try {
      await api.post(`/admin-users/${user.id}/2fa/disable`);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to disable MFA');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveExemption = async (user) => {
    if (!window.confirm(`Remove MFA exemption for ${user.email || user.username}? If enforcement is on, they will be required to set up MFA on next login.`)) return;
    setSaving(true);
    try {
      await api.delete(`/admin-users/${user.id}/2fa`);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to remove exemption');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnforceMfa = async (val) => {
    try {
      await api.post('/admin-users/mfa-settings', { enforceMfa: val });
      setEnforceMfa(val);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update MFA enforcement');
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
      if (editEmail.trim() && editEmail.trim().toLowerCase() !== (editUser.email || '')) payload.email = editEmail.trim();
      if (Object.keys(payload).length) await api.patch(`/admin-users/${editUser.id}`, payload);
      setEditUser(null);
      setEditPassword('');
      setEditEmail('');
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
          <h1 className="text-2xl font-bold text-vs-text">Admin Users</h1>
          <p className="text-sm text-vs-text-3 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setFormError(''); }}>
          + Add User
        </Button>
      </div>

      {/* MFA Enforcement banner */}
      <Card className="px-5 py-4 mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-vs-text">MFA Enforcement</p>
          <p className="text-xs text-vs-text-3 mt-0.5">Require all non-exempt users to set up MFA on next login</p>
        </div>
        <button
          type="button"
          onClick={() => toggleEnforceMfa(!enforceMfa)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-vs-ring focus:ring-offset-2 focus:ring-offset-vs-card ${enforceMfa ? 'bg-vs-purple' : 'bg-vs-elevated border border-vs-border'}`}
          role="switch"
          aria-checked={enforceMfa}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enforceMfa ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </Card>

      {error && (
        <div className="bg-vs-danger/10 border border-vs-danger/30 text-vs-danger text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-vs-elevated border-b border-vs-border">
              <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wider">2FA</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-vs-text-3 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vs-border">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-vs-text-3 text-sm">Loading…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-vs-text-3 text-sm">No admin users found.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-vs-elevated transition-colors">
                <td className="px-4 py-3 font-medium text-vs-text">
                  {u.email || u.username}
                  {u.username === currentUser && (
                    <span className="ml-2 text-xs text-vs-text-3">(you)</span>
                  )}
                </td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3">
                  {u.two_factor_enabled
                    ? <span className="inline-flex items-center gap-1 text-xs text-vs-success font-medium"><Check className="w-3 h-3" /> Enabled</span>
                    : <span className="text-xs text-vs-text-3">Disabled</span>}
                </td>
                <td className="px-4 py-3 text-vs-text-3 text-xs">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditUser(u); setEditRole(u.role); setEditPassword(''); setEditEmail(u.email || ''); setFormError(''); }}
                    >
                      Edit
                    </Button>
                    {u.username !== currentUser && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => { setDeleteUser(u); setFormError(''); }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Create modal */}
      {showCreate && (
        <Modal title="Add Admin User" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <div className="text-sm text-vs-danger bg-vs-danger/10 border border-vs-danger/30 rounded-lg px-3 py-2">{formError}</div>}
            <div>
              <label className={labelCls}>Email Address</label>
              <input type="email" required placeholder="user@example.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Display Name <span className="text-vs-text-3 font-normal">(optional)</span></label>
              <input type="text" placeholder="Defaults to email prefix" value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input type="password" required minLength={8} value={form.password} placeholder="Min. 8 characters"
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create User'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editUser && (
        <Modal title={`Edit — ${editUser.email || editUser.username}`} onClose={() => setEditUser(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            {formError && <div className="text-sm text-vs-danger bg-vs-danger/10 border border-vs-danger/30 rounded-lg px-3 py-2">{formError}</div>}
            <div>
              <label className={labelCls}>Email Address</label>
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>New Password <span className="text-vs-text-3 font-normal">(leave blank to keep current)</span></label>
              <input type="password" minLength={8} value={editPassword} placeholder="Min. 8 characters"
                onChange={(e) => setEditPassword(e.target.value)} className={inputCls} />
            </div>
            {editUser.two_factor_enabled && (
              <div className="rounded-lg border border-vs-warning/40 bg-vs-warning/10 px-3 py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-vs-warning">MFA is enabled</p>
                    <p className="text-xs text-vs-warning/70">Resetting will require the user to set up MFA again</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <Button type="button" variant="secondary" size="sm" disabled={saving}
                      onClick={() => handleResetMfa(editUser)}>Reset MFA</Button>
                    <Button type="button" variant="ghost" size="sm" disabled={saving}
                      onClick={() => handleDisableMfa(editUser)}>Disable MFA</Button>
                  </div>
                </div>
              </div>
            )}
            {!editUser.two_factor_enabled && !editUser.two_factor_exempt && (
              <div className="flex items-center justify-between rounded-lg border border-vs-border bg-vs-elevated px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-vs-text">MFA is disabled</p>
                  <p className="text-xs text-vs-text-3">User will be required to set up MFA if enforcement is on</p>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={saving} className="ml-3 whitespace-nowrap"
                  onClick={() => handleDisableMfa(editUser)}>Disable MFA</Button>
              </div>
            )}
            {!editUser.two_factor_enabled && editUser.two_factor_exempt && (
              <div className="flex items-center justify-between rounded-lg border border-vs-purple/40 bg-vs-purple/10 px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-vs-purple-light">MFA exempt</p>
                  <p className="text-xs text-vs-purple-light/70">User can log in without MFA even if enforcement is on</p>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={saving} className="ml-3 whitespace-nowrap"
                  onClick={() => handleRemoveExemption(editUser)}>Remove exemption</Button>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteUser && (
        <Modal title="Delete User" onClose={() => setDeleteUser(null)}>
          <p className="text-sm text-vs-text-2 mb-5">
            Are you sure you want to delete <strong className="text-vs-text">{deleteUser.email || deleteUser.username}</strong>? This cannot be undone.
          </p>
          {formError && <div className="text-sm text-vs-danger bg-vs-danger/10 border border-vs-danger/30 rounded-lg px-3 py-2 mb-4">{formError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
