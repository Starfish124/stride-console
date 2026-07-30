# The email sequencer

Multi step email that sends itself, with a stop switch.

It is **off by design**. With no environment set it runs the whole sequencer,
writes a complete record of every message including the exact subject and body,
and sends nothing. Read those records before you switch it on.

## The one decision everything else follows from

`scripts/salesnav-runner.mjs` owns the clock. The Next process owns every write.

The runner ticks once a minute, mints the session cookie itself and calls
`POST /api/salesnav/run`. It never touches `data/`. That is why there is no
locking anywhere in `lib/salesnav/`: there is one writer, Node is single
threaded inside it, and every store accessor is synchronous.

The cost: **while the console is down, nothing sends.** That is the correct
failure, and the runner logs it every minute.

## Switching it on

Live needs all four, not just the flag:

    STRIDE_SALESNAV=live
    RESEND_API_KEY=re_...
    SALESNAV_FROM="Sarvesh at Stride <sarvesh@mail.stride-ai.nl>"
    SALESNAV_PUBLIC_URL=https://mac-mini.tailc91701.ts.net

The public URL must be `https` and must be reachable from the internet. Every
message carries an unsubscribe link pointing at it, and a link nobody can
follow is a broken promise. `salesnavMode()` returns `dry` until all four hold.

Send from a **subdomain** with its own SPF, DKIM and DMARC. A domain that has
never sent cold email will land in spam, and the website and the contact form
share whatever reputation this burns. Start well under 40 a day for the first
fortnight.

## Stopping it

Three ways, all the same file:

- the switch on `/salesnav`
- `POST /api/salesnav {"stop": true, "reason": "..."}`
- `node scripts/salesnav-runner.mjs --stop`, which writes `data/salesnav-stop.json`
  directly and works when the console is dead

Resuming needs a second field, `{"stop": false, "confirm": "resume"}`, so a fat
finger on a phone cannot restart cold email.

## Where each guarantee lives

Everything is enforced in `lib/salesnav/guard.ts`, in this order, first refusal
wins:

1. hard stop
2. the address is an address
3. the suppression list, exact or `@domain.nl`
4. unresolved merge fields
5. the daily cap (default 40)
6. the per-domain cap (default 3)
7. the voice gate, on the finished text

`lib/salesnav/provider.ts` is imported by `send.ts` and by nothing else in the
repo. There is no path from a route or a page to a provider that skips the
guard. That is a fact about the module graph, not a convention.

## Idempotency

The key is `${enrolmentId}:${stepId}`, and the ledger is checked before
anything else happens.

| ledger state | what happens |
| --- | --- |
| `sent` | advance, send nothing. The crash-restart case. |
| `sending`, attempts < 2 | retry with the same `Idempotency-Key`, which Resend dedupes server side |
| `sending`, attempts >= 2 | `stuck`, pause the enrolment, raise an attention item |
| `skipped` / `failed` | only retried when asked, and re-guarded from scratch |

The claim is written **synchronously, before the first await**. A SIGKILL
between the claim and the provider's answer leaves a `sending` row, which is
the honest state: unknown, not zero.

## Reply detection is manual

Resend inbound needs MX records on a subdomain. Until those exist nothing here
can see an email reply. What stops a sequence instead:

- the client's stage moves past the stage at enrolment
- a Reply record matching the name or the address
- a bounce or complaint webhook
- the address changes or disappears
- the sequence is deleted

`salesnavStatus().replyDetection` says which mode is true, the page prints it,
and an attention item fires whenever live sending runs with manual detection.
A sequencer that keeps writing to somebody who already answered is the worst
thing this could do, so it says which mode it is in rather than implying the
safe one.

## GDPR

`enrol()` refuses without a lawful basis whose reason is at least 20 characters
and whose source is filled in. The basis is **copied** onto every send record,
so "why was this person emailed in March" is answerable from the ledger alone
after the enrolment is deleted.

Open and click tracking are not enabled on the Resend calls. A tracking pixel
on a cold B2B email in the EU is a liability with no operational value here.

A 20-character minimum does not make a weak reason lawful. The one-click
unsubscribe and the honoured suppression list are doing the heavier lifting.

## Running it

    npm run salesnav                              the clock alone
    npm run backend                               console, SEO agents, sequencer
    node scripts/salesnav-runner.mjs --once       one tick, then exit
    node --test "tests/salesnav*.test.mjs"        the safety tests
