# WhatsApp: chat with the console from a phone.

Two pieces, vendored and wired in: a Go bridge that holds one founder's own
WhatsApp session (lharries/whatsapp-mcp's `whatsapp-bridge`, MIT, under
`bridge/whatsapp/`, patched twice — see below), and a relay that reads what
comes in and answers with the same brain `/ask` uses. Nothing new gets built
to understand a question; WhatsApp is just another door into Ask Stride.

Everything runs through one chat: the **StrideAI** WhatsApp group, every
founder a member. Not a founder's personal number, not "Message yourself" —
those used to work too, and the result was Stride content and a founder's
own private messages told apart only by a phone-number allowlist, with no
chat-level boundary either founder could point at. `lib/whatsapp/store.ts`
now queries nothing but the configured group (`STRIDE_WHATSAPP_GROUP`); a
message anywhere else on that WhatsApp account is invisible to the console.

What it does:

- **Console → group.** Every push notification (draft-ready pings, from
  `lib/push.ts`) also lands as one WhatsApp message in the group. Best-effort
  — a WhatsApp failure never breaks the web push.
- **Group → console.** The group is shared with a human on the other end,
  which "Message yourself" never was, so the relay only answers a message
  that opens with the wake word: `Stride, what needs me today?`,
  `hey stride open invoices`. Everything else in the group passes through
  unanswered — an ordinary line between founders never becomes an AI reply
  — though it still reaches the brain and the calendar's signals panel
  (`lib/brain/ingest.ts`, `app/api/whatsapp/signals`), just not this reply
  loop. A wake-worded question gets the console-wide sheet — the same one
  `/ask` builds — or, if it names a live client, that client's own sheet,
  the same routing the client hub's chat box already does.

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

3. Set the group and who it answers, in `.env.local`:

   ```
   STRIDE_WHATSAPP_GROUP=120363412406725019@g.us
   STRIDE_WHATSAPP_FOUNDERS=31612345678:Jort,31698765432:Sarvesh
   ```

   The group JID is easiest to find by creating the group, sending one
   message, then reading it straight from the bridge's own database:
   `sqlite3 bridge/whatsapp/store/messages.db "SELECT jid, name FROM chats
   WHERE jid LIKE '%@g.us' ORDER BY last_message_time DESC LIMIT 5;"`.
   Founders are E.164 without the `+`, name after the colon,
   comma-separated — a message from anyone else in the group, or from
   anywhere that is not the configured group at all, is read and silently
   ignored. No bounce: confirming the bridge exists to a stranger is worse
   than saying nothing.

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
- `lib/whatsapp/config.ts` — the group JID and the founder allowlist.
- `scripts/whatsapp-relay.mjs` — polls for new inbound, answers wake-worded
  questions, replies.
- `app/api/whatsapp/{status,qr,signals}` and `components/WhatsAppPanel.tsx`
  — the settings-page view of the bridge, and the calendar's read-only
  "From WhatsApp" panel.

## Privacy

Everything stays on this Mac. The Go bridge talks to WhatsApp's own servers
(that is the point — it is a real client), but the console never sends a
message body anywhere except the local Ollama model already trusted with
the rest of the fact sheet. `store/messages.db` holds a personal WhatsApp
history; treat it like the client-book database it now sits next to.
