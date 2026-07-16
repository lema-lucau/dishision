10.9–10.11 — Build, sideload, final build (your steps):
These require your EAS account and a physical Android phone, so here's the exact flow:

Preview build: npx eas build --platform android --profile preview (logs into EAS / links the project on first run — it'll ask to create a new project, accept).
Download & sideload: EAS gives you a .apk download link when done. Transfer it to the phone (e.g., via email/drive/USB) and tap to install (allow "install from unknown sources" if prompted).
Full run-through on the device: seed data loads correctly, navigation between tabs, photo picker (camera/gallery), wake lock during the live ticker, flip cards, export/import backup, Time Capsule, Trip Wrapped.
Report back any issues you find — I'll fix them in the code.
Final production build: once everything checks out, npx eas build --platform android --profile production — that APK is "the one you gift."