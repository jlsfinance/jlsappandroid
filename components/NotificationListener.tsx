import React, { useEffect } from 'react';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { LocalNotifications } from '@capacitor/local-notifications';
import { onAuthStateChanged } from 'firebase/auth';

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

        const setupListener = (userId: string | null) => {
            const customerId = localStorage.getItem('customerPortalId');

            // Define who this device is listening for
            const recipients = ['all'];
            if (customerId) recipients.push(customerId);
            if (userId) recipients.push(userId);

            console.log("🔔 Notification Listener Active for:", recipients);

            // Create query - Unordered to avoid index requirement for small datasets
            // We filter by 'added' change type for real-time alerts
            const q = query(
                collection(db, 'notifications'),
                where('recipientId', 'in', recipients)
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

                        console.log("🔔 Receiving Notification:", data.title);

                        try {
                            // Schedule Local Notification
                            await LocalNotifications.schedule({
                                notifications: [{
                                    title: data.title || 'JLS Alert',
                                    body: data.message || '',
                                    id: Math.floor(Math.random() * 1000000),
                                    schedule: { at: new Date(Date.now() + 1500) }, // 1.5s delay
                                    sound: 'beep.wav',
                                    channelId: 'default',
                                    smallIcon: 'ic_launcher',
                                    largeIcon: 'ic_launcher'
                                }]
                            });
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

        // Wait for Auth to settle so we have the User ID (if admin)
        const authUnsub = onAuthStateChanged(auth, (user) => {
            if (unsubscribe) unsubscribe();
            setupListener(user ? user.uid : null);
        });

        return () => {
            if (unsubscribe) unsubscribe();
            authUnsub();
        };
    }, []);

    return null;
};

export default NotificationListener;
