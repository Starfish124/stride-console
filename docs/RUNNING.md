# Running Stride

One word, from anywhere:

```bash
stride              # start everything
stride status       # what is up, what is not
stride down         # stop the console and the terminal relay
stride install      # start it all at login, and link this command
stride logs         # tail everything at once
```

`stride install` has been run. It puts a symlink in `~/.local/bin`, which is
why the command works outside the repo, and it loads the four login agents so
everything comes back on its own after a restart.

Bare `stride` starts rather than reports, and is safe to type twice: it checks
each part and only starts what is down. `status` is the read-only one.

## Is the app offline when the Mac is off?

Yes. Completely.

The console is served from this Mac and nowhere else. Tailscale Funnel gives
it a public address, but that address points here: it is a doorway, not a
copy. When the Mac is off, asleep, or off the internet, the address stops
answering for everyone, including Jort.

The data is on this disk too. Drafts, leads, replies and the client book all
live under `data/`. Nothing is mirrored anywhere.

What the phone does when it cannot reach the Mac depends on the install. The
web app shows a branded offline screen rather than a browser error, because it
caches its own shell, but every page needs the Mac for its content. The native
shell just fails to load.

So: the Mac needs to stay on and awake for the app to work. Worth checking
System Settings, Energy, that it is set never to sleep, and that "Wake for
network access" is on.

The email sequencer is the same story: it only sends while the console is
running on this machine, so a sleeping Mac means a paused sequence.

## The three parts

| Part | What it is | Fails as |
|---|---|---|
| console | Next.js on :3000 | the app does not load at all |
| funnel | Tailscale publishing :3000 | works on the tailnet, dead from outside |
| terminal | the relay behind `/term` | the phone's terminal goes quiet |

They fail independently, which is why `status` reports each one rather than
saying "started" and hoping.

There used to be two more — a loopback bridge on :7455 and Linked Helper
itself, launched with a debugger port so the bridge could drive it. Apollo
replaced both. It is an API and a browser tab, not a desktop app being
driven through a debugger, so there is no daemon to keep alive and two fewer
things that can be down.

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
- **funnel off** — `tailscale funnel --bg 3000`.
