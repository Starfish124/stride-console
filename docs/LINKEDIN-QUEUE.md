# The LinkedIn queue

Connection notes and messages, written and checked by the console, sent by a
founder's thumb.

## Why it is not automated

Linked Helper 2 used to own this half: it held the campaign, ran the clock and
clicked Connect. Without a licence, that clicking has to come from somewhere,
and the honest options are a script driving `linkedin.com` or a person.

It is a person, on purpose.

- Driving linkedin.com from a script breaks LinkedIn's user agreement (§8.2,
  no bots or automated access). Linked Helper broke the same rule — that is not
  the difference. The difference is that LH2 had a team tuning human-like
  pacing and a large user base absorbing the detection heat. Two accounts
  running a home-built driver get flagged sooner, and nobody fixes it but us.
- The blast radius is bad. A restriction lands on Jort's or Sarvesh's personal
  account, which is also where the Sales Navigator seat lives, and which is a
  founder's professional identity. That is worth more than the licence saved.
- The saving is about ten seconds a message. At the volume two founders can
  actually follow up on, that is five to ten minutes a day.

It also matches what the console already does for posting: nothing auto-posts,
a founder approves and publishes by hand. This is that, pointed at outbound.

What the console keeps is everything that is not the click: the words, the
voice gate, the clock, the caps, the suppression list and the ledger.

## The shape of it

```
sequence step comes due
   └─ runner tick ─▶ guardTouch ─▶ Touch (pending) ─▶ /outreach#queue
                                                          │
                              founder: copy, open, paste, send, "Sent."
                                                          │
                                          settleTouch ─▶ advance the sequence
```

`lib/outreach/touch.ts` holds the records and the caps.
`lib/outreach/queue.ts` holds the guard and the behaviour.
`data/outreach-touches.json`, mode 0600.

## Where each guarantee lives

Everything is enforced in `guardTouch()` in `lib/outreach/queue.ts`, in this
order, first refusal wins:

1. the hard stop — the same switch as email, so "stop everything" means everything
2. a profile that normalises to `linkedin.com/in/<slug>`
3. the suppression list, on **both** channels
4. unresolved merge fields
5. LinkedIn's own character ceiling (300 on a connection note)
6. the daily cap for the kind
7. the rolling weekly invitation cap
8. the voice gate, on the finished text

`putTouch` is called from `queueTouch` and `settleTouch` and nowhere else that
reaches a person, and both go through the guard. That is a fact about the
module graph rather than a convention.

A **fatal** refusal stops the enrolment, except the voice gate, which pauses it
— copy can be fixed and the sequence resumed. A **cap** refusal is not fatal
and, importantly, **writes no record at all**: `skipped` and `expired` are read
by the runner as "settled, move on", so recording a cap hit under the same key
would turn "come back tomorrow" into "never send this".

## Idempotency

The key is `${enrolmentId}:${stepId}`, same as the email ledger.

| ledger state | what the runner does |
| --- | --- |
| none | guard, then queue it |
| `pending` | nothing. The enrolment does not move — a sequence never runs past a message nobody has sent |
| `done` / `skipped` / `expired` | advance to the next step |

## The caps

| Variable | Default | What it does |
| --- | --- | --- |
| `OUTREACH_INVITES_PER_DAY` | 15 | invitations queued per day |
| `OUTREACH_INVITES_PER_WEEK` | 80 | invitations in a rolling seven days |
| `OUTREACH_MESSAGES_PER_DAY` | 25 | messages and InMails per day |
| `OUTREACH_TOUCH_EXPIRE_DAYS` | 5 | how long a queued touch stays worth sending |

LinkedIn's weekly invitation limit is roughly 100 for an established account
and materially less for a new one or one with a low acceptance rate. It is not
published, so 80 sits under the low end deliberately. Going over does not
bounce like an email — it restricts the account, and the Sales Navigator seat
with it.

**The caps govern how fast the queue is fed, not what actually happens.**
Nothing here can stop somebody sending forty invitations by hand this
afternoon. So the queue also shows the number that matters — invitations
actually marked sent in the last seven days — and an attention item fires at
80 percent of the cap and again at the cap.

A `pending` touch counts against the cap, because it is a message a founder has
been handed and will send. A `skipped` or `expired` one does not, so a slot
passed on comes back.

## Expiry

A pending touch older than `OUTREACH_TOUCH_EXPIRE_DAYS` is marked `expired` and
the sequence moves past it. A connection note written on Monday about something
from last week is a worse message on Friday and a much worse one a fortnight
later, and an unworked queue must not freeze a sequence forever. It is marked
rather than deleted, because "nobody got to this" is worth being able to read.

Expiry runs before the sending-window check, so a queue does not go stale over
a weekend and hand somebody last week's words on Monday.

## The sending window

`SALESNAV_WINDOW` gates when the queue is **fed**, not when a founder may send
from it. Nothing can stop a message being sent by hand at midnight, and the
queue does not pretend otherwise.

## Suppression across both channels

`Suppression.channel` is `"email"` or `"linkedin"`. An entry written before
this existed has no channel and is email, which is what it was.

The two share one list because the promise is one promise. Somebody who
unsubscribes from the email is **not** then fair game for a connection request:
`guardTouch` checks the profile *and* the client's address, and `suppress()`
stops live enrolments on both and cancels any touch already sitting in a
founder's queue. An opt-out that leaves a queued note for a founder to send by
hand tomorrow is worse than the automated version, not better.

To suppress a profile:

    POST /api/salesnav/suppress
    {"address": "https://www.linkedin.com/in/jane-doe", "channel": "linkedin", "reason": "blocked"}

## Sales Navigator URLs are refused

`linkedin.com/sales/lead/ACwAAA...` is a different identifier space with no
public slug in it. `normaliseProfileUrl` returns empty for one, and the guard
refuses rather than proceeding — because "cannot check the suppression list"
must never read the same as "not on the suppression list". Copy the public
profile URL off the Sales Navigator page instead.

This is also why `enrol()` refuses a client whose LinkedIn field holds a Sales
Navigator link, and says so in those words.

## What "Sent." means

It records that a founder says they sent it, and moves the sequence on.
Nothing in the console can see LinkedIn, so it is a claim by a person, not an
observation. The ledger stores who said so and when, and the page says as much
rather than implying otherwise.

## Running it

    npm test                                       the whole suite
    node --test tests/outreach-touch.test.mjs      the safety layer alone

The tests cover the failure this replaced: the runner used to advance straight
past every LinkedIn step with "Linked Helper's job", so a sequence ran to
completion having sent nothing and reported nothing wrong.
