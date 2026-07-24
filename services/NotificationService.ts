import { LocalNotifications } from '@capacitor/local-notifications';
import { Loan } from '../types';
import { parseISO, isFuture, isToday, setHours, setMinutes, setSeconds, isPast, isValid, format } from 'date-fns';

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

            await LocalNotifications.schedule({
                notifications: [{
                    title: 'Background Test Success!',
                    body: 'If you are reading this, the app can notify you even when closed (via functionality like AlarmManager). For 100% reliability on all devices, use Server-Side Push.',
                    id: Math.floor(Math.random() * 100000), // Random ID to avoid collisions
                    schedule: { at: deliveryTime },
                    smallIcon: 'ic_stat_jls',
                    iconColor: '#4f46e5',
                    channelId: 'default',
                    sound: 'beep.wav',
                    attachments: undefined,
                    actionTypeId: "",
                    extra: null
                }]
            });
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
                        // Customer portal: store token on the existing customer doc (one token per customer, overwrite)
                        const customerId = localStorage.getItem('customerPortalId');
                        if (customerId) {
                            const { Capacitor } = await import('@capacitor/core');
                            const custRef = doc(db, 'customers', customerId);
                            const tokenData = {
                                fcmToken: token.value,
                                fcmUpdatedAt: new Date().toISOString(),
                                fcmPlatform: Capacitor.getPlatform(),
                            };
                            await updateDoc(custRef, tokenData).catch(async () => {
                                await setDoc(custRef, tokenData, { merge: true }).catch(() => { });
                            });
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
                // presentationOptions in capacitor.config handles foreground display
            });

            await PushNotifications.addListener('pushNotificationActionPerformed', notification => {
                // no-op: tapping the push opens the app
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

    async clearCustomerToken(customerId: string) {
        try {
            const { db } = await import('../firebaseConfig');
            const { doc, updateDoc, deleteField } = await import('firebase/firestore');
            await updateDoc(doc(db, 'customers', customerId), {
                fcmToken: deleteField(),
                fcmUpdatedAt: deleteField(),
                fcmPlatform: deleteField(),
            }).catch(() => { });
        } catch (e) {
            console.error('clearCustomerToken failed', e);
        }
        localStorage.removeItem('fcm_token');
    },
    // ponytail: deterministic 32-bit positive id so re-runs overwrite, never duplicate
    emiNotificationId(loanId: string, emiNumber: number): number {
        let h = 2166136261;
        const s = `${loanId}_${emiNumber}`;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) % 2000000000 + 1;
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

        for (const loan of loans) {
            // Only consider active loans
            if (['Active', 'Disbursed', 'Overdue'].includes(loan.status) && loan.repaymentSchedule) {

                // Find the NEXT unpaid installment
                const nextIdx = loan.repaymentSchedule.findIndex(inst => inst.status === 'Pending');

                if (nextIdx >= 0) {
                    const nextInstallment = loan.repaymentSchedule[nextIdx];
                    // ponytail: runtime data uses `dueDate` (Disbursal), type says `date`; read both safely
                    const inst = nextInstallment as { dueDate?: string; date?: string; amount?: number };
                    const dueDateStr = inst.dueDate || inst.date;
                    if (!dueDateStr) continue;
                    // ponytail: per-EMI dedup key; changes when dueDate changes (reschedule/top-up)
                    const dedupKey = `notif_emi_${loan.id}_${nextIdx}_${dueDateStr}`;
                    if (localStorage.getItem(dedupKey)) continue;
                    const dueDate = parseISO(dueDateStr);

                    // Create a schedule date at 9:00 AM on the due date
                    const scheduleDate = setSeconds(setMinutes(setHours(dueDate, 9), 0), 0);

                    let trigger: any = { at: scheduleDate };
                    let body = `EMI of Rs. ${nextInstallment.amount} is due today for ${loan.customerName}`;
                    let title = 'EMI Due Today';

                    if (isToday(dueDate)) {
                        const now = new Date();
                        if (now > scheduleDate) {
                            trigger = { at: new Date(now.getTime() + 1000 * 5) }; // 5 seconds from now
                        }
                    } else if (isPast(dueDate)) {
                        title = 'EMI Overdue';
                        // ponytail: use the resolved dueDate (never the missing .date field) + safe format
                        const dueLabel = isValid(dueDate) ? format(dueDate, 'dd MMM yyyy') : dueDateStr;
                        body = `EMI of Rs. ${nextInstallment.amount} from ${loan.customerName} was due on ${dueLabel}`;
                        trigger = { at: new Date(Date.now() + 1000 * 5) };
                    }

                    // ponytail: stable id from loan+emi index overwrites prior schedule instead of duplicating
                    const id = this.emiNotificationId(loan.id || '', nextIdx);

                    notifications.push({
                        title: title,
                        body: body,
                        id: id,
                        schedule: trigger,
                        sound: null,
                        attachments: null,
                        actionTypeId: "",
                        smallIcon: "ic_stat_jls",
                        iconColor: '#4f46e5',
                        channelId: 'default',
                        extra: {
                            loanId: loan.id,
                            customerId: loan.customerId
                        }
                    });
                    localStorage.setItem(dedupKey, '1');
                }
            }
        }

        // ponytail: "Reminders Synced" once per calendar day to stop open/switch spam
        const todayKey = `notif_sync_${new Date().toISOString().slice(0, 10)}`;
        if (!localStorage.getItem(todayKey)) {
            notifications.push({
                title: 'Reminders Synced',
                body: `Processed active loans. Alerts set for upcoming due dates.`,
                id: 999999,
                schedule: { at: new Date(Date.now() + 2000) },
                sound: 'beep.wav',
                channelId: 'default',
                smallIcon: 'ic_stat_jls',
                iconColor: '#4f46e5',
                extra: null
            });
            localStorage.setItem(todayKey, '1');
        }

        if (notifications.length > 0) {
            try {
                await LocalNotifications.schedule({ notifications });
            } catch (error) {
                console.error("Error scheduling notifications", error);
            }
        }
    }
};
