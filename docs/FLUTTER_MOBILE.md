# MTES Attendance — Flutter mobile app

The native client lives in **`mtes_attendance_mobile/`** next to the Next.js app. It uses the **same Firebase client keys** as the web app (see `.env.example` in the repo root) plus **`API_BASE_URL`**, which must point at your deployed Next.js origin (no trailing slash), because attendance writes, photo uploads, and most reads go through `/api/*` with a Firebase ID token.

> **Git:** `mtes_attendance_mobile/` is listed in the root `.gitignore` so the folder stays on your machine but is not pushed. To version the app in Git, remove that line or move the app to its own repository.

## Cursor IDE (this repo)

Cursor is VS Code–compatible. You do **not** need Android Studio as an editor.

1. Open this repo (or the `mtes_attendance_mobile` folder) in Cursor.
2. When prompted, **install recommended extensions**, or install manually:
   - **Flutter** (`Dart-Code.flutter`) — pulls in the **Dart** extension.
3. **Command Palette** (`Cmd+Shift+P`): run **Flutter: Select Device** before **Run → Start Debugging** (`F5`) or use the terminal: `flutter run` from `mtes_attendance_mobile/`.

The repo includes `.vscode/extensions.json` so Cursor suggests the Dart/Flutter extensions.

## Prerequisites

1. **Install Flutter** (includes Dart): [https://docs.flutter.dev/get-started/install](https://docs.flutter.dev/get-started/install)  
   - macOS: **Xcode** (from the App Store) for **iOS** builds — that is separate from Android Studio.  
   - **Android:** use the **Android SDK command-line tools** only (see below); you do **not** need the Android Studio app.  
   - Run `flutter doctor` and fix every issue it reports.

### Android SDK without Android Studio (CLI only)

`flutter doctor` needs an SDK at **`ANDROID_HOME`** (usually `~/Library/Android/sdk`).

1. Download **Command line tools only** for macOS from:  
   [https://developer.android.com/studio#command-line-tools-only](https://developer.android.com/studio#command-line-tools-only)
2. Create the folder layout so `sdkmanager` exists at  
   `~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager`  
   (Google’s zip must end up inside `cmdline-tools/latest/`, not one level too shallow.)
3. Add to **`~/.zshrc`** (adjust if your SDK path differs):

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin"
   export PATH="$PATH:$ANDROID_HOME/platform-tools"
   ```

4. New terminal, then:

   ```bash
   sdkmanager --install "cmdline-tools;latest" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
   flutter doctor --android-licenses
   flutter doctor
   ```

Alternatively install the **Android SDK command-line tools** via Homebrew and point **`ANDROID_HOME`** at the path Homebrew documents for that cask (`brew info --cask android-commandlinetools`).

2. **One-time project bootstrap** (if `android/` / `ios/` are missing):

   ```bash
   cd "mtes_attendance_mobile"
   flutter create . --project-name mtes_attendance_mobile --platforms android,ios
   ```

   This adds platform folders without overwriting your `lib/` or `pubspec.yaml`.

3. **Environment file**

   ```bash
   cp .env.example .env
   ```

   Fill in:

   - `API_BASE_URL` — e.g. `https://your-deployment.vercel.app`
   - `GOOGLE_SIGN_IN_WEB_CLIENT_ID` if you use Google Sign-In in **Chrome**
   - (Optional) `NEXT_PUBLIC_SUPER_ADMIN_EMAIL`

   Firebase **client** config for `Firebase.initializeApp` lives in **`lib/firebase_options.dart`** (FlutterFire-style `DefaultFirebaseOptions.currentPlatform`). To regenerate after adding Android/iOS apps:

   ```bash
   dart pub global activate flutterfire_cli
   flutterfire configure
   ```

## Where Firebase config files live (Flutter layout)

| File | Location | Purpose |
|------|----------|---------|
| `google-services.json` | **`android/app/google-services.json`** | Android — **not** in `lib/` or project root. |
| `GoogleService-Info.plist` | **`ios/Runner/GoogleService-Info.plist`** | iOS — add to Xcode **Runner** target (the template includes it in **Copy Bundle Resources**). |
| Dart options | **`lib/firebase_options.dart`** | `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` |

**Gradle:** the **Google services** plugin is wired in `android/settings.gradle.kts` and `android/app/build.gradle.kts` (same idea as [Firebase Android setup](https://firebase.google.com/docs/android/setup)). Flutter pulls Firebase native code via **pub** packages (`firebase_core`, etc.); you do **not** add the [Firebase iOS SDK](https://github.com/firebase/firebase-ios-sdk) through **Swift Package Manager** in Xcode for a normal Flutter app — iOS deps are resolved with **CocoaPods** (`ios/Podfile`) when you run `pod install`.

**SwiftUI / `FirebaseApp.configure()` snippet:** that pattern is for **native Swift** apps. With Flutter, **`firebase_core`** initializes Firebase from Dart (`main.dart`); keep `AppDelegate` as Flutter provides unless a plugin’s docs say otherwise.

## Firebase: what to do for **Android** and **iOS** (same project as web)

Use **one** Firebase project (`attendance-system-c83ee` or whatever you already use). You **add** Android and iOS **apps** to it — you do **not** create a new Firebase project.

### 1. Authentication (all platforms)

1. Firebase Console → **Build** → **Authentication** → **Sign-in method**.
2. Enable **Email/Password** (and **Google** if you use Google Sign-In in the app).
3. For **Google**: use the default support email / project support if asked. No extra Firebase “toggle” beyond enabling the provider.

Your Firestore security rules are already in the repo (`firestore.rules`); the mobile app uses the same Auth + Firestore as the web app.

### 2. Android app in Firebase

1. **Project overview** (gear) → **Project settings** → **Your apps** → **Add app** → **Android**.
2. **Android package name** must **exactly** match your Flutter app’s `applicationId` in  
   `mtes_attendance_mobile/android/app/build.gradle.kts` (often `com.example.mtes_attendance_mobile` until you change it). If they differ, Firebase and the app won’t match.
3. Register the app → **Download `google-services.json`**.
4. Place the file here: **`mtes_attendance_mobile/android/app/google-services.json`** (must be inside `app/`, not `android/` root).
5. Ensure the Android Gradle files apply the Google Services plugin (Flutter’s template usually does after `flutter create`; if build fails, follow [FlutterFire Android install](https://firebase.google.com/docs/flutter/setup?platform=android)).
6. **SHA fingerprints (required for Google Sign-In on Android):**
   - In **Project settings** → your **Android** app → **Add fingerprint**.
   - Debug keystore (typical local dev):

     ```bash
     cd mtes_attendance_mobile/android
     ./gradlew signingReport
     ```

     Copy **SHA-1** (and **SHA-256** if shown) into Firebase.
   - For **Play Store** release builds, add the **release** keystore’s SHA-1/SHA-256 too.

### 3. iOS app in Firebase

1. **Project settings** → **Your apps** → **Add app** → **Apple** (iOS).
2. **iOS bundle ID** must **exactly** match **`ios/Runner`** in Xcode (`PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project — often `com.example.mtesAttendanceMobile` until you change it).
3. Register → **Download `GoogleService-Info.plist`**.
4. Place it in **`mtes_attendance_mobile/ios/Runner/GoogleService-Info.plist`** (add via Xcode’s file list so it’s in the target).
5. **Google Sign-In on iOS:** add the **URL scheme** from the plist (`REVERSED_CLIENT_ID`) to **Info.plist** → **URL types**, per [google_sign_in iOS](https://pub.dev/packages/google_sign_in#ios).
6. Install **CocoaPods** dependencies: `cd ios && pod install`.

### 4. Regenerate `firebase_options.dart` (required after adding apps)

From the **`mtes_attendance_mobile`** folder:

```bash
dart pub global activate flutterfire_cli
flutterfire configure
```

Select your Firebase project and the **Android** + **iOS** (and **Web** if listed) apps. This overwrites **`lib/firebase_options.dart`** with the correct `appId` and options per platform. Commit that file if you version the app (or keep it local per your workflow).

### 5. Google Cloud (OAuth) — only if something still fails

- Firebase links to a **Google Cloud** project. OAuth **client IDs** for Android/iOS are often created when you add those apps.
- If Google Sign-In still fails: **Google Cloud Console** → **APIs & Services** → **OAuth consent screen** — set app name / support email if needed.
- **Flutter Web only:** you still need **`GOOGLE_SIGN_IN_WEB_CLIENT_ID`** in `.env` (Web OAuth client ID). **Native Android/iOS** do not use that variable.

### Quick reference

| Platform | In Firebase | In your Flutter project |
|----------|----------------|-------------------------|
| **Android** | Add Android app, package name = `applicationId` | `android/app/google-services.json` + SHA-1/256 |
| **iOS** | Add Apple app, bundle ID = Xcode | `ios/Runner/GoogleService-Info.plist` + URL scheme for Google |
| **Both** | Enable Auth providers | Run `flutterfire configure` → update `firebase_options.dart` |

## Permissions

The app uses **camera**, **photo library**, and **location**. After `flutter create`, ensure:

- **Android:** `AndroidManifest.xml` includes `CAMERA`, `ACCESS_FINE_LOCATION` (and coarse as needed), and `READ_MEDIA_IMAGES` / legacy storage flags per your `compileSdk`.
- **iOS:** `Info.plist` includes usage strings for `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`.

## Run

```bash
cd mtes_attendance_mobile
flutter pub get
flutter run
```

Choose a device (simulator, USB device, or `flutter devices`).

## Build release binaries

- **Android APK (easy sharing / sideload):**

  ```bash
  flutter build apk --release
  ```

  Output: `build/app/outputs/flutter-apk/app-release.apk`.

- **Android App Bundle (Google Play):**

  ```bash
  flutter build appbundle --release
  ```

- **iOS:** Open `ios/Runner.xcworkspace` in Xcode, set signing team, then **Product → Archive** for TestFlight or Ad Hoc distribution.

## Sharing with testers (e.g. WhatsApp groups)

**Android**

1. Build a release APK or App Bundle as above.  
2. For informal testing, share the **APK** file in the group (people must allow “Install unknown apps” for their browser or file app).  
3. For safer distribution, use **Google Play internal testing** or **Firebase App Distribution** and share the link instead of the raw APK.

**iOS**

1. **TestFlight** (recommended): upload an archive in App Store Connect, add internal/external testers. Share the public TestFlight link in the group.  
2. **Ad Hoc:** Register device UDIDs, export an Ad Hoc `.ipa`, distribute via a link (Apple limits apply).  
3. iOS cannot install arbitrary IPAs from WhatsApp like Android; testers need TestFlight or a registered device build.

## Operational notes

- The mobile app is a **client** to your existing backend: keep the Next.js deployment up and **`API_BASE_URL`** correct.  
- Photo upload uses `/api/upload` (Vercel Blob); ensure `BLOB_READ_WRITE_TOKEN` is set on the server.  
- Design and flows mirror the **mobile-oriented** parts of the web app (Work, Today, Calendar, friend check-in, overtime, notifications, settings, admin tabs).

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| `API_BASE_URL` / network errors | HTTPS origin, no trailing slash; device can reach the internet. |
| 401/403 on APIs | User signed in; Firestore `users/{uid}` exists; role matches expectations. |
| Google Sign-In fails on Android | SHA-1/SHA-256 in Firebase, `google-services.json` package name matches `applicationId`. |
| Location / camera denied | OS permissions and Info.plist / manifest strings. |
