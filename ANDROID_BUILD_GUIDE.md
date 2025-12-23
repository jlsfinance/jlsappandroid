# JLS Finance Suite - Android Build Guide

This guide explains how to build and publish the JLS Finance Suite app to the Google Play Store.

## Prerequisites

1. **Android Studio** (latest version) - Download from https://developer.android.com/studio
2. **Java Development Kit (JDK)** - Minimum version 11
3. **Google Play Console Account** - $25 one-time fee at https://play.google.com/console

## Step 1: Download the Android Project

1. Download the entire project from Replit
2. Open Android Studio
3. Click "Open" and select the `android` folder from this project

## Step 2: Configure Firebase (Required)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project "jls-finance-company"
3. Go to **Project Settings** > **General**
4. Under "Your apps", click "Add app" > Android icon
5. Enter package name: `com.jls.suite`
6. Enter app nickname: `JLS Finance Suite`
7. Click "Register app"
8. Download `google-services.json`
9. Copy the file to `android/app/google-services.json`

### Add SHA Fingerprints (Required for Firebase Auth)

In Android Studio terminal, run:
```bash
cd android
./gradlew signingReport
```

Copy the SHA-1 and SHA-256 fingerprints and add them to Firebase Console:
- Go to Project Settings > Your apps > Android app
- Click "Add fingerprint" and paste each fingerprint

## Step 3: Generate Signing Key (Required for Play Store)

Open terminal in Android Studio and run:

```bash
keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jls-finance
```

Follow the prompts to set:
- Keystore password
- Key password
- Your name, organization, city, state, country

**IMPORTANT**: Save this keystore file and passwords securely. You need them for every update!

Move the keystore file:
```bash
mkdir -p android/app/keystores
mv release-key.jks android/app/keystores/
```

## Step 4: Configure Signing in gradle.properties

Add these lines to `android/gradle.properties`:

```properties
RELEASE_STORE_FILE=keystores/release-key.jks
RELEASE_STORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=jls-finance
RELEASE_KEY_PASSWORD=your_key_password
```

## Step 5: Update Version for Each Release

Before each release, update version in `android/app/build.gradle`:

```gradle
defaultConfig {
    versionCode 2  // Increment this number for each release
    versionName "1.0.1"  // Update version string
}
```

## Step 6: Build the App Bundle (AAB)

In Android Studio:
1. Go to **Build** > **Generate Signed Bundle / APK**
2. Select **Android App Bundle**
3. Click **Next**
4. Select your keystore file and enter passwords
5. Click **Next**
6. Select **release** build variant
7. Click **Create**

The AAB file will be generated at:
`android/app/build/outputs/bundle/release/app-release.aab`

## Step 7: Upload to Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Click **Create app**
3. Fill in app details:
   - App name: JLS Finance Suite
   - Default language: English (India)
   - App or game: App
   - Free or paid: Free
4. Click **Create app**

### Required Assets for Store Listing

Prepare these images:
- **App Icon**: 512 x 512 px (PNG, 32-bit with alpha)
- **Feature Graphic**: 1024 x 500 px (PNG or JPEG)
- **Screenshots**: At least 2 screenshots per device type
  - Phone: 16:9 ratio, minimum 320px, maximum 3840px
  - 7-inch tablet (optional)
  - 10-inch tablet (optional)

### Store Listing Information

Fill in:
- Short description (max 80 characters)
- Full description (max 4000 characters)
- App category: Finance
- Contact email
- Privacy Policy URL (required)

### Content Rating

Complete the content rating questionnaire to get a rating for your app.

### Data Safety

Declare what data your app collects:
- Phone number (for login)
- Financial information (loan details)
- Usage data

## Step 8: Release the App

1. Go to **Production** > **Releases**
2. Click **Create new release**
3. Upload your AAB file
4. Add release notes
5. Click **Review release**
6. Click **Start rollout to Production**

## Testing Before Production

Consider using these tracks first:
1. **Internal testing** - Up to 100 testers
2. **Closed testing** - Larger group with feedback
3. **Open testing** - Public beta

## Updating the App

When you make changes to the web app:

1. In Replit, run: `npm run build`
2. Then run: `npx cap sync android`
3. Open Android Studio
4. Increment `versionCode` and `versionName`
5. Build new AAB
6. Upload to Play Console

## Troubleshooting

### Build Errors
- Ensure JDK 11+ is installed
- Run `./gradlew clean` before rebuilding
- Check Gradle sync is successful

### Firebase Errors
- Verify `google-services.json` is in `android/app/`
- Check SHA fingerprints are added in Firebase Console
- Ensure Firebase rules allow required access

### Play Store Rejection
- Ensure privacy policy URL is valid and accessible
- Complete all required store listing fields
- Respond to any policy violation notices

## Support

For additional help:
- [Capacitor Android Documentation](https://capacitorjs.com/docs/android)
- [Play Console Help](https://support.google.com/googleplay/android-developer)
- [Firebase Android Setup](https://firebase.google.com/docs/android/setup)
