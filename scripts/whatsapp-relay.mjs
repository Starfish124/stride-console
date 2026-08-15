// The other half of "chat with the console from a phone": WhatsApp in.
//
// bridge/whatsapp-server.mjs owns the connection and lets the console send.
// This script is the listener: poll the bridge's own database for new
// inbound messages from an authorised founder, hand the text to the same
// model that answers on /ask, and send the reply back over WhatsApp. No new
// channel of truth — this is Ask Stride's brain, reached from a different
// door.
//
// A message mentioning a client's name gets that client's own sheet instead
// of the console-wide one, the same routing the /clients/[id] hub already
// does for its own chat box — "what did we bill Durabo" should not need
// opening a laptop.
//
// Run: node scripts/whatsapp-relay.mjs
//      npm run whatsapp:relay

import fs from "node:fs";
import path from "node:path";
import { listInboundSince } from "../lib/whatsapp/store.ts";
import { sendWhatsApp } from "../lib/whatsapp/send.ts";
import { founderFor } from "../lib/whatsapp/config.ts";
import { buildClientContext, buildContext, SYSTEM_PROMPT } from "../lib/ask/context.ts";
import { chat, modelReady } from "../lib/ask/ollama.ts";
import { listClients } from "../lib/store.ts";

const POLL_MS = 4_000;
const STATE_FILE = path.join(process.cwd(), "data", "whatsapp-relay-state.json");

function log(message) {
  console.log(`[whatsapp-relay] ${message}`);
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    // First run: only answer what arrives from here on, never the backlog —
    // a founder pairing a fresh bridge should not get replies to messages
    // from a year ago the moment history sync lands.
    return { since: new Date().toISOString() };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

/** The first live client whose name shows up in the text, case-insensitive. */
function mentionedClient(text) {
  const lower = text.toLowerCase();
  return listClients()
    .filter((c) => c.stage !== "past")
    .find((c) => {
      const who = (c.company || c.name).toLowerCase();
      return who.length > 2 && lower.includes(who);
    });
}

async function answer(question) {
  const client = mentionedClient(question);
  const context = client
    ? await buildClientContext(client.id, question)
    : await buildContext(question);
  if (!context) return "Could not find that client in the book.";

  const reply = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Notes on the console as it stands right now:\n\n${context.text}\n\n---\n\nQuestion: ${question}`,
    },
  ]);
  // WhatsApp is a phone screen, not a fact-sheet page — keep it to a
  // message, not an essay.
  return reply.length > 1_200 ? `${reply.slice(0, 1_180)}…` : reply;
}

async function tick(state) {
  const inbound = listInboundSince(state.since, 20);
  if (inbound.length === 0) return state;

  let newest = state.since;
  for (const msg of inbound) {
    newest = msg.timestamp > newest ? msg.timestamp : newest;
    const founder = msg.founderNumber ? founderFor(msg.founderNumber) : undefined;
    if (!founder) {
      log(`ignored: unauthorised or unresolved sender (${msg.founderNumber ?? "unknown"})`);
      continue;
    }
    log(`${founder.name}: ${msg.content.slice(0, 80)}`);
    try {
      const ready = await modelReady();
      const reply = ready.ok
        ? await answer(msg.content)
        : `The model is not ready right now (${ready.problem}). Try again in a moment.`;
      const sent = await sendWhatsApp(msg.replyTo, reply);
      if (!sent.ok) log(`send failed: ${sent.problem}`);
    } catch (err) {
      log(`answer failed: ${err.message}`);
      await sendWhatsApp(msg.replyTo, "Something went wrong answering that. Try again?");
    }
  }
  return { since: newest };
}

let state = readState();
log(`watching for WhatsApp messages since ${state.since}`);

async function loop() {
  try {
    state = await tick(state);
    writeState(state);
  } catch (err) {
    log(`tick failed: ${err.message}`);
  }
  setTimeout(loop, POLL_MS);
}

loop();
