const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendNotificationOnCreate = functions.firestore
    .document('notifications/{notificationId}')
    .onCreate(async (snap, context) => {
        const data = snap.data();
        const recipientId = data.recipientId;

        if (!recipientId) {
            console.log('No recipientId found in notification data');
            return;
        }

        try {
            let tokens = [];

            if (recipientId === 'all') {
                console.log('Fetching all customer tokens for broadcast');
                const customersSnap = await admin.firestore().collection('customers').get();
                customersSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.fcmToken) tokens.push(d.fcmToken);
                });

                // Also fetch users (Staff)
                const usersSnap = await admin.firestore().collection('users').get();
                usersSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.fcmToken) tokens.push(d.fcmToken);
                });

                console.log(`Found ${tokens.length} recipients for broadcast`);
            } else {
                // Single Recipient Logic
                // 1. Check if recipient is a Customer
                console.log(`Searching for FCM token for recipient: ${recipientId}`);
                const customerDoc = await admin.firestore().collection('customers').doc(recipientId).get();
                if (customerDoc.exists && customerDoc.data().fcmToken) {
                    tokens.push(customerDoc.data().fcmToken);
                }

                // 2. If not customer, check if User (Admin/Staff)
                if (tokens.length === 0) {
                    const userDoc = await admin.firestore().collection('users').doc(recipientId).get();
                    if (userDoc.exists && userDoc.data().fcmToken) {
                        tokens.push(userDoc.data().fcmToken);
                    }
                }

                // Fallback: If "recipientId" is actually the raw token
                if (tokens.length === 0 && recipientId.length > 20) {
                    tokens.push(recipientId);
                }
            }

            if (tokens.length === 0) {
                console.log('No FCM Tokens found for target:', recipientId);
                return;
            }

            // 3. Send Push Notification
            const payload = {
                notification: {
                    title: data.title || 'New Notification',
                    body: data.message || 'You have a new alert',
                    sound: 'default',
                },
                data: {
                    action: 'OPEN_APP',
                    notificationId: context.params.notificationId
                }
            };

            // Send to the device(s)
            // sendToDevice accepts a single token OR an array of tokens
            const response = await admin.messaging().sendToDevice(tokens, payload);

            // Log errors if any
            if (response.failureCount > 0) {
                response.results.forEach((result, index) => {
                    if (result.error) {
                        console.error('Failure sending notification:', result.error);
                    }
                });
            } else {
                console.log('Notification sent successfully!');
            }

        } catch (error) {
            console.error('Error in sendNotificationOnCreate:', error);
        }
    });
