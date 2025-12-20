import React, { useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { LocalNotifications } from '@capacitor/local-notifications';

const NotificationListener: React.FC = () => {
    useEffect(() => {
        // Check permissions on mount
        const checkPerms = async () => {
            try {
                const perm = await LocalNotifications.checkPermissions();
                if (perm.display !== 'granted') {
                    await LocalNotifications.requestPermissions();
                }
            } catch (e) {
                console.error("Permission check failed", e);
            }
        };
        checkPerms();

        // Determine current user context
        // Admin uses 'auth' but Customer uses localStorage 'customerPortalId'
        const customerId = localStorage.getItem('customerPortalId');

        // Listen for notifications
        // We listen for 'all' AND specific recipientId
        // We limit to recent ones to avoid flooding (e.g. created in last 5 minutes? 
        // real-time listener only picks up "added" events, but onSnapshot initially returns all matching docs.
        // To avoid initial flood, we can check 'doc.metadata.hasPendingWrites' or simply use a timestamp query greater than NOW.
        // But getting "NOW" in Firestore query requires server timestamp sync.
        // Easier: Filter in client side for "isNew". Or just accept that "unread" ones show up.

        // Let's filter by createdAt >= Now (approx) to only show *new* incoming ones while app is open.
        // However, user might miss something if we strict filter.
        // Let's rely on 'read' status if we had it, but for now let's just show alerts for any added doc
        // that doesn't look ancient.

        const startTime = new Date();

        const q = query(
            collection(db, 'notifications'),
            where('createdAt', '>', startTime)
            // Note: Firestore requires index for complex queries. 
            // If index missing, this might fail.
            // Safer to getting last 10 and filtering client side for 'added' logic after mount?
            // Actually onSnapshot with 'added' change type is good enough if we ignore the initial snapshot.
        );

        // Improving logic: Listen to ALL relevant notifications and only notify if it's a NEW addition.
        // We won't use 'createdAt' in query to avoid index issues for now. We will filter client side.

        // We need to construct a query that matches 'recipientId' IN ['all', customerId]
        // Firestore 'in' query works.
        const recipients = ['all'];
        if (customerId) recipients.push(customerId);

        const q2 = query(
            collection(db, 'notifications'),
            where('recipientId', 'in', recipients)
        );

        let isInitial = true;

        const unsubscribe = onSnapshot(q2, (snapshot) => {
            if (isInitial) {
                isInitial = false;
                return; // Skip initial load
            }

            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    // Verify it's recent (e.g. created within last minute) to be safe, 
                    // or just show it because it's a "live" add.

                    // Trigger Local Notification
                    try {
                        await LocalNotifications.schedule({
                            notifications: [{
                                title: data.title || 'New Notification',
                                body: data.message || '',
                                id: Math.floor(Math.random() * 100000), // Random ID
                                schedule: { at: new Date(Date.now() + 100) }, // Immediate
                                sound: 'beep.wav',
                                smallIcon: 'ic_stat_icon_config_sample',
                                actionTypeId: '',
                                extra: null
                            }]
                        });
                        // Also vibe?
                    } catch (err) {
                        console.error("Local Notification Error", err);
                    }
                }
            });
        }, (error) => {
            console.error("Notification Listener Error", error);
        });

        return () => unsubscribe();
    }, []);

    return null; // This component handles logic only, no UI
};

export default NotificationListener;
