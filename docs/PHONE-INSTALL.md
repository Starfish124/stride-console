# Stride on your phone — the founder install guide

Written for Jort, works for anyone we trust with the console.

**You do not need Tailscale.** That changed on 2026-07-24: the console is
served to the open internet over Tailscale Funnel, on a real Let's Encrypt
certificate. Any phone, any network, no VPN, nothing to install first.

If you already installed Tailscale — it does no harm, but it does nothing
for you here either. Signing into it with your own GitHub account puts you
on your *own* private network, not ours, which is a good way to spend an
afternoon wondering why nothing loads. Ignore it and use the address below.

Everything except the public signup page sits behind a password. Ask
Sarvesh for it; it is deliberately not written down here.

**The address: https://mac-mini.tailc91701.ts.net**

Open it in Safari. You should get the Stride login. If you do, skip to
Option A — you are two minutes from done.

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
   cd ~/stride-console
   ./scripts/install-ios.sh              # the only phone plugged in
   ./scripts/install-ios.sh "Jort"       # or match by name, two phones attached
   ./scripts/install-ios.sh --list       # see what the Mac can find
   ```

3. First launch only: if iOS says **Untrusted Developer**, go to
   **Settings → General → VPN & Device Management** and trust the profile.
4. When it expires in a week, repeat step 2. Or switch to Option A and
   never think about it again.

---

## When it says "The console is unreachable."

In order of likelihood:

1. **The Mac mini is off, asleep, or off the internet.** The console runs
   on it and nowhere else. This is nearly always the answer.
2. **You turned Tailscale on and it is doing something odd.** You do not
   need it. Switch it off and try again.
3. Still stuck? On the Mac, the console service may need a kick:
   `launchctl kickstart -k gui/$(id -u)/com.stride.console`
   and the public route may need checking: `tailscale funnel status`
   should show `https://mac-mini.tailc91701.ts.net` proxying to port 3000.

Your drafts are safe through all of this. The store is on the Mac's disk;
the phone is just a window.
