import React, { useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { LocalNotifications } from '@capacitor/local-notifications';
import { onAuthStateChanged, User } from 'firebase/auth';

const NotificationListener: React.FC = () => {
    useEffect(() => {
        const checkPerms = async () => {
            try {
                const perm = await LocalNotifications.checkPermissions();
                if (perm.display !== 'granted') {
                    await LocalNotifications.requestPermissions();
                }
                // Explicitly create the channel for Android 8+
                await LocalNotifications.createChannel({
                    id: 'default',
                    name: 'General Alerts',
                    description: 'General system notifications',
                    importance: 5,
                    visibility: 1,
                    sound: 'beep.wav',
                    vibration: true,
                });
            } catch (e) {
                // Web fallback or error
                if ("Notification" in window && Notification.permission !== "granted") {
                    Notification.requestPermission();
                }
            }
        };
        checkPerms();

        let unsubscribe: any;

        const setupListener = async (user: User | null) => {
            if (unsubscribe) unsubscribe();

            const customerId = localStorage.getItem('customerPortalId');

            let companyId: string | null = null;

            if (user) {
                if (customerId) {
                    try {
                        const tokenResult = await user.getIdTokenResult();
                        companyId = (tokenResult.claims as any).companyId || null;
                    } catch {
                        return;
                    }
                } else {
                    companyId = localStorage.getItem(`selectedCompany_${user.uid}`);
                }
            }

            if (!companyId) return;

            const recipients = ['all'];
            if (customerId) recipients.push(customerId);
            if (user) recipients.push(user.uid);

            const q = query(
                collection(db, 'notifications'),
                where('recipientId', 'in', recipients),
                where('companyId', '==', companyId)
            );

            unsubscribe = onSnapshot(q, (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    // We only care about NEWLY ADDED notifications
                    if (change.type === 'added') {
                        const data = change.doc.data();

                        // TIME FILTER: Only show notifications created in the last 10 minutes
                        // Check both common field names
                        const ts = data.date || data.createdAt;
                        const createdAt = ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : Date.now());
                        const now = Date.now();
                        const age = now - createdAt;

                        // Only notify for fresh alerts (avoiding old ones on mount)
                        if (age > 600000) return;

                        // ponytail: same Firestore doc -> same local notif once (stable id + guard)
                        const docId = change.doc.id;
                        const listenerGuard = `notif_listener_${docId}`;
                        if (localStorage.getItem(listenerGuard)) return;
                        let h = 2166136261;
                        for (let i = 0; i < docId.length; i++) {
                            h ^= docId.charCodeAt(i);
                            h = Math.imul(h, 16777619);
                        }
                        const notifId = (h >>> 0) % 2000000000 + 1;

                        try {
                            // Schedule Local Notification
                            await LocalNotifications.schedule({
                                notifications: [{
                                    title: data.title || 'JLS Alert',
                                    body: data.message || '',
                                    id: notifId,
                                    schedule: { at: new Date(Date.now() + 1500) }, // 1.5s delay
                                    sound: 'beep.wav',
                                    channelId: 'default',
                                    smallIcon: 'ic_stat_jls',
                                    iconColor: '#4f46e5',
                                    largeIcon: 'ic_launcher'
                                }]
                            });
                            localStorage.setItem(listenerGuard, '1');
                        } catch (err) {
                            // Fallback for Web Browser
                            if ("Notification" in window) {
                                if (Notification.permission === "granted") {
                                    new Notification(data.title || 'JLS Alert', { body: data.message });
                                } else if (Notification.permission !== "denied") {
                                    Notification.requestPermission().then(permission => {
                                        if (permission === "granted") {
                                            new Notification(data.title || 'JLS Alert', { body: data.message });
                                        }
                                    });
                                }
                            }
                            console.error("Error scheduling local notification:", err);
                        }
                    }
                });
            }, (error) => {
                console.error("Firestore Listener Error:", error);
            });
        };

        const authUnsub = onAuthStateChanged(auth, (user) => {
            setupListener(user).catch(console.error);
        });

        return () => {
            if (unsubscribe) unsubscribe();
            authUnsub();
        };
    }, []);

    return null;
};

export default NotificationListener;
