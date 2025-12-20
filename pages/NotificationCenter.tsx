import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useCompany } from '../context/CompanyContext';
import { format } from 'date-fns';

interface NotificationLog {
    id: string;
    title: string;
    message: string;
    recipientId: string;
    recipientName: string;
    createdAt: any;
    type: 'info' | 'warning' | 'success' | 'error';
}

const NotificationCenter: React.FC = () => {
    const { currentCompany } = useCompany();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [recipient, setRecipient] = useState('all');
    const [customers, setCustomers] = useState<any[]>([]);
    const [history, setHistory] = useState<NotificationLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');

    useEffect(() => {
        if (currentCompany) {
            fetchCustomers();
            fetchHistory();
        }
    }, [currentCompany]);

    const fetchCustomers = async () => {
        try {
            const q = query(collection(db, 'customers'), where('companyId', '==', currentCompany?.id));
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomers(list);
        } catch (error) {
            console.error("Error fetching customers", error);
        }
    };

    const fetchHistory = async () => {
        try {
            const q = query(
                collection(db, 'notifications'),
                where('companyId', '==', currentCompany?.id),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NotificationLog));
            setHistory(list);
        } catch (error) {
            console.error("Error fetching history", error);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !message || !currentCompany) return;

        setLoading(true);
        try {
            let recipientName = 'All Users';
            if (recipient !== 'all') {
                const user = customers.find(c => c.id === recipient);
                recipientName = user ? user.name : 'Unknown User';
            }

            await addDoc(collection(db, 'notifications'), {
                companyId: currentCompany.id,
                title,
                message,
                recipientId: recipient,
                recipientName,
                createdAt: serverTimestamp(),
                read: false, // For simple single-user notifications, or initial state
                type: 'info'
            });

            // Reset form
            setTitle('');
            setMessage('');
            setRecipient('all');
            alert('Notification sent successfully!');
            fetchHistory(); // Refresh history
            setActiveTab('history');
        } catch (error) {
            console.error("Error sending notification", error);
            alert('Failed to send notification.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Notification Center</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Send alerts and updates to your customers</p>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('compose')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'compose'
                                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                    >
                        Compose
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history'
                                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                    >
                        History
                    </button>
                </div>
            </div>

            {activeTab === 'compose' ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 md:p-8 max-w-3xl">
                    <form onSubmit={handleSend} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Recipient</label>
                            <select
                                value={recipient}
                                onChange={(e) => setRecipient(e.target.value)}
                                className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500 p-3"
                            >
                                <option value="all">📢 All Users</option>
                                <optgroup label="Specific Customers">
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email})</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Payment Reminder"
                                className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500 p-3"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Write your message here..."
                                rows={5}
                                className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-indigo-500 p-3"
                                required
                            />
                        </div>

                        <div className="flex justify-end pt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/30"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">send</span>
                                        Send Notification
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {history.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            <span className="material-symbols-outlined text-4xl mb-4 opacity-50">inbox</span>
                            <p>No notifications sent yet.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                            {history.map((item) => (
                                <div key={item.id} className="p-4 md:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${item.recipientId === 'all' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'}`}>
                                                {item.recipientId === 'all' ? 'Everyone' : 'Direct Message'}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {item.createdAt?.toDate ? format(item.createdAt.toDate(), 'PPp') : 'Just now'}
                                            </span>
                                        </div>
                                    </div>
                                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{item.title}</h3>
                                    <p className="text-slate-600 dark:text-slate-300 text-sm">{item.message}</p>
                                    {item.recipientName && (
                                        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                                            <span className="material-symbols-outlined text-sm">person</span>
                                            Sent to: <span className="font-medium">{item.recipientName}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
