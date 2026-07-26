# Running Stride

One command:

```bash
cd ~/stride-console
./scripts/stride status     # what is up, what is not
./scripts/stride up         # start everything now
./scripts/stride install    # make it all start at login, forever
./scripts/stride down       # stop the console and the bridge
./scripts/stride logs       # tail everything at once
```

`install` has been run, so after a restart everything comes back on its own.
`status` is the one to reach for when something looks wrong.

## Is the app offline when the Mac is off?

Yes. Completely.

The console is served from this Mac and nowhere else. Tailscale Funnel gives
it a public address, but that address points here: it is a doorway, not a
copy. When the Mac is off, asleep, or off the internet, the address stops
answering for everyone, including Jort.

The data is on this disk too. Drafts, campaigns, replies and the LinkedIn
Helper database all live under `data/` and in Linked Helper's own folder.
Nothing is mirrored anywhere.

What the phone does when it cannot reach the Mac depends on the install. The
web app shows a branded offline screen rather than a browser error, because it
caches its own shell, but every page needs the Mac for its content. The native
shell just fails to load.

So: the Mac needs to stay on and awake for the app to work. Worth checking
System Settings, Energy, that it is set never to sleep, and that "Wake for
network access" is on.

Linked Helper is the same story and then some. It only sends while it is
running on this machine, so a sleeping Mac means a paused campaign.

## The four parts

| Part | What it is | Fails as |
|---|---|---|
| console | Next.js on :3000 | the app does not load at all |
| funnel | Tailscale publishing :3000 | works on the tailnet, dead from outside |
| bridge | loopback API on :7455 | campaign pages go quiet, posts still work |
| linked helper | the app, with `--remote-debugging-port=9222` | bridge sees nothing |

They fail independently, which is why `status` reports each one rather than
saying "started" and hoping.

There is a fifth, and it is the one that trips people up: the **per-account
instance**. Linked Helper spawns a separate app per running LinkedIn account,
and that is where the campaign window and the AI drafts live. It only exists
while a LinkedIn session is running. Creating a campaign from the phone needs
it, so `status` reports it separately.

## The password

`STRIDE_PASSWORD` lives only in the installed agent at
`~/Library/LaunchAgents/com.stride.console.plist`, never in git. `install`
carries it across when it rewrites that file, so reinstalling does not quietly
drop the console back to the default password. If it ever does go missing:

```bash
/usr/libexec/PlistBuddy -c \
  "Add :EnvironmentVariables:STRIDE_PASSWORD string YOUR-PASSWORD" \
  ~/Library/LaunchAgents/com.stride.console.plist
launchctl kickstart -k gui/$(id -u)/com.stride.console
```

Without it the console answers to `stride`, which is not a password, and
`status` will not catch that for you.

## When something is wrong

Read `status` first; it names the fix in the line.

- **console down** — `tail /tmp/stride-console.log`. After a `git pull` it is
  usually a missing build: `npm ci && npm run build`.
- **linked helper open without the debugger port** — it was launched from the
  Dock. The flag only applies to a fresh start, so `./scripts/stride up` quits
  and reopens it.
- **bridge down** — `tail /tmp/stride-bridge.log`. A hand-started
  `node bridge/server.mjs` holding :7455 will make the agent fail to bind;
  `up` clears that before starting.
- **funnel off** — `tailscale funnel --bg 3000`.
