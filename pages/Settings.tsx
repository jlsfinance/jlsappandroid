import React, { useState } from 'react';
import { APP_NAME, APP_VERSION, DEVELOPER_NAME } from '../constants';
import { Link, useNavigate } from 'react-router-dom';
import { signOut, updateProfile, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';
import { NotificationService } from '../services/NotificationService';
import AboutModal from '../components/AboutModal';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [profileName, setProfileName] = useState(auth.currentUser?.displayName || '');
  const [profileEmail, setProfileEmail] = useState(auth.currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setIsUpdating(true);
    setUpdateMessage('');

    try {
      if (profileName !== auth.currentUser.displayName) {
        await updateProfile(auth.currentUser, { displayName: profileName });
      }

      if (newPassword && newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      if ((profileEmail !== auth.currentUser.email || newPassword) && currentPassword) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email!, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);

        if (profileEmail !== auth.currentUser.email) {
          await updateEmail(auth.currentUser, profileEmail);
        }

        if (newPassword) {
          await updatePassword(auth.currentUser, newPassword);
        }
      }

      setUpdateMessage('Profile updated successfully!');
      setTimeout(() => {
        setShowProfileModal(false);
        setUpdateMessage('');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }, 1500);
    } catch (error: any) {
      setUpdateMessage(error.message || 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto shadow-2xl bg-background-light dark:bg-background-dark text-slate-900 dark:text-white pb-10">
      <div className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <Link to="/" className="flex items-center gap-2 text-primary cursor-pointer">
          <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
          <span className="text-base font-medium">Back</span>
        </Link>
        <h1 className="text-lg font-bold flex-1 text-center pr-12">Settings</h1>
      </div>

      <div className="px-4 mt-6 mb-2">
        <div
          onClick={() => setShowProfileModal(true)}
          className="bg-white dark:bg-[#1a2235] rounded-xl p-4 shadow-sm flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="bg-gradient-to-br from-primary to-primary-dark rounded-full h-16 w-16 shrink-0 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
            {(auth.currentUser?.displayName || auth.currentUser?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col justify-center flex-1 min-w-0">
            <p className="text-lg font-bold leading-tight truncate">{auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'User'}</p>
            <p className="text-slate-500 dark:text-gray-400 text-sm font-medium leading-normal truncate">{auth.currentUser?.email}</p>
            <p className="text-primary text-xs font-medium mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">edit</span>
              Tap to edit profile
            </p>
          </div>
          <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-slate-500 dark:text-gray-400 text-sm font-bold uppercase tracking-wider px-6 pb-2 pt-2">Company</h3>
        <div className="mx-4 bg-white dark:bg-[#1a2235] rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          <Link to="/company-selector" className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">business</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium leading-normal truncate">{currentCompany?.name || 'Select Company'}</p>
              <p className="text-xs text-slate-400">Tap to switch, edit or add company</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-slate-500 dark:text-gray-400 text-sm font-bold uppercase tracking-wider px-6 pb-2 pt-2">Account</h3>
        <div className="mx-4 bg-white dark:bg-[#1a2235] rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          <div
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">person</span>
            </div>
            <div className="flex-1">
              <p className="text-base font-medium leading-normal">Edit Profile</p>
              <p className="text-xs text-slate-400">Name, Email & Password</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </div>

          <Link to="/user-management" className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <div className="flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
            </div>
            <div className="flex-1">
              <p className="text-base font-medium leading-normal">User Management</p>
              <p className="text-xs text-slate-400">Roles & Permissions</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-slate-500 dark:text-gray-400 text-sm font-bold uppercase tracking-wider px-6 pb-2 pt-2">About & Legal</h3>
        <div className="mx-4 bg-white dark:bg-[#1a2235] rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">

          <div
            onClick={() => setShowAbout(true)}
            className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">info</span>
            </div>
            <div className="flex-1">
              <p className="text-base font-medium leading-normal">App Info</p>
              <p className="text-xs text-slate-400">Version & Build Details</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </div>

          <Link to="/terms" className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <div className="flex items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">description</span>
            </div>
            <div className="flex-1">
              <p className="text-base font-medium leading-normal">Terms & Conditions</p>
              <p className="text-xs text-slate-400">Loan Terms & Disclosure</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </Link>

          <Link to="/privacy" className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <div className="flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0 size-9">
              <span className="material-symbols-outlined text-[20px]">security</span>
            </div>
            <div className="flex-1">
              <p className="text-base font-medium leading-normal">Privacy Policy</p>
              <p className="text-xs text-slate-400">Terms & Conditions</p>
            </div>
            <span className="material-symbols-outlined text-gray-400 dark:text-gray-600 text-[20px]">chevron_right</span>
          </Link>

          <div
            onClick={() => alert("Please contact support or admin to request permanent account deletion.")}
            className="flex items-center gap-4 px-4 py-3.5 hover:bg-red-50 dark:hover:bg-red-900/10 cursor-pointer transition-colors group"
          >
            <div className="flex items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0 size-9 group-hover:bg-red-200 dark:group-hover:bg-red-900/50 transition-colors">
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </div>
            <div className="flex-1">
              <p className="text-base font-medium leading-normal text-red-600 dark:text-red-400">Delete Account</p>
              <p className="text-xs text-red-400/80 dark:text-red-400/70">Request permanent data removal</p>
            </div>
            <span className="material-symbols-outlined text-red-400 dark:text-red-600 text-[20px]">chevron_right</span>
          </div>

        </div>
      </div>

      <div className="mt-8 mx-4 mb-4 space-y-3">
        <button onClick={() => NotificationService.testNotification()} className="w-full bg-white dark:bg-[#1a2235] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3.5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 border border-slate-100 dark:border-slate-800">
          <span className="material-symbols-outlined text-lg">notifications_active</span>
          Test Notification
        </button>
        <button onClick={handleLogout} className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 border border-red-700">
          <span className="material-symbols-outlined text-lg material-symbols-fill">logout</span>
          Log Out Session
        </button>
      </div>

      <div className="mt-4 mb-4 text-center">
        <p className="text-xs text-slate-400 uppercase tracking-widest">{APP_NAME} {APP_VERSION}</p>
        <p className="text-[10px] text-slate-300 mt-1 font-bold">App Created by {DEVELOPER_NAME}</p>
      </div>

      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e2736] rounded-[28px] w-full max-w-sm shadow-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-gradient-to-br from-primary to-primary-dark rounded-full h-14 w-14 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                {(profileName || auth.currentUser?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Edit Profile</h3>
                <p className="text-sm text-slate-500">Update your account details</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Display Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Enter email"
                />
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Change Password (Optional)</p>

                <div className="space-y-3">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Current password (required to change email/password)"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="New password"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              {updateMessage && (
                <div className={`p-3 rounded-xl text-sm ${updateMessage.includes('success') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {updateMessage}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setUpdateMessage('');
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="flex-1 px-4 py-3 text-primary font-medium border border-primary rounded-xl hover:bg-primary/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 px-4 py-3 bg-primary text-white font-black rounded-xl hover:brightness-110 shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isUpdating ? 'Updating...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
};
export default Settings;
