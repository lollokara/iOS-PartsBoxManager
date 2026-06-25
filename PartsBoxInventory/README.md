# PartsBox Inventory iOS

Standalone native SwiftUI iOS app project for the PartsBox Manager mobile slice.

## Open

Open `PartsBoxInventory.xcodeproj` in Xcode 27 beta.

## Build

Use the shared `PartsBoxInventory` scheme and run against an iPhone simulator.

For command-line builds with Xcode beta:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild \
  -project PartsBoxInventory.xcodeproj \
  -scheme PartsBoxInventory \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
```

## Connect to the server

Start the local server from the repository root:

```bash
npm run start:mobile
```

On the iPhone, join the Casa Wi-Fi network, open **Manage**, and tap
**Discover on Casa**. The server advertises `_partsbox-manager._tcp` with
Bonjour and the app stores the discovered URL in **Active Base URL**.

Manual fallback:

```text
http://<server-lan-ip>:39200
```

## Notes

- The app talks to the local Node server through `/api/mobile/...`.
- Server secrets stay on the Node side; do not put API keys into the iOS app.
- Connection settings are stored locally on the device.
