#!/bin/bash
set -euo pipefail
# Remove only the two files installed by this project, preserving their directories.
rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.local.canva_snap_haptics.json"
rm -f "$HOME/Library/Application Support/CanvaSnapHaptics/canva-haptic-host"
echo "Helper dihapus. Hapus extension secara terpisah lewat chrome://extensions."
