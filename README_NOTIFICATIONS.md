# How to Enable Background Notifications (When App is Closed)

Currently, your app uses stored **local notifications** (simulated) or **Firestore Listeners** (Customer Portal).
- **Firestore Listeners** only run when the app is OPEN.
- **Local Notifications** work in the background but can be killed by Battery Optimization on some phones.

To get **100% reliable notifications** when the app is **Swipe Closed (Killed)**, you MUST use **Firebase Cloud Functions** to send real Push Notifications to the `fcmToken` we are now saving in the database.

## Step 1: Initialize Cloud Functions
If you haven't already:
```bash
npm install -g firebase-tools
firebase login
firebase init functions
# Select 'TypeScript' or 'JavaScript'
# Select your project
# Install dependencies (yes)
```

## Step 2: Add this Code to `functions/index.js` (or index.ts)

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendNotificationOnCreate = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const recipientId = data.recipientId;

    if (!recipientId) return;

    try {
      let token = null;

      // 1. Check if recipient is a Customer
      const customerDoc = await admin.firestore().collection('customers').doc(recipientId).get();
      if (customerDoc.exists && customerDoc.data().fcmToken) {
        token = customerDoc.data().fcmToken;
      }

      // 2. If not customer, check if User (Admin/Staff)
      if (!token) {
        const userDoc = await admin.firestore().collection('users').doc(recipientId).get();
        if (userDoc.exists && userDoc.data().fcmToken) {
          token = userDoc.data().fcmToken;
        }
      }

      if (!token) {
        console.log('No FCM Token found for user:', recipientId);
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
            // Add any extra data here
            action: 'OPEN_APP'
        }
      };

      await admin.messaging().sendToDevice(token, payload);
      console.log('Notification sent successfully to:', recipientId);

    } catch (error) {
      console.error('Error sending notification:', error);
    }
  });
```

## Step 3: Deploy
```bash
firebase deploy --only functions
```

Once deployed, any document added to the `notifications` collection (which your Customer Portal already does) will automatically trigger a **Real Push Notification** that works even if the user has killed the app.
