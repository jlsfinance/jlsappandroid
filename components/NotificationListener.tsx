import React, { useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { LocalNotifications } from '@capacitor/local-notifications';

const NotificationListener: React.FC = () => {
    useEffect(() => {
        const init = async () => {
            try {
                // Debug 1: Permission Check
                const perm = await LocalNotifications.checkPermissions();
                // alert(`Debug: Permission status is ${perm.display}`);

                if (perm.display !== 'granted') {
                    const req = await LocalNotifications.requestPermissions();
                    // alert(`Debug: Request result is ${req.display}`);
                }
            } catch (e: any) {
                alert(`Debug: Permission Error - ${e.message}`);
            }
        };
        init();

        const customerId = localStorage.getItem('customerPortalId');
        const recipients = ['all'];
        if (customerId) recipients.push(customerId);

        const q = query(
            collection(db, 'notifications'),
            where('recipientId', 'in', recipients)
        );

        let isInitial = true;

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (isInitial) {
                isInitial = false;
                return;
            }

            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const myCompanyId = localStorage.getItem('customerPortalCompanyId');

                    if (data.recipientId === 'all' && data.companyId && myCompanyId && data.companyId !== myCompanyId) {
                        return;
                    }

                    // Debug 2: Data Received
                    // alert(`Debug: Received Notification - ${data.title}`);

                    try {
                        await LocalNotifications.schedule({
                            notifications: [{
                                title: data.title || 'New Notification',
                                body: data.message || '',
                                id: Math.floor(Math.random() * 100000) + 1,
                                schedule: { at: new Date(Date.now() + 100) },
                                actionTypeId: '',
                                extra: null
                            }]
                        });
                        // alert(`Debug: Notification Scheduled!`);
                    } catch (err: any) {
                        alert(`Debug: Schedule Error - ${err.message}`);
                        console.error("Local Notification Error", err);
                    }
                }
            });
        }, (error) => {
            alert(`Debug: Firestore Listener Error - ${error.message}`);
        });

        return () => unsubscribe();
    }, []);

    return null;
};

export default NotificationListener;
