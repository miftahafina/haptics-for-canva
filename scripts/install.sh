#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Helper hanya mendukung macOS." >&2
  exit 1
fi
EXTENSION_ID="${1:-}"
if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Penggunaan: bash scripts/install.sh EXTENSION_ID" >&2
  echo "Salin ID dari chrome://extensions setelah Load unpacked folder extension/." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/CanvaSnapHaptics"
HOSTS="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$ROOT/native/build" "$DEST" "$HOSTS"
xcrun swiftc -O "$ROOT/native/HapticHost.swift" -o "$ROOT/native/build/canva-haptic-host" -framework AppKit
codesign --force --sign - "$ROOT/native/build/canva-haptic-host"
install -m 755 "$ROOT/native/build/canva-haptic-host" "$DEST/canva-haptic-host"
# Mutate an XML plist: some macOS plutil versions cannot edit JSON directly.
# Convert only after all fields have been added.
/usr/bin/plutil -create xml1 "$ROOT/native/build/com.local.canva_snap_haptics.json"
/usr/bin/plutil -insert name -string 'com.local.canva_snap_haptics' "$ROOT/native/build/com.local.canva_snap_haptics.json"
/usr/bin/plutil -insert description -string 'Local Canva trackpad haptic helper' "$ROOT/native/build/com.local.canva_snap_haptics.json"
/usr/bin/plutil -insert path -string "$DEST/canva-haptic-host" "$ROOT/native/build/com.local.canva_snap_haptics.json"
/usr/bin/plutil -insert type -string 'stdio' "$ROOT/native/build/com.local.canva_snap_haptics.json"
/usr/bin/plutil -insert allowed_origins -json "[\"chrome-extension://$EXTENSION_ID/\"]" "$ROOT/native/build/com.local.canva_snap_haptics.json"
/usr/bin/plutil -convert json "$ROOT/native/build/com.local.canva_snap_haptics.json"
install -m 644 "$ROOT/native/build/com.local.canva_snap_haptics.json" "$HOSTS/com.local.canva_snap_haptics.json"
echo "Helper terpasang untuk Chrome dan extension $EXTENSION_ID."
echo "Buka popup extension, lalu pilih Cek koneksi dan Tes ketukan."
