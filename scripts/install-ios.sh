#!/usr/bin/env bash
#
# Build the native Stride shell and install it on a connected iPhone.
#
#   ./scripts/install-ios.sh                 # install on the only connected phone
#   ./scripts/install-ios.sh "Jort"          # match a device by name
#   ./scripts/install-ios.sh --list          # show what is plugged in
#
# The phone must be connected by cable and unlocked, and the first time it
# will ask you to tap Trust. Free developer builds expire after seven days;
# rerun this to renew. Push notifications only reach the PWA, never this.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

if [[ "${1:-}" == "--list" ]]; then
  xcrun devicectl list devices
  exit 0
fi

WANTED="${1:-}"

echo "==> Regenerating the Xcode project"
(cd ios && xcodegen generate >/dev/null)

echo "==> Building (this takes a minute)"
xcodebuild \
  -project ios/StrideConsole.xcodeproj \
  -scheme StrideConsole \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$ROOT/ios/build" \
  -allowProvisioningUpdates \
  build >/dev/null

APP="$ROOT/ios/build/Build/Products/Debug-iphoneos/StrideConsole.app"
[[ -d "$APP" ]] || { echo "Build produced no app at $APP" >&2; exit 1; }

echo "==> Looking for a connected phone"
DEVICES=$(xcrun devicectl list devices --quiet 2>/dev/null | grep -iv "unavailable" | grep -iE "iphone|ipad" || true)
[[ -n "$WANTED" ]] && DEVICES=$(echo "$DEVICES" | grep -i "$WANTED" || true)

if [[ -z "$DEVICES" ]]; then
  echo "No connected phone${WANTED:+ matching \"$WANTED\"}." >&2
  echo "Plug it in, unlock it, tap Trust, then try again. See --list." >&2
  exit 1
fi

COUNT=$(echo "$DEVICES" | wc -l | tr -d ' ')
if [[ "$COUNT" != "1" ]]; then
  echo "More than one phone is connected. Narrow it down by name:" >&2
  echo "$DEVICES" >&2
  exit 1
fi

# The identifier is the UUID-shaped column.
ID=$(echo "$DEVICES" | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1)
NAME=$(echo "$DEVICES" | sed -E 's/  +/\t/g' | cut -f1)
[[ -n "$ID" ]] || { echo "Could not read the device identifier from:\n$DEVICES" >&2; exit 1; }

echo "==> Installing on $NAME"
xcrun devicectl device install app --device "$ID" "$APP"

cat <<'DONE'

Installed. On the phone:
  - If iOS says "Untrusted Developer", open
    Settings -> General -> VPN & Device Management and trust the profile.
  - Open Stride. Log in with the console password.
  - This build stops opening in seven days. Rerun this script to renew,
    or install the web app instead (docs/PHONE-INSTALL.md, Option A) —
    that one never expires and is the only version that can send push.
DONE
