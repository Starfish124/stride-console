# The Linked Helper channel

How the console reaches Linked Helper 2, why it works that way, and what to do
when it stops.

## The shape of it

```
phone ──Funnel──▶ console (:3000) ──loopback──▶ bridge (:7455) ──CDP──▶ Linked Helper (:9222)
```

The console is public. Linked Helper is not, and must never be. The bridge is
the seam: it listens on **127.0.0.1 only**, takes a bearer token, and is the one
thing that holds a debugger connection to the app.

## Why a debugger port

Linked Helper 2 is an Electron app with no public API. Launched with
`--remote-debugging-port=9222` it exposes one CDP page target — its own UI — and
that renderer runs with **nodeIntegration on**. So evaluating JS inside it
reaches `window.require('electron').ipcRenderer`, which is a direct line to
LH2's main process and the campaign services behind it.

Campaign verbs found in its bundle, for the phases that follow:
`startRunningCampaigns`, `stopRunningCampaigns`, `CampaignServicePauseCampaign`,
`CampaignServiceUnpauseCampaign`, `CampaignServiceArchiveCampaign`.

## Two traps worth knowing

**The UI port is ephemeral.** Linked Helper also runs an Express server for its
own interface, but on a random port each launch — 62078 one time, 62717 the
next. Never build on it. The debugger port is fixed because we set it; that is
the only stable address.

**The Dock does not pass the flag.** A normal launch has no debugger port, and
the console will correctly report the channel as `off`. That is what
`com.stride.linkedhelper.plist` is for.

## Install

```bash
cp docs/com.stride.linkedhelper.plist ~/Library/LaunchAgents/
cp docs/com.stride.bridge.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stride.linkedhelper.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stride.bridge.plist
```

Quit Linked Helper first if it is already open — the flag only applies to a
fresh launch. Check it took:

```bash
curl -s -H "Authorization: Bearer $(python3 -c 'import json;print(json.load(open("data/bridge.json"))["token"])')" \
  http://127.0.0.1:7455/health
```

`state: "ready"` means the whole chain is up. The same thing is on `/settings`
in the console, which is the version you can read from your phone.

## What the states mean

| State | Meaning |
|---|---|
| `ready` | LH2 is open, the control channel answers, a licensed account is logged in. |
| `degraded` | Reachable, but something it needs is missing — usually no licence left. |
| `off` | LH2 is closed, or was opened without the debugger flag, or the bridge is not running. |
| `error` | It should be working and is not. Read `detail`. |

## When it breaks

**`off` and Linked Helper is clearly open** — it was launched without the flag.
Quit it, then `launchctl kickstart -k gui/$(id -u)/com.stride.linkedhelper`.

**`error` mentioning nodeIntegration** — LH2 auto-updated and its renderer no
longer exposes `window.require`. This is the failure that ends the whole
approach, so it is called out explicitly rather than buried: the channel would
need rebuilding on a different surface (their webhooks, or UI automation).
`probe()` in `bridge/lh.mjs` is the canary.

**Accounts read as empty** — LH2 is not showing the account manager screen.
Harmless: `readAccounts()` is screen scraping and returns null rather than
failing. Health does not depend on it.

**Token rejected** — delete `data/bridge.json` and restart the bridge; it mints
a new one and the console picks it up on the next request.

## Security

Anything that can reach `127.0.0.1:9222` can act as the logged-in LinkedIn
account. That is acceptable on a single-user Mac and nowhere else. Do not bind
it to the tailnet, do not put it behind Funnel, and do not forward it.

The bridge token lives in `data/bridge.json` at mode 0600. `data/` is gitignored.
