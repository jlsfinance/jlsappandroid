import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';

interface UserPermissions {
  canViewLoans: boolean;
  canCollectEMI: boolean;
  canViewCustomers: boolean;
}

interface User {
  id: string;
  name?: string;
  email: string;
  role: 'admin' | 'agent' | 'customer';
  companyId?: string;
  permissions?: Partial<UserPermissions>;
}

const defaultPermissions: UserPermissions = {
  canViewLoans: false,
  canCollectEMI: false,
  canViewCustomers: false,
};

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editedRole, setEditedRole] = useState<'admin' | 'agent' | 'customer'>('customer');
  const [editedPermissions, setEditedPermissions] = useState<UserPermissions>(defaultPermissions);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'agent' | 'customer'>('customer');
  const [newPermissions, setNewPermissions] = useState<UserPermissions>(defaultPermissions);
  const [showPassword, setShowPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [addError, setAddError] = useState('');
  const [toast, setToast] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  };

  const openAddDialog = () => {
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewRole('customer');
    setNewPermissions(defaultPermissions);
    setShowPassword(false);
    setAddError('');
    setShowAddDialog(true);
  };

  const closeAddDialog = () => {
    if (isCreating) return;
    setShowAddDialog(false);
  };

  const handleCreateUser = async () => {
    if (isCreating) return;
    setAddError('');

    const name = newName.trim();
    const email = newEmail.trim();

    if (!name || !email || !newPassword) {
      setAddError('All fields are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddError('Enter a valid email address.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setAddError('Password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (!currentCompany) {
      setAddError('Please select or create a company first.');
      return;
    }

    setIsCreating(true);
    try {
      const createUserByAdmin = httpsCallable<
        {
          name: string;
          email: string;
          password: string;
          role: string;
          companyId: string;
          permissions?: Partial<UserPermissions>;
        },
        { success: boolean; uid: string }
      >(functions, 'createUserByAdmin');

      await createUserByAdmin({
        name,
        email,
        password: newPassword,
        role: newRole,
        companyId: currentCompany.id,
        permissions: newRole === 'agent' ? newPermissions : {},
      });

      setShowAddDialog(false);
      await fetchUsers();
      showToast(`User ${name} created successfully.`);
    } catch (err: any) {
      const code = err?.code || '';
      if (code.includes('already-exists')) {
        setAddError('This email is already in use.');
      } else if (code.includes('permission-denied')) {
        setAddError("You don't have permission to add users.");
      } else if (code.includes('not-found')) {
        setAddError('Company not found. Please re-select your company.');
      } else if (code.includes('invalid-argument')) {
        setAddError(err?.message || 'Please check the entered details.');
      } else if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
        setAddError('Network error. Check your connection and try again.');
      } else {
        setAddError('Something went wrong. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "users"),
        where("companyId", "==", currentCompany.id)
      );
      const querySnapshot = await getDocs(q);
      const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setEditedRole(user.role || 'customer');
    setEditedPermissions({ ...defaultPermissions, ...user.permissions });
  };

  const handleUserUpdate = async () => {
    if (!selectedUser || !currentCompany) return;
    setIsSubmitting(true);
    try {
      const updateUserByAdmin = httpsCallable<
        {
          uid: string;
          permissions?: Partial<UserPermissions>;
          companyId: string;
        },
        { success: boolean; uid: string }
      >(functions, 'updateUserByAdmin');

      await updateUserByAdmin({
        uid: selectedUser.id,
        companyId: currentCompany.id,
        permissions: editedRole === 'agent' ? editedPermissions : {},
      });

      alert(`User profile for ${selectedUser.name || selectedUser.email} has been updated and assigned to ${currentCompany.name}.`);
      await fetchUsers();
      setSelectedUser(null);
    } catch (error) {
      console.error("Error updating user:", error);
      alert('Update failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPin = async () => {
    if (!selectedUser || !currentCompany) return;
    if (!pinValue || pinValue.length < 6) { setPinError('PIN must be at least 6 digits.'); return; }
    setPinLoading(true);
    setPinError('');
    try {
      const custSnap = await getDocs(query(
        collection(db, "customers"),
        where("companyId", "==", currentCompany.id),
        where("name", "==", selectedUser.name)
      ));
      if (custSnap.empty) {
        setPinError('No matching customer record found. Create a customer with this name first.');
        return;
      }
      const setCustomerPin = httpsCallable(functions, 'setCustomerPin');
      await setCustomerPin({ customerId: custSnap.docs[0].id, newPin: pinValue });
      setPinValue('');
      showToast('PIN set successfully.');
    } catch (err: any) { setPinError(err?.message || 'Failed to set PIN.'); }
    finally { setPinLoading(false); }
  };

  const formatPermissionKey = (key: string) => {
    return key.replace('can', '').replace(/([A-Z])/g, ' $1').trim();
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24 text-slate-900 dark:text-white">
      <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {currentCompany && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              Users will be assigned to: <strong>{currentCompany.name}</strong>
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-[#1e2736] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-lg">System Users</h2>
              <p className="text-sm text-slate-500">Manage user roles and agent permissions.</p>
            </div>
            <button
              onClick={openAddDialog}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white font-black text-xs shadow-md shadow-primary/20 active:scale-95 transition-all uppercase tracking-widest"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add User
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Permissions</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No users found.</td></tr>
                ) : (
                  users.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium">{user.name || 'N/A'}</td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase ${user.role === 'admin' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          user.role === 'agent' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                          {user.role || 'Customer'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.role === 'agent' && user.permissions ? (
                            Object.entries(user.permissions).filter(([, val]) => val).map(([key]) => (
                              <span key={key} className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                                {formatPermissionKey(key)}
                              </span>
                            ))
                          ) : <span className="text-slate-400 text-xs">-</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditDialog(user)} className="px-4 py-1.5 rounded-lg bg-primary text-white font-black text-xs shadow-md shadow-primary/20 active:scale-95 transition-all uppercase tracking-widest">
                          Edit Profile
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-1">Edit User</h3>
            <p className="text-sm text-slate-500 mb-4">{selectedUser.name || selectedUser.email}</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Role</label>
                <select
                  value={editedRole}
                  onChange={(e) => setEditedRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="customer">Customer</option>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editedRole === 'agent' && (
                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h4 className="text-sm font-bold">Agent Permissions</h4>
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedPermissions.canViewCustomers}
                      onChange={(e) => setEditedPermissions(p => ({ ...p, canViewCustomers: e.target.checked }))}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-sm">Can View Customers</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedPermissions.canViewLoans}
                      onChange={(e) => setEditedPermissions(p => ({ ...p, canViewLoans: e.target.checked }))}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-sm">Can View Loans</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedPermissions.canCollectEMI}
                      onChange={(e) => setEditedPermissions(p => ({ ...p, canCollectEMI: e.target.checked }))}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-sm">Can Collect EMI</span>
                  </label>
                </div>
              )}
              {editedRole === 'customer' && (
                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h4 className="text-sm font-bold">PIN Management</h4>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={pinValue}
                      onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit PIN"
                      inputMode="numeric"
                      maxLength={10}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                    />
                    <button
                      onClick={handleSetPin}
                      disabled={pinLoading}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50"
                    >
                      {pinLoading ? 'Setting...' : 'Set PIN'}
                    </button>
                  </div>
                  {pinError && <p className="text-xs text-red-500">{pinError}</p>}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUserUpdate}
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#1e2736] rounded-2xl w-full max-w-sm shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-1">Add User</h3>
            <p className="text-sm text-slate-500 mb-4">
              New user will be assigned to <strong>{currentCompany?.name || '—'}</strong>
            </p>

            {addError && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm font-medium text-red-600 dark:text-red-400">
                {addError}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isCreating}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isCreating}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isCreating}
                    className="w-full px-3 py-2 pr-10 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                    placeholder="Min 8 chars, 1 letter, 1 number"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    disabled={isCreating}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  disabled={isCreating}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#1a2230] border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                >
                  <option value="customer">Customer</option>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {newRole === 'agent' && (
                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h4 className="text-sm font-bold">Agent Permissions</h4>
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPermissions.canViewCustomers}
                      onChange={(e) => setNewPermissions((p) => ({ ...p, canViewCustomers: e.target.checked }))}
                      disabled={isCreating}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 disabled:opacity-50"
                    />
                    <span className="text-sm">Can View Customers</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPermissions.canViewLoans}
                      onChange={(e) => setNewPermissions((p) => ({ ...p, canViewLoans: e.target.checked }))}
                      disabled={isCreating}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 disabled:opacity-50"
                    />
                    <span className="text-sm">Can View Loans</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPermissions.canCollectEMI}
                      onChange={(e) => setNewPermissions((p) => ({ ...p, canCollectEMI: e.target.checked }))}
                      disabled={isCreating}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 disabled:opacity-50"
                    />
                    <span className="text-sm">Can Collect EMI</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={closeAddDialog}
                disabled={isCreating}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isCreating}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isCreating && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto">
          <div className="bg-slate-800 dark:bg-slate-900 text-white rounded-xl p-4 shadow-lg flex items-center gap-3">
            <span className="material-symbols-outlined text-green-400">check_circle</span>
            <span className="text-sm">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;