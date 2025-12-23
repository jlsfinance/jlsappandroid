import { LocalNotifications } from '@capacitor/local-notifications';
import { Loan } from '../types';
import { parseISO, isFuture, isToday, setHours, setMinutes, setSeconds, isPast } from 'date-fns';

export const NotificationService = {
    async requestPermissions() {
        try {
            const local = await LocalNotifications.requestPermissions();
            try {
                // Dynamic import to avoid errors if plugin isn't installed/mocked in web
                const { PushNotifications } = await import('@capacitor/push-notifications');
                const push = await PushNotifications.requestPermissions();
                return local.display === 'granted' && push.receive === 'granted';
            } catch (e) {
                // Fallback for web or if push plugin fails
                return local.display === 'granted';
            }
        } catch (e) {
            console.error("Error asking for permissions", e);
            return false;
        }
    },

    async checkPermissions() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            const status = await PushNotifications.checkPermissions();
            return status;
        } catch {
            const status = await LocalNotifications.checkPermissions();
            return { receive: status.display };
        }
    },

    async createChannel() {
        try {
            await LocalNotifications.createChannel({
                id: 'default',
                name: 'General Notifications',
                description: 'General app notifications',
                importance: 5,
                visibility: 1,
                vibration: true,
            });
        } catch (e) {
            console.error("Error creating channel", e);
        }
    },

    async testNotification() {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
            alert("Permission not granted!");
            return;
        }

        await this.createChannel();

        try {
            const deliveryTime = new Date(Date.now() + 1000 * 10); // 10 seconds from now
            console.log("Scheduling notification for: " + deliveryTime.toString());

            await LocalNotifications.schedule({
                notifications: [{
                    title: 'Background Test Success!',
                    body: 'If you are reading this, the app can notify you even when closed (via functionality like AlarmManager). For 100% reliability on all devices, use Server-Side Push.',
                    id: Math.floor(Math.random() * 100000), // Random ID to avoid collisions
                    schedule: { at: deliveryTime },
                    smallIcon: 'ic_launcher',
                    channelId: 'default',
                    sound: 'beep.wav',
                    attachments: undefined,
                    actionTypeId: "",
                    extra: null
                }]
            });
            console.log("Test notification scheduled for 10s from now. Close the app immediately to test background delivery.");
        } catch (e) {
            console.error("Error scheduling test notification", e);
            alert("Error scheduling test notification: " + JSON.stringify(e));
        }
    },

    async registerNotifications() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');

            await PushNotifications.removeAllListeners();

            await PushNotifications.addListener('registration', async token => {
                console.log('Push registration success, token: ' + token.value);
                localStorage.setItem('fcm_token', token.value);

                // Save token to Firestore
                try {
                    const { auth, db } = await import('../firebaseConfig');
                    const { doc, setDoc, updateDoc, getDoc } = await import('firebase/firestore');

                    const user = auth.currentUser;
                    if (user) {
                        const userRef = doc(db, 'users', user.uid);
                        // Try to update, if fails (doc doesn't exist), set it
                        try {
                            await updateDoc(userRef, { fcmToken: token.value });
                        } catch (e) {
                            await setDoc(userRef, { fcmToken: token.value, email: user.email }, { merge: true });
                        }
                    } else {
                        // If customer portal (anonymous or local ID), we might want to store it against the customer ID
                        const customerId = localStorage.getItem('customerPortalId');
                        if (customerId) {
                            const custRef = doc(db, 'customers', customerId);
                            await updateDoc(custRef, { fcmToken: token.value }).catch(() => { });
                        }
                    }
                } catch (e) {
                    console.error("Error saving token to Firestore", e);
                }
            });

            await PushNotifications.addListener('registrationError', error => {
                console.error('Push registration error: ', error.error);
                localStorage.setItem('fcm_error', JSON.stringify(error));
            });

            await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
                console.log('Push received: ', notification);
                // Fallback: If presentationOptions doesn't work or for custom handling
                // We verify if we need to show a local toast/notification
                // For now, let's just log it. The capacitor config 'presentationOptions' should handle the UI.
                // But if we want to force it:
                /*
                await LocalNotifications.schedule({
                    notifications: [{
                        title: notification.title || 'New Notification',
                        body: notification.body || '',
                        id: new Date().getTime(),
                        schedule: { at: new Date(Date.now()) },
                        smallIcon: 'ic_launcher',
                        extra: notification.data
                    }]
                });
                */
            });

            await PushNotifications.addListener('pushNotificationActionPerformed', notification => {
                console.log('Push action performed: ', notification);
            });

            const perm = await PushNotifications.checkPermissions();
            if (perm.receive === 'granted') {
                await PushNotifications.register();
            }
            await this.createChannel();
        } catch (e) {
            console.error("Failed to register push", e);
        }
    },

    getToken() {
        return localStorage.getItem('fcm_token');
    },

    async scheduleLoanNotifications(loans: Loan[]) {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) return;

        // Clear existing to avoid duplicates/stale ones
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel(pending);
        }

        const notifications: any[] = [];
        let idCounter = 1;

        for (const loan of loans) {
            // Only consider active loans
            if (['Active', 'Disbursed', 'Overdue'].includes(loan.status) && loan.repaymentSchedule) {

                // Find the NEXT unpaid installment
                const nextInstallment = loan.repaymentSchedule.find(inst => inst.status === 'Pending');

                if (nextInstallment) {
                    const dueDate = parseISO(nextInstallment.date);

                    // Create a schedule date at 9:00 AM on the due date
                    const scheduleDate = setSeconds(setMinutes(setHours(dueDate, 9), 0), 0);

                    // If due date is in the past (e.g. Overdue) or Today but past 9AM, notify effectively "Now" (or today at next convenient time)
                    // Actually, if it's strictly in the past, we should notify "Immediately" if we want to alert them of overdue.
                    // But let's check: if "isToday", schedule for 1 minute from now (if current time > 9am) or 9am.
                    // If "isPast" (and not today), it's Overdue. 

                    let trigger: any = { at: scheduleDate };
                    let body = `EMI of Rs. ${nextInstallment.amount} is due today for ${loan.customerName}`;
                    let title = 'EMI Due Today';

                    if (isToday(dueDate)) {
                        // It's due today. 
                        const now = new Date();
                        if (now > scheduleDate) {
                            // It's already past 9 AM today. trigger now-ish.
                            trigger = { at: new Date(now.getTime() + 1000 * 5) }; // 5 seconds from now
                        }
                    } else if (isPast(dueDate)) {
                        // It is OVERDUE.
                        title = 'EMI Overdue';
                        body = `EMI of Rs. ${nextInstallment.amount} from ${loan.customerName} was due on ${nextInstallment.date}`;
                        // Trigger immediately (5 sec delay)
                        trigger = { at: new Date(Date.now() + 1000 * 5) };
                    }

                    // If it is in the future, 'trigger' remains set to 9 AM on that day.

                    // Construct ID based on loan ID hash or simple counter? 
                    // Using counter for batch.

                    // We only schedule ONE notification per loan (the next one) to save slots.
                    notifications.push({
                        title: title,
                        body: body,
                        id: idCounter++,
                        schedule: trigger,
                        sound: null,
                        attachments: null,
                        actionTypeId: "",
                        smallIcon: "ic_launcher",
                        channelId: 'default',
                        extra: {
                            loanId: loan.id,
                            customerId: loan.customerId
                        }
                    });
                }
            }
        }

        // Always schedule a "Sync Complete" immediate notification to confirm logic ran
        notifications.push({
            title: 'Reminders Synced',
            body: `Processed active loans. Alerts set for upcoming due dates.`,
            id: 999999,
            schedule: { at: new Date(Date.now() + 2000) },
            sound: 'beep.wav',
            channelId: 'default',
            smallIcon: 'ic_launcher',
            extra: null
        });

        if (notifications.length > 0) {
            try {
                await LocalNotifications.schedule({ notifications });
                console.log(`Scheduled ${notifications.length} notifications.`);
            } catch (error) {
                console.error("Error scheduling notifications", error);
            }
        }
    }
};
