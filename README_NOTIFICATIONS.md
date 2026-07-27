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

## Step 2: ~~Not implemented — `sendNotificationOnCreate` function has been removed from the codebase.~~

## Step 3: Deploy
```bash
firebase deploy --only functions
```

Once deployed, any document added to the `notifications` collection (which your Customer Portal already does) will automatically trigger a **Real Push Notification** that works even if the user has killed the app.
