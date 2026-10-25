# Haptics for Canva

An unofficial Chrome extension that adds macOS Force Touch trackpad haptics to snapping and alignment in Canva.

Feel a subtle tap when an object aligns with another object or the page center while dragging or resizing. A small native macOS helper bridges Chrome to Apple's haptic feedback API.

**Experimental · macOS only · MIT licensed**

> This project is not affiliated with, endorsed by, or sponsored by Canva. Canva is a trademark of its respective owner.

## Current status

| Feature | Status |
| --- | --- |
| Manual trackpad haptic test | Confirmed on a 2021 MacBook Pro with M1 Pro and its built-in trackpad |
| Object-to-object alignment while dragging/resizing | Confirmed with configured CSS selectors |
| Page-center alignment | Confirmed with center-specific CSS selectors |
| Combined center and object alignment | Implemented; needs further manual testing after the latest detector update |
| Safe-area / margin contact | Unfinished experiment; not working reliably in manual testing. Leave disabled |
| Keyboard snapping, video timelines, and iframe editors | Not supported |

This is a DOM-based prototype, **not an integration with an official Canva snap API**. Canva's generated class names can change, so selectors may need updating. Automatic haptics are disabled on a fresh installation until configured.

## Requirements

- macOS and a Force Touch trackpad. The hardware configuration confirmed above is the current test reference; other devices have not been verified.
- Google Chrome, using its standard macOS installation/profile setup. The installer does not configure Chrome Beta, Chromium, Brave, or other browsers.
- Xcode Command Line Tools to compile the Swift helper.
- A Canva design open in the web editor.

No Node.js packages or third-party libraries are needed to run the extension.

## Installation

### 1. Get the source

```bash
git clone https://github.com/miftahafina/haptics-for-canva.git
cd haptics-for-canva
```

Alternatively, download and extract the repository ZIP from GitHub. Keep the extracted directory in a stable location: Chrome loads the unpacked extension from there.

### 2. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository's `extension/` directory.
4. Copy the extension ID from that page or the extension popup.

The extension popup currently uses Indonesian labels; the instructions below include those labels.

### 3. Install the native helper

If Xcode Command Line Tools are not installed, run this and finish the installation before continuing:

```bash
xcode-select --install
```

From the repository directory, replace `YOUR_EXTENSION_ID` with the ID copied from Chrome:

```bash
bash scripts/install.sh YOUR_EXTENSION_ID
```

The installer compiles the Swift helper, signs it ad hoc, and installs these two files:

```text
~/Library/Application Support/CanvaSnapHaptics/canva-haptic-host
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.local.canva_snap_haptics.json
```

Only the supplied extension ID is allowed to connect through Chrome Native Messaging. Installation does not require `sudo`, Accessibility permission, or Screen Recording permission. Re-running the installer replaces this project's installed helper and host manifest.

### 4. Test the trackpad

1. Open the extension popup.
2. Click **Cek koneksi** (check connection).
3. Rest a finger lightly on the trackpad and click **Tes ketukan** (test haptic).

Make sure **Force Click and haptic feedback** is enabled in macOS trackpad settings. The helper uses Apple's `.alignment` feedback pattern; it may feel like a short double tap.

A successful helper response means the API was called, not that hardware feedback was guaranteed. Confirm that you can actually feel the test before troubleshooting Canva detection.

### 5. Enable snap detection

1. Open a Canva design and reload its tab after installing the extension.
2. Open the popup and enter the following in **Selector indikator snap**:

   ```css
   div.iNDyaw.HBtN1Q, div.iNDyaw.sDt_sQ
   ```

3. Leave **both safe-area selector fields empty**.
4. Check **Aktifkan haptic saat drag** (enable haptics while dragging).
5. Click **Simpan** (save), close the popup, and drag or resize an object until a snap guide appears.

These selectors come from observed Canva markup, not a stable API. If combined detection is unreliable, this narrower selector was confirmed for page-center guides:

```css
div.iNDyaw._0IZqsQ.HBtN1Q, div.iNDyaw._0IZqsQ.sDt_sQ
```

Do not use generic selectors such as `div` or `svg`: they can match unrelated content, create false feedback, or be rejected as too broad.

## How it works

```text
Canva snap guide in the DOM
  → extension content script
  → Chrome service worker
  → Native Messaging
  → Swift helper / NSHapticFeedbackManager
  → Force Touch trackpad
```

During a pointer drag, the extension samples matching visible guides approximately every 32 ms. It compares their axis and screen position, rather than treating all visible guides as a single on/off signal. Guide length changes, DOM replacement, and position jitter up to 1.5 CSS pixels between samples are ignored.

The service worker limits snap requests to one per 120 ms. Very fast consecutive alignments may therefore produce only one feedback event. This extension provides feedback; it does not change Canva's snapping behavior.

### Safe-area experiment

The popup includes optional selectors for a safe-area box and the selected object's bounding box. This experiment compares corresponding object and safe-area edges, entering contact within 1 CSS pixel and releasing beyond 3 pixels. Each selector must match exactly one visible, distinct element.

**This feature is not working reliably in manual testing and is not part of the recommended setup.** Leave both fields empty. It measures geometric proximity, not an actual Canva snap event; border offsets, rotation, zoom, and incorrect bounding elements can affect accuracy. Rotated objects use their axis-aligned screen bounding box, not their true edges.

## Diagnosing broken selectors

If Canva changes its markup:

1. Open the editor with a single object selected.
2. Click **Rekam diagnosis 15 detik** (record diagnostics for 15 seconds).
3. Close the popup and reproduce the alignment while dragging/resizing.
4. Wait **more than 15 seconds**, then reopen the popup.
5. Click **Tampilkan laporan** (show report).

The JSON report contains candidate lines, boxes, and ancestors of pointer targets. It includes selector suggestions, bounds, colors, border/outline styles, and observation counts. Static boxes are also scanned, up to 6,000 DOM elements; candidate and mutation budgets limit additional work. `truncated: true` means a limit was reached, not necessarily that detection failed.

Candidates are **not automatically trusted or applied**. Canvas/WebGL drawings and some pseudo-elements cannot be identified with this DOM approach. Inspect suggested selectors before using them.

To report a problem, [open an issue](https://github.com/miftahafina/haptics-for-canva/issues) with your macOS/Chrome versions, trackpad model, reproduction steps, and a reviewed diagnostic report if useful. Do not include private designs or account information.

## Privacy and permissions

- No telemetry, analytics, remote server, or third-party dependencies.
- Content scripts run only on `https://canva.com/*` and `https://www.canva.com/*`.
- `nativeMessaging` connects the extension to the installed local helper.
- `storage` saves the enable switch and CSS selectors locally in Chrome.
- Diagnostics do not collect page text or screenshots. Reports contain DOM identifiers and geometry/style metadata, which can still be sensitive; review them before sharing.
- Diagnostic reports stay in tab memory until reload and are not uploaded automatically.

## Restarting and updating

**You do not need to run the installer after restarting your Mac.** Chrome launches the installed helper when needed, and extension settings persist. No login item or always-running server is required.

After updating extension files, click **Reload** in `chrome://extensions`, then reload Canva. You only need to rerun the installer when the native helper changes, the installed files are removed, or the extension ID changes. Keep the extension loaded from the same directory to avoid unnecessary ID changes.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `Specified native messaging host not found` | Run the installer with the correct ID and use standard Google Chrome. |
| Native host access is forbidden | Compare the ID in Chrome with the one used for installation; reinstall the helper with the current ID. |
| Helper connects but no tap is felt | Check macOS trackpad settings and keep a finger lightly touching the trackpad during the test. macOS may suppress feedback. |
| Popup cannot reach Canva / extension context invalidated | Reload the Canva tab after installing or reloading the extension. |
| Manual test works, automatic feedback does not | Check the enable switch, saved selector, and current Canva markup; use diagnostics. |
| Safe-area feedback is missing or inaccurate | This feature is unfinished. Clear both safe-area selector fields and keep using guide-based snapping. |

## Development

```text
extension/                 Manifest V3 extension, popup, and DOM detector
native/HapticHost.swift    AppKit helper and Native Messaging protocol
scripts/                   Local install and uninstall scripts
tests/                     Extension and native protocol tests
```

For tests, you additionally need Node.js (with the built-in test runner) and Python 3:

```bash
node --test tests/extension.test.cjs
mkdir -p native/build
xcrun swiftc -O native/HapticHost.swift -o native/build/canva-haptic-host -framework AppKit
python3 tests/native_protocol.py
```

Tests cover guide transitions, independent axes, safe-area geometry and hysteresis, ambiguous selectors, diagnostics, request throttling, and native message framing. They do not install the helper, trigger physical feedback, or verify Canva's live DOM.

Contributions and reproducible bug reports are welcome. Keep changes local-first, avoid private Canva APIs, and document any assumptions about editor markup.

## Uninstall

From the repository directory:

```bash
bash scripts/uninstall.sh
```

Then remove the extension at `chrome://extensions`. The script removes only the two installed helper files; it does not delete the repository.

## License

[MIT](LICENSE) © 2026 [miftahafina](https://github.com/miftahafina).

The license covers this project's code, not Canva's trademarks, services, or assets.
