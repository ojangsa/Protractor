# iOS Native App Setup Guide

This directory contains the source code for the iOS Hybrid App version of the Protractor Controller. This app wraps the web interface in a native shell to enable:
1.  **WiFi Control**: Bypasses Mixed Content restrictions (HTTPS -> simple HTTP).
2.  **BLE Control**: Uses native CoreBluetooth, so no special browser (Bluefy) is needed.

## Setup Instructions

Since I cannot generate an `.xcodeproj` file directly, you need to create one manually in Xcode.

### 1. Create Xcode Project
1.  Open **Xcode**.
2.  Select **Create a new Xcode project**.
3.  Choose **iOS** -> **App**.
4.  Enter details:
    -   **Product Name**: `ProtractorApp`
    -   **Interface**: `Storyboard` (or SwiftUI, but the provided code uses UIKit/Storyboard lifecycle mainly, though `SceneDelegate` adapts. Actually, just choose **Storyboard** to be safe with `AppDelegate` logic).
    -   **Language**: `Swift`.
5.  Save the project in `.../Protractor/ios/`.

### 2. Replace Source Files
1.  In Finder, go to `.../Protractor/ios/ProtractorApp/`.
2.  You will see the files I generated: `ViewController.swift`, `Info.plist`, `AppDelegate.swift`, `SceneDelegate.swift`.
3.  **Drag and drop** these files into your Xcode project navigator (replace existing ones).
    -   Make sure **"Copy items if needed"** is CHECKED.
    -   Make sure your app target is CHECKED.

### 3. Add Web Assets
1.  Locate `index.html`, `styles.css`, `app.js` in the root `.../Protractor/` directory.
2.  **Drag and drop** these three files into the Xcode project.
3.  **IMPORTANT**: In the "Choose options for adding these files" dialog:
    -   Select **"Create folder references"** (This is crucial! It keeps the folder structure and allows `index.html` to find `app.js` easily).
    -   Ensure your app target is CHECKED.

### 4. Build and Run
1.  Connect your iPhone.
2.  Select your iPhone as the destination.
3.  Press **Cmd + R** to run.
4.  Accept the permissions (Local Network, Bluetooth, Camera) when prompted.

## Troubleshooting
-   **"index.html not found"**: Make sure you added the web files as "Folder References" (blue folder icon in Xcode) or that they are included in "Copy Bundle Resources" in Build Phases.
-   **White Screen**: Check the Xcode console logs for any web loading errors.
