# Stride on your phone — the founder install guide

Written for Jort, works for anyone we trust with the console.

The console lives on the Mac mini and is only reachable over our private
Tailscale network. So every path starts with the same step: get on the
tailnet. After that you choose an install: the web app (recommended) or
the native app.

---

## Step 0 — Get on the tailnet (one-time, needs Sarvesh)

1. **Sarvesh:** open [the Tailscale admin console](https://login.tailscale.com/admin/users),
   press **Invite users**, and send an invite to Jort's email.
2. **Jort:** install **Tailscale** from the App Store, open the invite link
   on your phone, and sign in with that account.
3. Open the Tailscale app and flip the switch to **Connected**. Accept the
   iOS "Allow VPN configuration" prompt — that's the one that matters.
4. Test it: open **https://mac-mini.tailc91701.ts.net** in Safari. You
   should see the Stride login. Password: ask Sarvesh — it is not in this
   file on purpose.

If the page does not load, the answer is almost always the Tailscale
switch. Turn it on, try again.

---

## Option A — The web app (recommended)

Two minutes, no Mac needed, and it is the only version that can ping your
phone when a draft is ready.

1. In **Safari**, open https://mac-mini.tailc91701.ts.net and log in.
2. Tap the **Share** button (the square with the arrow).
3. Tap **Add to Home Screen**, then **Add**.
4. Open the new **Stride** icon from your home screen — it runs
   fullscreen, like any app.
5. In the app: **Settings → notifications → enable**. Now Monday's TLDR
   and Wednesday's news draft announce themselves. That's the point of
   having it on your phone.

Stays installed forever. Updates itself. Done.

## Option B — The native app (optional, needs the Mac mini)

Looks and feels the same as Option A, but push notifications do **not**
reach it, and Apple expires free developer builds after **7 days** — then
it needs a reinstall from the Mac. Only worth it if you prefer a real
app binary.

1. Plug the iPhone into the Mac mini with a cable. Tap **Trust** on the
   phone if asked.
2. On the Mac, in Terminal:

   ```bash
   cd ~/Desktop/standalone/stride-console/ios
   xcodegen generate
   xcodebuild -project StrideConsole.xcodeproj -scheme StrideConsole \
     -destination 'generic/platform=iOS' -allowProvisioningUpdates build
   xcrun devicectl list devices        # find the phone's identifier
   xcrun devicectl device install app --device <IDENTIFIER> \
     ~/Library/Developer/Xcode/DerivedData/StrideConsole-*/Build/Products/Debug-iphoneos/StrideConsole.app
   ```

3. First launch only: if iOS says **Untrusted Developer**, go to
   **Settings → General → VPN & Device Management** and trust the profile.
4. When it expires in a week, repeat step 2. Or switch to Option A and
   never think about it again.

---

## When it says "The console is unreachable."

In order of likelihood:

1. **Tailscale is off on the phone.** Open the app, connect.
2. **Tailscale is stuck at "Starting…".** Force-quit the app and reopen;
   if that fails, reboot the phone — this fixes it nearly every time.
3. **The Mac mini is off or asleep.** The console runs on it.
4. Still stuck? The console service may need a kick on the Mac:
   `launchctl kickstart -k gui/$(id -u)/com.stride.console`

Your drafts are safe through all of this. The store is on the Mac's disk;
the phone is just a window.
