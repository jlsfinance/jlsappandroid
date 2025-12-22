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

    async registerNotifications() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            const perm = await PushNotifications.checkPermissions();
            if (perm.receive === 'granted') {
                await PushNotifications.register();
            }
        } catch (e) {
            console.error("Failed to register push", e);
        }
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
                        extra: {
                            loanId: loan.id,
                            customerId: loan.customerId
                        }
                    });
                }
            }
        }

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
