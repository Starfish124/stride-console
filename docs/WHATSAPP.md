# WhatsApp: chat with the console from a phone.

Two pieces, vendored and wired in: a Go bridge that holds one founder's own
WhatsApp session (lharries/whatsapp-mcp's `whatsapp-bridge`, MIT, under
`bridge/whatsapp/`, patched twice — see below), and a relay that reads what
comes in and answers with the same brain `/ask` uses. Nothing new gets built
to understand a question; WhatsApp is just another door into Ask Stride.

What it does:

- **Console → phone.** Every push notification (draft-ready pings, from
  `lib/push.ts`) now also lands as a WhatsApp message to every founder in the
  allowlist. Best-effort — a WhatsApp failure never breaks the web push.
- **Phone → console.** Message the paired number (or, for the founder who
  owns the pairing, WhatsApp's own "Message yourself" chat) and the relay
  answers from the console-wide sheet — the same one `/ask` builds — or,
  if the message names a live client, that client's own sheet, the same
  routing the client hub's chat box already does.

## Setup

**Prerequisites:** Go (`brew install go`), Python 3 with `qrcode[pil]`
(`python3 -m pip install --user "qrcode[pil]"` — only needed to render the
pairing QR as an image).

1. Build the bridge:

   ```bash
   cd bridge/whatsapp && go build -o whatsapp-bridge . && cd ../..
   ```

2. Start it and pair:

   ```bash
   npm run whatsapp
   ```

   First run prints a QR to the terminal and writes it to
   `data/whatsapp-qr.png` (0600, gitignored). Scan it in WhatsApp → Settings
   → Linked Devices → Link a Device. The same image and a live status also
   show on `/settings#whatsapp`. Re-authentication is needed roughly every
   20 days, per upstream.

3. Set who it answers, in `.env.local`:

   ```
   STRIDE_WHATSAPP_FOUNDERS=31612345678:Jort,31698765432:Sarvesh
   ```

   E.164 without the `+`, name after the colon, comma-separated. A message
   from any other number is read and silently ignored — no bounce, since
   confirming the bridge exists to a stranger is worse than saying nothing.

4. Start the relay (the inbound half):

   ```bash
   npm run whatsapp:relay
   ```

5. Or run both under the supervisor, once paired:

   ```bash
   STRIDE_WHATSAPP=on npm run backend
   ```

   Off by default — `npm run backend` has to keep working on a checkout with
   no Go binary built and no phone paired yet.

## What was patched in the vendored bridge

`bridge/whatsapp/main.go`, two changes from upstream, both marked
`// Stride patch:` inline:

- Binds `127.0.0.1:8765` instead of every interface (and instead of
  upstream's own default `8080`, which on this Mac is already Durabo's
  `Map/serve.py`). The console's other bridges are loopback-only on
  principle; this one carries a personal session and gets no exception.
- Prints the raw pairing string (`STRIDE_QR_RAW:...`) on its own line, so
  `bridge/whatsapp-server.mjs` can render an actual scannable PNG instead of
  parsing half-block art back out of a terminal.

Also bumped `go.mau.fi/whatsmeow` to latest at vendor time — the pinned
version upstream ships 405 "client outdated" against WhatsApp's current
servers, and the newer API takes `context.Context` on five calls that used
to take none (`Download`, `sqlstore.New`, `GetFirstDevice`, `GetGroupInfo`,
`Contacts.GetContact`), all passed `context.Background()`.

Two more patches, once real traffic exposed what upstream's schema could not
answer:

- **The account's own identity, printed at connect** (`STRIDE_OWN_NUMBER:`,
  `STRIDE_OWN_LID:`). The bridge pairs as a linked device on one founder's
  own account, so a message that founder sends to their own "Message
  yourself" chat is still `is_from_me = 1` — WhatsApp has no concept of
  "incoming from your other device". Without knowing the account's own
  identity, the relay could never tell that self-chat apart from an ordinary
  outbound message to a friend, and the founder who owns the pairing would
  have no way to reach the console at all.
- **`sender_pn`, a resolved real phone number, stored per message.**
  WhatsApp is migrating chats onto opaque LIDs (privacy IDs) rather than
  phone numbers — `chat_jid` and `sender` can both be a value like
  `46329862561839@lid` bearing no relation to the person's actual number.
  `handleMessage` now resolves it via `client.Store.LIDs.GetPNForLID` when
  the sender is a contact WhatsApp already knows on this account, additive
  `ALTER TABLE` on open so it upgrades a database already on disk. The
  founder allowlist matches against this column, never against `chat_jid` —
  replies still go to the literal `chat_jid`, LID or not, since that is the
  address that actually routes.

## Where things live

- `bridge/whatsapp/` — vendored Go source + `LICENSE` (MIT). `store/` (the
  session and every message, SQLite) and the compiled `whatsapp-bridge`
  binary are gitignored — never commit either.
- `bridge/whatsapp-server.mjs` — supervises the Go binary: restarts it with
  backoff if it dies, watches stdout for the QR/paired/logged-out moments,
  keeps `data/whatsapp-bridge.json` truthful.
- `lib/whatsapp/store.ts` — read-only reads of the bridge's own
  `messages.db`, the same posture `bridge/db.mjs` holds for Linked Helper's
  database: never write someone else's store.
- `lib/whatsapp/send.ts` — one POST to the bridge's `/api/send`.
- `lib/whatsapp/config.ts` — the founder allowlist.
- `scripts/whatsapp-relay.mjs` — polls for new inbound, answers, replies.
- `app/api/whatsapp/{status,qr}` and `components/WhatsAppPanel.tsx` — the
  settings-page view of all of the above.

## Privacy

Everything stays on this Mac. The Go bridge talks to WhatsApp's own servers
(that is the point — it is a real client), but the console never sends a
message body anywhere except the local Ollama model already trusted with
the rest of the fact sheet. `store/messages.db` holds a personal WhatsApp
history; treat it like the client-book database it now sits next to.
